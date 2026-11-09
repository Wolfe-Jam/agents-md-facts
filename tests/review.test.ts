/**
 * Findings from the review of PR #7 (R1–R19): each test is an input that made
 * the authored AGENTS.md say something false, guessed or unstable.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { authorAgentsMd } from '../src/author.ts';
import { buildRepoContext } from '../src/context.ts';
import { detectCommands } from '../src/detect/commands.ts';
import { parseWorkflow } from '../src/detect/ci.ts';
import { detectContributing } from '../src/detect/contributing.ts';
import { detectPackageManager } from '../src/detect/orientation.ts';
import { detectRelease } from '../src/detect/release.ts';
import { extractBlock, wrapBlock } from '../src/inject.ts';

const ROOT = join(import.meta.dir, '..');
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function repo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'amf-review-'));
  dirs.push(dir);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}
const pkg = (o: Record<string, unknown>): string => JSON.stringify({ name: 'demo', version: '1.0.0', ...o });
const author = (dir: string): string => authorAgentsMd(buildRepoContext(dir), new Date('2026-11-09T00:00:00Z'));

describe('R1 — a job\'s if: stays with its job', () => {
  test('a deploy job\'s condition is not put on the test job\'s step', () => {
    const { jobs } = parseWorkflow(`on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
  deploy:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - run: npx wrangler deploy
`);
    expect(jobs).toEqual([
      { id: 'test', runsOn: ['ubuntu-latest'], matrix: [], steps: [{ run: 'npm test' }] },
      { id: 'deploy', if: "github.ref == 'refs/heads/main'", runsOn: ['ubuntu-latest'], matrix: [], steps: [{ run: 'npx wrangler deploy' }] },
    ]);
  });
});

describe('R2 — what npm publish runs', () => {
  test('`prepublish` is not a publish gate (npm ≥ 7 runs it on install)', () => {
    expect(detectRelease(JSON.parse(pkg({ scripts: { prepublish: 'tsc' } })))).toBeNull();
  });
  test('prepublishOnly and prepack both run, in that order', () => {
    const md = author(repo({ 'package.json': pkg({ scripts: { prepack: 'npm run build', prepublishOnly: 'npm test' } }) }));
    expect(md).toContain('`npm publish` runs `prepublishOnly`, then `prepack` first:');
    expect(md).toContain('# prepublishOnly\nnpm test\n# prepack\nnpm run build');
  });
});

describe('R3 — the file stays short', () => {
  test('six workflows of twelve multi-line steps stay under 150 lines', () => {
    const step = (i: number): string => `      - if: matrix.os == 'ubuntu-latest'\n        run: |\n          echo ${i}\n          echo more\n          echo more\n`;
    const wf = (n: string): string => `on: ${n === 'a' ? 'push' : 'release'}\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n${Array.from({ length: 12 }, (_, i) => step(i)).join('')}`;
    const files: Record<string, string> = { 'package.json': pkg({}) };
    for (const n of ['a', 'b', 'c', 'd', 'e', 'f']) files[`.github/workflows/${n}.yml`] = wf(n);
    const md = author(repo(files));
    expect(md.split('\n').length).toBeLessThanOrEqual(150);
    expect(md).toContain('`.github/workflows/a.yml` (on push)');
    expect(md).toContain('# … 2 more lines in this step');
    expect(md).toMatch(/Also: .*`\.github\/workflows\/f\.yml` \(on release\)\./);
  });
  test('workflows that check pushes come first', () => {
    const wf = (on: string): string => `on: ${on}\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ${on}\n`;
    const md = author(repo({ 'package.json': pkg({}), '.github/workflows/a-release.yml': wf('release'), '.github/workflows/b-ci.yml': wf('pull_request') }));
    expect(md.indexOf('b-ci.yml')).toBeLessThan(md.indexOf('a-release.yml'));
  });
});

describe('R4/R5 — the hook and the Action run this release', () => {
  const version = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as { version: string }).version;
  test('the pre-commit hook runs the published package at this version, with no file names', () => {
    const hook = readFileSync(join(ROOT, '.pre-commit-hooks.yaml'), 'utf-8');
    expect(hook).toContain(`entry: npx --yes agents-md-facts@${version} --check`);
    expect(hook).toContain('pass_filenames: false');
    expect(hook).toContain('always_run: true');
    expect(hook).toContain('stages: [pre-commit]');
  });
  test('the Action defaults to this version, not latest', () => {
    expect(readFileSync(join(ROOT, 'action.yml'), 'utf-8')).toContain(`default: '${version}'`);
  });
  test('the README pins this version', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf-8');
    expect(readme).toContain(`Wolfe-Jam/agents-md-facts@v${version}`);
    expect(readme).toContain(`rev: v${version}`);
  });
});

describe('R6 — only real checks are gates', () => {
  const scripts = { 'test:watch': 'vitest', test: 'vitest run', 'test:e2e': 'playwright test', lint: 'eslint .', 'lint:fix': 'eslint . --fix' };
  test('watch and fix scripts are not listed', () => {
    expect(detectCommands(repo({}), JSON.parse(pkg({ scripts })))).toEqual({ test: 'npm test', 'test:e2e': 'npm run test:e2e', lint: 'npm run lint' });
  });
  test('the guardrail names `test`; the Definition of Done names only test and lint', () => {
    const md = author(repo({ 'package.json': pkg({ scripts }) }));
    expect(md).toContain('run the tests (`npm test`)');
    expect(md).toContain('Done when: `npm run lint` exits 0 · `npm test` passes · committed with a clear message.');
  });
});

describe('R7/R8/R9 — CI read as YAML', () => {
  const { on, jobs } = parseWorkflow(`on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest # pinned
    strategy:
      matrix:
        node-version: [18, 20]
    steps:
      - run: npm test   # unit only
      - run: >
          npm run build
          --if-present
      - if: >-
          github.event_name == 'push'
        run: npm run smoke
      - uses: some/action@v1
        with:
          run: echo not-a-step
      - run: pnpm i --filter '!docs'
  lint:
    runs-on: [self-hosted, linux, x64]
    steps:
      - run: npm run lint
`);
  test('comments dropped; folded blocks are one line; block if: read', () => {
    expect(on).toEqual(['push', 'pull_request']);
    expect(jobs[0]?.runsOn).toEqual(['ubuntu-latest']);
    expect(jobs[0]?.steps).toEqual([
      { run: 'npm test' },
      { run: 'npm run build --if-present' },
      { run: 'npm run smoke', if: "github.event_name == 'push'" },
    ]);
  });
  test('runners and matrix belong to their job; a label set is one runner', () => {
    expect(jobs[0]?.matrix).toEqual(['node-version 18, 20']);
    expect(jobs[1]).toEqual({ id: 'lint', runsOn: ['self-hosted+linux+x64'], matrix: [], steps: [{ run: 'npm run lint' }] });
  });
  test('broken YAML adds nothing', () => {
    expect(parseWorkflow('jobs: [unclosed')).toEqual({ on: [], jobs: [] });
  });
});

describe('R10 — a folder is used only when a script names its path', () => {
  test('`NODE_ENV=test` and `bun test` are not the test folder; `./scripts/x.sh` is scripts', () => {
    const md = author(repo({
      'package.json': pkg({ scripts: { start: 'cross-env NODE_ENV=test node src/index.js', ci: 'bun test --coverage', release: './scripts/release.sh', prepare: 'node scripts/setup.js' } }),
      'test/a.js': '', 'scripts/release.sh': '', 'src/index.js': '',
    }));
    expect(md).toContain('- `test/` — tests\n');
    expect(md).toContain('- `scripts/` — scripts, used by `npm run release`, `npm run prepare`');
  });
});

describe('R11 — no guessed folder names', () => {
  test('`lib/` and `spec/` get no gloss; `packages/` only when a workspace lists it', () => {
    const plain = author(repo({ 'package.json': pkg({}), 'lib/a.js': '', 'spec/protocol.md': '', 'packages/README.md': '' }));
    expect(plain).toContain('- `lib/`\n');
    expect(plain).toContain('- `packages/`\n');
    expect(plain).toContain('- `spec/`\n');
    const ws = author(repo({ 'package.json': pkg({ workspaces: ['packages/*'] }), 'packages/a/index.js': '', 'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n" }));
    expect(ws).toContain('- `packages/` — workspace packages');
    expect(ws).toContain('- `pnpm-workspace.yaml` — workspace config');
  });
});

describe('R12 — the command name npm installs', () => {
  test('a scoped package\'s string bin installs without the scope', () => {
    expect(author(repo({ 'package.json': JSON.stringify({ name: '@faf/tool', bin: 'dist/cli.js' }), 'src/cli.ts': '' })))
      .toContain('- `src/cli.ts` — the `tool` command');
  });
  test('no name → no invented command name', () => {
    expect(author(repo({ 'package.json': JSON.stringify({ bin: 'dist/cli.js' }), 'src/cli.ts': '' })))
      .toContain("- `src/cli.ts` — the package's command (`bin`)");
  });
});

describe('R13 — outside git, ignored folders are left out', () => {
  test('folders the root .gitignore ignores are not listed', () => {
    const md = author(repo({ 'package.json': pkg({}), '.gitignore': 'tmp/\n/vendor\n*.log\n', 'src/a.js': '', 'tmp/x': '', 'vendor/y': '' }));
    expect(md).toContain('- `src/`');
    expect(md).not.toContain('`tmp/`');
    expect(md).not.toContain('`vendor/`');
  });
});

describe('R14 — a CRLF checkout is not stale', () => {
  test('extractBlock reads a CRLF file the same as LF', () => {
    const dir = repo({ 'AGENTS.md': `${wrapBlock('# AGENTS.md — demo\n\nline')}\n`.replace(/\n/g, '\r\n') });
    expect(extractBlock(join(dir, 'AGENTS.md'))).toBe('# AGENTS.md — demo\n\nline');
  });
});

describe('R15 — the declared package manager wins', () => {
  test('`packageManager: pnpm@9` over a stale package-lock.json', () => {
    const dir = repo({ 'package.json': pkg({ packageManager: 'pnpm@9.1.0', scripts: { test: 'vitest' } }), 'package-lock.json': '{}' });
    expect(detectPackageManager(dir)).toBe('pnpm');
    expect(author(dir)).toContain('pnpm install');
    expect(author(dir)).toContain('pnpm test');
  });
  test('a package.json beside a pubspec.yaml is a Node repo for its commands', () => {
    expect(detectPackageManager(repo({ 'package.json': pkg({}), 'pubspec.yaml': 'name: x\n' }))).toBe('npm');
  });
});

describe('R16 — headings inside code blocks are not sections', () => {
  test('`## install deps` in a fence is skipped', () => {
    const dir = repo({ 'CONTRIBUTING.md': '## Setup\n\n```bash\n## install deps\nnpm i\n```\n\n## Code\n' });
    expect(detectContributing(dir)?.sections).toEqual(['Setup', 'Code']);
  });
});

describe('R17 — entry points from tsconfig and nested exports', () => {
  test('outDir/rootDir trace `distribution/` back to source', () => {
    const md = author(repo({
      'package.json': pkg({ exports: { '.': { import: { types: './distribution/index.d.ts', default: './distribution/index.js' } } } }),
      'tsconfig.json': '{ "compilerOptions": { "outDir": "distribution", "rootDir": "source" } }',
      'source/index.ts': '',
    }));
    expect(md).toContain('- `source/index.ts` — library entry');
  });
});

describe('R19 — the default branch is not assumed', () => {
  test('git rules name "the default branch", never `main`', () => {
    const md = author(ROOT);
    expect(md).toContain('push to the default branch');
    expect(md).toContain('Branch off the default branch; never commit to it directly');
    expect(md).not.toContain('`main`');
  });
});
