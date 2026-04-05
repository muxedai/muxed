import { Eval, traced } from 'braintrust';
import { Factuality } from 'autoevals';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { loadTasks } from './tasks.ts';
import { ToolAccuracy } from './scorer.ts';
import { startMockServers } from '../../lib/mcp-server-harness.ts';
import { runAgent } from '../../lib/agent-runner.ts';
import { writeConfigFiles } from '../../lib/config-builder.ts';
import type { AgentType, Condition } from '../../types.ts';

const CASE_DIR = path.resolve('evals/cases/tool-accuracy');
const SERVERS_DIR = path.resolve('evals/servers');

const tasks = loadTasks(path.join(CASE_DIR, 'tasks.yaml'));

const agents: AgentType[] = ['claude-code', 'codex'];
const toolCounts = [10, 25, 50, 100];
const conditions: Condition[] = ['baseline', 'muxed'];

const API_KEY_ENV: Record<AgentType, string> = {
  'claude-code': 'ANTHROPIC_API_KEY',
  codex: 'OPENAI_API_KEY',
};

for (const agent of agents) {
  for (const toolCount of toolCounts) {
    for (const condition of conditions) {
      Eval(`tool-accuracy-${agent}-${toolCount}tools-${condition}`, {
        data: () =>
          tasks.map((t) => ({
            input: t.input,
            expected: t.correctToolByCount[toolCount] ?? 'unknown',
          })),

        task: async (input) => {
          const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'muxed-eval-tool-accuracy-'));

          const { servers, cleanup } = await startMockServers([
            {
              name: 'confusable',
              scriptPath: path.join(SERVERS_DIR, 'confusable.ts'),
              args: ['--tool-count', String(toolCount), '--seed', '42'],
            },
          ]);

          try {
            const mcpConfigPath = writeConfigFiles(workDir, condition, servers);

            const result = await runAgent({
              agent,
              condition,
              taskPrompt: input as string,
              mcpConfigPath,
              workDir,
              apiKeys: {
                [API_KEY_ENV[agent]]: process.env[API_KEY_ENV[agent]] ?? '',
              },
              maxTurns: 15,
              maxBudgetUsd: 1.5,
              timeoutMs: 120_000,
            });

            const toolCalls = result.toolCalls;

            for (const tc of toolCalls) {
              const isMessage = tc.name === 'AgentMessage';
              traced(
                (span) => {
                  span.log({
                    input: tc.arguments,
                    output: tc.result ?? tc.name,
                    metadata: { agent, condition, toolCount },
                  });
                },
                { name: isMessage ? 'agent-message' : tc.name, type: isMessage ? 'llm' : 'tool' }
              );
            }

            traced(
              (span) => {
                span.log({
                  input: { prompt: input },
                  output: {
                    exitCode: result.exitCode,
                    durationMs: result.durationMs,
                    tokenUsage: result.tokenUsage,
                  },
                  metadata: { agent, condition, toolCount },
                });
              },
              { name: 'agent-run', type: 'task' }
            );

            return { result: result.finalOutput, toolCalls };
          } finally {
            await cleanup();
            fs.rmSync(workDir, { recursive: true, force: true });
          }
        },

        scores: [
          ToolAccuracy,
          async ({
            output,
            expected,
            input,
          }: {
            output: unknown;
            expected?: unknown;
            input: unknown;
            [key: string]: unknown;
          }) => {
            const taskOutput = output as { result: string } | undefined;
            const result = await Factuality({
              output: taskOutput?.result ?? '',
              expected: `The agent should have called tool: ${expected}`,
              input: input as string,
              model: 'gpt-5.4',
              reasoningEffort: 'medium',
            } as Parameters<typeof Factuality>[0]);
            return { name: 'Factuality', score: result.score ?? 0 };
          },
        ],

        maxConcurrency: 1,
      });
    }
  }
}
