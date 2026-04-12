import { describe, it, expect } from 'vitest';
import { makeCliFragments, makeToolFragments, buildPrompt } from './prompt.js';

describe('makeCliFragments', () => {
  it('uses the provided runner prefix', () => {
    const f = makeCliFragments('bunx');
    expect(f.grep('test')).toBe('bunx muxed grep "test"');
    expect(f.tools()).toBe('bunx muxed tools');
    expect(f.tools('slack')).toBe('bunx muxed tools slack');
    expect(f.info('s/t')).toBe('bunx muxed info s/t');
    expect(f.call('s/t', '{}')).toBe("bunx muxed call s/t '{}'");
    expect(f.servers()).toBe('bunx muxed servers');
  });

  it('works with npx runner', () => {
    const f = makeCliFragments('npx');
    expect(f.grep('test')).toBe('npx muxed grep "test"');
    expect(f.info('s/t')).toBe('npx muxed info s/t');
  });

  it('generates toolsSchema commands', () => {
    const f = makeCliFragments('npx');
    expect(f.toolsSchema()).toBe('npx muxed tools --include schema');
    expect(f.toolsSchema('slack')).toBe('npx muxed tools slack --include schema');
  });

  it('generates progressive exploration commands', () => {
    const f = makeCliFragments('npx');
    expect(f.infoDepth('s/t', 1)).toBe('npx muxed info s/t --depth 1');
    expect(f.infoPath('s/t', 'filters')).toBe('npx muxed info s/t --path filters');
  });

  it('generates dry-run and fields commands', () => {
    const f = makeCliFragments('npx');
    expect(f.callDryRun('s/t', '{}')).toBe("npx muxed call s/t '{}' --dry-run");
    expect(f.callFields('s/t', '{}', 'a,b')).toBe('npx muxed call s/t \'{}\' --fields "a,b"');
  });
});

describe('makeToolFragments', () => {
  it('uses muxed:exec syntax', () => {
    const f = makeToolFragments();
    expect(f.grep('test')).toBe('muxed:exec({ "command": "grep test" })');
    expect(f.tools()).toBe('muxed:exec({ "command": "tools" })');
    expect(f.tools('slack')).toBe('muxed:exec({ "command": "tools slack" })');
    expect(f.info('s/t')).toBe('muxed:exec({ "command": "info s/t" })');
  });

  it('uses input field for call commands', () => {
    const f = makeToolFragments();
    expect(f.call('s/t', '{}')).toBe('muxed:exec({ "command": "call s/t", "input": {} })');
  });

  it('generates progressive exploration commands', () => {
    const f = makeToolFragments();
    expect(f.infoDepth('s/t', 1)).toBe('muxed:exec({ "command": "info s/t --depth 1" })');
    expect(f.infoPath('s/t', 'filters')).toBe(
      'muxed:exec({ "command": "info s/t --path filters" })'
    );
  });
});

describe('buildPrompt', () => {
  const f = makeCliFragments('npx');

  it('includes the intro', () => {
    const result = buildPrompt(f);
    expect(result).toContain(f.intro);
  });

  it('includes mandatory prerequisites', () => {
    const result = buildPrompt(f);
    expect(result).toContain('MANDATORY PREREQUISITES');
    expect(result).toContain('BLOCKING REQUIREMENTS');
  });

  it('includes progressive schema exploration', () => {
    const result = buildPrompt(f);
    expect(result).toContain('--depth 1');
    expect(result).toContain('--path filters');
    expect(result).toContain('PROGRESSIVE SCHEMA EXPLORATION');
  });

  it('includes tools --include schema', () => {
    const result = buildPrompt(f);
    expect(result).toContain('--include schema');
  });

  it('includes correct usage examples', () => {
    const result = buildPrompt(f);
    expect(result).toContain('slack/search_private');
    expect(result).toContain('CORRECT Usage Pattern');
  });

  it('includes incorrect usage patterns', () => {
    const result = buildPrompt(f);
    expect(result).toContain('INCORRECT Usage Patterns');
    expect(result).toContain('WRONG');
  });

  it('includes error handling', () => {
    const result = buildPrompt(f);
    expect(result).toContain('Handling errors');
    expect(result).toContain('dry-run');
  });

  it('includes heading when provided', () => {
    const result = buildPrompt(f, { heading: '# My Heading' });
    expect(result.startsWith('# My Heading')).toBe(true);
  });

  it('omits heading when not provided', () => {
    const result = buildPrompt(f);
    expect(result.startsWith('#')).toBe(false);
  });

  it('includes servers section when provided', () => {
    const result = buildPrompt(f, { servers: '- slack\n- db' });
    expect(result).toContain('Available MCP servers:');
    expect(result).toContain('- slack\n- db');
  });

  it('omits servers section when not provided', () => {
    const result = buildPrompt(f);
    expect(result).not.toContain('Available MCP servers:');
  });

  it('includes server instructions when provided', () => {
    const result = buildPrompt(f, { serverInstructions: '### slack\n\nUse wisely.' });
    expect(result).toContain('instructions for the connected MCP servers');
    expect(result).toContain('### slack');
  });

  it('omits server instructions when not provided', () => {
    const result = buildPrompt(f);
    expect(result).not.toContain('instructions for the connected MCP servers');
  });

  it('includes scripts section when provided', () => {
    const result = buildPrompt(f, { scripts: '## Scripts\n\nUse scripts for complex workflows.' });
    expect(result).toContain('## Scripts');
    expect(result).toContain('Use scripts for complex workflows.');
  });

  it('omits scripts section when not provided', () => {
    const result = buildPrompt(f);
    expect(result).not.toContain('Scripts');
  });

  it('works with tool fragments', () => {
    const tf = makeToolFragments();
    const result = buildPrompt(tf);
    expect(result).toContain('muxed:exec');
    expect(result).not.toContain('npx muxed');
  });

  it('allows overriding intro via spread', () => {
    const result = buildPrompt({ ...f, intro: 'Custom intro text.' });
    expect(result).toContain('Custom intro text.');
    expect(result).not.toContain(f.intro);
  });
});
