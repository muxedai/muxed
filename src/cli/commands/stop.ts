import { Command } from 'commander';
import { sendRequest } from '../client.js';

export const stopCommand = new Command('stop').description('Stop the daemon').action(async () => {
  try {
    await sendRequest('daemon/stop');
    console.log('Daemon stopped');
  } catch {
    console.log('Daemon is not running');
  }
});
