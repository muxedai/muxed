import { describeEval } from 'vitest-evals';
import { ClosedQA } from 'autoevals';
import path from 'node:path';
import { loadTasks } from './tasks.ts';
import { SkillPriority } from './scorer.ts';
import { startMockServers } from '../../lib/mcp-server-harness.ts';
import { runAgent } from '../../lib/agent-runner.ts';
import { writeConfigFiles } from '../../lib/config-builder.ts';
import type { AgentType, Condition } from '../../types.ts';

const CASE_DIR = import.meta.dirname;
const ENV_DIR = path.join(CASE_DIR, 'environment');
const SERVERS_DIR = path.resolve(CASE_DIR, '..', '..', 'servers');

const tasks = loadTasks(path.join(CASE_DIR, 'tasks.yaml'));

const agents: AgentType[] = ['claude-code', 'codex'];
const conditions: Condition[] = ['baseline', 'muxed'];

const API_KEY_ENV: Record<AgentType, string> = {
  'claude-code': 'ANTHROPIC_API_KEY',
  codex: 'OPENAI_API_KEY',
};

const hasApiKey = (agent: AgentType): boolean => !process.env[API_KEY_ENV[agent]];

for (const agent of agents) {
  for (const condition of conditions) {
    describeEval(`Skill Priority [${agent}/${condition}]`, {
      skipIf: () => hasApiKey(agent),

      data: async () =>
        tasks.slice(0, 1).map((t) => ({
          name: `${t.name}/${agent}/${condition}`,
          input: t.input,
          expected: t.expected,
        })),

      task: async (input) => {
        const { servers, cleanup } = await startMockServers([
          { name: 'analytics', scriptPath: path.join(SERVERS_DIR, 'analytics.ts') },
          {
            name: 'feature-flags',
            scriptPath: path.join(SERVERS_DIR, 'feature-flags.ts'),
          },
          { name: 'logging', scriptPath: path.join(SERVERS_DIR, 'logging.ts') },
          { name: 'database', scriptPath: path.join(SERVERS_DIR, 'database.ts') },
        ]);

        try {
          const mcpConfigPath = writeConfigFiles(ENV_DIR, condition, servers);

          const result = await runAgent({
            agent,
            condition,
            taskPrompt: input,
            mcpConfigPath,
            workDir: ENV_DIR,
            apiKeys: {
              [API_KEY_ENV[agent]]: process.env[API_KEY_ENV[agent]] ?? '',
            },
            maxTurns: 20,
            maxBudgetUsd: 2.0,
            timeoutMs: 180_000,
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
        }
      },

      scorers: [
        SkillPriority,
        async ({ output, expected, input }: Record<string, unknown>) => {
          const result = await ClosedQA({
            output: output as string,
            expected: (expected as string) ?? '',
            input: input as string,
          } as Parameters<typeof ClosedQA>[0]);
          return { score: result.score ?? 0 };
        },
      ],

      threshold: 0.8,
      timeout: 300_000,
    });
  }
}
