import { Command } from 'commander';
import { serversCommand } from './commands/servers.js';
import { toolsCommand } from './commands/tools.js';
import { infoCommand } from './commands/info.js';
import { callCommand } from './commands/call.js';
import { stopCommand } from './commands/stop.js';
import { statusCommand } from './commands/status.js';

export function runCli(): void {
  const program = new Command();
  program.name('mcpd').description('MCP Server Proxy/Aggregator').version('0.1.0');
  program.option('--config <path>', 'Path to config file');

  program.addCommand(serversCommand);
  program.addCommand(toolsCommand);
  program.addCommand(infoCommand);
  program.addCommand(callCommand);
  program.addCommand(stopCommand);
  program.addCommand(statusCommand);

  program.parse();
}
