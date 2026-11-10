import { afterAll, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { authorAgentsMd } from '../src/author.ts';
import { buildRepoContext } from '../src/context.ts';
import { extractBlock, wrapBlock } from '../src/inject.ts';
import { stripVolatile } from '../src/volatile.ts';

const EX = join(import.meta.dir, '..', 'examples');

/**
 * Each fixture authored as its own git repo (a temp copy, git init, add), so the
 * goldens are the same in a clone, a zip download or a subfolder: they never
 * depend on the repo the fixtures happen to sit in.
 */
const tmp: string[] = [];
afterAll(() => { for (const d of tmp) rmSync(d, { recursive: true, force: true }); });
function asRepo(src: string): string {
  // Same folder name as the fixture: a repo with no manifest is named after its folder.
  const parent = mkdtempSync(join(tmpdir(), 'amf-golden-'));
  tmp.push(parent);
  const dir = join(parent, basename(src));
  cpSync(src, dir, { recursive: true });
  rmSync(join(dir, 'AGENTS.md'), { force: true });
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['add', '.'], { cwd: dir });
  return dir;
}
const FIXTURES = ['node-ts', 'python', 'rust', 'go'];

describe('golden fixtures', () => {
  for (const name of FIXTURES) {
    const goldenPath = join(EX, name, 'AGENTS.md');
    const dir = asRepo(join(EX, name));

    test(`${name} — authored block matches the committed golden`, () => {
      const block = authorAgentsMd(buildRepoContext(dir));
      expect(stripVolatile(extractBlock(goldenPath) ?? '')).toBe(stripVolatile(block.trim()));
    });

    test(`${name} — committed file is exactly the wrapped block`, () => {
      const block = authorAgentsMd(buildRepoContext(dir));
      // A Windows checkout (core.autocrlf) has CRLF line ends; the tool reads it the same as LF.
      expect(stripVolatile(readFileSync(goldenPath, 'utf-8').replace(/\r\n/g, '\n'))).toBe(stripVolatile(`${wrapBlock(block)}\n`));
    });

    test(`${name} — output is deterministic across two runs`, () => {
      const now = new Date();
      const a = authorAgentsMd(buildRepoContext(dir), now);
      const b = authorAgentsMd(buildRepoContext(dir), now);
      expect(a).toBe(b);
    });
  }
});
