import { Command } from 'commander';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatCallResult, formatJson } from '../formatter.js';

export const taskResultCommand = new Command('task-result')
  .description('Retrieve the output of a completed async task')
  .argument('<server/taskId>', 'Task identifier (e.g. myserver/task-123)')
  .option('--json', 'Output as JSON')
  .action(async (serverTaskId: string, opts: { json?: boolean }) => {
    const configPath = taskResultCommand.parent?.opts().config as string | undefined;
    await ensureDaemon(configPath);

    const slashIndex = serverTaskId.indexOf('/');
    if (slashIndex === -1) {
      console.error('Invalid format. Use: server/taskId');
      process.exit(1);
    }

    const server = serverTaskId.slice(0, slashIndex);
    const taskId = serverTaskId.slice(slashIndex + 1);

    const result = (await sendRequest('tasks/result', { server, taskId })) as {
      content: Array<{
        type: string;
        text?: string;
        mimeType?: string;
        data?: string;
        name?: string;
        uri?: string;
        resource?: { text?: string; blob?: string; mimeType?: string };
      }>;
      structuredContent?: Record<string, unknown>;
      isError?: boolean;
    };
    console.log(opts.json ? formatJson(result) : formatCallResult(result));
  });
