import { startDaemon } from './daemon/index.js';
import { runCli } from './cli/index.js';

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
  runCli().catch((err) => {
    console.error(err instanceof Error ? err.message : 'Unexpected error');
    process.exit(1);
  });
}
