import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  buildStaticInstructions,
  extractMuxedVersion,
  compareSemver,
  injectInstructions,
  hasBun,
  type InstructionTarget,
} from './instructions.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'muxed-instructions-test-'));
}

function makeTarget(tmpDir: string, overrides: Partial<InstructionTarget> = {}): InstructionTarget {
  return {
    name: 'test-target',
    filePath: path.join(tmpDir, 'CLAUDE.md'),
    format: 'tagged',
    scope: 'global',
    ...overrides,
  };
}

describe('buildStaticInstructions', () => {
  const bun = hasBun();
  const run = bun ? 'bunx' : 'npx';

  it('returns non-empty content', () => {
    const content = buildStaticInstructions();
    expect(content.length).toBeGreaterThan(100);
  });

  it('uses detected runner in CLI instructions', () => {
    const content = buildStaticInstructions();
    expect(content).toContain(`${run} muxed`);
  });

  it('contains Node.js script usage', () => {
    const content = buildStaticInstructions();
    expect(content).toContain('createClient');
    expect(content).toContain('muxed/client');
  });

  it('includes tsx runner for scripts', () => {
    const content = buildStaticInstructions();
    const tsx = bun ? 'bun' : 'npx tsx';
    expect(content).toContain(`${tsx} script.ts`);
  });

  it('explains when to use scripts vs CLI', () => {
    const content = buildStaticInstructions();
    expect(content).toContain('Scripts');
    expect(content).toContain('CLI');
  });

  it('includes MCP CLI Proxy heading', () => {
    const content = buildStaticInstructions();
    expect(content).toContain('# Muxed — MCP CLI Proxy');
  });

  it('includes progressive schema exploration', () => {
    const content = buildStaticInstructions();
    expect(content).toContain('--depth 1');
    expect(content).toContain('--path filters');
  });

  it('includes tools --include schema', () => {
    const content = buildStaticInstructions();
    expect(content).toContain('--include schema');
  });

  it('includes usage examples', () => {
    const content = buildStaticInstructions();
    expect(content).toContain('slack/search_private');
  });
});

describe('extractMuxedVersion', () => {
  it('extracts version from tagged block', () => {
    const content = `Some content\n<muxed version="1.2.3">\nstuff\n</muxed>\nmore`;
    expect(extractMuxedVersion(content, 'tagged')).toBe('1.2.3');
  });

  it('returns null when no tagged block exists', () => {
    const content = 'Just a plain markdown file\n# Heading\nContent';
    expect(extractMuxedVersion(content, 'tagged')).toBeNull();
  });

  it('extracts version from MDC frontmatter', () => {
    const content = `---\ndescription: Test\nmuxed_version: 2.0.1\n---\n\nContent`;
    expect(extractMuxedVersion(content, 'owned')).toBe('2.0.1');
  });

  it('returns null when MDC has no muxed_version', () => {
    const content = `---\ndescription: Test\n---\n\nContent`;
    expect(extractMuxedVersion(content, 'owned')).toBeNull();
  });

  it('returns null when MDC has no frontmatter', () => {
    const content = 'Just plain content';
    expect(extractMuxedVersion(content, 'owned')).toBeNull();
  });
});

describe('compareSemver', () => {
  it('returns 0 for equal versions', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
  });

  it('returns -1 when a < b', () => {
    expect(compareSemver('1.2.3', '1.2.4')).toBe(-1);
    expect(compareSemver('1.2.3', '1.3.0')).toBe(-1);
    expect(compareSemver('1.2.3', '2.0.0')).toBe(-1);
  });

  it('returns 1 when a > b', () => {
    expect(compareSemver('1.2.4', '1.2.3')).toBe(1);
    expect(compareSemver('2.0.0', '1.9.9')).toBe(1);
  });

  it('handles missing patch version', () => {
    expect(compareSemver('1.2', '1.2.0')).toBe(0);
    expect(compareSemver('1.2', '1.2.1')).toBe(-1);
  });
});

