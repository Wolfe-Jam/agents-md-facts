/**
 * Findings from the two reviews of PR #8 at c0582f3 (claude: K1–K12, goose: N1–N9).
 * Each test is an input that made the output false, lost text, or stopped a run.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { authorAgentsMd } from '../src/author.ts';
import { buildRepoContext } from '../src/context.ts';
import { detectCommands } from '../src/detect/commands.ts';
import { parseWorkflow } from '../src/detect/ci.ts';
import { detectContributing } from '../src/detect/contributing.ts';
import { gitFiles } from '../src/detect/git.ts';
import { extractBlock, injectBlock, MarkerError, wrapBlock } from '../src/inject.ts';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function repo(files: Record<string, string>, git = false): string {
  const dir = mkdtempSync(join(tmpdir(), 'amf-r8c-'));
  dirs.push(dir);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  if (git) {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['add', '.'], { cwd: dir });
  }
  return dir;
}
const pkg = (o: Record<string, unknown>): string => JSON.stringify({ name: 'demo', version: '1.0.0', ...o });
const author = (dir: string): string => authorAgentsMd(buildRepoContext(dir), new Date('2026-11-09T00:00:00Z'));
const wf = (on: string, steps: string[]): string =>
  `on: ${on}\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n${steps.map((s) => `      - run: ${JSON.stringify(s)}\n`).join('')}`;
const runs = (yaml: string): string[] => parseWorkflow(yaml).jobs.flatMap((j) => j.steps.map((s) => s.run));

const CLI = join(import.meta.dir, '..', 'src', 'cli.ts');

/** Run the CLI in `cwd` with PATH holding only a stub `git` (or no git at all). Bun caches PATH, so it's a child process. */
function cliWithGit(cwd: string, stub: string | null): { status: number | null; stderr: string } {
  const bin = mkdtempSync(join(tmpdir(), 'amf-bin-'));
  dirs.push(bin);
  if (stub !== null) {
    writeFileSync(join(bin, 'git'), `#!/bin/sh\n${stub}\n`);
    chmodSync(join(bin, 'git'), 0o755);
  }
  const r = spawnSync(process.execPath, ['run', CLI, '--stdout'], { cwd, env: { PATH: bin, HOME: cwd }, encoding: 'utf-8' });
  return { status: r.status, stderr: r.stderr };
}

describe('K1 — a marker counts only as a whole line', () => {
  const START = '<!-- agents:from-facts:start -->';
  const END = '<!-- agents:from-facts:end -->';

  test('a start marker mentioned in prose is not the block: hand text survives', () => {
    const dir = repo({});
    const p = join(dir, 'AGENTS.md');
    writeFileSync(p, `# Team\nOur tool rewrites everything after \`${START}\`.\nNever touch billing/. PROSEUSER\n${wrapBlock('old')}\n`);
    expect(injectBlock(p, 'new')).toBe('replaced-block');
    const out = readFileSync(p, 'utf-8');
    expect(out).toContain('PROSEUSER');
    expect(out).toContain(`${START}\nnew\n${END}`);
    expect(out).not.toContain('old');
  });

  test('both markers on one prose line: the real block is replaced, the line is kept, --check reads the real block', () => {
    const dir = repo({});
    const p = join(dir, 'AGENTS.md');
    const prose = `Keep the ${START} and ${END} markers. INLINEUSER`;
    writeFileSync(p, `${prose}\n\n${wrapBlock('old')}\n`);
    injectBlock(p, 'new');
    const out = readFileSync(p, 'utf-8');
    expect(out).toContain(prose);
    expect(extractBlock(p)).toBe('new');
  });

  test('two whole-line start markers: nothing is written, the reason is given', () => {
    const dir = repo({});
    const p = join(dir, 'AGENTS.md');
    const text = `${wrapBlock('a')}\n\n${wrapBlock('b')}\n`;
    writeFileSync(p, text);
    expect(() => injectBlock(p, 'new')).toThrow(MarkerError);
    expect(() => extractBlock(p)).toThrow(MarkerError);
    expect(readFileSync(p, 'utf-8')).toBe(text);
  });

  test('a BOM before the start marker is kept; a reclaimed BOM file keeps its BOM', () => {
    const dir = repo({});
    const p = join(dir, 'AGENTS.md');
    writeFileSync(p, `\uFEFF${wrapBlock('old')}\nHAND\n`);
    expect(injectBlock(p, 'new')).toBe('replaced-block');
    expect(readFileSync(p, 'utf-8')).toBe(`\uFEFF${wrapBlock('new')}\nHAND\n`);
  });

  test('a mixed LF / CRLF file gets LF in the new lines', () => {
    const dir = repo({});
    const p = join(dir, 'AGENTS.md');
    writeFileSync(p, 'a\r\nb\nc\n');
    injectBlock(p, 'new');
    expect(readFileSync(p, 'utf-8')).toBe(`${wrapBlock('new')}\n\na\r\nb\nc\n`);
  });
});

