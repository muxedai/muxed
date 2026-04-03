import type { CapturedToolCall } from '../../types.ts';

const MAX_TURNS = 5;

/**
 * Check if a tool call invokes the /investigate-customer-issue skill.
 * Claude Code: Skill tool with skill name.
 * Codex: may appear as a bash command or direct skill invocation.
 */
function isSkillCall(call: CapturedToolCall): boolean {
  const name = call.name;

  // Claude Code Skill tool
  if (name === 'Skill') {
    const skill =
      (call.arguments?.['skill'] as string) ?? (call.arguments?.['name'] as string) ?? '';
    return skill.includes('investigate-customer-issue');
  }

  // Direct slash-command reference in Bash
  if (name === 'Bash' || name === 'bash') {
    const command = (call.arguments?.['command'] as string) ?? '';
    return command.includes('investigate-customer-issue');
  }

  // Tool name itself matches
  if (name.includes('investigate-customer-issue')) return true;

  return false;
}

export type SkillPriorityResult = {
  score: number;
  metadata: {
    skillCalledAtTurn: number | null;
    totalCalls: number;
    firstCalls: string[];
  };
};

/**
 * Score whether the agent invoked the skill within the first N tool calls.
 *
 * 1.0 if the skill was called within the first 5 tool calls, 0.0 otherwise.
 */
export function scoreSkillPriority(toolCalls: CapturedToolCall[]): SkillPriorityResult {
  const first = toolCalls.slice(0, MAX_TURNS);
  const idx = first.findIndex(isSkillCall);

  return {
    score: idx !== -1 ? 1.0 : 0.0,
    metadata: {
      skillCalledAtTurn: idx !== -1 ? idx + 1 : null,
      totalCalls: toolCalls.length,
      firstCalls: first.map((c) => c.name),
    },
  };
}

/**
 * Vitest-evals compatible scorer function.
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