describe('injectInstructions', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('tagged format', () => {
    it('creates a new file with tagged block', () => {
      const target = makeTarget(tmpDir);
      const result = injectInstructions(target, 'test content', '1.0.0', { dryRun: false });

      expect(result.action).toBe('created');
      expect(result.newVersion).toBe('1.0.0');
      const content = fs.readFileSync(target.filePath, 'utf-8');
      expect(content).toContain('<muxed version="1.0.0">');
      expect(content).toContain('test content');
      expect(content).toContain('</muxed>');
    });

    it('appends block to existing file without muxed block', () => {
      const target = makeTarget(tmpDir);
      fs.writeFileSync(target.filePath, '# Existing content\n\nSome text\n');

      const result = injectInstructions(target, 'new instructions', '1.0.0', { dryRun: false });

      expect(result.action).toBe('created');
      const content = fs.readFileSync(target.filePath, 'utf-8');
      expect(content).toContain('# Existing content');
      expect(content).toContain('<muxed version="1.0.0">');
      expect(content).toContain('new instructions');
    });

    it('updates block when version is older', () => {
      const target = makeTarget(tmpDir);
      fs.writeFileSync(
        target.filePath,
        'before\n<muxed version="0.1.0">\nold stuff\n</muxed>\nafter\n'
      );

      const result = injectInstructions(target, 'updated content', '1.0.0', { dryRun: false });

      expect(result.action).toBe('updated');
      expect(result.previousVersion).toBe('0.1.0');
      expect(result.newVersion).toBe('1.0.0');
      const content = fs.readFileSync(target.filePath, 'utf-8');
      expect(content).toContain('<muxed version="1.0.0">');
      expect(content).toContain('updated content');
      expect(content).not.toContain('old stuff');
      expect(content).toContain('before');
      expect(content).toContain('after');
    });

    it('skips when version is same', () => {
      const target = makeTarget(tmpDir);
      const original = '<muxed version="1.0.0">\nexisting\n</muxed>\n';
      fs.writeFileSync(target.filePath, original);

      const result = injectInstructions(target, 'new content', '1.0.0', { dryRun: false });

      expect(result.action).toBe('up-to-date');
      expect(result.previousVersion).toBe('1.0.0');
      expect(fs.readFileSync(target.filePath, 'utf-8')).toBe(original);
    });

    it('skips when version is newer', () => {
      const target = makeTarget(tmpDir);
      fs.writeFileSync(target.filePath, '<muxed version="2.0.0">\nfuture\n</muxed>\n');

      const result = injectInstructions(target, 'old content', '1.0.0', { dryRun: false });

      expect(result.action).toBe('up-to-date');
      expect(result.previousVersion).toBe('2.0.0');
    });

    it('does not write in dry-run mode', () => {
      const target = makeTarget(tmpDir);
      const result = injectInstructions(target, 'content', '1.0.0', { dryRun: true });

      expect(result.action).toBe('created');
      expect(fs.existsSync(target.filePath)).toBe(false);
    });

    it('creates parent directories when needed', () => {
      const target = makeTarget(tmpDir, {
        filePath: path.join(tmpDir, 'nested', 'dir', 'CLAUDE.md'),
      });

      injectInstructions(target, 'content', '1.0.0', { dryRun: false });

      expect(fs.existsSync(target.filePath)).toBe(true);
    });
  });

  describe('owned format (MDC)', () => {
    it('creates a new MDC file', () => {
      const target = makeTarget(tmpDir, {
        filePath: path.join(tmpDir, 'muxed.mdc'),
        format: 'owned',
      });

      const result = injectInstructions(target, 'mdc content', '1.0.0', { dryRun: false });

      expect(result.action).toBe('created');
      expect(result.newVersion).toBe('1.0.0');
      const content = fs.readFileSync(target.filePath, 'utf-8');
      expect(content).toContain('muxed_version: 1.0.0');
      expect(content).toContain('alwaysApply: true');
      expect(content).toContain('mdc content');
    });

    it('updates MDC file when version is older', () => {
      const target = makeTarget(tmpDir, {
        filePath: path.join(tmpDir, 'muxed.mdc'),
        format: 'owned',
      });
      fs.writeFileSync(target.filePath, '---\nmuxed_version: 0.5.0\n---\n\nold content\n');

      const result = injectInstructions(target, 'new content', '1.0.0', { dryRun: false });

      expect(result.action).toBe('updated');
      expect(result.previousVersion).toBe('0.5.0');
      expect(result.newVersion).toBe('1.0.0');
      const content = fs.readFileSync(target.filePath, 'utf-8');
      expect(content).toContain('muxed_version: 1.0.0');
      expect(content).toContain('new content');
    });

    it('skips MDC when version is up-to-date', () => {
      const target = makeTarget(tmpDir, {
        filePath: path.join(tmpDir, 'muxed.mdc'),
        format: 'owned',
      });
      fs.writeFileSync(target.filePath, '---\nmuxed_version: 1.0.0\n---\n\nexisting\n');

      const result = injectInstructions(target, 'new', '1.0.0', { dryRun: false });

      expect(result.action).toBe('up-to-date');
    });

    it('does not write MDC in dry-run mode', () => {
      const target = makeTarget(tmpDir, {
        filePath: path.join(tmpDir, 'muxed.mdc'),
        format: 'owned',
      });

      const result = injectInstructions(target, 'content', '1.0.0', { dryRun: true });

      expect(result.action).toBe('created');
      expect(fs.existsSync(target.filePath)).toBe(false);
    });
  });
});
