import { Command } from 'commander';
import { setTelemetryEnabled, getTelemetryStatus } from '../../analytics.js';

export const telemetryCommand = new Command('telemetry')
  .description('Enable, disable, or check anonymous telemetry')
  .argument('[action]', 'on | off | status (default: status)')
  .action((action?: string) => {
    switch (action) {
      case 'on':
        setTelemetryEnabled(true);
        console.log('Telemetry enabled.');
        break;
      case 'off':
        setTelemetryEnabled(false);
        console.log('Telemetry disabled.');
        break;
      case 'status':
      case undefined:
        console.log(`Telemetry is ${getTelemetryStatus()}.`);
        break;
      default:
        console.error(`Unknown action: ${action}. Use on, off, or status.`);
        process.exit(1);
    }
  });
