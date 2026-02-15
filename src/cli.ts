import { Command } from 'commander';
import { startDaemon } from './daemon/index.js';

// If --daemon flag is present, start the daemon instead of the CLI
const daemonIndex = process.argv.indexOf('--daemon');
if (daemonIndex !== -1) {
  const configIndex = process.argv.indexOf('--config');
  const configPath = configIndex !== -1 ? process.argv[configIndex + 1] : undefined;
  startDaemon(configPath).catch((err) => {
    console.error('Failed to start daemon:', err);
    process.exit(1);
  });
} else {
  const program = new Command();
  program.name('mcpd').version('0.1.0').description('MCP server proxy/aggregator');
  program.parse();
}
