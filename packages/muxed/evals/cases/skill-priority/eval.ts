import { Eval, traced } from 'braintrust';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { loadTasks } from './tasks.ts';
import { SkillPriority } from './scorer.ts';
import { startMockServers } from '../../lib/mcp-server-harness.ts';
import { runAgent } from '../../lib/agent-runner.ts';
import { writeConfigFiles } from '../../lib/config-builder.ts';
import type { AgentType, Condition } from '../../types.ts';

const CASE_DIR = path.resolve('evals/cases/skill-priority');
const ENV_DIR = path.join(CASE_DIR, 'environment');
const SERVERS_DIR = path.resolve('evals/servers');

const tasks = loadTasks(path.join(CASE_DIR, 'tasks.yaml'));

const agents: AgentType[] = ['claude-code', 'codex'];
const conditions: Condition[] = ['baseline', 'muxed'];

const API_KEY_ENV: Record<AgentType, string> = {
  'claude-code': 'ANTHROPIC_API_KEY',
  codex: 'OPENAI_API_KEY',
};

for (const agent of agents) {
  for (const condition of conditions) {
    Eval(`skill-priority-${agent}-${condition}`, {
      data: () =>
        tasks.map((t) => ({
          input: t.input,
          expected: t.expected,
        })),

      task: async (input) => {
        // Config files go in a separate temp dir to avoid race conditions.
        // ENV_DIR (with skills) is mounted as the workspace.
        const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'muxed-eval-config-'));
        const { servers, cleanup } = await startMockServers([
          { name: 'analytics', scriptPath: path.join(SERVERS_DIR, 'analytics.ts') },
          { name: 'feature-flags', scriptPath: path.join(SERVERS_DIR, 'feature-flags.ts') },
          { name: 'logging', scriptPath: path.join(SERVERS_DIR, 'logging.ts') },
          { name: 'database', scriptPath: path.join(SERVERS_DIR, 'database.ts') },
        ]);

        try {
          const mcpConfigPath = writeConfigFiles(configDir, condition, servers);

          const result = await runAgent({
            agent,
            condition,
            taskPrompt: input as string,
            mcpConfigPath,
            workDir: ENV_DIR,
            apiKeys: {
              [API_KEY_ENV[agent]]: process.env[API_KEY_ENV[agent]] ?? '',
            },
            maxTurns: 20,
            maxBudgetUsd: 2.0,
            timeoutMs: 180_000,
          });

          const toolCalls = result.toolCalls;

          for (const tc of toolCalls) {
            const isMessage = tc.name === 'AgentMessage';
            traced(
              (span) => {
                span.log({
                  input: tc.arguments,
                  output: tc.result ?? tc.name,
                  metadata: { agent, condition },
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
                metadata: { agent, condition },
              });
            },
            { name: 'agent-run', type: 'task' }
          );

          return { result: result.finalOutput, toolCalls };
        } finally {
          await cleanup();
          fs.rmSync(configDir, { recursive: true, force: true });
        }
      },

      scores: [SkillPriority],

      maxConcurrency: 1,
    });
  }
}
