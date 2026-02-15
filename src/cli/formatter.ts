import type { Tool, Resource, Prompt, ServerState } from '../core/types.js';
import type { InitResult } from '../core/agents.js';

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

export function formatResources(resources: Array<{ server: string; resource: Resource }>): string {
  if (resources.length === 0) return 'No resources available.';

  const headers = ['Resource', 'Title', 'MIME Type', 'Description'];
  const rows = resources.map(({ server, resource }) => [
    `${server}/${resource.name}`,
    resource.title ?? '\u2014',
    resource.mimeType ?? '\u2014',
    truncate(resource.description ?? '', 50),
  ]);

  return formatTable(headers, rows);
}

export function formatReadResource(result: {
  contents: Array<{ text?: string; blob?: string; mimeType?: string; uri?: string }>;
}): string {
  const parts: string[] = [];
  for (const content of result.contents) {
    if (content.text !== undefined) {
      parts.push(content.text);
    } else if (content.blob) {
      parts.push(`[Binary: ${content.mimeType ?? 'unknown'}, ${content.blob.length} bytes]`);
    }
  }
  return parts.join('\n');
}

export function formatPrompts(prompts: Array<{ server: string; prompt: Prompt }>): string {
  if (prompts.length === 0) return 'No prompts available.';

  const headers = ['Prompt', 'Title', 'Description', 'Args'];
  const rows = prompts.map(({ server, prompt }) => [
    `${server}/${prompt.name}`,
    prompt.title ?? '\u2014',
    truncate(prompt.description ?? '', 50),
    prompt.arguments ? String(prompt.arguments.length) : '0',
  ]);

  return formatTable(headers, rows);
}

export function formatPromptMessages(result: {
  description?: string;
  messages: Array<{
    role: string;
    content:
      | { type: string; text?: string; mimeType?: string; data?: string }
      | Array<{ type: string; text?: string; mimeType?: string; data?: string }>;
  }>;
}): string {
  const lines: string[] = [];
  if (result.description) {
    lines.push(result.description);
    lines.push('');
  }

  for (const msg of result.messages) {
    lines.push(`[${msg.role}]`);
    const contents = Array.isArray(msg.content) ? msg.content : [msg.content];
    for (const block of contents) {
      switch (block.type) {
        case 'text':
          lines.push(block.text ?? '');
          break;
        case 'image':
          lines.push(`[Image: ${block.mimeType}]`);
          break;
        case 'audio':
          lines.push(`[Audio: ${block.mimeType}]`);
          break;
        case 'resource':
          lines.push(`[Resource]`);
          break;
        default:
          lines.push(`[${block.type}]`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

export function formatCompletions(result: {
  completion: { values: string[]; total?: number; hasMore?: boolean };
}): string {
  if (result.completion.values.length === 0) return 'No completions.';

  const lines = result.completion.values.map((v) => `  ${v}`);
  if (result.completion.hasMore) {
    lines.push(`  ... (${result.completion.total ?? 'more'} total)`);
  }
  return lines.join('\n');
}

export function formatTasks(
  serverTasks: Array<{ server: string; tasks: Array<Record<string, unknown>> }>
): string {
  const allTasks: Array<{ server: string; task: Record<string, unknown> }> = [];
  for (const { server, tasks } of serverTasks) {
    for (const task of tasks) {
      allTasks.push({ server, task });
    }
  }

  if (allTasks.length === 0) return 'No active tasks.';

  const headers = ['Task ID', 'Status', 'Server', 'Message'];
  const rows = allTasks.map(({ server, task }) => [
    String(task.taskId ?? ''),
    String(task.status ?? ''),
    server,
    truncate(String(task.statusMessage ?? ''), 40),
  ]);

  return formatTable(headers, rows);
}

export function formatTask(task: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`Task ID: ${task.taskId}`);
  lines.push(`Status: ${task.status}`);
  if (task.statusMessage) {
    lines.push(`Message: ${task.statusMessage}`);
  }
  if (task.createdAt) {
    lines.push(`Created: ${task.createdAt}`);
  }
  if (task.lastUpdatedAt) {
    lines.push(`Updated: ${task.lastUpdatedAt}`);
  }
  return lines.join('\n');
}

export function formatReload(result: {
  added: string[];
  removed: string[];
  changed: string[];
}): string {
  const lines: string[] = [];
  if (result.added.length > 0) {
    lines.push(`Added: ${result.added.join(', ')}`);
  }
  if (result.removed.length > 0) {
    lines.push(`Removed: ${result.removed.join(', ')}`);
  }
  if (result.changed.length > 0) {
    lines.push(`Changed: ${result.changed.join(', ')}`);
  }
  if (lines.length === 0) {
    return 'No changes detected.';
  }
  return lines.join('\n');
}

export function formatInit(result: InitResult): string {
  const lines: string[] = [];

  if (result.dryRun) {
    lines.push('[dry run] No files will be modified.\n');
  }

  // Discovered agents table
  lines.push('Discovered MCP servers:\n');
  const discHeaders = ['Agent', 'Scope', 'Config', 'Servers'];
  const discRows = result.discovered.map((d) => [d.agent, d.scope, d.path, String(d.serverCount)]);
  lines.push(formatTable(discHeaders, discRows));

  // Imported
  if (result.imported.length > 0) {
    lines.push('');
    lines.push(`Imported ${result.imported.length} server(s) into ${result.mcpdConfigPath}:`);
    lines.push(`  ${result.imported.join(', ')}`);
  }

  // Skipped
  if (result.skipped.length > 0) {
    lines.push('');
    lines.push(`Skipped ${result.skipped.length} (already existed):`);
    lines.push(`  ${result.skipped.join(', ')}`);
  }

  // Conflicts
  if (result.conflicts.length > 0) {
    lines.push('');
    lines.push('Conflicts (resolved by prefixing):');
    for (const c of result.conflicts) {
      lines.push(`  ${c.name} \u2192 ${c.resolution}`);
    }
  }

  // Warnings
  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const w of result.warnings) {
      lines.push(`  ${w}`);
    }
  }

  // Modified files
  if (result.modifiedFiles.length > 0) {
    lines.push('');
    lines.push('Modified files:');
    for (const f of result.modifiedFiles) {
      lines.push(`  ${f} (backed up to ${f}.bak)`);
    }
  }

  if (result.imported.length === 0 && result.skipped.length > 0) {
    lines.push('');
    lines.push('All discovered servers already exist in mcpd config. Nothing to do.');
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
