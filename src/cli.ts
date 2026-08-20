#!/usr/bin/env node
import { join } from 'path';
import { authorAgentsMd } from './author.js';
import { buildRepoContext } from './context.js';
import { extractBlock, injectBlock, wrapBlock } from './inject.js';
import { stripVolatile } from './volatile.js';

const HELP = `agents-md-facts — author a minimal AGENTS.md from your repo's facts.

Usage: agents-md-facts [options]

  (default)    author/refresh AGENTS.md in the current directory (non-destructive)
  --check      exit 1 if AGENTS.md is missing or stale (no writes)
  --dry-run    print what would be written; write nothing
  --stdout     print the managed block to stdout; write nothing
  -h, --help   show this help
`;

function main(): void {
  const args = process.argv.slice(2);
  const has = (f: string): boolean => args.includes(f);

  if (has('-h') || has('--help')) {
    process.stdout.write(HELP);
    return;
  }

  const dir = process.cwd();
  const target = join(dir, 'AGENTS.md');
  const ctx = buildRepoContext(dir);
  const block = authorAgentsMd(ctx);

  // --check: fail if missing or drifted from repo facts.
  if (has('--check')) {
    const current = extractBlock(target);
    if (current === null) {
      process.stderr.write('AGENTS.md is missing or has no agents-md-facts block — run agents-md-facts to author it.\n');
      process.exit(1);
    }
    if (stripVolatile(current) !== stripVolatile(block.trim())) {
      process.stderr.write('AGENTS.md is stale — re-run agents-md-facts to refresh it from the repo.\n');
      process.exit(1);
    }
    process.stderr.write('AGENTS.md is up to date.\n');
    return;
  }

  // --stdout / --dry-run: emit, write nothing.
  if (has('--stdout') || has('--dry-run')) {
    process.stdout.write(`${wrapBlock(block)}\n`);
    if (has('--dry-run')) process.stderr.write('\n(dry run — nothing written)\n');
    return;
  }

  // default: author/refresh non-destructively.
  injectBlock(target, block);
  process.stderr.write(`AGENTS.md authored from facts → ${target}\n`);
}

main();
