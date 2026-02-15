import { Command } from 'commander';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatReload, formatJson } from '../formatter.js';

export const reloadCommand = new Command('reload')
  .description('Reload config, reconnect changed servers')
  .option('--json', 'Output as JSON')
  .action(async (opts: { json?: boolean }) => {
    const configPath = reloadCommand.parent?.opts().config as string | undefined;
    await ensureDaemon(configPath);
    const result = (await sendRequest('config/reload', { configPath })) as {
      added: string[];
      removed: string[];
      changed: string[];
    };
    console.log(opts.json ? formatJson(result) : formatReload(result));
  });