describe('N1 / K5 — git: big repos, subfolders, git missing', () => {
  test('a file list over 1 MB is read, not reported as unreadable', () => {
    const files: Record<string, string> = { 'package.json': pkg({}) };
    for (let i = 0; i < 12000; i++) files[`packages/p${Math.floor(i / 400)}/a-long-folder-name-to-fill-the-list/file-${i}.ts`] = '';
    const dir = repo(files, true);
    const tracked = gitFiles(dir);
    expect(tracked?.files.size).toBe(12001);
  }, 120_000);

  test('dubious ownership seen from a subfolder (no .git in it) stops the run', () => {
    const dir = repo({ 'pkg/package.json': pkg({}) });
    const r = cliWithGit(join(dir, 'pkg'), `echo "fatal: detected dubious ownership in repository at '${dir}'" >&2; exit 128`);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('safe.directory');
  });

  test('git not installed with a .git present: says so, no safe.directory hint', () => {
    const dir = repo({ 'package.json': pkg({}), '.git/HEAD': 'ref: refs/heads/main\n' });
    const r = cliWithGit(dir, null);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('git is not installed or not on PATH');
    expect(r.stderr).not.toContain('safe.directory');
  });

  test('an empty .git folder is not a repo: the folder is read as usual', () => {
    const dir = repo({ 'package.json': pkg({}), 'src/a.ts': '' });
    mkdirSync(join(dir, '.git'));
    expect(gitFiles(dir)).toBeNull();
    expect(author(dir)).toContain('`src/`');
  });
});

describe('N7 — reusable workflows', () => {
  test("a callee's own call is named; a callee job with nothing kept isn't printed", () => {
    const md = author(repo({
      'package.json': pkg({ scripts: { test: 't', deepcheck: 'd' } }),
      '.github/workflows/ci.yml': 'on: pull_request\njobs:\n  a:\n    uses: ./.github/workflows/reuse.yml\n',
      '.github/workflows/reuse.yml': 'on: workflow_call\njobs:\n  inner:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n'
        + '  cache:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm ci\n'
        + '  nested:\n    uses: ./.github/workflows/deep.yml\n  ext:\n    uses: org/repo/.github/workflows/x.yml@v1\n',
      '.github/workflows/deep.yml': 'on: workflow_call\njobs:\n  d:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm run deepcheck\n',
    }));
    expect(md).toContain('# job a → nested · calls `.github/workflows/deep.yml`');
    expect(md).not.toContain('a → cache');
    expect(md).not.toContain('a → ext');
  });
});

describe('N8 — job-level labels stay on one line; tokens are masked in labels', () => {
  test('runs-on block, matrix values and a token in `if:` / `name:`', () => {
    const tok = `ghp_${'a'.repeat(36)}`;
    const yaml = 'on: pull_request\njobs:\n  j:\n    runs-on: |\n      self-hosted\n      rm -rf /\n'
      + '    strategy:\n      matrix:\n        node: ["18\\nrm -rf ~", 20]\n'
      + `    steps:\n      - name: tok ${tok} here\n        if: github.token == '${tok}'\n        run: |\n          npm test\n          npm run lint\n`;
    const md = author(repo({ 'package.json': pkg({ scripts: { test: 't', lint: 'l' } }), '.github/workflows/ci.yml': yaml }));
    expect(md).toContain('npm test\nnpm run lint');
    expect(md).not.toMatch(/^rm -rf/m);
    expect(md).not.toContain(tok);
  });
});

