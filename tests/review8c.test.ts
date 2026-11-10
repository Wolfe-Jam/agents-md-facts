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
import { commandsOf, parseWorkflow, ships } from '../src/detect/ci.ts';
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

describe('K2 / N2 — WRITES: only flags that mean "write" in that tool', () => {
  test.each([
    ['jest -w 2', 'jest --maxWorkers'],
    ['npm test -w packages/core', 'npm --workspace'],
    ['mocha -u tdd', 'mocha --ui'],
    ['curl -u me:x host && jest', 'curl user'],
  ])('`%s` is still the test command (%s)', (cmd) => {
    expect(detectCommands('/nonexistent', { scripts: { test: cmd } })).toEqual({ test: 'npm test' });
  });
  test.each(['jest -u', 'vitest run -u', 'prettier -w .', 'eslint . --fix'])('`%s` writes files: not a check', (cmd) => {
    expect(detectCommands('/nonexistent', { scripts: { lint: cmd } })).toEqual({});
  });
  test('`test:update-snapshots` is not a check', () => {
    expect(detectCommands('/nonexistent', { scripts: { 'test:update-snapshots': 'jest' } })).toEqual({});
  });
});

describe('K3 / N4 — SHIPS: per command, at its start', () => {
  test.each([
    'npm publish --dry-run', 'pnpm publish --dry-run --no-git-checks', 'cargo publish --dry-run',
    'git push --dry-run origin HEAD', 'gh release view v1.0.0', 'gh release list',
    'echo "remember: npm publish happens; git push later"', 'npm test',
  ])('`%s` is not a ship', (cmd) => {
    expect(commandsOf(cmd).some(ships)).toBe(false);
  });
  test.each([
    'npx semantic-release', 'docker push ghcr.io/x/y:latest', 'vercel deploy --prod', 'uv publish', 'npm run deploy',
    'npx firebase deploy', 'npm run release', 'pnpm -r publish', 'pnpm --filter x publish', 'lerna publish',
    'git -c user.name=x push origin HEAD', 'NODE_AUTH_TOKEN=x npm publish', 'pnpm exec pkg-pr-new publish --compact',
    'docker buildx build . --push -t x',
  ])('`%s` ships', (cmd) => {
    expect(commandsOf(cmd).every(ships)).toBe(true);
  });
  test('a step that builds and pushes is kept, with a note; one that only ships is counted', () => {
    const dir = repo({
      'package.json': pkg({}),
      '.github/workflows/ci.yml': wf('pull_request', ['npm run build && git push', 'npm publish']),
    });
    const md = author(dir);
    expect(md).toContain('# part of this step publishes / deploys / pushes\nnpm run build && git push');
    expect(md).toContain('# 1 publish / deploy / push step left out');
  });
  test('push to main only, and label-only pull requests, are named, not copied', () => {
    expect(parseWorkflow('on:\n  push:\n    branches: [main]\njobs: {}\n').checksChanges).toBe(false);
    expect(parseWorkflow('on:\n  pull_request:\n    types: [labeled, unlabeled]\njobs: {}\n').checksChanges).toBe(false);
    expect(parseWorkflow('on:\n  push:\n    branches: [main]\n  pull_request:\njobs: {}\n').checksChanges).toBe(true);
    expect(parseWorkflow('on:\n  pull_request:\n    types: [opened, labeled]\njobs: {}\n').checksChanges).toBe(true);
    expect(parseWorkflow('on: push\njobs: {}\n').checksChanges).toBe(true);
  });
});

describe('K9 / N5 — INSTALL: a flag never swallows a script name', () => {
  test.each(['yarn --silent test', 'yarn -s lint'])('`%s` is kept', (cmd) => {
    expect(runs(wf('pull_request', [cmd]))).toEqual([cmd]);
  });
  test.each(['npm ci --prefix web', 'pnpm i --filter "!docs"', 'pnpm install -w', 'yarn --immutable', 'yarn install --network-timeout 100000'])(
    '`%s` is an install', (cmd) => { expect(runs(wf('pull_request', [cmd]))).toEqual([]); },
  );
});

