import type { CapturedToolCall } from '../../types.ts';

type TaskOutput = {
  result: string;
  toolCalls: Array<{ name: string; arguments?: Record<string, unknown> }>;
};

/**
 * Check if a tool call matches the expected tool name.
 */
function matchesExpectedTool(callName: string, expectedTool: string): boolean {
  if (callName === expectedTool) return true;
  if (callName.includes(`/${expectedTool}`)) return true;
  const parts = callName.split('/');
  if (parts.length === 2 && parts[1] === expectedTool) return true;
  return false;
}

/**
 * Braintrust scorer: checks if the agent called the correct tool.
 */
export function ToolAccuracy({
  output,
  expected,
}: {
  output: unknown;
  expected?: unknown;
  [key: string]: unknown;
}) {
  const taskOutput = output as TaskOutput | undefined;
  const expectedTool = expected as string;

  if (!expectedTool) {
    return { name: 'ToolAccuracy', score: 0, metadata: { error: 'No expected tool provided' } };
  }

  const toolCalls: CapturedToolCall[] = (taskOutput?.toolCalls ?? []).map((tc) => ({
    name: tc.name,
    arguments: tc.arguments,
  }));

  const calledTools = toolCalls.map((c) => c.name);
  const matched = calledTools.some((name) => matchesExpectedTool(name, expectedTool));

  return {
    name: 'ToolAccuracy',
    score: matched ? 1.0 : 0.0,
    metadata: {
      expectedTool,
      calledTools,
      matched,
      firstToolCall: calledTools[0] ?? null,
    },
  };
}