describe('K7 — CONTRIBUTING headings', () => {
  test('front matter is skipped; a two-line setext heading is the whole paragraph', () => {
    const dir = repo({ 'CONTRIBUTING.md': '---\ntitle: Contributing\nlayout: page\n---\n\nSetup\n---\n\nline1\nline2\n---\n' });
    expect(detectContributing(dir)?.sections).toEqual(['Setup', 'line1 line2']);
  });
});

describe('N9 — workspace roots', () => {
  test('a literal workspace path is one package, not a root of packages', () => {
    const md = author(repo({ 'package.json': pkg({ workspaces: ['./tools/x', 'packages/*'] }), 'tools/x/package.json': '{}', 'packages/a/package.json': '{}' }));
    expect(md).toContain('`packages/` — workspace packages');
    expect(md).not.toContain('`tools/` — workspace packages');
  });
});

describe('Rust and Go defaults (kept by decision; not removed without a discussion)', () => {
  test('Cargo: main.rs and lib.rs by default; `[lib] path` (after an array) and a virtual workspace turn them off', () => {
    expect(author(repo({ 'Cargo.toml': '[package]\nname = "x"\n', 'src/main.rs': '', 'src/lib.rs': '' })))
      .toContain('- `src/main.rs` — binary crate root (Cargo default)\n- `src/lib.rs` — library crate root (Cargo default)');
    expect(author(repo({ 'Cargo.toml': '[package]\nname = "x"\n\n[lib]\ncrate-type = ["cdylib"]\npath = "src/mylib.rs"\n', 'src/lib.rs': '', 'src/mylib.rs': '' })))
      .not.toContain('library crate root');
    expect(author(repo({ 'Cargo.toml': '[workspace]\nmembers = ["a"]\n', 'src/main.rs': '' }))).not.toContain('crate root');
    expect(author(repo({ 'Cargo.toml': '[package]\nname = "x"\nautobins = false\n', 'src/main.rs': '' }))).not.toContain('binary crate root');
  });
  test('Go: a root main.go that is `package main`; not a `//go:build ignore` generator or another package', () => {
    expect(author(repo({ 'go.mod': 'module x\n', 'main.go': 'package main\n' }))).toContain('- `main.go` — Go `package main`');
    expect(author(repo({ 'go.mod': 'module x\n', 'main.go': '//go:build ignore\n\npackage main\n' }))).not.toContain('Go `package main`');
    expect(author(repo({ 'go.mod': 'module x\n', 'main.go': 'package mainutil\n' }))).not.toContain('Go `package main`');
  });
  test('a manifest entry wins over the defaults', () => {
    const md = author(repo({ 'package.json': pkg({ main: 'dist/index.js' }), 'Cargo.toml': '[package]\nname = "x"\n', 'src/main.rs': '' }));
    expect(md).not.toContain('Cargo default');
  });
});

describe('scripts and workflows by name and trigger', () => {
  test('`test:update-snapshots` is not a check', () => {
    expect(detectCommands('/nonexistent', { scripts: { 'test:update-snapshots': 'jest' } })).toEqual({});
  });
  test('push to main only, and label-only pull requests, are named, not copied', () => {
    expect(parseWorkflow('on:\n  push:\n    branches: [main]\njobs: {}\n').checksChanges).toBe(false);
    expect(parseWorkflow('on:\n  pull_request:\n    types: [labeled, unlabeled]\njobs: {}\n').checksChanges).toBe(false);
    expect(parseWorkflow('on:\n  push:\n    branches: [main]\n  pull_request:\njobs: {}\n').checksChanges).toBe(true);
    expect(parseWorkflow('on:\n  pull_request:\n    types: [opened, labeled]\njobs: {}\n').checksChanges).toBe(true);
    expect(parseWorkflow('on: push\njobs: {}\n').checksChanges).toBe(true);
  });
  test('a CI line that calls a repo script after flags is the repo\'s own command', () => {
    const md = author(repo({ 'package.json': pkg({ scripts: { test: 't', lint: 'l' } }), '.github/workflows/ci.yml': 'on: pull_request\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: yarn --silent test\n      - run: pnpm -s lint\n' }));
    expect(md).toContain('yarn --silent test\npnpm -s lint');
  });
});

