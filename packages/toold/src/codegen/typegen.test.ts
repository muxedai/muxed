import { describe, it, expect } from 'vitest';
import { generateTypes, type ToolEntry } from './typegen.js';

describe('generateTypes', () => {
  it('generates module augmentation with tool types', async () => {
    const tools: ToolEntry[] = [
      {
        server: 'fs',
        tool: {
          name: 'read',
          description: 'Read a file from disk.',
          inputSchema: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path'],
          },
        },
      },
    ];
    const output = await generateTypes(tools);
    expect(output).toContain("declare module 'mcpd'");
    expect(output).toContain("'fs/read'");
    expect(output).toContain('path: string');
    expect(output).toContain('output: unknown');
  });

  it('includes tool description as JSDoc on map entry', async () => {
    const tools: ToolEntry[] = [
      {
        server: 'fs',
        tool: {
          name: 'read',
          description: 'Read a file from disk.',
          inputSchema: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path'],
          },
        },
      },
    ];
    const output = await generateTypes(tools);
    expect(output).toContain('/** Read a file from disk. */');
  });

  it('includes property descriptions as JSDoc on fields', async () => {
    const tools: ToolEntry[] = [
      {
        server: 'fs',
        tool: {
          name: 'read',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Absolute path to the file.' },
              encoding: { type: 'string', description: 'Text encoding to use.' },
            },
            required: ['path'],
          },
        },
      },
    ];
    const output = await generateTypes(tools);
    expect(output).toContain('Absolute path to the file.');
    expect(output).toContain('Text encoding to use.');
  });

  it('omits JSDoc when tool has no description', async () => {
    const tools: ToolEntry[] = [
      {
        server: 'fs',
        tool: {
          name: 'read',
          inputSchema: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path'],
          },
        },
      },
    ];
    const output = await generateTypes(tools);
    // Should not have a JSDoc comment before the tool entry
    expect(output).not.toMatch(/\/\*\*.*\*\/\s*\n\s*'fs\/read'/);
  });

  it('generates typed output when outputSchema present', async () => {
    const tools: ToolEntry[] = [
      {
        server: 'gh',
        tool: {
          name: 'create_issue',
          description: 'Create a GitHub issue.',
          inputSchema: {
            type: 'object',
            properties: { title: { type: 'string', description: 'Issue title.' } },
            required: ['title'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              number: { type: 'integer', description: 'The issue number.' },
              url: { type: 'string', description: 'URL of the created issue.' },
            },
            required: ['number', 'url'],
          },
        },
      },
    ];
    const output = await generateTypes(tools);
    expect(output).toContain('number: number');
    expect(output).toContain('url: string');
    expect(output).toContain('The issue number.');
    expect(output).toContain('URL of the created issue.');
    expect(output).not.toContain('output: unknown');
  });

  it('handles tools with no properties', async () => {
    const tools: ToolEntry[] = [
      {
        server: 'srv',
        tool: {
          name: 'ping',
          inputSchema: { type: 'object' },
        },
      },
    ];
    const output = await generateTypes(tools);
    expect(output).toContain("'srv/ping'");
  });

  it('handles empty tool list', async () => {
    const output = await generateTypes([]);
    expect(output).toContain('interface McpdToolMap');
    expect(output).toContain('export {}');
  });

  it('escapes special characters in tool names', async () => {
    const tools: ToolEntry[] = [
      {
        server: 'my-server',
        tool: {
          name: "tool's",
          inputSchema: { type: 'object' },
        },
      },
    ];
    const output = await generateTypes(tools);
    expect(output).toContain("my-server/tool\\'s");
  });
});
