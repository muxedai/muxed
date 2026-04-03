import type { AgentType } from '../types.ts';
import type { CapturedToolCall } from '../types.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJsonl(raw: string): unknown[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    if (trimmed.startsWith('[')) return JSON.parse(trimmed);
    return trimmed
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Claude Code
// ---------------------------------------------------------------------------

type ContentBlock = {
  type: string;
  name?: string;
  input?: Record<string, unknown>;
  text?: string;
};

/**
 * stream-json format wraps messages: {"type":"assistant","message":{"content":[...]}}
 * json format has flat messages: {"type":"tool_use","name":"..."} or {"type":"result",...}
 * This normalises both into a flat list of content blocks + result.
 */
type NormalisedEvent = {
  type: string;
  content?: ContentBlock[];
  result?: string;
  usage?: { input_tokens: number; output_tokens: number };
};

function normaliseClaudeCodeEvents(raw: unknown[]): NormalisedEvent[] {
  const events: NormalisedEvent[] = [];
  for (const obj of raw) {
    const ev = obj as Record<string, unknown>;
    if (ev['type'] === 'assistant' && ev['message']) {
      // stream-json envelope
      const msg = ev['message'] as Record<string, unknown>;
      events.push({
        type: 'assistant',
        content: msg['content'] as ContentBlock[] | undefined,
      });
    } else if (ev['type'] === 'result') {
      events.push({
        type: 'result',
        result: ev['result'] as string | undefined,
        usage: ev['usage'] as NormalisedEvent['usage'],
      });
    } else if (ev['type'] === 'tool_use') {
      // flat json format
      events.push({
        type: 'assistant',
        content: [
          {
            type: 'tool_use',
            name: ev['name'] as string,
            input: ev['input'] as Record<string, unknown>,
          },
        ],
      });
    }
  }
  return events;
}

function parseClaudeCodeCalls(raw: unknown[]): CapturedToolCall[] {
  const calls: CapturedToolCall[] = [];
  for (const ev of normaliseClaudeCodeEvents(raw)) {
    if (ev.content) {
      for (const block of ev.content) {
        if (block.type === 'tool_use' && block.name) {
          calls.push({ name: block.name, arguments: block.input });
        }
      }
    }
  }
  return calls;
}

function extractClaudeCodeFinalOutput(raw: unknown[]): string {
  const events = normaliseClaudeCodeEvents(raw);
  const resultEv = events.find((e) => e.type === 'result');
  if (resultEv?.result) return resultEv.result;

  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]!;
    if (ev.type === 'assistant' && ev.content) {
      const text = ev.content.find((b) => b.type === 'text');
      if (text?.text) return text.text;
    }
  }
  return '';
}

function extractClaudeCodeUsage(
  raw: unknown[]
): { inputTokens: number; outputTokens: number } | undefined {
  const events = normaliseClaudeCodeEvents(raw);
  const resultEv = events.find((e) => e.type === 'result');
  if (resultEv?.usage) {
    return {
      inputTokens: resultEv.usage.input_tokens,
      outputTokens: resultEv.usage.output_tokens,
    };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Codex
// ---------------------------------------------------------------------------

type CodexEvent = {
  type: string;
  item?: {
    id?: string;
    type?: string;
    text?: string;
    command?: string;
    status?: string;
  };
  usage?: {
    input_tokens: number;
    cached_input_tokens?: number;
    output_tokens: number;
  };
};

function parseCodexCalls(events: CodexEvent[]): CapturedToolCall[] {
  const calls: CapturedToolCall[] = [];
  for (const ev of events) {
    if (ev.type === 'item.completed' && ev.item?.type === 'command_execution' && ev.item.command) {
      calls.push({
        name: 'Bash',
        arguments: { command: ev.item.command },
      });
    }
  }
  return calls;
}

function extractCodexFinalOutput(events: CodexEvent[]): string {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]!;
    if (ev.type === 'item.completed' && ev.item?.type === 'agent_message' && ev.item.text) {
      return ev.item.text;
    }
  }
  return '';
}

function extractCodexUsage(
  events: CodexEvent[]
): { inputTokens: number; outputTokens: number } | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]!;
    if (ev.type === 'turn.completed' && ev.usage) {
      return {
        inputTokens: ev.usage.input_tokens,
        outputTokens: ev.usage.output_tokens,
      };
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Unified API
// ---------------------------------------------------------------------------

export function parseToolCalls(rawOutput: string, agent: AgentType): CapturedToolCall[] {
  const parsed = parseJsonl(rawOutput);
  return agent === 'claude-code'
    ? parseClaudeCodeCalls(parsed)
    : parseCodexCalls(parsed as CodexEvent[]);
}

export function extractFinalOutput(rawOutput: string, agent: AgentType): string {
  const parsed = parseJsonl(rawOutput);
  return agent === 'claude-code'
    ? extractClaudeCodeFinalOutput(parsed)
    : extractCodexFinalOutput(parsed as CodexEvent[]);
}

export function extractTokenUsage(
  rawOutput: string,
  agent: AgentType
): { inputTokens: number; outputTokens: number } | undefined {
  const parsed = parseJsonl(rawOutput);
  return agent === 'claude-code'
    ? extractClaudeCodeUsage(parsed)
    : extractCodexUsage(parsed as CodexEvent[]);
}

/**
 * Extract the underlying muxed subcommand from Bash tool calls.
 * Works for both agents — both use Bash/shell commands to invoke muxed CLI.
 */
export function extractMuxedSubcommands(calls: CapturedToolCall[]): CapturedToolCall[] {
  const extracted: CapturedToolCall[] = [];

  for (const call of calls) {
    if (call.name === 'Bash' || call.name === 'bash') {
      const command =
        (call.arguments?.['command'] as string) ?? (call.arguments?.['cmd'] as string) ?? '';

      const callMatch = command.match(/(?:npx\s+)?muxed\s+call\s+([\w-]+\/[\w-]+)/);
      if (callMatch) {
        extracted.push({ name: `muxed:call:${callMatch[1]}`, arguments: call.arguments });
        continue;
      }

      const infoMatch = command.match(/(?:npx\s+)?muxed\s+info\s+([\w-]+\/[\w-]+)/);
      if (infoMatch) {
        extracted.push({ name: `muxed:info:${infoMatch[1]}`, arguments: call.arguments });
        continue;
      }

      if (/(?:npx\s+)?muxed\s+grep\s+/.test(command)) {
        extracted.push({ name: 'muxed:grep', arguments: call.arguments });
        continue;
      }

      if (/(?:npx\s+)?muxed\s+tools/.test(command)) {
        extracted.push({ name: 'muxed:tools', arguments: call.arguments });
        continue;
      }
    }

    extracted.push(call);
  }

  return extracted;
}
