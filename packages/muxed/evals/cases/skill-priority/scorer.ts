import type { CapturedToolCall } from '../../types.ts';

/**
 * Discovery commands that don't count as "substantive" tool calls.
 * These are part of the muxed discover → inspect → call workflow.
 */
const DISCOVERY_PATTERNS = ['muxed:grep', 'muxed:tools', /^muxed:info:/, 'Read', 'Glob', 'Grep'];

function isDiscoveryCall(name: string): boolean {
  return DISCOVERY_PATTERNS.some((pattern) =>
    typeof pattern === 'string' ? name === pattern : pattern.test(name)
  );
}

/**
 * Map a tool call name to the server it belongs to.
 * Works for both baseline (direct MCP) and muxed (via npx muxed call) conditions.
 */
function getServerName(call: CapturedToolCall): string | null {
  const name = call.name;

  // Muxed condition: "muxed:call:logging/search_logs" → "logging"
  const muxedMatch = name.match(/^muxed:call:([\w-]+)\//);
  if (muxedMatch) return muxedMatch[1]!;

  // Baseline condition: direct MCP tool names
  // Logging server tools
  if (
    ['search_logs', 'get_error_summary', 'get_trace', 'tail_logs', 'get_service_health'].includes(
      name
    )
  ) {
    return 'logging';
  }

  // Analytics server tools
  if (
    [
      'query_events',
      'get_user_sessions',
      'get_funnel',
      'query_insights',
      'list_dashboards',
      'get_dashboard_data',
    ].includes(name)
  ) {
    return 'analytics';
  }

  // Feature flags server tools
  if (['list_flags', 'get_flag', 'evaluate_flag', 'get_flag_history'].includes(name)) {
    return 'feature-flags';
  }

  // Database server tools
  if (['query', 'list_tables', 'describe_table'].includes(name)) {
    return 'database';
  }

  return null;
}

/**
 * Expected investigation order from CLAUDE.md skill:
 * 1. logging (check logs first)
 * 2. analytics (query events)
 * 3. feature-flags (check flags)
 */
const EXPECTED_ORDER = ['logging', 'analytics', 'feature-flags'];

export type SkillPriorityResult = {
  score: number;
  metadata: {
    substantiveCalls: string[];
    serverOrder: string[];
    expectedOrder: string[];
    stepScores: Record<string, number>;
  };
};

/**
 * Score whether the agent followed the investigation skill in the correct order.
 *
 * Scoring:
 * - First substantive call targets logging server → +0.25
 * - Second unique server targets analytics → +0.25
 * - Third unique server targets feature-flags → +0.25
 * - All three in correct order without skipping → +0.25
 */
export function scoreSkillPriority(toolCalls: CapturedToolCall[]): SkillPriorityResult {
  // Filter to substantive calls (exclude discovery)
  const substantive = toolCalls.filter((c) => !isDiscoveryCall(c.name));

  // Extract unique server order (first appearance)
  const seenServers = new Set<string>();
  const serverOrder: string[] = [];
  for (const call of substantive) {
    const server = getServerName(call);
    if (server && !seenServers.has(server)) {
      seenServers.add(server);
      serverOrder.push(server);
    }
  }

  let score = 0;
  const stepScores: Record<string, number> = {
    logging_first: 0,
    analytics_second: 0,
    flags_third: 0,
    correct_order: 0,
  };

  // Check step 1: logging first
  if (serverOrder[0] === EXPECTED_ORDER[0]) {
    score += 0.25;
    stepScores['logging_first'] = 1;
  }

  // Check step 2: analytics second
  if (serverOrder[1] === EXPECTED_ORDER[1]) {
    score += 0.25;
    stepScores['analytics_second'] = 1;
  }

  // Check step 3: feature-flags third
  if (serverOrder[2] === EXPECTED_ORDER[2]) {
    score += 0.25;
    stepScores['flags_third'] = 1;
  }

  // Check overall order: all three present in correct sequence
  const orderCorrect =
    serverOrder.length >= 3 &&
    serverOrder[0] === EXPECTED_ORDER[0] &&
    serverOrder[1] === EXPECTED_ORDER[1] &&
    serverOrder[2] === EXPECTED_ORDER[2];

  if (orderCorrect) {
    score += 0.25;
    stepScores['correct_order'] = 1;
  }

  return {
    score,
    metadata: {
      substantiveCalls: substantive.map((c) => c.name),
      serverOrder,
      expectedOrder: EXPECTED_ORDER,
      stepScores,
    },
  };
}

/**
 * Vitest-evals compatible scorer function.
 * Receives `toolCalls` from the TaskResult returned by the task function.
 */
export async function SkillPriority({
  toolCalls,
}: {
  input: string;
  output: string;
  toolCalls?: Array<{ name: string; arguments?: Record<string, unknown> }>;
}): Promise<{ score: number; metadata?: Record<string, unknown> }> {
  const calls: CapturedToolCall[] = (toolCalls ?? []).map((tc) => ({
    name: tc.name,
    arguments: tc.arguments,
  }));

  const result = scoreSkillPriority(calls);
  return {
    score: result.score,
    metadata: result.metadata as unknown as Record<string, unknown>,
  };
}