describe('K6 / N6 / N7 — CI ranking and reusable workflows', () => {
  test('a fix / changelog helper ranks after the test workflows', () => {
    const md = author(repo({
      'package.json': pkg({}),
      '.github/workflows/check-changelog.yml': wf('pull_request', ['yarn check-changelog']),
      '.github/workflows/lint-autofix.yml': wf('pull_request', ['pnpm lint:js:fix']),
      '.github/workflows/nodejs.yml': wf('pull_request', ['yarn jest']),
      '.github/workflows/tests-e2e.yml': wf('pull_request', ['pnpm e2e']),
    }));
    const at = (f: string): number => md.indexOf(`\`.github/workflows/${f}\``);
    expect(at('tests-e2e.yml')).toBeLessThan(at('nodejs.yml'));
    expect(at('nodejs.yml')).toBeLessThan(at('check-changelog.yml'));
    expect(at('nodejs.yml')).toBeLessThan(at('lint-autofix.yml'));
  });
  test("a callee's own call is named; a callee job with nothing kept isn't printed", () => {
    const md = author(repo({
      'package.json': pkg({}),
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
    const md = author(repo({ 'package.json': pkg({}), '.github/workflows/ci.yml': yaml }));
    expect(md).not.toMatch(/^rm -rf/m);
    expect(md).not.toContain(tok);
  });
});

describe('K4 / N3 — entry points: traced only when every build is plain tsc', () => {
  const traced = (scripts: Record<string, string>, files: Record<string, string>): string =>
    author(repo({ 'package.json': pkg({ main: 'dist/index.js', scripts }), 'src/index.ts': '', ...files }));
  test.each([
    [{ build: 'tsc -p tsconfig.build.json' }, {}],
    [{ build: 'tsc --outDir dist --rootDir lib' }, {}],
    [{ build: 'tsc && cp bundle/index.js dist/index.js' }, {}],
    [{ build: 'tsc || esbuild src/main.ts --outfile=dist/index.js' }, {}],
    [{ 'build:js': 'esbuild src/main.ts --bundle --outfile=dist/index.js' }, { 'tsconfig.json': '{"compilerOptions":{"outDir":"dist"}}' }],
    [{ prepare: 'tsup src/entry.ts' }, { 'tsconfig.json': '{"compilerOptions":{"outDir":"dist"}}' }],
    [{ dist: 'tsup src/entry.ts' }, { 'tsconfig.json': '{"compilerOptions":{"outDir":"dist"}}' }],
  ] as [Record<string, string>, Record<string, string>][])('%j is not traced', (scripts, files) => {
    expect(traced(scripts, files)).not.toContain('- `src/index.ts`');
  });
  test('`npm run clean && npm run build:ts` is followed: plain tsc, traced', () => {
    expect(traced({ build: 'npm run clean && npm run build:ts', clean: 'rimraf dist', 'build:ts': 'tsc' }, {}))
      .toContain('- `src/index.ts` — package entry (`main`)');
  });
  test('an `extends` array is read, later entries win', () => {
    const md = traced({ build: 'tsc' }, {
      'tsconfig.json': '{"extends":["./a.json","./b.json"]}',
      'a.json': '{"compilerOptions":{"outDir":"dist","rootDir":"src"}}',
      'b.json': '{"compilerOptions":{"rootDir":"lib"}}',
      'lib/index.ts': '',
    });
    expect(md).toContain('- `lib/index.ts` — package entry (`main`)');
  });
  test('a two-level `extends` chain is followed', () => {
    const md = traced({ build: 'tsc' }, {
      'tsconfig.json': '{"extends":"./cfg/a.json"}',
      'cfg/a.json': '{"extends":"./b.json"}',
      'cfg/b.json': '{"compilerOptions":{"outDir":"../dist","rootDir":"../lib"}}',
      'lib/index.ts': '',
    });
    expect(md).toContain('- `lib/index.ts` — package entry (`main`)');
  });
  test('no rootDir: a one-folder `include` is the root; several folders trace nothing', () => {
    expect(traced({ build: 'tsc' }, { 'tsconfig.json': '{"compilerOptions":{"outDir":"dist"},"include":["lib"]}', 'lib/index.ts': '' }))
      .toContain('- `lib/index.ts` — package entry (`main`)');
    expect(traced({ build: 'tsc' }, { 'tsconfig.json': '{"compilerOptions":{"outDir":"dist"},"include":["lib","src"]}' }))
      .toContain('- `dist/index.js` — package entry (`main`)');
  });
});

describe('K7 — CONTRIBUTING headings', () => {
  test('front matter is skipped; a two-line setext heading is the whole paragraph', () => {
    const dir = repo({ 'CONTRIBUTING.md': '---\ntitle: Contributing\nlayout: page\n---\n\nSetup\n---\n\nline1\nline2\n---\n' });
    expect(detectContributing(dir)?.sections).toEqual(['Setup', 'line1 line2']);
  });
});

describe('K8 / N9 — toolchain defaults checked against the manifest', () => {
  test('Cargo `[lib]` with an array before `path`; a virtual workspace', () => {
    expect(author(repo({ 'Cargo.toml': '[package]\nname = "x"\n\n[lib]\ncrate-type = ["cdylib"]\npath = "src/mylib.rs"\n', 'src/lib.rs': '', 'src/mylib.rs': '' })))
      .not.toContain('`src/lib.rs` — library crate root');
    expect(author(repo({ 'Cargo.toml': '[workspace]\nmembers = ["a"]\n', 'src/main.rs': '' })))
      .not.toContain('binary crate root');
  });
  test('a commented build.zig line; a `//go:build ignore` main.go', () => {
    expect(author(repo({ 'build.zig': '// .root_source_file = b.path("src/main.zig"),\n', 'src/main.zig': '' })))
      .not.toContain('named in build.zig');
    expect(author(repo({ 'go.mod': 'module x\n', 'main.go': '//go:build ignore\n\npackage main\n' })))
      .not.toContain('Go `package main`');
  });
  test('a literal workspace path is one package, not a root of packages', () => {
    const md = author(repo({ 'package.json': pkg({ workspaces: ['./tools/x', 'packages/*'] }), 'tools/x/package.json': '{}', 'packages/a/package.json': '{}' }));
    expect(md).toContain('`packages/` — workspace packages');
    expect(md).not.toContain('`tools/` — workspace packages');
  });
});
