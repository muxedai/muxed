import { Command } from 'commander';
import { ensureDaemon, sendRequest, MuxedError } from '../client.js';
import {
  formatCallResult,
  formatJson,
  formatStructuredError,
  formatValidation,
} from '../formatter.js';
import { capture } from '../../analytics.js';

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

type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  unsupported?: boolean;
  tool?: { name: string; annotations?: Record<string, unknown> };
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
  .description('Execute a tool with JSON arguments')
  .argument('<server/tool>', 'server_name/tool_name (e.g. postgres/query)')
  .argument('[json]', 'JSON object with arguments, or - to read from stdin')
  .option('--dry-run', 'Validate arguments without executing (catches errors early)')
  .option(
    '--fields <paths>',
    'Extract specific fields from response (comma-separated dot-notation)'
  )
  .option('--timeout <ms>', 'Timeout in milliseconds')
  .option('--async', 'Run in background, return a task ID instead of waiting')
  .option('--json', 'Output as JSON (machine-readable)')
  .addHelpText(
    'after',
    `
Examples:
  muxed call postgres/query '{"sql": "SELECT * FROM users LIMIT 5"}'
  muxed call fs/read_file '{"path": "/tmp/data.json"}' --fields "content"
  muxed call server/tool '{"a": 1}' --dry-run     Validate without executing
  echo '{"sql": "..."}' | muxed call db/query -    Read args from stdin
  muxed call analytics/export '{}' --async         Returns task ID immediately`
  )
  .action(
    async (
      serverTool: string,
      jsonArgs: string | undefined,
      opts: {
        json?: boolean;
        timeout?: string;
        async?: boolean;
        dryRun?: boolean;
        fields?: string;
      }
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

      const [server, tool] = serverTool.split('/');

      // Dry-run mode: validate without executing
      if (opts.dryRun) {
        try {
          const result = (await sendRequest('tools/validate', {
            name: serverTool,
            arguments: parsedArgs,
          })) as ValidationResult;

          capture('tool_called', {
            server,
            tool,
            mode: 'dry-run',
            status: result.valid ? 'success' : 'validation_error',
          });

          if (opts.json) {
            console.log(formatJson(result));
          } else {
            console.log(formatValidation(result));
          }

          if (!result.valid) process.exit(1);
        } catch (err) {
          capture('tool_called', { server, tool, mode: 'dry-run', status: 'error' });

          if (err instanceof MuxedError && err.data) {
            const errorData = err.data as {
              code?: string;
              suggestion?: string;
              context?: Record<string, unknown>;
            };
            if (opts.json) {
              console.log(formatJson({ code: err.code, message: err.message, data: err.data }));
            } else {
              console.error(
                formatStructuredError({ code: err.code, message: err.message, data: errorData })
              );
            }
          } else {
            console.error(err instanceof Error ? err.message : 'Validation failed');
          }
          process.exit(1);
        }
        return;
      }

      // Async mode
      if (opts.async) {
        try {
          const taskResult = (await sendRequest('tools/call-async', {
            name: serverTool,
            arguments: parsedArgs,
          })) as { taskId: string; status: string; server: string };

          capture('tool_called', { server, tool, mode: 'async', status: 'success' });

          if (opts.json) {
            console.log(formatJson(taskResult));
          } else {
            console.log(`Task created: ${taskResult.taskId} (status: ${taskResult.status})`);
          }
        } catch (err) {
          capture('tool_called', { server, tool, mode: 'async', status: 'error' });

          if (err instanceof MuxedError && err.data) {
            const errorData = err.data as {
              code?: string;
              suggestion?: string;
              context?: Record<string, unknown>;
            };
            if (opts.json) {
              console.log(formatJson({ code: err.code, message: err.message, data: err.data }));
            } else {
              console.error(
                formatStructuredError({ code: err.code, message: err.message, data: errorData })
              );
            }
          } else {
            console.error(err instanceof Error ? err.message : 'Call failed');
          }
          process.exit(1);
        }
        return;
      }

      // Normal call
      try {
        const callParams: Record<string, unknown> = {
          name: serverTool,
          arguments: parsedArgs,
        };
        if (opts.timeout) {
          callParams.timeout = parseInt(opts.timeout, 10);
        }
        if (opts.fields) {
          callParams.fields = opts.fields.split(',').map((f) => f.trim());
        }

        const result = (await sendRequest('tools/call', callParams)) as CallResult;
        capture('tool_called', {
          server,
          tool,
          mode: 'sync',
          status: result.isError ? 'tool_error' : 'success',
          has_timeout: !!opts.timeout,
          has_fields: !!opts.fields,
          stdin_input: jsonArgs === '-',
        });
        console.log(opts.json ? formatJson(result) : formatCallResult(result));
      } catch (err) {
        capture('tool_called', {
          server,
          tool,
          mode: 'sync',
          status: 'error',
          has_timeout: !!opts.timeout,
          has_fields: !!opts.fields,
          stdin_input: jsonArgs === '-',
        });
        if (err instanceof MuxedError && err.data) {
          const errorData = err.data as {
            code?: string;
            suggestion?: string;
            context?: Record<string, unknown>;
          };
          if (opts.json) {
            console.log(formatJson({ code: err.code, message: err.message, data: err.data }));
          } else {
            console.error(
              formatStructuredError({ code: err.code, message: err.message, data: errorData })
            );
          }
        } else {
          console.error(err instanceof Error ? err.message : 'Call failed');
        }
        process.exit(1);
      }
    }
  );
