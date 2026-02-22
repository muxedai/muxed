import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Logger } from './logger.js';

describe('Logger', () => {
  const tmpDir = path.join(os.tmpdir(), 'toold-logger-test');
  let logPath: string;
  let logger: Logger;

  afterEach(() => {
    if (logger) logger.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setup(opts?: { level?: 'debug' | 'info' | 'warn' | 'error' }) {
    fs.mkdirSync(tmpDir, { recursive: true });
    logPath = path.join(tmpDir, 'test.log');
    logger = new Logger({ level: opts?.level ?? 'debug', logPath, stderr: false });
  }

  it('writes log entries to file', () => {
    setup();
    logger.info('hello world');
    logger.close();

    const content = fs.readFileSync(logPath, 'utf-8');
    expect(content).toContain('INFO');
    expect(content).toContain('hello world');
  });

  it('includes timestamp in log entries', () => {
    setup();
    logger.info('timestamp test');
    logger.close();

    const content = fs.readFileSync(logPath, 'utf-8');
    // ISO timestamp format check
    expect(content).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('includes server name when provided', () => {
    setup();
    logger.info('server event', 'filesystem');
    logger.close();

    const content = fs.readFileSync(logPath, 'utf-8');
    expect(content).toContain('[filesystem]');
  });

  it('respects log level filtering', () => {
    setup({ level: 'warn' });
    logger.debug('should not appear');
    logger.info('should not appear');
    logger.warn('should appear');
    logger.error('should also appear');
    logger.close();

    const content = fs.readFileSync(logPath, 'utf-8');
    expect(content).not.toContain('should not appear');
    expect(content).toContain('should appear');
    expect(content).toContain('should also appear');
  });

  it('writes all log levels when set to debug', () => {
    setup({ level: 'debug' });
    logger.debug('debug msg');
    logger.info('info msg');
    logger.warn('warn msg');
    logger.error('error msg');
    logger.close();

    const content = fs.readFileSync(logPath, 'utf-8');
    expect(content).toContain('DEBUG');
    expect(content).toContain('INFO');
    expect(content).toContain('WARN');
    expect(content).toContain('ERROR');
  });

  it('setLevel changes filtering at runtime', () => {
    setup({ level: 'debug' });
    logger.debug('before-level-switch');
    logger.setLevel('error');
    logger.debug('filtered-debug-msg');
    logger.error('kept-error-msg');
    logger.close();

    const content = fs.readFileSync(logPath, 'utf-8');
    expect(content).toContain('before-level-switch');
    expect(content).not.toContain('filtered-debug-msg');
    expect(content).toContain('kept-error-msg');
  });

  it('truncates log file when it exceeds 10MB', () => {
    setup();
    // Write just over 10MB
    const bigLine = 'x'.repeat(1024) + '\n';
    const fd = fs.openSync(logPath, 'w');
    for (let i = 0; i < 10 * 1024 + 1; i++) {
      fs.writeSync(fd, bigLine);
    }
    fs.closeSync(fd);

    // Close and recreate logger to pick up the large file
    logger.close();
    logger = new Logger({ level: 'debug', logPath, stderr: false });
    logger.info('after rotation');
    logger.close();

    const stat = fs.statSync(logPath);
    // After rotation the file should be small (just the new entry)
    expect(stat.size).toBeLessThan(1024 * 1024);
  });

  it('does not throw when log directory does not exist', () => {
    const badPath = path.join(tmpDir, 'nonexistent', 'sub', 'test.log');
    const badLogger = new Logger({ level: 'debug', logPath: badPath, stderr: false });
    // Should not throw, just silently fail
    expect(() => badLogger.info('test')).not.toThrow();
    badLogger.close();
  });
});
