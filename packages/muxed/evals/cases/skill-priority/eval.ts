import { Eval, traced } from 'braintrust';
import path from 'node:path';
import { loadTasks } from './tasks.ts';
import { SkillPriority } from './scorer.ts';
import { startMockServers } from '../../lib/mcp-server-harness.ts';
import { runAgent } from '../../lib/agent-runner.ts';
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

// Fixed ports — matching the hardcoded configs in environment/
const SERVER_DEFS = [
  { name: 'posthog', scriptPath: path.join(SERVERS_DIR, 'mock-posthog.ts'), port: 9700 },
  { name: 'sentry', scriptPath: path.join(SERVERS_DIR, 'mock-sentry.ts'), port: 9701 },
  { name: 'pagerduty', scriptPath: path.join(SERVERS_DIR, 'mock-pagerduty.ts'), port: 9702 },
  { name: 'linear', scriptPath: path.join(SERVERS_DIR, 'mock-linear.ts'), port: 9703 },
  { name: 'grafana', scriptPath: path.join(SERVERS_DIR, 'mock-grafana.ts'), port: 9704 },
  { name: 'slack', scriptPath: path.join(SERVERS_DIR, 'mock-slack.ts'), port: 9705 },
  { name: 'github', scriptPath: path.join(SERVERS_DIR, 'mock-github.ts'), port: 9706 },
  { name: 'datadog', scriptPath: path.join(SERVERS_DIR, 'mock-datadog.ts'), port: 9707 },
];

for (const agent of agents) {
  for (const condition of conditions) {
    Eval(`skill-priority-${agent}-${condition}`, {
      data: () =>
        tasks.map((t) => ({
          input: t.input,
          expected: t.expected,
        })),

      task: async (input) => {
        const { servers, cleanup } = await startMockServers(SERVER_DEFS);

        try {
          const result = await runAgent({
            agent,
            condition,
            taskPrompt: input as string,
            workDir: ENV_DIR,
            apiKeys: {
              [API_KEY_ENV[agent]]: process.env[API_KEY_ENV[agent]] ?? '',
            },
            maxTurns: 20,
            maxBudgetUsd: 2.0,
            timeoutMs: 300_000,
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
        }
      },

      scores: [SkillPriority],

      maxConcurrency: 1,
    });
  }
}
