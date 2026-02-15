import fs from 'node:fs';
import { getLogPath } from './paths.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB

export class Logger {
  private level: LogLevel;
  private logPath: string;
  private fd: number | null = null;
  private writeToStderr: boolean;

  constructor(opts?: { level?: LogLevel; logPath?: string; stderr?: boolean }) {
    this.level = opts?.level ?? 'info';
    this.logPath = opts?.logPath ?? getLogPath();
    this.writeToStderr = opts?.stderr ?? false;
  }

  private openFile(): void {
    if (this.fd !== null) return;
    try {
      this.fd = fs.openSync(this.logPath, 'a');
    } catch {
      // Cannot open log file, file logging disabled
    }
  }

  private rotateIfNeeded(): void {
    if (this.fd === null) return;
    try {
      const stat = fs.fstatSync(this.fd);
      if (stat.size > MAX_LOG_SIZE) {
        fs.closeSync(this.fd);
        fs.truncateSync(this.logPath, 0);
        this.fd = fs.openSync(this.logPath, 'a');
      }
    } catch {
      // Ignore rotation errors
    }
  }

  private formatMessage(level: LogLevel, message: string, server?: string): string {
    const ts = new Date().toISOString();
    const serverTag = server ? ` [${server}]` : '';
    return `${ts} ${level.toUpperCase()}${serverTag} ${message}`;
  }

  private log(level: LogLevel, message: string, server?: string): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[this.level]) return;

    const formatted = this.formatMessage(level, message, server);

    if (this.writeToStderr) {
      process.stderr.write(formatted + '\n');
    }

    this.openFile();
    if (this.fd !== null) {
      this.rotateIfNeeded();
      try {
        fs.writeSync(this.fd, formatted + '\n');
      } catch {
        // Ignore write errors
      }
    }
  }

  debug(message: string, server?: string): void {
    this.log('debug', message, server);
  }

  info(message: string, server?: string): void {
    this.log('info', message, server);
  }

  warn(message: string, server?: string): void {
    this.log('warn', message, server);
  }

  error(message: string, server?: string): void {
    this.log('error', message, server);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  close(): void {
    if (this.fd !== null) {
      try {
        fs.closeSync(this.fd);
      } catch {
        // Ignore close errors
      }
      this.fd = null;
    }
  }
}

// Singleton logger for the daemon process
let defaultLogger: Logger | undefined;

export function getLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger();
  }
  return defaultLogger;
}

export function initLogger(opts?: {
  level?: LogLevel;
  logPath?: string;
  stderr?: boolean;
}): Logger {
  if (defaultLogger) {
    defaultLogger.close();
  }
  defaultLogger = new Logger(opts);
  return defaultLogger;
}
