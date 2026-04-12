import type { ServerState } from '../../core/types.js';
import { makeCliFragments, makeToolFragments, buildPrompt } from '../../core/prompt.js';
import { hasBun } from '../../core/instructions.js';

export type InstructionMode = 'cli' | 'tool';

export function buildInstructions(servers: ServerState[], mode: InstructionMode = 'cli'): string {
  const connected = servers.filter((s) => s.status === 'connected');

  const serverList = connected.map((s) => `- ${s.name}`).join('\n');

  const serverInstructions = connected
    .filter((s) => s.instructions)
    .map((s) => `### ${s.name}\n\n${s.instructions}`)
    .join('\n\n');

  const run = hasBun() ? 'bunx' : 'npx';
  const fragments = mode === 'tool' ? makeToolFragments() : makeCliFragments(run);
  return buildPrompt(fragments, {
    servers: serverList,
    serverInstructions: serverInstructions || undefined,
  });
}
