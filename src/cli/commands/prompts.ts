import { Command } from 'commander';
import type { Prompt } from '@modelcontextprotocol/sdk/types.js';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatPrompts, formatJson } from '../formatter.js';

export const promptsCommand = new Command('prompts')
  .description('List available prompt templates, optionally filtered by server name')
  .argument('[server]', 'Filter by server name')
  .option('--json', 'Output as JSON')
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
