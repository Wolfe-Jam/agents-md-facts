/**
 * The ladder findings (A1–A9): what an agent missed at BETTER that the repo's
 * own files already said. Each test builds a small repo and checks the
 * authored AGENTS.md carries the fact.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { authorAgentsMd } from '../src/author.ts';
import { buildRepoContext } from '../src/context.ts';
import { detectCommands, scriptCommand } from '../src/detect/commands.ts';
import { parseWorkflow } from '../src/detect/ci.ts';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** A throwaway repo (no git) holding the given files. */
function repo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'amf-ladder-'));
  dirs.push(dir);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

const pkg = (o: Record<string, unknown>): string => JSON.stringify({ name: 'demo', version: '1.0.0', ...o });
const author = (dir: string): string => authorAgentsMd(buildRepoContext(dir), new Date('2026-11-09T00:00:00Z'));

describe('A1 — the release gate', () => {
  test('prepublishOnly is shown verbatim, as what publishing runs', () => {
    const md = author(repo({ 'package.json': pkg({ scripts: { test: 'node --test', prepublishOnly: 'npm run build && npm test && npm run smoke' } }) }));
    expect(md).toContain('## Before a release');
    expect(md).toContain('`npm publish` runs `prepublishOnly` first:');
    expect(md).toContain('npm run build && npm test && npm run smoke');
  });
  test('a `release` script is shown with its run command', () => {
    const md = author(repo({ 'package.json': pkg({ scripts: { release: 'changeset publish' } }) }));
    expect(md).toContain('The `release` script runs:');
    expect(md).toContain('changeset publish');
  });
  test('no release script → no section', () => {
    expect(author(repo({ 'package.json': pkg({ scripts: { test: 'node --test' } }) }))).not.toContain('## Before a release');
  });
});

describe('A2 — what CI runs', () => {
  const WF = `name: CI
on: [push]
jobs:
  verify:
    runs-on: \${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
        node: ['22', '24']
    steps:
      - uses: actions/checkout@v5
      - run: npm ci
      - run: npm test
      - name: Coverage
        if: matrix.os == 'ubuntu-latest'
        run: npm run coverage:checks
      - name: Drift
        run: |
          npm run build:validator
          git diff --exit-code -- worker/validator.cjs
`;
  test('runners, versions and each step\'s commands; conditions kept', () => {
    expect(parseWorkflow(WF)).toEqual({
      on: ['push'],
      checksChanges: true,
      jobs: [{
        id: 'verify',
        runsOn: ['ubuntu-latest', 'windows-latest'],
        matrix: ['node 22, 24'],
        steps: [
          { commands: ['npm ci'] },
          { commands: ['npm test'] },
          { commands: ['npm run coverage:checks'], if: "matrix.os == 'ubuntu-latest'" },
          { commands: ['npm run build:validator', 'git diff --exit-code -- worker/validator.cjs'] },
        ],
      }],
    });
  });
  test('the CI section names the workflow file and the repo commands it runs, nothing else', () => {
    const scripts = { test: 'node --test', 'coverage:checks': 'c8', 'build:validator': 'node b.mjs' };
    const md = author(repo({ 'package.json': pkg({ scripts }), '.github/workflows/ci.yml': WF }));
    expect(md).toContain('`.github/workflows/ci.yml` (on push)');
    expect(md).toContain('# job verify · ubuntu-latest, windows-latest · node 22, 24\nnpm test\n');
    expect(md).toContain("# if: matrix.os == 'ubuntu-latest'\nnpm run coverage:checks\nnpm run build:validator");
    expect(md).not.toContain('npm ci');
    expect(md).not.toContain('git diff');
  });
  test('a workflow that only uses actions is named, not copied', () => {
    const md = author(repo({ 'package.json': pkg({}), '.github/workflows/pages.yml': 'jobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/deploy-pages@v4\n' }));
    expect(md).toContain('Also: `.github/workflows/pages.yml`.');
    expect(md).not.toContain('# job');
  });
});

describe('A3 — the contributing guide', () => {
  test('pointed to, with its headings, not copied', () => {
    const md = author(repo({ 'package.json': pkg({}), 'CONTRIBUTING.md': '# Contributing\n\n## A wrong verdict\n\nOpen an issue.\n\n## Code\n\n- A new check needs a test.\n' }));
    expect(md).toContain('## Contributing\n\n- `CONTRIBUTING.md` — A wrong verdict · Code');
    expect(md).not.toContain('A new check needs a test');
  });
  test('found in .github/ too, and shown outside a git repo', () => {
    const md = author(repo({ '.github/CONTRIBUTING.md': '# How to help\n' }));
    expect(md).toContain('## Contributing\n\n- `.github/CONTRIBUTING.md`');
  });
});

