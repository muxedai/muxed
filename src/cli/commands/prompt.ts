import { Command } from 'commander';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatPromptMessages, formatJson } from '../formatter.js';

export const promptCommand = new Command('prompt')
  .description('Get a prompt (render with arguments)')
  .argument('<server/prompt>', 'Prompt identifier (e.g. myserver/myprompt)')
  .argument('[args-json]', 'JSON arguments')
  .option('--json', 'Output as JSON')
  .action(async (serverPrompt: string, argsJson: string | undefined, opts: { json?: boolean }) => {
    const configPath = promptCommand.parent?.opts().config as string | undefined;
    await ensureDaemon(configPath);

    const slashIndex = serverPrompt.indexOf('/');
    if (slashIndex === -1) {
      console.error('Invalid format. Use: server/prompt');
      process.exit(1);
    }

    const server = serverPrompt.slice(0, slashIndex);
    const name = serverPrompt.slice(slashIndex + 1);

    let args: Record<string, string> | undefined;
    if (argsJson) {
      try {
        args = JSON.parse(argsJson) as Record<string, string>;
      } catch {
        console.error('Invalid JSON arguments');
        process.exit(1);
      }
    }

    const result = (await sendRequest('prompts/get', {
      server,
      name,
      arguments: args,
    })) as {
      description?: string;
      messages: Array<{
        role: string;
        content:
          | { type: string; text?: string; mimeType?: string; data?: string }
          | Array<{ type: string; text?: string; mimeType?: string; data?: string }>;
      }>;
    };
    console.log(opts.json ? formatJson(result) : formatPromptMessages(result));
  });
