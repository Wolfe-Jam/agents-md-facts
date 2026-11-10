/**
 * Findings from the review of PR #7 (R1–R19): each test is an input that made
 * the authored AGENTS.md say something false, guessed or unstable.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
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
import { extractBlock, injectBlock, wrapBlock } from '../src/inject.ts';

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
      { id: 'test', runsOn: ['ubuntu-latest'], matrix: [], steps: [{ lines: ['npm test'] }], other: 0 },
      { id: 'deploy', if: "github.ref == 'refs/heads/main'", runsOn: ['ubuntu-latest'], matrix: [], steps: [{ lines: ['npx wrangler deploy'] }], other: 0 },
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
    const step = (i: number): string => `      - if: matrix.os == 'ubuntu-latest'\n        run: |\n          npm test -- ${i}\n          npm run lint\n          npm run build\n`;
    const wf = (n: string): string => `on: ${n === 'a' ? 'push' : 'release'}\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n${Array.from({ length: 12 }, (_, i) => step(i)).join('')}`;
    const files: Record<string, string> = { 'package.json': pkg({ scripts: { test: 't', lint: 'l', build: 'b' } }) };
    for (const n of ['a', 'b', 'c', 'd', 'e', 'f']) files[`.github/workflows/${n}.yml`] = wf(n);
    const md = author(repo(files));
    expect(md.split('\n').length).toBeLessThanOrEqual(150);
    expect(md).toContain('`.github/workflows/a.yml` (on push)');
    expect(md).toContain('# … more in the file');
    expect(md).toMatch(/Also: .*`\.github\/workflows\/f\.yml` \(on release\)\./);
  });
  test('workflows that check pushes come first', () => {
    const wf = (on: string): string => `on: ${on}\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n`;
    const md = author(repo({ 'package.json': pkg({ scripts: { test: 't' } }), '.github/workflows/a-release.yml': wf('release'), '.github/workflows/b-ci.yml': wf('pull_request') }));
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
      { lines: ['npm test'] },
      { lines: ['npm run build --if-present'] },
      { lines: ['npm run smoke'], if: "github.event_name == 'push'" },
      { lines: ["pnpm i --filter '!docs'"] },
    ]);
  });
  test('runners and matrix belong to their job; a label set is one runner', () => {
    expect(jobs[0]?.matrix).toEqual(['node-version 18, 20']);
    expect(jobs[1]).toEqual({ id: 'lint', runsOn: ['self-hosted+linux+x64'], matrix: [], steps: [{ lines: ['npm run lint'] }], other: 0 });
  });
  test('broken YAML adds nothing', () => {
    expect(parseWorkflow('jobs: [unclosed')).toEqual({ on: [], checksChanges: false, jobs: [], unreadable: true });
  });
});


describe('R11 — no guessed folder names', () => {
  test('`lib/` and `spec/` get no gloss; `packages/` only when a workspace lists it', () => {
    const plain = author(repo({ 'package.json': pkg({}), 'lib/a.js': '', 'spec/protocol.md': '', 'packages/README.md': '' }));
    expect(plain).toContain('- `lib/`\n');
    expect(plain).toContain('- `packages/`\n');
    expect(plain).toMatch(/^- `spec\/`$/m);
    const ws = author(repo({ 'package.json': pkg({ workspaces: ['packages/*'] }), 'packages/a/index.js': '', 'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n" }));
    expect(ws).toContain('- `packages/` — workspace packages');
    expect(ws).toContain('- `pnpm-workspace.yaml` — pnpm workspace config');
  });
});

describe('R12 — the command name npm installs', () => {
  test('a scoped package\'s string bin installs without the scope', () => {
    expect(author(repo({ 'package.json': JSON.stringify({ name: '@faf/tool', bin: 'dist/cli.js' }), 'tsconfig.json': '{"compilerOptions":{"outDir":"dist"}}', 'src/cli.ts': '' })))
      .toContain('- `dist/cli.js` — the `tool` command');
  });
  test('no name → no invented command name', () => {
    expect(author(repo({ 'package.json': JSON.stringify({ bin: 'dist/cli.js' }), 'tsconfig.json': '{"compilerOptions":{"outDir":"dist"}}', 'src/cli.ts': '' })))
      .toContain("- `dist/cli.js` — the package's command (`bin`)");
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



/* ── The second review of #7 (goose): G-numbers are its finding numbers ── */

