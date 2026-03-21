import type { CapturedToolCall } from '../../types.ts';

/**
 * Check if a tool call matches the expected tool name.
 * Handles both exact matches and partial matches for muxed condition.
 */
function matchesExpectedTool(callName: string, expectedTool: string): boolean {
  // Exact match
  if (callName === expectedTool) return true;

  // Muxed condition: "muxed:call:confusable/fetch_data" matches "fetch_data"
  if (callName.includes(`/${expectedTool}`)) return true;

  // Muxed condition with server prefix
  const parts = callName.split('/');
  if (parts.length === 2 && parts[1] === expectedTool) return true;

  return false;
}

export type ToolAccuracyResult = {
  score: number;
  metadata: {
    expectedTool: string;
    calledTools: string[];
    matched: boolean;
    firstToolCall: string | null;
  };
};

/**
 * Score whether the agent called the correct tool.
 * Returns 1.0 if the correct tool was called at any point, 0.0 otherwise.
 */
export function scoreToolAccuracy(
  toolCalls: CapturedToolCall[],
  expectedTool: string
): ToolAccuracyResult {
  const calledTools = toolCalls.map((c) => c.name);
  const matched = calledTools.some((name) => matchesExpectedTool(name, expectedTool));

  return {
    score: matched ? 1.0 : 0.0,
    metadata: {
      expectedTool,
      calledTools,
      matched,
      firstToolCall: calledTools[0] ?? null,
    },
  };
}

/**
 * Vitest-evals compatible scorer function.
 * Receives `toolCalls` from the TaskResult and `expected` from the data item.
 */
export async function ToolAccuracy({
  toolCalls,
  expected,
}: {
  input: string;
  output: string;
  toolCalls?: Array<{ name: string; arguments?: Record<string, unknown> }>;
  expected?: string;
}): Promise<{ score: number; metadata?: Record<string, unknown> }> {
  if (!expected) {
    return { score: 0, metadata: { error: 'No expected tool provided' } };
  }

  const calls: CapturedToolCall[] = (toolCalls ?? []).map((tc) => ({
    name: tc.name,
    arguments: tc.arguments,
  }));

  const result = scoreToolAccuracy(calls, expected);
  return {
    score: result.score,
    metadata: result.metadata as unknown as Record<string, unknown>,
  };
}
