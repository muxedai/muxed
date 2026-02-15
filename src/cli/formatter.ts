import type { Tool, ServerState } from '../core/types.js';

type ContentBlock = {
  type: string;
  text?: string;
  mimeType?: string;
  data?: string;
  name?: string;
  uri?: string;
  resource?: { text?: string; blob?: string; mimeType?: string };
};

type CallToolResult = {
  content: ContentBlock[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

type DaemonStatus = {
  pid: number;
  uptime: number;
  serverCount: number;
  servers: ServerState[];
};

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '\u2026';
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function formatServers(servers: ServerState[]): string {
  if (servers.length === 0) return 'No servers configured.';

  const headers = ['Name', 'Title', 'Status', 'Protocol'];
  const rows = servers.map((s) => [
    s.name,
    s.serverInfo?.title ?? '\u2014',
    s.status,
    s.protocolVersion ?? '\u2014',
  ]);

  return formatTable(headers, rows);
}

export function formatTools(tools: Array<{ server: string; tool: Tool }>): string {
  if (tools.length === 0) return 'No tools available.';

  const headers = ['Tool', 'Title', 'Description', 'Hints'];
  const rows = tools.map(({ server, tool }) => {
    const hints: string[] = [];
    if (tool.annotations?.readOnlyHint) hints.push('[read-only]');
    if (tool.annotations?.destructiveHint) hints.push('[destructive]');
    if (tool.annotations?.idempotentHint) hints.push('[idempotent]');

    return [
      `${server}/${tool.name}`,
      tool.title ?? '\u2014',
      truncate(tool.description ?? '', 60),
      hints.join(' '),
    ];
  });

  return formatTable(headers, rows);
}

export function formatToolInfo(server: string, tool: Tool): string {
  const lines: string[] = [];

  lines.push(`${server}/${tool.name}`);
  lines.push(`Title: ${tool.title ?? '\u2014'}`);
  lines.push(`Description: ${tool.description ?? '\u2014'}`);

  lines.push('');
  lines.push('Input Schema:');
  lines.push('  ' + JSON.stringify(tool.inputSchema, null, 2).split('\n').join('\n  '));

  if (tool.outputSchema) {
    lines.push('');
    lines.push('Output Schema:');
    lines.push('  ' + JSON.stringify(tool.outputSchema, null, 2).split('\n').join('\n  '));
  }

  const annotations = tool.annotations;
  if (annotations) {
    const entries = Object.entries(annotations).filter(([, v]) => v);
    if (entries.length > 0) {
      lines.push('');
      lines.push('Annotations:');
      for (const [key, value] of entries) {
        lines.push(`  ${key}: ${value}`);
      }
    }
  }

  if (tool.execution?.taskSupport) {
    lines.push('');
    lines.push(`Task Support: ${tool.execution.taskSupport}`);
  }

  return lines.join('\n');
}

export function formatCallResult(result: CallToolResult): string {
  const parts: string[] = [];

  if (result.isError) {
    parts.push('Error:');
  }

  for (const block of result.content) {
    switch (block.type) {
      case 'text':
        parts.push(block.text ?? '');
        break;
      case 'image':
        parts.push(`[Image: ${block.mimeType}]`);
        break;
      case 'audio':
        parts.push(`[Audio: ${block.mimeType}]`);
        break;
      case 'resource_link':
        parts.push(`Resource: ${block.name ?? block.uri} (${block.uri})`);
        break;
      case 'resource':
        if (block.resource?.text !== undefined) {
          parts.push(block.resource.text);
        } else {
          parts.push(`[Binary: ${block.resource?.mimeType ?? 'unknown'}]`);
        }
        break;
      default:
        parts.push(`[${block.type}]`);
    }
  }

  if (result.structuredContent) {
    parts.push('');
    parts.push('Structured Output:');
    parts.push('  ' + JSON.stringify(result.structuredContent, null, 2).split('\n').join('\n  '));
  }

  return parts.join('\n');
}

export function formatStatus(status: DaemonStatus): string {
  const lines: string[] = [];

  lines.push(`PID: ${status.pid}`);
  lines.push(`Uptime: ${formatUptime(status.uptime)}`);
  lines.push(`Servers: ${status.serverCount}`);

  if (status.servers.length > 0) {
    lines.push('');
    for (const server of status.servers) {
      const title = server.serverInfo?.title ? ` (${server.serverInfo.title})` : '';
      lines.push(`  ${server.name}${title}: ${server.status}`);
      if (server.capabilities) {
        const caps = Object.keys(server.capabilities).join(', ');
        if (caps) {
          lines.push(`    capabilities: ${caps}`);
        }
      }
    }
  }

  return lines.join('\n');
}

export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function formatTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));

  const headerLine = headers.map((h, i) => padRight(h, widths[i]!)).join('  ');
  const separator = widths.map((w) => '\u2500'.repeat(w)).join('  ');
  const dataLines = rows.map((row) => row.map((cell, i) => padRight(cell, widths[i]!)).join('  '));

  return [headerLine, separator, ...dataLines].join('\n');
}
