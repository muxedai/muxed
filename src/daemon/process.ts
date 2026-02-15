import { fork } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { getMcpdDir, getPidPath, getSocketPath } from '../utils/paths.js';

function getLockPath(): string {
  return path.join(getMcpdDir(), 'mcpd.lock');
}

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

function isMcpdProcess(pid: number): boolean {
  // Verify the PID is actually an mcpd/node process
  try {
    const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf-8');
    return cmdline.includes('mcpd') || cmdline.includes('node');
  } catch {
    // /proc may not exist (macOS), fall back to process alive check
    return isProcessAlive(pid);
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

function acquireLock(): boolean {
  const lockPath = getLockPath();
  try {
    // Use exclusive flag to ensure atomic creation
    fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      // Lock file exists — check if the holder is still alive
      try {
        const lockPid = parseInt(fs.readFileSync(lockPath, 'utf-8').trim(), 10);
        if (!Number.isFinite(lockPid) || !isProcessAlive(lockPid)) {
          // Stale lock, remove and retry
          fs.unlinkSync(lockPath);
          try {
            fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
            return true;
          } catch {
            return false;
          }
        }
      } catch {
        // Can't read lock file, try to remove
        try {
          fs.unlinkSync(lockPath);
        } catch {
          // ignore
        }
      }
    }
    return false;
  }
}

function releaseLock(): void {
  try {
    fs.unlinkSync(getLockPath());
  } catch {
    // ignore
  }
}

export async function isDaemonRunning(): Promise<boolean> {
  const pid = getDaemonPid();
  if (pid === null) return false;
  if (!isProcessAlive(pid)) return false;
  if (!isMcpdProcess(pid)) return false;
  return tryConnectSocket(getSocketPath());
}

export async function cleanupStaleFiles(): Promise<void> {
  const pidPath = getPidPath();
  const socketPath = getSocketPath();
  const pid = getDaemonPid();

  if (pid !== null && !isProcessAlive(pid)) {
    // PID file exists but process is dead — stale
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
    releaseLock();
    return;
  }

  if (pid !== null && isProcessAlive(pid) && !isMcpdProcess(pid)) {
    // PID exists and alive, but not an mcpd process — stale PID file
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
    releaseLock();
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
  // Acquire lock to prevent race conditions
  if (!acquireLock()) {
    // Another process is starting the daemon, wait for it
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const running = await isDaemonRunning();
    if (running) return;
    throw new Error('Another process is starting the daemon. Try again.');
  }

  try {
    // Use process.argv[1] to get the actual script being run (works for both
    // built dist/cli.mjs and dev src/cli.ts)
    const cliEntry = process.argv[1]!;

    const args = ['--daemon'];
    if (configPath) {
      args.push('--config', configPath);
    }

    await new Promise<void>((resolve, reject) => {
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
  } finally {
    releaseLock();
  }
}
