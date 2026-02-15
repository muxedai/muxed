import { fork } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPidPath, getSocketPath } from '../utils/paths.js';

export function getDaemonPid(): number | null {
  try {
    const content = fs.readFileSync(getPidPath(), 'utf-8').trim();
    const pid = parseInt(content, 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function tryConnectSocket(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection(socketPath);
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 2000);

    socket.on('connect', () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(true);
    });

    socket.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

export async function isDaemonRunning(): Promise<boolean> {
  const pid = getDaemonPid();
  if (pid === null) return false;
  if (!isProcessAlive(pid)) return false;
  return tryConnectSocket(getSocketPath());
}

export async function cleanupStaleFiles(): Promise<void> {
  const pidPath = getPidPath();
  const socketPath = getSocketPath();
  const pid = getDaemonPid();

  if (pid !== null && !isProcessAlive(pid)) {
    // PID file exists but process is dead
    try {
      fs.unlinkSync(pidPath);
    } catch {
      // ignore
    }
    try {
      fs.unlinkSync(socketPath);
    } catch {
      // ignore
    }
    return;
  }

  if (pid === null) {
    // No PID file but socket might exist
    try {
      fs.unlinkSync(socketPath);
    } catch {
      // ignore
    }
  }
}

export async function daemonize(configPath?: string): Promise<void> {
  const cliEntry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'cli.ts');

  const args = ['--daemon'];
  if (configPath) {
    args.push('--config', configPath);
  }

  return new Promise<void>((resolve, reject) => {
    const child = fork(cliEntry, args, {
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });

    const timeout = setTimeout(() => {
      child.unref();
      child.disconnect?.();
      reject(new Error('Daemon failed to start: timeout waiting for ready signal'));
    }, 10_000);

    child.on('message', (msg) => {
      if (msg === 'ready') {
        clearTimeout(timeout);
        child.unref();
        child.disconnect?.();
        resolve();
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Daemon failed to start: ${err.message}`));
    });

    child.on('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Daemon exited with code ${code}`));
      }
    });
  });
}