describe('0.2.0 keeps everything 0.1.0 offered', () => {
  test('every v0.1.0 section and line type is still authored', () => {
    const dir = repo({
      'package.json': pkg({ type: 'module', scripts: { build: 'tsc', test: 'node --test', lint: 'eslint .' } }),
      'tsconfig.json': '{"compilerOptions":{"strict":true}}', 'eslint.config.js': '', '.env': 'X=1', '.env.example': 'X=',
      'src/index.ts': '', 'README.md': '', 'CHANGELOG.md': '',
    }, true);
    const md = author(dir);
    for (const line of [
      '## Setup & build', 'npm install    # install dependencies', '## Run the tests', '## Where things live',
      'Key files:', '- `package.json`', '- `src/index.ts`', '- `README.md`', '- `tsconfig.json`',
      '## Conventions', 'TypeScript strict mode (tsconfig.json)', 'ESM modules (`type: module`)', '— obey the configs',
      '## Guardrails', '**Always OK:**', '**Ask first:**', '**Never:**', 'commit `.env`',
      '## Definition of Done', 'committed with a clear message',
      '## Security & secrets', 'Secrets live in `.env` (see `.env.example`). Never read or commit them.',
      '## Commit & PR', 'refresh this file in the **same PR**',
    ]) expect(md).toContain(line);
  });
});

describe('restored from main: ranking, step details, folder notes', () => {
  const run = (cmd: string): string => `on: pull_request\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: ${cmd}\n`;
  test('the main check comes first; fix / changelog helpers rank after the tests', () => {
    const md = author(repo({
      'package.json': pkg({ scripts: { test: 't', 'check-changelog': 'c', 'lint:js:fix': 'f', e2e: 'e' } }),
      '.github/workflows/check-changelog.yml': run('yarn check-changelog'),
      '.github/workflows/lint-autofix.yml': run('npm run lint:js:fix'),
      '.github/workflows/nodejs.yml': run('npm test'),
      '.github/workflows/tests-e2e.yml': run('npm run e2e'),
      '.github/workflows/ci.yml': run('npm test'),
    }));
    const at = (f: string): number => md.indexOf(`\`.github/workflows/${f}\``);
    expect(at('ci.yml')).toBeLessThan(at('tests-e2e.yml'));
    expect(at('tests-e2e.yml')).toBeLessThan(at('nodejs.yml'));
    expect(at('nodejs.yml')).toBeLessThan(at('check-changelog.yml'));
    expect(at('nodejs.yml')).toBeLessThan(at('lint-autofix.yml'));
  });
  test('steps not shown are counted, never copied', () => {
    const md = author(repo({ 'package.json': pkg({ scripts: { test: 't' } }), '.github/workflows/ci.yml': 'on: pull_request\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm ci\n      - run: npm test\n      - run: npx wrangler deploy\n' }));
    expect(md).toContain('npm test\n# 2 other steps in the file');
    expect(md).not.toContain('wrangler');
  });
});

describe('ladder 11-10: a CI note stays with its step; a step is shown whole', () => {
  test('a condition ends its own line, and a step that mixes a repo command with a check keeps the check', () => {
    const md = author(repo({
      'package.json': pkg({ scripts: { test: 't', 'coverage:checks': 'c', build: 'b', 'build:validator': 'v' } }),
      '.github/workflows/ci.yml': "on: pull_request\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n      - if: matrix.node == '24'\n        run: npm run coverage:checks\n      - run: npm run build\n      - run: npm run build:validator && git diff --exit-code -- worker/validator.cjs\n",
    }));
    expect(md).toContain("npm test\nnpm run coverage:checks    # if: matrix.node == '24'\nnpm run build\nnpm run build:validator && git diff --exit-code -- worker/validator.cjs\n");
  });
});