describe('R19 — the default branch is not assumed', () => {
  test('git rules name "the default branch", never `main`', () => {
    const md = author(ROOT);
    expect(md).toContain('push to the default branch');
    expect(md).toContain('Branch off the default branch; never commit to it directly');
    expect(md).not.toContain('`main`');
  });
});


describe('G3 — release and chore workflows are named, not copied', () => {
  test('a publish workflow\'s steps stay out; its file is named', () => {
    const wf = (on: string, run: string): string => `on: ${on}\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: ${run}\n`;
    const md = author(repo({
      'package.json': pkg({ scripts: { test: 't' } }),
      '.github/workflows/ci.yml': wf('pull_request', 'npm test'),
      '.github/workflows/publish.yml': wf('release', 'npm publish'),
      '.github/workflows/key.yml': wf('workflow_dispatch', 'gh secret set KEY'),
    }));
    expect(md).toContain('npm test');
    expect(md).not.toContain('npm publish');
    expect(md).not.toContain('gh secret set');
    expect(md).toContain('Also: `.github/workflows/key.yml` (on workflow_dispatch) · `.github/workflows/publish.yml` (on release).');
  });
});

describe('G4 — a fence inside a step can\'t close the block', () => {
  test('the block\'s fence is longer than any backtick run in it', () => {
    const md = author(repo({
      'package.json': pkg({ scripts: { x: 'node x.mjs' } }),
      '.github/workflows/ci.yml': 'on: push\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm run x -- "```"\n',
    }));
    expect(md).toContain('````bash\n');
    expect(md).toContain('npm run x -- "```"\n````');
  });
});

describe('G7 — a file that kept the banner but lost its markers keeps its text', () => {
  test('hand-written sections survive; the block is added at the top', () => {
    const dir = repo({
      'package.json': pkg({}),
      'AGENTS.md': '<!-- authored by agents-md-facts — from your repo\'s facts, never guessed -->\n\n# AGENTS.md — demo\n\n## Guardrails\n\n- x\n\n## Team notes\n\nNever touch billing/.\n',
    });
    injectBlock(join(dir, 'AGENTS.md'), author(dir));
    const after = readFileSync(join(dir, 'AGENTS.md'), 'utf-8');
    expect(after).toContain('Never touch billing/.');
    expect(after.startsWith('<!-- agents:from-facts:start -->')).toBe(true);
  });
  test('an old tool output that differs from today\'s is kept too (it may hold edits)', () => {
    const dir = repo({ 'package.json': pkg({}), 'AGENTS.md': '<!-- authored by agents-md-facts — old -->\n\n# AGENTS.md — demo\n\n## Guardrails\n\n- x\n' });
    expect(injectBlock(join(dir, 'AGENTS.md'), author(dir))).toBe('kept');
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf-8')).toContain('— old -->');
  });
});

describe('G8b — git decides the folder list', () => {
  test('a committed dist/ is listed (git tracks it); outside git it is skipped', () => {
    const files = { 'package.json': pkg({}), 'dist/index.js': '', 'src/a.ts': '' };
    const plain = author(repo(files));
    expect(plain).not.toContain('`dist/`');
    const dir = repo(files);
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['add', '.'], { cwd: dir });
    expect(author(dir)).toContain('- `dist/`');
  });
});