describe('A4 — the description', () => {
  test('package.json description, verbatim on one line, under the title', () => {
    const md = author(repo({ 'package.json': pkg({ description: 'Check a  Server Card\nrule by rule.' }) }));
    expect(md).toContain('# AGENTS.md — demo\n\nCheck a Server Card rule by rule.\n');
  });
  test('no description → no line', () => {
    expect(author(repo({ 'package.json': pkg({}) }))).toContain('# AGENTS.md — demo\n\nJavaScript');
  });
});

describe('A5 — the repo\'s own command spelling', () => {
  test('npm: `npm test` and `npm start`, `npm run` for the rest', () => {
    expect(scriptCommand('npm', 'test')).toBe('npm test');
    expect(scriptCommand('npm', 'start')).toBe('npm start');
    expect(scriptCommand('npm', 'build')).toBe('npm run build');
  });
  test('bun keeps `bun run test` (bare `bun test` is Bun\'s own runner)', () => {
    expect(scriptCommand('bun', 'test')).toBe('bun run test');
  });
  test('pnpm and yarn lockfiles use pnpm and yarn', () => {
    const p = repo({ 'package.json': pkg({ scripts: { build: 'tsc', test: 'vitest' } }), 'pnpm-lock.yaml': '' });
    expect(detectCommands(p, JSON.parse(pkg({ scripts: { build: 'tsc', test: 'vitest' } }))))
      .toEqual({ build: 'pnpm run build', test: 'pnpm test' });
    const y = repo({ 'package.json': pkg({ scripts: { test: 'jest' } }), 'yarn.lock': '' });
    expect(detectCommands(y, JSON.parse(pkg({ scripts: { test: 'jest' } })))).toEqual({ test: 'yarn test' });
  });
});

describe('A6 — where things live', () => {
  test('top-level folders with what the repo says they are; entry points as declared', () => {
    const dir = repo({
      'package.json': pkg({
        bin: { 'card-check': 'dist/cli.js', 'mcp-card-check': 'dist/cli.js' },
        exports: { '.': { types: './dist/lib.d.ts', default: './dist/lib.js' } },
        scripts: { build: 'tsc', test: 'node --test "test/*.test.ts"', smoke: 'node scripts/smoke.mjs', typecheck: 'tsc --noEmit -p worker' },
      }),
      'wrangler.jsonc': '{ "name": "x", "main": "worker/index.ts" }',
      'src/cli.ts': '', 'src/lib.ts': '', 'test/a.test.ts': '', 'scripts/smoke.mjs': '',
      'worker/index.ts': '', 'schema/s.json': '{}', 'dist/cli.js': '', 'node_modules/x/i.js': '',
    });
    const md = author(dir);
    expect(md).toContain('- `schema/`\n');
    // Script bodies aren't read: no "used by" notes.
    expect(md).toContain('- `scripts/`\n');
    expect(md).toContain('- `test/`\n');
    expect(md).toContain('- `worker/` — Cloudflare Worker (`wrangler.jsonc` main: `worker/index.ts`)\n');
    expect(md).toContain('- `dist/cli.js` — the `card-check` and `mcp-card-check` commands');
    expect(md).toContain('- `dist/lib.js` — package entry (`exports`)');
    expect(md).not.toContain('`dist/`');
    expect(md).not.toContain('node_modules');
  });
  test('no manifest entry → no entry points (a toolchain convention isn\'t declared)', () => {
    const md = author(repo({ 'Cargo.toml': '[package]\nname = "x"\n', 'src/main.rs': '' }));
    expect(md).not.toContain('Entry points');
  });
});

describe('A7 — refresh survives a merge', () => {
  test('the banner says to keep the markers', () => {
    expect(author(repo({ 'package.json': pkg({}) }))).toContain('keep the start/end markers');
  });
});

describe('A8 — the Node version', () => {
  test('engines.node goes on the orientation line', () => {
    expect(author(repo({ 'package.json': pkg({ engines: { node: '>=22' } }) }))).toContain('JavaScript · Node.js >=22 · npm package manager · v1.0.0');
  });
});

describe('A9 — renamed scripts', () => {
  test('`compile` is the build: listed', () => {
    const md = author(repo({ 'package.json': pkg({ scripts: { compile: 'tsc', test: 'node --test' } }) }));
    expect(md).toContain('npm run compile    # compile');
  });
  test('test:* and format:check are verify commands', () => {
    const dir = repo({ 'package.json': pkg({ scripts: { test: 'a', 'test:coverage': 'b', 'format:check': 'c', format: 'd' } }) });
    expect(detectCommands(dir, JSON.parse(pkg({ scripts: { test: 'a', 'test:coverage': 'b', 'format:check': 'c', format: 'd' } }))))
      .toEqual({ test: 'npm test', 'test:coverage': 'npm run test:coverage', 'format:check': 'npm run format:check' });
  });
});
