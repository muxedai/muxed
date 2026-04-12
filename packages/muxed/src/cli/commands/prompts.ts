import { Command } from 'commander';
import type { Prompt } from '@modelcontextprotocol/sdk/types.js';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatPrompts, formatJson } from '../formatter.js';

export const promptsCommand = new Command('prompts')
  .description('List available MCP prompt templates across all servers')
  .argument('[server]', 'Show prompts from this server only')
  .option('--json', 'Output as JSON (machine-readable)')
  .action(async (server: string | undefined, opts: { json?: boolean }) => {
    const configPath = promptsCommand.parent?.opts().config as string | undefined;
    await ensureDaemon(configPath);
    const params = server ? { server } : undefined;
    const result = (await sendRequest('prompts/list', params)) as Array<{
      server: string;
      prompt: Prompt;
    }>;
    console.log(opts.json ? formatJson(result) : formatPrompts(result));
  });
