import type { CapturedToolCall } from '../../types.ts';

const MAX_TURNS = 5;

const SKILL_NAMES = ['investigate-customer-issue', 'exploring-llm-traces'];

type TaskOutput = {
  result: string;
  toolCalls: Array<{ name: string; arguments?: Record<string, unknown> }>;
};

/**
 * Check if a tool call invokes any of the known skills.
 */
function isSkillCall(call: CapturedToolCall): boolean {
  const name = call.name;

  if (name === 'Skill') {
    const skill =
      (call.arguments?.['skill'] as string) ?? (call.arguments?.['name'] as string) ?? '';
    return SKILL_NAMES.some((s) => skill.includes(s));
  }

  if (name === 'Bash' || name === 'bash') {
    const command = (call.arguments?.['command'] as string) ?? '';
    return SKILL_NAMES.some((s) => command.includes(s));
  }

  return SKILL_NAMES.some((s) => name.includes(s));
}

/**
 * Braintrust scorer: checks if a skill was called within the first 5 tool calls.
 */
export function SkillPriority({ output }: { output: unknown; [key: string]: unknown }) {
  const taskOutput = output as TaskOutput | undefined;
  const toolCalls: CapturedToolCall[] = (taskOutput?.toolCalls ?? []).map((tc) => ({
    name: tc.name,
    arguments: tc.arguments,
  }));

  const first = toolCalls.slice(0, MAX_TURNS);
  const idx = first.findIndex(isSkillCall);

  return {
    name: 'SkillPriority',
    score: idx !== -1 ? 1.0 : 0.0,
    metadata: {
      skillCalledAtTurn: idx !== -1 ? idx + 1 : null,
      totalCalls: toolCalls.length,
      firstCalls: first.map((c) => c.name),
    },
  };
}
