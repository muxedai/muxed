import { Command } from 'commander';
import { serversCommand } from './commands/servers.js';
import { toolsCommand } from './commands/tools.js';
import { infoCommand } from './commands/info.js';
import { callCommand } from './commands/call.js';
import { grepCommand } from './commands/grep.js';
import { resourcesCommand } from './commands/resources.js';
import { readCommand } from './commands/read.js';
import { daemonCommand } from './commands/daemon.js';
import { promptsCommand } from './commands/prompts.js';
import { promptCommand } from './commands/prompt.js';
import { completionsCommand } from './commands/completions.js';
import { tasksCommand } from './commands/tasks.js';
import { taskCommand } from './commands/task.js';
import { taskResultCommand } from './commands/task-result.js';
import { taskCancelCommand } from './commands/task-cancel.js';
import { initCommand } from './commands/init.js';
import { mcpCommand } from './commands/mcp.js';
import { typegenCommand } from './commands/typegen.js';
import { telemetryCommand } from './commands/telemetry.js';
import { capture, shutdown } from '../analytics.js';
import { getVersion } from '../utils/version.js';

export async function runCli(): Promise<void> {
  const program = new Command();
  program.name('muxed').description('The optimization layer for MCP').version(getVersion());
  program.enablePositionalOptions();
  program.option('--config <path>', 'Path to config file');

  program.commandsGroup('Servers:');
  program.addCommand(serversCommand);

  program.commandsGroup('Tools:');
  program.addCommand(toolsCommand);
  program.addCommand(infoCommand);
  program.addCommand(callCommand);
  program.addCommand(grepCommand);

  program.commandsGroup('Resources:');
  program.addCommand(resourcesCommand);
  program.addCommand(readCommand);

  program.commandsGroup('Prompts:');
  program.addCommand(promptsCommand);
  program.addCommand(promptCommand);
  program.addCommand(completionsCommand);

  program.commandsGroup('Tasks:');
  program.addCommand(tasksCommand);
  program.addCommand(taskCommand);
  program.addCommand(taskResultCommand);
  program.addCommand(taskCancelCommand);

  program.commandsGroup('Configuration:');
  program.addCommand(initCommand);
  program.addCommand(mcpCommand);
  program.addCommand(typegenCommand);
  program.addCommand(telemetryCommand);

  program.commandsGroup('Daemon:');
  program.addCommand(daemonCommand);

  const command = process.argv[2];
  capture('session_started', { command: command ?? null });

  try {
    await program.parseAsync();
  } finally {
    await shutdown();
  }
}
