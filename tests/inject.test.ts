import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { END, extractBlock, injectBlock, START, wrapBlock } from '../src/inject.ts';

let dir: string;
let target: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'amf-inject-'));
  target = join(dir, 'AGENTS.md');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('injectBlock', () => {
  test('missing file → creates it as exactly the wrapped block', () => {
    injectBlock(target, 'HELLO');
    expect(readFileSync(target, 'utf-8')).toBe(`${wrapBlock('HELLO')}\n`);
    expect(extractBlock(target)).toBe('HELLO');
  });

  test('non-destructive → preserves content outside the markers on re-run', () => {
    const before = '# My own notes\nkeep this.\n\n';
    const after = '\n## Appendix\nkeep this too.\n';
    writeFileSync(target, `${before}${wrapBlock('OLD')}${after}`);

    injectBlock(target, 'NEW');
    const out = readFileSync(target, 'utf-8');
    expect(out).toContain('# My own notes');
    expect(out).toContain('## Appendix');
    expect(out).toContain('keep this too.');
    expect(extractBlock(target)).toBe('NEW');
  });

  test('idempotent → re-running with the same block leaves bytes unchanged', () => {
    injectBlock(target, 'SAME');
    const first = readFileSync(target, 'utf-8');
    injectBlock(target, 'SAME');
    expect(readFileSync(target, 'utf-8')).toBe(first);
  });

  test('genuine markerless user file → block is prefixed, user content preserved', () => {
    writeFileSync(target, '# Hand-written AGENTS.md\nno markers here.\n');
    injectBlock(target, 'BLOCK');
    const out = readFileSync(target, 'utf-8');
    expect(out.startsWith(START)).toBe(true);
    expect(out).toContain('# Hand-written AGENTS.md');
    expect(out.indexOf(END)).toBeLessThan(out.indexOf('# Hand-written'));
  });

  test('extractBlock returns null when there is no managed block', () => {
    writeFileSync(target, 'just prose, no markers');
    expect(extractBlock(target)).toBeNull();
  });
});
