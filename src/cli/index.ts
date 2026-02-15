import { Command } from 'commander';
import { serversCommand } from './commands/servers.js';
import { toolsCommand } from './commands/tools.js';
import { infoCommand } from './commands/info.js';
import { callCommand } from './commands/call.js';
import { stopCommand } from './commands/stop.js';
import { statusCommand } from './commands/status.js';
import { grepCommand } from './commands/grep.js';
import { resourcesCommand } from './commands/resources.js';
import { readCommand } from './commands/read.js';
import { reloadCommand } from './commands/reload.js';
import { promptsCommand } from './commands/prompts.js';
import { promptCommand } from './commands/prompt.js';
import { completionsCommand } from './commands/completions.js';
import { tasksCommand } from './commands/tasks.js';
import { taskCommand } from './commands/task.js';
import { taskResultCommand } from './commands/task-result.js';
import { taskCancelCommand } from './commands/task-cancel.js';

export function runCli(): void {
  const program = new Command();
  program.name('mcpd').description('MCP Server Proxy/Aggregator').version('0.1.0');
  program.option('--config <path>', 'Path to config file');

  program.addCommand(serversCommand);
  program.addCommand(toolsCommand);
  program.addCommand(infoCommand);
  program.addCommand(callCommand);
  program.addCommand(grepCommand);
  program.addCommand(resourcesCommand);
  program.addCommand(readCommand);
  program.addCommand(promptsCommand);
  program.addCommand(promptCommand);
  program.addCommand(completionsCommand);
  program.addCommand(tasksCommand);
  program.addCommand(taskCommand);
  program.addCommand(taskResultCommand);
  program.addCommand(taskCancelCommand);
  program.addCommand(reloadCommand);
  program.addCommand(stopCommand);
  program.addCommand(statusCommand);

  program.parse();
}
