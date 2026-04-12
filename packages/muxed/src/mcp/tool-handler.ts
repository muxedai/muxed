import { sendRequest } from '../client/socket.js';
import { MuxedError } from '../client/socket.js';

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

function parseCommand(command: string): { subcommand: string; args: string } {
  const trimmed = command.trim();
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) {
    return { subcommand: trimmed, args: '' };
  }
  return {
    subcommand: trimmed.slice(0, spaceIndex),
    args: trimmed.slice(spaceIndex + 1).trim(),
  };
}

function parseFlags(args: string): {
  positional: string;
  flags: Record<string, string>;
} {
  const flags: Record<string, string> = {};
  const positionalParts: string[] = [];
  const parts = args.split(/\s+/);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (part.startsWith('--') && i + 1 < parts.length) {
      const key = part.slice(2);
      flags[key] = parts[++i]!;
    } else {
      positionalParts.push(part);
    }
  }

  return { positional: positionalParts.join(' '), flags };
}

function textResult(data: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(message: string): ToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

export async function handleToolCommand(
  command: string,
  input?: Record<string, unknown>
): Promise<ToolResult> {
  const { subcommand, args } = parseCommand(command);

  try {
    switch (subcommand) {
      case 'servers': {
        const result = await sendRequest('servers/list');
        return textResult(result);
      }

      case 'tools': {
        const { positional, flags } = parseFlags(args);
        const params: Record<string, unknown> = {};
        if (positional) params.server = positional;
        if (flags.include === 'schema') params.includeSchema = true;
        if (flags.depth) params.schemaDepth = parseInt(flags.depth, 10);
        const result = await sendRequest('tools/list', params);
        return textResult(result);
      }

      case 'grep': {
        if (!args) return errorResult('Usage: grep <pattern>');
        const { positional, flags } = parseFlags(args);
        if (!positional) return errorResult('Usage: grep <pattern>');
        const params: Record<string, unknown> = { pattern: positional };
        if (flags.include === 'schema') params.includeSchema = true;
        if (flags.depth) params.schemaDepth = parseInt(flags.depth, 10);
        const result = await sendRequest('tools/grep', params);
        return textResult(result);
      }

      case 'info': {
        if (!args) return errorResult('Usage: info <server/tool> [--path <path>] [--depth <n>]');
        const { positional, flags } = parseFlags(args);
        if (!positional) return errorResult('Usage: info <server/tool>');
        const params: Record<string, unknown> = { name: positional };
        if (flags.path) params.path = flags.path;
        if (flags.depth) params.schemaDepth = parseInt(flags.depth, 10);
        const result = await sendRequest('tools/info', params);
        return textResult(result);
      }

      case 'call': {
        if (!args) return errorResult('Usage: call <server/tool>');
        const result = await sendRequest('tools/call', {
          name: args,
          args: input ?? {},
        });
        // tools/call returns { content: [...] } — pass through directly
        const callResult = result as { content?: unknown[] };
        if (callResult?.content) {
          return result as ToolResult;
        }
        return textResult(result);
      }

      case 'resources': {
        const params: Record<string, unknown> = {};
        if (args) params.server = args;
        const result = await sendRequest('resources/list', params);
        return textResult(result);
      }

      case 'read': {
        if (!args) return errorResult('Usage: read <server/resource>');
        const result = await sendRequest('resources/read', { name: args });
        return textResult(result);
      }

      default:
        return errorResult(
          `Unknown command: "${subcommand}". Available: servers, tools, grep, info, call, resources, read`
        );
    }
  } catch (err) {
    const message = err instanceof MuxedError ? err.message : String(err);
    return errorResult(message);
  }
}
