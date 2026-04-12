import { Command } from 'commander';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatCompletions, formatJson } from '../formatter.js';

export const completionsCommand = new Command('completions')
  .description('Get argument completions for a prompt or resource')
  .argument('<type>', '"prompt" or "resource"')
  .argument('<name>', 'server_name/template_name')
  .argument('<arg>', 'Argument name to complete')
  .argument('<value>', 'Partial value to get suggestions for')
  .option('--json', 'Output as JSON (machine-readable)')
  .addHelpText(
    'after',
    `
Examples:
  muxed completions prompt myserver/summarize language "py"
  muxed completions resource myserver/files path "/home/"`
  )
  .action(
    async (type: string, name: string, arg: string, value: string, opts: { json?: boolean }) => {
      const configPath = completionsCommand.parent?.opts().config as string | undefined;
      await ensureDaemon(configPath);

      const slashIndex = name.indexOf('/');
      if (slashIndex === -1) {
        console.error('Invalid name format. Use: server/name');
        process.exit(1);
      }

      const server = name.slice(0, slashIndex);
      const refName = name.slice(slashIndex + 1);

      const refType =
        type === 'prompt' ? 'ref/prompt' : type === 'resource' ? 'ref/resource' : type;
      const ref: { type: string; name: string; uri?: string } = { type: refType, name: refName };
      if (type === 'resource') {
        ref.uri = refName;
      }

      const result = (await sendRequest('completions/complete', {
        server,
        ref,
        argument: { name: arg, value },
      })) as { completion: { values: string[]; total?: number; hasMore?: boolean } };
      console.log(opts.json ? formatJson(result) : formatCompletions(result));
    }
  );
