import { Command } from 'commander';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatCallResult, formatJson } from '../formatter.js';

type CallResult = {
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

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

export const callCommand = new Command('call')
  .description('Execute a tool with JSON arguments (use - for stdin, --async for background)')
  .argument('<server/tool>', 'Tool identifier (e.g. myserver/mytool)')
  .argument('[json]', 'JSON arguments (use - for stdin)')
  .option('--timeout <ms>', 'Request timeout in milliseconds')
  .option('--async', 'Use task-based execution (return task handle immediately)')
  .option('--json', 'Output as JSON')
  .action(
    async (
      serverTool: string,
      jsonArgs: string | undefined,
      opts: { json?: boolean; timeout?: string; async?: boolean }
    ) => {
      const configPath = callCommand.parent?.opts().config as string | undefined;
      await ensureDaemon(configPath);

      let parsedArgs: Record<string, unknown> = {};
      if (jsonArgs === '-') {
        try {
          const stdinData = await readStdin();
          parsedArgs = JSON.parse(stdinData) as Record<string, unknown>;
        } catch {
          console.error('Invalid JSON from stdin');
          process.exit(1);
        }
      } else if (jsonArgs) {
        try {
          parsedArgs = JSON.parse(jsonArgs) as Record<string, unknown>;
        } catch {
          console.error('Invalid JSON arguments');
          process.exit(1);
        }
      }

      // Check tool's task support to decide execution mode
      if (opts.async) {
        // Async mode: use task-based execution
        const taskResult = (await sendRequest('tools/call-async', {
          name: serverTool,
          arguments: parsedArgs,
        })) as { taskId: string; status: string; server: string };

        if (opts.json) {
          console.log(formatJson(taskResult));
        } else {
          console.log(`Task created: ${taskResult.taskId} (status: ${taskResult.status})`);
        }
        return;
      }

      const params: Record<string, unknown> = {
        name: serverTool,
        arguments: parsedArgs,
      };
      if (opts.timeout) {
        params.timeout = parseInt(opts.timeout, 10);
      }

      const result = (await sendRequest('tools/call', params)) as CallResult;
      console.log(opts.json ? formatJson(result) : formatCallResult(result));
    }
  );
