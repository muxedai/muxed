import { Command } from 'commander';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatTask, formatJson } from '../formatter.js';

export const taskCancelCommand = new Command('task-cancel')
  .description('Cancel a running task')
  .argument('<server/taskId>', 'Task identifier (e.g. myserver/task-123)')
  .option('--json', 'Output as JSON')
  .action(async (serverTaskId: string, opts: { json?: boolean }) => {
    const configPath = taskCancelCommand.parent?.opts().config as string | undefined;
    await ensureDaemon(configPath);

    const slashIndex = serverTaskId.indexOf('/');
    if (slashIndex === -1) {
      console.error('Invalid format. Use: server/taskId');
      process.exit(1);
    }

    const server = serverTaskId.slice(0, slashIndex);
    const taskId = serverTaskId.slice(slashIndex + 1);

    const result = (await sendRequest('tasks/cancel', { server, taskId })) as Record<
      string,
      unknown
    >;
    console.log(opts.json ? formatJson(result) : formatTask(result));
  });
