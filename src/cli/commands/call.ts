import { Command } from 'commander';
import { ensureDaemon, sendRequest } from '../client.js';
import { formatCallResult, formatJson } from '../formatter.js';

export const callCommand = new Command('call')
  .description('Invoke a tool')
  .argument('<server/tool>', 'Tool identifier (e.g. myserver/mytool)')
  .argument('[json]', 'JSON arguments')
  .option('--timeout <ms>', 'Request timeout in milliseconds')
  .option('--json', 'Output as JSON')
  .action(
    async (
      serverTool: string,
      jsonArgs: string | undefined,
      opts: { json?: boolean; timeout?: string }
    ) => {
      const configPath = callCommand.parent?.opts().config as string | undefined;
      await ensureDaemon(configPath);

      let parsedArgs: Record<string, unknown> = {};
      if (jsonArgs) {
        try {
          parsedArgs = JSON.parse(jsonArgs) as Record<string, unknown>;
        } catch {
          console.error('Invalid JSON arguments');
          process.exit(1);
        }
      }

      const params: Record<string, unknown> = {
        name: serverTool,
        arguments: parsedArgs,
      };
      if (opts.timeout) {
        params.timeout = parseInt(opts.timeout, 10);
      }

      const result = (await sendRequest('tools/call', params)) as {
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
    }
  );
