import { describe, expect, test } from 'bun:test';
import { join } from 'path';
import { authorAgentsMd } from '../src/author.ts';
import { buildRepoContext } from '../src/context.ts';

const ROOT = join(import.meta.dir, '..');
const EX = join(ROOT, 'examples');

/** Every real authored surface: the tool's own repo + all fixtures. */
const DIRS = [ROOT, join(EX, 'node-ts'), join(EX, 'python'), join(EX, 'rust'), join(EX, 'go')];

describe('doctrine — authored output', () => {
  for (const dir of DIRS) {
    const md = authorAgentsMd(buildRepoContext(dir));

    test(`${dir} — never contains "generate"/"generated"`, () => {
      expect(md).not.toMatch(/generat/i);
    });

    test(`${dir} — carries zero FAF footprint`, () => {
      // No "faf" token, no faf.one, no scoring/tier/bi-sync vocabulary.
      expect(md).not.toMatch(/\bfaf\b/i);
      expect(md).not.toMatch(/faf\.one/i);
      expect(md).not.toMatch(/bi-sync/i);
    });

    test(`${dir} — stays minimal (≤ 150 lines)`, () => {
      expect(md.split('\n').length).toBeLessThanOrEqual(150);
    });

    test(`${dir} — leads with the "authored" banner`, () => {
      expect(md.split('\n')[0]).toContain('authored by agents-md-facts');
    });
  }
});
