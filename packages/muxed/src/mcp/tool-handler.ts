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
        const params: Record<string, unknown> = {};
        if (args) params.server = args;
        const result = await sendRequest('tools/list', params);
        return textResult(result);
      }

      case 'grep': {
        if (!args) return errorResult('Usage: grep <pattern>');
        const result = await sendRequest('tools/grep', { pattern: args });
        return textResult(result);
      }

      case 'info': {
        if (!args) return errorResult('Usage: info <server/tool>');
        const result = await sendRequest('tools/info', { name: args });
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
