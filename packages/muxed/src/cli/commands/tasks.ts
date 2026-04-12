import { Command } from 'commander';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatTasks, formatJson } from '../formatter.js';

export const tasksCommand = new Command('tasks')
  .description('List active async tasks (from --async calls)')
  .argument('[server]', 'Show tasks from this server only')
  .option('--json', 'Output as JSON (machine-readable)')
  .action(async (server: string | undefined, opts: { json?: boolean }) => {
    const configPath = tasksCommand.parent?.opts().config as string | undefined;
    await ensureDaemon(configPath);
    const params = server ? { server } : undefined;
    const result = (await sendRequest('tasks/list', params)) as Array<{
      server: string;
      tasks: Array<Record<string, unknown>>;
    }>;
    console.log(opts.json ? formatJson(result) : formatTasks(result));
  });
