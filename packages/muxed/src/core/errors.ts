import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// --- Error codes ---

export const ErrorCode = {
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  SERVER_NOT_FOUND: 'SERVER_NOT_FOUND',
  SERVER_NOT_CONNECTED: 'SERVER_NOT_CONNECTED',
  INVALID_ARGUMENTS: 'INVALID_ARGUMENTS',
  INVALID_FORMAT: 'INVALID_FORMAT',
  MISSING_PARAMETER: 'MISSING_PARAMETER',
  TIMEOUT: 'TIMEOUT',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export type StructuredError = {
  code: ErrorCode;
  message: string;
  suggestion: string;
  context?: Record<string, unknown>;
};

// --- Fuzzy matching ---

/** Compute Levenshtein distance between two strings. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1]![j - 1]!
          : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }

  return dp[m]![n]!;
}

/** Find tools with names similar to the given name. */
export function findSimilarTools(
  targetTool: string,
  allTools: Array<{ server: string; tool: Tool }>,
  maxResults = 3
): string[] {
  const maxDistance = Math.max(3, Math.floor(targetTool.length * 0.4));

  const scored = allTools
    .map(({ server, tool }) => {
      const fullName = `${server}/${tool.name}`;
      const toolOnly = tool.name;

      // Compare against both full name and tool-only name
      const distFull = levenshtein(targetTool.toLowerCase(), fullName.toLowerCase());
      const distTool = levenshtein(targetTool.toLowerCase(), toolOnly.toLowerCase());
      const dist = Math.min(distFull, distTool);

      return { fullName, dist };
    })
    .filter(({ dist }) => dist <= maxDistance)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, maxResults);

  return scored.map(({ fullName }) => fullName);
}

// --- Error builders ---

export function toolNotFoundError(name: string, similarTools: string[]): StructuredError {
  const hasSimilar = similarTools.length > 0;
  const suggestion = hasSimilar
    ? `Did you mean: ${similarTools.join(', ')}? Run 'muxed grep <pattern>' to search available tools.`
    : `Run 'muxed grep <pattern>' to find available tools, or 'muxed tools' to list all.`;

  return {
    code: ErrorCode.TOOL_NOT_FOUND,
    message: `Tool not found: ${name}`,
    suggestion,
    context: hasSimilar ? { similarTools } : undefined,
  };
}

export function serverNotFoundError(
  serverName: string,
  availableServers: string[]
): StructuredError {
  return {
    code: ErrorCode.SERVER_NOT_FOUND,
    message: `Server not found: ${serverName}`,
    suggestion: `Available servers: ${availableServers.join(', ') || 'none'}. Run 'muxed servers' to list all.`,
    context: { availableServers },
  };
}

export function serverNotConnectedError(serverName: string): StructuredError {
  return {
    code: ErrorCode.SERVER_NOT_CONNECTED,
    message: `Server not connected: ${serverName}`,
    suggestion: `The server may be starting up. Run 'muxed status' to check, or 'muxed reload' to reconnect.`,
  };
}

export function invalidFormatError(name: string): StructuredError {
  return {
    code: ErrorCode.INVALID_FORMAT,
    message: `Invalid tool name format: ${name}`,
    suggestion: `Use the format 'server/tool' (e.g. 'myserver/mytool'). Run 'muxed tools' to list all available tools.`,
  };
}

export function missingParameterError(param: string): StructuredError {
  return {
    code: ErrorCode.MISSING_PARAMETER,
    message: `Missing required parameter: ${param}`,
    suggestion: `Provide the '${param}' parameter in the request.`,
  };
}

export function invalidArgumentsError(toolName: string, errors: string[]): StructuredError {
  return {
    code: ErrorCode.INVALID_ARGUMENTS,
    message: `Invalid arguments for tool ${toolName}`,
    suggestion: `Run 'muxed info ${toolName}' to see the expected input schema.`,
    context: { validationErrors: errors },
  };
}

export function timeoutError(toolName: string, timeoutMs: number): StructuredError {
  return {
    code: ErrorCode.TIMEOUT,
    message: `Tool call timed out after ${timeoutMs}ms: ${toolName}`,
    suggestion: `Increase the timeout with --timeout <ms>, or use --async for long-running operations.`,
  };
}

// --- Timeout detection ---

/** Check if an error is a timeout/abort error from AbortSignal.timeout(). */
export function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return true;
  const msg = err.message.toLowerCase();
  return msg.includes('timeout') || msg.includes('aborted');
}

// --- JSON-RPC error data helper ---

/** Convert a StructuredError to the `data` field for a JSON-RPC error response. */
export function toErrorData(err: StructuredError): Record<string, unknown> {
  return {
    code: err.code,
    suggestion: err.suggestion,
    ...(err.context ? { context: err.context } : {}),
  };
}
