import type { CapturedToolCall } from '../types.ts';

type ClaudeCodeMessage = {
  type: string;
  subtype?: string;
  content?: Array<{
    type: string;
    name?: string;
    input?: Record<string, unknown>;
    text?: string;
    id?: string;
    tool_use_id?: string;
  }>;
  // Top-level tool_use fields (flat format)
  name?: string;
  input?: Record<string, unknown>;
  id?: string;
  // Result message
  result?: string;
  cost_usd?: number;
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
  session_id?: string;
  is_error?: boolean;
  total_cost_usd?: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
};

/**
 * Parse Claude Code `--output-format json` output into tool call sequences.
 *
 * Claude Code outputs a JSON array of messages, or one JSON object per line.
 */
export function parseClaudeCodeOutput(rawOutput: string): CapturedToolCall[] {
  const calls: CapturedToolCall[] = [];

  let messages: ClaudeCodeMessage[];
  try {
    const trimmed = rawOutput.trim();
    if (trimmed.startsWith('[')) {
      messages = JSON.parse(trimmed);
    } else {
      // One JSON object per line (JSONL)
      messages = trimmed
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
    }
  } catch {
    return calls;
  }

  for (const msg of messages) {
    // Handle nested content array format
    if (msg.content && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'tool_use' && block.name) {
          calls.push({
            name: block.name,
            arguments: block.input,
          });
        }
      }
    }

    // Handle flat tool_use format
    if (msg.type === 'tool_use' && msg.name) {
      calls.push({
        name: msg.name,
        arguments: msg.input,
      });
    }
  }

  return calls;
}

/**
 * Extract the underlying muxed subcommand from Bash tool calls.
 * When the agent uses muxed via CLI, tool calls appear as Bash commands
 * like `npx muxed call logging/search_logs '{"query": "error"}'`.
 */
export function extractMuxedSubcommands(calls: CapturedToolCall[]): CapturedToolCall[] {
  const extracted: CapturedToolCall[] = [];

  for (const call of calls) {
    if (call.name === 'Bash' || call.name === 'bash') {
      const command =
        (call.arguments?.['command'] as string) ?? (call.arguments?.['cmd'] as string) ?? '';

      // Match: npx muxed call <server/tool> [args]
      const callMatch = command.match(/npx\s+muxed\s+call\s+([\w-]+\/[\w-]+)/);
      if (callMatch) {
        extracted.push({
          name: `muxed:call:${callMatch[1]}`,
          arguments: call.arguments,
        });
        continue;
      }

      // Match: npx muxed info <server/tool>
      const infoMatch = command.match(/npx\s+muxed\s+info\s+([\w-]+\/[\w-]+)/);
      if (infoMatch) {
        extracted.push({
          name: `muxed:info:${infoMatch[1]}`,
          arguments: call.arguments,
        });
        continue;
      }

      // Match: npx muxed grep <pattern>
      const grepMatch = command.match(/npx\s+muxed\s+grep\s+/);
      if (grepMatch) {
        extracted.push({
          name: 'muxed:grep',
          arguments: call.arguments,
        });
        continue;
      }

      // Match: npx muxed tools [server]
      const toolsMatch = command.match(/npx\s+muxed\s+tools/);
      if (toolsMatch) {
        extracted.push({
          name: 'muxed:tools',
          arguments: call.arguments,
        });
        continue;
      }
    }

    // Pass through non-bash or non-muxed calls
    extracted.push(call);
  }

  return extracted;
}

/**
 * Get the final text output from Claude Code's JSON output.
 */
export function extractFinalOutput(rawOutput: string): string {
  let messages: ClaudeCodeMessage[];
  try {
    const trimmed = rawOutput.trim();
    if (trimmed.startsWith('[')) {
      messages = JSON.parse(trimmed);
    } else {
      messages = trimmed
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
    }
  } catch {
    return rawOutput;
  }

  // Find the result message
  const resultMsg = messages.find((m) => m.type === 'result');
  if (resultMsg?.result) {
    return resultMsg.result;
  }

  // Fall back to last assistant text message
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (msg.type === 'assistant' && msg.content) {
      const textBlock = msg.content.find((b) => b.type === 'text');
      if (textBlock?.text) return textBlock.text;
    }
    if (msg.type === 'text' && msg.content) {
      const textBlock = msg.content.find((b) => b.type === 'text');
      if (textBlock?.text) return textBlock.text;
    }
  }

  return rawOutput;
}

/**
 * Extract token usage from Claude Code result message.
 */
export function extractTokenUsage(
  rawOutput: string
): { inputTokens: number; outputTokens: number } | undefined {
  let messages: ClaudeCodeMessage[];
  try {
    const trimmed = rawOutput.trim();
    if (trimmed.startsWith('[')) {
      messages = JSON.parse(trimmed);
    } else {
      messages = trimmed
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
    }
  } catch {
    return undefined;
  }

  const resultMsg = messages.find((m) => m.type === 'result');
  if (resultMsg?.usage) {
    return {
      inputTokens: resultMsg.usage.input_tokens,
      outputTokens: resultMsg.usage.output_tokens,
    };
  }

  return undefined;
}