describe('G9 — wrangler main: top level, no comments', () => {
  test('a commented line and an [env.*] main are ignored; single quotes read', () => {
    const md = author(repo({
      'package.json': pkg({}),
      'wrangler.toml': "# main = \"old/index.ts\"\nname = \"x\"\nmain = 'worker/index.ts'\n\n[env.staging]\nmain = \"staging/index.ts\"\n",
      'worker/index.ts': '', 'old/x': '', 'staging/x': '',
    }));
    expect(md).toContain('- `worker/` — Cloudflare Worker (`wrangler.toml` main: `worker/index.ts`)');
    expect(md).toContain('- `old/`\n');
    expect(md).toContain('- `staging/`\n');
  });
  test('wrangler.jsonc: comments stripped, top-level main only', () => {
    const md = author(repo({
      'package.json': pkg({}),
      'wrangler.jsonc': '{\n  // "main": "old/index.ts",\n  "name": "x",\n  "main": "worker/index.ts",\n  "env": { "staging": { "main": "staging/index.ts" } },\n}\n',
      'worker/index.ts': '', 'staging/x': '',
    }));
    expect(md).toContain('- `worker/` — Cloudflare Worker (`wrangler.jsonc` main: `worker/index.ts`)');
    expect(md).toContain('- `staging/`\n');
  });
});


describe('G11 — entry points say what the manifest says', () => {
  test('a bundled bin is not traced by name to a same-named source file', () => {
    const md = author(repo({
      'package.json': pkg({ bin: { x: 'dist/cli.js' }, scripts: { build: 'esbuild src/main.ts --bundle --outfile=dist/cli.js' } }),
      'src/main.ts': '', 'src/cli.ts': '',
    }));
    expect(md).toContain('- `dist/cli.js` — the `x` command');
    expect(md).not.toContain('`src/cli.ts` — the');
  });
  test('`main` is a package entry, not a "library"; an exports array is read', () => {
    expect(author(repo({ 'package.json': pkg({ main: 'dist/extension.js' }), 'tsconfig.json': '{"compilerOptions":{"outDir":"dist"}}', 'src/extension.ts': '' })))
      .toContain('- `dist/extension.js` — package entry (`main`)');
    expect(author(repo({ 'package.json': pkg({ exports: { '.': ['./dist/a.js'] }, main: 'dist/index.js' }), 'tsconfig.json': '{"compilerOptions":{"outDir":"dist"}}', 'src/a.ts': '', 'src/index.ts': '' })))
      .toContain('- `dist/a.js` — package entry (`exports`)');
  });
  test('a file with a popular name and no manifest entry is not listed', () => {
    expect(author(repo({ 'package.json': pkg({}), 'src/index.ts': '' }))).not.toContain('Entry points');
  });
});

describe('G16 — no folder notes that repeat the name', () => {
  test('`docs/`, `tests/`, `examples/`, `scripts/` get no gloss', () => {
    const md = author(repo({ 'package.json': pkg({}), 'docs/a.md': '', 'tests/a': '', 'examples/a': '', 'scripts/a': '', 'migrations/1.sql': '' }));
    expect(md).toContain('- `docs/`\n- `examples/`\n- `migrations/` — database migrations\n- `scripts/`\n- `tests/`');
  });
});

describe('G17 — contributing headings as plain text', () => {
  test('`## Why C#` keeps its #; links keep their text; at most six shown', () => {
    const md = author(repo({
      'package.json': pkg({}),
      'CONTRIBUTING.md': '## Why C#\n## Use [Langfuse](https://x.y)\n## A ##\n## B\n## C\n## D\n## E\n',
    }));
    expect(md).toContain('- Follow `CONTRIBUTING.md` (Why C# · Use Langfuse · A · B · C · D · …).');
  });
});

describe('G18/G19 — odd manifests', () => {
  test('a non-string script doesn\'t throw', () => {
    expect(() => author(repo({ 'package.json': JSON.stringify({ name: 'x', scripts: { prepack: 1, test: 'node --test' } }) }))).not.toThrow();
  });
  test('a description that starts like markup stays text', () => {
    expect(author(repo({ 'package.json': pkg({ description: '# not a heading' }) }))).toContain('\n\\# not a heading\n');
  });
});

describe('G15 — a step\'s directory and shell are shown', () => {
  test('working-directory and shell from the step or the job default', () => {
    const { jobs } = parseWorkflow('on: push\njobs:\n  j:\n    runs-on: windows-latest\n    defaults:\n      run:\n        shell: pwsh\n    steps:\n      - run: npm run lint\n        working-directory: ./sibling/\n');
    expect(jobs[0]?.steps).toEqual([{ lines: ['npm run lint'], dir: 'sibling', shell: 'pwsh' }]);
  });
});
