/**
 * Findings from the two reviews of PR #8 (claude: C1–C12, goose: G8-1–G8-9).
 * Each test is an input that made the output false, lost text, or unstable.
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
import { GitUnreadableError } from '../src/detect/git.ts';
import { injectBlock, wrapBlock } from '../src/inject.ts';

const ROOT = join(import.meta.dir, '..');
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function repo(files: Record<string, string>, git = false): string {
  const dir = mkdtempSync(join(tmpdir(), 'amf-r8-'));
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
  `on: ${on}\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n${steps.map((s) => `      - run: ${s}\n`).join('')}`;

describe('C1 / G8-2 — a markerless file is replaced only when it is exactly the tool\'s output', () => {
  const BANNER = '<!-- authored by agents-md-facts — from your repo\'s facts, never guessed -->\n\n';
  const cases: Record<string, string> = {
    'a bullet added under a tool heading': '# AGENTS.md — demo\n\n## Guardrails\n\n- **Never:** touch billing/ — TEAMRULE\n',
    'a setext heading': 'Team notes\n==========\n\nTEAMRULE\n',
    'a hand-written title': '# AGENTS.md — our team handbook\n\nTEAMRULE\n',
    'HTML': '<details><summary>Team notes</summary>TEAMRULE</details>\n',
    'a ```` fence holding ```': '## CI\n\n````bash\n```\n````\n\n## Team notes\n\nTEAMRULE\n',
    'a plain paragraph': 'TEAMRULE: never touch billing.\n',
  };
  for (const [what, rest] of Object.entries(cases)) {
    test(`${what} is kept`, () => {
      const dir = repo({ 'package.json': pkg({}), 'AGENTS.md': BANNER + rest });
      expect(injectBlock(join(dir, 'AGENTS.md'), author(dir))).toBe('kept');
      expect(readFileSync(join(dir, 'AGENTS.md'), 'utf-8')).toContain('TEAMRULE');
    });
  }
  test('the tool\'s own unchanged output (markers lost) is reclaimed', () => {
    const dir = repo({ 'package.json': pkg({}) });
    const block = author(dir);
    writeFileSync(join(dir, 'AGENTS.md'), `${block}\n`);
    expect(injectBlock(join(dir, 'AGENTS.md'), block)).toBe('reclaimed');
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf-8')).toBe(`${wrapBlock(block)}\n`);
  });
  test('a CRLF file keeps CRLF line ends', () => {
    const dir = repo({ 'package.json': pkg({}), 'AGENTS.md': 'Team notes\r\n' });
    injectBlock(join(dir, 'AGENTS.md'), author(dir));
    const text = readFileSync(join(dir, 'AGENTS.md'), 'utf-8');
    expect(text).not.toMatch(/[^\r]\n/);
  });
});

describe('C2 / G8-1 — the install filter drops installs only', () => {
  const runs = (step: string): string[] => parseWorkflow(wf('push', [step])).jobs[0]?.steps.map((s) => s.run) ?? [];
  test('scripts and chains are kept', () => {
    for (const s of ['yarn build', 'yarn test --coverage', 'yarn lint', 'npm ci && npm run build', 'pnpm install && pnpm test', 'bun i && bun test']) {
      expect(runs(s)).toEqual([s]);
    }
  });
  test('installs with flags are dropped', () => {
    for (const s of ['npm ci', 'npm ci --prefix web', 'yarn --immutable', 'yarn install --frozen-lockfile', "pnpm i --filter '!docs'", 'bun install']) {
      expect(runs(s)).toEqual([]);
    }
  });
});

describe('C3 — a local build doesn\'t change the output', () => {
  test('a gitignored dist/ file is not the source', () => {
    const files = {
      'package.json': pkg({ bin: { tool: 'dist/cli.js' }, main: 'dist/index.js', scripts: { build: 'tsup src/main.ts' } }),
      '.gitignore': 'dist/\n', 'src/main.ts': '',
    };
    const dir = repo(files, true);
    const before = author(dir);
    mkdirSync(join(dir, 'dist'));
    writeFileSync(join(dir, 'dist/cli.js'), '');
    writeFileSync(join(dir, 'dist/index.js'), '');
    expect(author(dir)).toBe(before);
    expect(before).toContain('- `dist/cli.js` — the `tool` command (built by `npm run build`)');
  });
});

describe('C4 / G8-3 — which workflows the CI section shows', () => {
  test('the main check comes first; a publish step is left out, not copied', () => {
    const md = author(repo({
      'package.json': pkg({}),
      '.github/workflows/autofix.yml': wf('pull_request', Array.from({ length: 30 }, (_, i) => `echo fix-${i}`)),
      '.github/workflows/cr.yml': wf('pull_request', ['pnpm build', 'pnpm exec pkg-pr-new publish --compact']),
      '.github/workflows/ci.yml': wf('[push, pull_request]', ['pnpm test']),
    }));
    expect(md.indexOf('`.github/workflows/ci.yml`')).toBeLessThan(md.indexOf('autofix.yml'));
    expect(md).toContain('pnpm test');
    expect(md).not.toContain('pkg-pr-new publish');
  });
  test('a tags-only push and pull_request_target are named, not copied', () => {
    const md = author(repo({
      'package.json': pkg({}),
      '.github/workflows/release.yml': 'on:\n  push:\n    tags: [\'v*\']\njobs:\n  r:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm run release-notes\n',
      '.github/workflows/label.yml': wf('pull_request_target', ['gh label sync']),
    }));
    expect(md).not.toContain('release-notes');
    expect(md).not.toContain('gh label sync');
    expect(md).toContain('Also: `.github/workflows/label.yml` (on pull_request_target) · `.github/workflows/release.yml` (on push).');
  });
  test('a reusable workflow is shown under the job that calls it', () => {
    const md = author(repo({
      'package.json': pkg({}),
      '.github/workflows/ci.yml': 'on: [pull_request]\njobs:\n  test:\n    uses: ./.github/workflows/test.yml\n',
      '.github/workflows/test.yml': 'on: workflow_call\njobs:\n  unit:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n',
    }));
    expect(md).toContain('# job test · calls `.github/workflows/test.yml`\n# job test → unit · ubuntu-latest\nnpm test');
    expect(md).not.toContain('Also:');
  });
  test('the "Also:" line names six, then counts', () => {
    const files: Record<string, string> = { 'package.json': pkg({}) };
    for (let i = 0; i < 10; i++) files[`.github/workflows/w${i}.yml`] = wf('schedule', ['echo hi']);
    const md = author(repo(files));
    expect(md).toMatch(/Also: (`[^`]+` \(on schedule\) · ){6}and 4 more in `\.github\/workflows\/`\./);
  });
});

describe('C5 — workflow-level defaults.run', () => {
  test('directory and shell come from the workflow when the job and step set none; paths normalised', () => {
    const { jobs } = parseWorkflow('on: push\ndefaults:\n  run:\n    working-directory: ./web/\n    shell: pwsh\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm run lint\n');
    expect(jobs[0]?.steps).toEqual([{ run: 'npm run lint', dir: 'web', shell: 'pwsh' }]);
  });
});

describe('C6 / G8-4 — entry points traced only for a plain tsc build', () => {
  for (const build of ['tsdown', 'bunchee', 'microbundle', 'node build.mjs', 'turbo run build']) {
    test(`\`${build}\` → the declared path, not a same-named file`, () => {
      const md = author(repo({ 'package.json': pkg({ bin: { x: 'dist/cli.js' }, scripts: { build } }), 'src/cli.ts': '', 'src/main.ts': '' }));
      expect(md).toContain('- `dist/cli.js` — the `x` command (built by `npm run build`)');
    });
  }
  test('`tsc -p tsconfig.build.json && node -e "…copy…"` is still traced', () => {
    const md = author(repo({
      'package.json': pkg({ bin: { x: 'dist/cli.js' }, scripts: { build: 'tsc -p tsconfig.build.json && node -e "require(\'fs\').copyFileSync(\'a\',\'b\')"' } }),
      'src/cli.ts': '',
    }));
    expect(md).toContain('- `src/cli.ts` — the `x` command');
  });
  test('a commented tsconfig option is ignored; `extends` is followed', () => {
    const md = author(repo({
      'package.json': pkg({ main: 'out/index.js' }),
      'tsconfig.json': '{\n  // "outDir": "old",\n  "extends": "./tsconfig.base.json",\n  "compilerOptions": { "outDir": "out" }\n}\n',
      'tsconfig.base.json': '{ "compilerOptions": { "rootDir": "lib2" } }',
      'lib2/index.ts': '', 'src/index.ts': '',
    }));
    expect(md).toContain('- `lib2/index.ts` — package entry (`main`)');
  });
});

describe('C7 / G8-9 — workspace and toolchain notes only from what the files say', () => {
  test('pnpm `catalog:` and `onlyBuiltDependencies:` entries are not workspace packages', () => {
    const md = author(repo({
      'package.json': pkg({}),
      'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\ncatalog:\n  nope: ^1.0.0\nonlyBuiltDependencies:\n  - esbuild\n",
      'packages/a/x': '', 'esbuild/x': '', 'nope/x': '',
    }));
    expect(md).toContain('- `esbuild/`\n');
    expect(md).toContain('- `packages/` — workspace packages');
  });
  test('main.go is listed only when it is `package main`', () => {
    expect(author(repo({ 'go.mod': 'module x\n', 'main.go': 'package x\n' }))).not.toContain('main.go');
    expect(author(repo({ 'go.mod': 'module x\n', 'main.go': 'package main\n' }))).toContain('- `main.go` — Go `package main`');
  });
  test('Cargo `[lib] path` replaces the src/lib.rs default', () => {
    const md = author(repo({ 'Cargo.toml': '[package]\nname = "x"\n\n[lib]\npath = "src/mylib.rs"\n', 'src/lib.rs': '', 'src/mylib.rs': '' }));
    expect(md).not.toContain('src/lib.rs');
  });
  test('turbo.json is Turborepo config', () => {
    expect(author(repo({ 'package.json': pkg({}), 'turbo.json': '{}' }))).toContain('- `turbo.json` — Turborepo config');
  });
});

describe('C8 / G8-7 — git that refuses to read the repo stops the run', () => {
  test('a .git git can\'t read throws GitUnreadableError, never a silent folder list', () => {
    const dir = repo({ 'package.json': pkg({}), '.git': 'gitdir: /nonexistent/really\n', 'src/a.ts': '' });
    expect(() => buildRepoContext(dir)).toThrow(GitUnreadableError);
  });
});

describe('C9 — CommonMark fences and setext headings in CONTRIBUTING', () => {
  test('a ``` line inside a ```` fence doesn\'t close it; a setext heading is read', () => {
    const dir = repo({ 'CONTRIBUTING.md': '## Setup\n\n````md\n```\n## inside\n```\n````\n\nCode style\n----------\n' });
    expect(detectContributing(dir)?.sections).toEqual(['Setup', 'Code style']);
  });
});

describe('C11 / G8-5 — labels stay comments on one line', () => {
  test('a multi-line if: and name: become one comment line each', () => {
    const md = author(repo({
      'package.json': pkg({}),
      '.github/workflows/ci.yml': "on: push\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - name: |\n          Harmless\n          rm -rf ~\n        if: |\n          github.event_name == 'push' ||\n          github.event_name == 'merge_group'\n        run: |\n          echo a\n          echo b\n",
    }));
    expect(md).toContain("# if: github.event_name == 'push' || github.event_name == 'merge_group'\n# step \"Harmless rm -rf ~\": 2-line script in the file");
    expect(md).not.toMatch(/^github\.event_name/m);
    expect(md).not.toMatch(/^rm -rf ~/m);
  });
  test('a name with an expression isn\'t used as a label', () => {
    const md = author(repo({ 'package.json': pkg({}), '.github/workflows/ci.yml': 'on: push\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - name: ${{ matrix.node }} build\n        run: |\n          set -e\n          npm run build\n' }));
    expect(md).toContain('npm run build\n# … 1 more line in this step');
  });
});

describe('G8-6 — YAML edge cases', () => {
  test('a workflow that isn\'t valid YAML is named, not dropped', () => {
    const md = author(repo({ 'package.json': pkg({}), '.github/workflows/bad.yml': 'on: push\non: push\njobs: {}\n' }));
    expect(md).toContain('`.github/workflows/bad.yml` (not valid YAML)');
  });
  test('merge keys are expanded; a matrix set by an expression is said so', () => {
    const { jobs } = parseWorkflow('on: push\nx: &base\n  runs-on: ubuntu-latest\n  steps:\n    - run: npm test\njobs:\n  a:\n    <<: *base\n  b:\n    <<: *base\n    strategy:\n      matrix: ${{ fromJSON(needs.x.outputs.m) }}\n');
    expect(jobs.map((j) => [j.id, j.runsOn, j.matrix, j.steps.length])).toEqual([
      ['a', ['ubuntu-latest'], [], 1],
      ['b', ['ubuntu-latest'], ['matrix set by an expression'], 1],
    ]);
  });
});

describe('C12 — a token in a run: line is masked', () => {
  test('a GitHub token typed into a step never reaches AGENTS.md', () => {
    const md = author(repo({ 'package.json': pkg({}), '.github/workflows/ci.yml': wf('push', ["\"curl -H 'Authorization: token ghp_abcdefghijklmnopqrstuvwxyz0123' https://x\""]) }));
    expect(md).not.toContain('ghp_');
    expect(md).toContain('token <token>');
  });
});

describe('G8-9 — scripts that write or only delete', () => {
  test('`lint` that runs `--fix` is not a check', () => {
    expect(detectCommands(repo({}), JSON.parse(pkg({ scripts: { lint: 'eslint . --fix', test: 'vitest run', 'test:watch:ci': 'vitest' } }))))
      .toEqual({ test: 'npm test' });
  });
  test('`rimraf dist && tsc -p src/` uses src/; `cd e2e && playwright test` uses e2e/', () => {
    const md = author(repo({ 'package.json': pkg({ scripts: { build: 'rimraf dist && tsc -p src/', e2e: 'cd e2e && playwright test' } }), 'src/a.ts': '', 'e2e/a.ts': '' }));
    expect(md).toContain('- `src/` — used by `npm run build`');
    expect(md).toContain('- `e2e/` — end-to-end tests, used by `npm run e2e`');
  });
});

describe('Release pins (C10 / G8-8)', () => {
  const version = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as { version: string }).version;
  test('agent.fafa and project.faf carry the package version', () => {
    expect(readFileSync(join(ROOT, 'agent.fafa'), 'utf-8')).toMatch(new RegExp(`^\\s+version: "?${version.replace(/\./g, '\\.')}"?$`, 'm'));
    expect(readFileSync(join(ROOT, 'project.faf'), 'utf-8')).toMatch(new RegExp(`^\\s+version: "?${version.replace(/\./g, '\\.')}"?$`, 'm'));
  });
  test('the hook says which pre-commit it needs', () => {
    expect(readFileSync(join(ROOT, '.pre-commit-hooks.yaml'), 'utf-8')).toContain("minimum_pre_commit_version: '3.2.0'");
  });
});
