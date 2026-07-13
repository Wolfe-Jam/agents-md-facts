import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { authorAgentsMd } from '../src/author.ts';
import { buildRepoContext } from '../src/context.ts';
import { extractBlock, wrapBlock } from '../src/inject.ts';

const EX = join(import.meta.dir, '..', 'examples');
const FIXTURES = ['node-ts', 'python', 'rust', 'go'];

describe('golden fixtures', () => {
  for (const name of FIXTURES) {
    const dir = join(EX, name);
    const goldenPath = join(dir, 'AGENTS.md');

    test(`${name} — authored block matches the committed golden`, () => {
      const block = authorAgentsMd(buildRepoContext(dir));
      expect(extractBlock(goldenPath)).toBe(block.trim());
    });

    test(`${name} — committed file is exactly the wrapped block`, () => {
      const block = authorAgentsMd(buildRepoContext(dir));
      expect(readFileSync(goldenPath, 'utf-8')).toBe(`${wrapBlock(block)}\n`);
    });

    test(`${name} — output is deterministic across two runs`, () => {
      const a = authorAgentsMd(buildRepoContext(dir));
      const b = authorAgentsMd(buildRepoContext(dir));
      expect(a).toBe(b);
    });
  }
});
