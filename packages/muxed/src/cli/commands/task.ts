import { Command } from 'commander';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatTask, formatJson } from '../formatter.js';

export const taskCommand = new Command('task')
  .description('Check the status of an async task')
  .argument('<server/taskId>', 'server_name/task_id (e.g. analytics/task-abc123)')
  .option('--json', 'Output as JSON (machine-readable)')
  .action(async (serverTaskId: string, opts: { json?: boolean }) => {
    const configPath = taskCommand.parent?.opts().config as string | undefined;
    await ensureDaemon(configPath);

    const slashIndex = serverTaskId.indexOf('/');
    if (slashIndex === -1) {
      console.error('Invalid format. Use: server/taskId');
      process.exit(1);
    }

    const server = serverTaskId.slice(0, slashIndex);
    const taskId = serverTaskId.slice(slashIndex + 1);

    const result = (await sendRequest('tasks/get', { server, taskId })) as Record<string, unknown>;
    console.log(opts.json ? formatJson(result) : formatTask(result));
  });
