import { describeEval } from 'vitest-evals';
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

const CASE_DIR = import.meta.dirname;
const SERVERS_DIR = path.resolve(CASE_DIR, '..', '..', 'servers');

const tasks = loadTasks(path.join(CASE_DIR, 'tasks.yaml'));

const agents: AgentType[] = ['claude-code', 'codex'];
const toolCounts = [10, 25, 50, 100];
const conditions: Condition[] = ['baseline', 'muxed'];

const API_KEY_ENV: Record<AgentType, string> = {
  'claude-code': 'ANTHROPIC_API_KEY',
  codex: 'OPENAI_API_KEY',
};

const hasApiKey = (agent: AgentType): boolean => !process.env[API_KEY_ENV[agent]];

for (const agent of agents) {
  for (const toolCount of toolCounts) {
    for (const condition of conditions) {
      describeEval(`Tool Accuracy [${agent}/${toolCount} tools/${condition}]`, {
        skipIf: () => hasApiKey(agent),

        data: async () =>
          tasks.map((t) => ({
            name: `${t.name}/n=${toolCount}/${condition}`,
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
              taskPrompt: input,
              mcpConfigPath,
              workDir,
              apiKeys: {
                [API_KEY_ENV[agent]]: process.env[API_KEY_ENV[agent]] ?? '',
              },
              maxTurns: 15,
              maxBudgetUsd: 1.5,
              timeoutMs: 120_000,
            });

            return {
              result: result.finalOutput,
              toolCalls: result.toolCalls.map((tc) => ({
                name: tc.name,
                arguments: tc.arguments,
              })),
            };
          } finally {
            await cleanup();
            fs.rmSync(workDir, { recursive: true, force: true });
          }
        },

        scorers: [
          ToolAccuracy,
          async ({ output, expected, input }: Record<string, unknown>) => {
            const result = await Factuality({
              output: output as string,
              expected: `The agent should have called tool: ${expected}`,
              input: input as string,
            } as Parameters<typeof Factuality>[0]);
            return { score: result.score ?? 0 };
          },
        ],

        threshold: 0.7,
        timeout: 300_000,
      });
    }
  }
}
