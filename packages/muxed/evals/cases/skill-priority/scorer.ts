import type { CapturedToolCall } from '../../types.ts';

const MAX_TURNS = 5;

type TaskOutput = {
  result: string;
  toolCalls: Array<{ name: string; arguments?: Record<string, unknown> }>;
};

/**
 * Check if a tool call invokes the /investigate-customer-issue skill.
 */
function isSkillCall(call: CapturedToolCall): boolean {
  const name = call.name;

  if (name === 'Skill') {
    const skill =
      (call.arguments?.['skill'] as string) ?? (call.arguments?.['name'] as string) ?? '';
    return skill.includes('investigate-customer-issue');
  }

  if (name === 'Bash' || name === 'bash') {
    const command = (call.arguments?.['command'] as string) ?? '';
    return command.includes('investigate-customer-issue');
  }

  if (name.includes('investigate-customer-issue')) return true;

  return false;
}

/**
 * Braintrust scorer: checks if the skill was called within the first 5 tool calls.
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
