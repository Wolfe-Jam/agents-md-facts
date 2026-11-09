import { execFileSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { PackageJson } from './pkg.js';
import { scriptCommand } from './commands.js';

/** A path in the repo and what it is, when the repo says so. */
export interface LayoutEntry {
  path: string;
  note: string | null;
}

/** The repo's map: its top-level folders, then its entry points. */
export interface DetectedLayout {
  folders: LayoutEntry[];
  entries: LayoutEntry[];
}

/** Build output, dependencies and caches: never part of the map. */
const SKIP = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', 'target', '__pycache__', 'venv', 'zig-out', 'zig-cache']);

/**
 * What a conventionally named folder holds (a curated default, like the
 * conventions list). Only names with one common meaning: not `lib` (source in
 * some repos, build output in others) or `spec` (tests, or a specification).
 */
const NAMES: Record<string, string> = {
  src: 'source', cmd: 'commands', internal: 'internal packages',
  test: 'tests', tests: 'tests', __tests__: 'tests', e2e: 'end-to-end tests', fixtures: 'test fixtures',
  docs: 'docs', examples: 'examples', scripts: 'scripts',
  bench: 'benchmarks', benchmarks: 'benchmarks', migrations: 'database migrations',
};

/** Workspace configs: a monorepo's root says where its packages are. */
const WORKSPACE_FILES = ['pnpm-workspace.yaml', 'lerna.json', 'nx.json', 'turbo.json'];

/** Fallback entry points, for repos whose manifest names none. */
const ENTRY_CANDIDATES = [
  'src/index.ts', 'src/index.js', 'src/main.ts', 'src/cli.ts',
  'src/main.rs', 'src/lib.rs', 'src/main.zig', 'src/root.zig',
  'src/__init__.py', 'main.py', '__main__.py', 'main.go', 'cmd/main.go',
];

/** Package managers and runners: the word after one is a script or a subcommand, not a folder. */
const RUNNERS = new Set(['npm', 'pnpm', 'yarn', 'bun', 'npx', 'bunx', 'deno', 'run']);

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Top-level names the root `.gitignore` ignores (plain `name`, `name/`, `/name` lines only). */
function ignoredAtRoot(dir: string): Set<string> {
  const out = new Set<string>();
  try {
    for (const line of readFileSync(join(dir, '.gitignore'), 'utf-8').split(/\r?\n/)) {
      const m = /^\/?([^\s/*!#?[\]]+)\/?$/.exec(line.trim());
      if (m?.[1]) out.add(m[1]);
    }
  } catch { /* no .gitignore */ }
  return out;
}

/**
 * Top-level folders, in name order: the ones git tracks inside a work tree;
 * outside git, the folders that exist minus what the root `.gitignore` ignores.
 */
function topFolders(dir: string, git: boolean): string[] {
  let names: string[] = [];
  if (git) {
    try {
      const out = execFileSync('git', ['ls-files', '-z'], { cwd: dir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
      names = [...new Set(out.split('\0').filter((p) => p.includes('/')).map((p) => p.slice(0, p.indexOf('/'))))];
    } catch { /* fall through to the folder itself */ }
  }
  if (!names.length) {
    const ignored = ignoredAtRoot(dir);
    try {
      names = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !ignored.has(e.name)).map((e) => e.name);
    } catch { return []; }
  }
  return names.filter((n) => !n.startsWith('.') && !SKIP.has(n)).sort();
}

/** The `main` a wrangler config names (Cloudflare Workers), or null. */
function wranglerMain(dir: string): { config: string; main: string } | null {
  for (const config of ['wrangler.toml', 'wrangler.jsonc', 'wrangler.json']) {
    const p = join(dir, config);
    if (!existsSync(p)) continue;
    const m = /(?:^|[\s,{])"?main"?\s*[=:]\s*"([^"]+)"/m.exec(readFileSync(p, 'utf-8'));
    if (m?.[1]) return { config, main: m[1].replace(/^\.\//, '') };
  }
  return null;
}

/** True when package.json `workspaces` or `pnpm-workspace.yaml` names this folder. */
function isWorkspaceFolder(dir: string, pkg: PackageJson | null, name: string): boolean {
  const ws = Array.isArray(pkg?.workspaces) ? pkg.workspaces : pkg?.workspaces?.packages ?? [];
  const globs = [...ws];
  try {
    const text = readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf-8');
    globs.push(...[...text.matchAll(/^\s*-\s*['"]?([^'"\s#]+)/gm)].map((m) => m[1] ?? ''));
  } catch { /* none */ }
  return globs.some((g) => g.replace(/^\.\//, '').split('/')[0] === name);
}

/**
 * True when a script command names `folder` as a path: `folder/…`, `./folder`,
 * or `folder` as a whole argument. Not a value (`NODE_ENV=test`) and not the
 * word after a runner (`bun test`, `npm run test`).
 */
function scriptUsesFolder(command: string, folder: string): boolean {
  const path = new RegExp(`(?:^|[\\s"'(=,])(?:\\./)?${escape(folder)}/`);
  if (path.test(command)) return true;
  const tokens = command.split(/[\s"'()]+/).filter(Boolean);
  return tokens.some((t, i) => (t === folder || t === `./${folder}`) && !RUNNERS.has(tokens[i - 1] ?? ''));
}

/** `outDir` → `rootDir` from tsconfig.json, for tracing a built file to its source. */
function tsDirs(dir: string): { outDir: string; rootDir: string } | null {
  try {
    const text = readFileSync(join(dir, 'tsconfig.json'), 'utf-8');
    const out = /"outDir"\s*:\s*"([^"]+)"/.exec(text)?.[1];
    if (!out) return null;
    const root = /"rootDir"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? 'src';
    const clean = (p: string): string => p.replace(/^\.\//, '').replace(/\/$/, '');
    return { outDir: clean(out), rootDir: clean(root) };
  } catch {
    return null;
  }
}

/** The source file behind a built path (`dist/cli.js` → `src/cli.ts`), when it exists. */
function sourceOf(dir: string, built: string, ts: { outDir: string; rootDir: string } | null): string | null {
  const p = built.replace(/^\.\//, '');
  const outs = [...new Set([...(ts ? [ts.outDir] : []), 'dist', 'build', 'out', 'lib'])];
  const out = outs.find((o) => p.startsWith(`${o}/`));
  if (!out) return existsSync(join(dir, p)) ? p : null;
  const rest = p.slice(out.length + 1).replace(/\.(c|m)?js$/, '');
  const root = ts && out === ts.outDir ? ts.rootDir : 'src';
  const stem = root === '.' || root === '' ? rest : `${root}/${rest}`;
  for (const ext of ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs']) {
    if (existsSync(join(dir, stem + ext))) return stem + ext;
  }
  // A committed file with no source behind it (a hand-written `lib/`) is the source.
  return existsSync(join(dir, p)) ? p : null;
}

/** The path `exports['.']` resolves to, descending through condition objects. */
function exportsEntry(exp: unknown, depth = 0): string | null {
  if (typeof exp === 'string') return /\.d\.[cm]?ts$/.test(exp) ? null : exp;
  if (!exp || typeof exp !== 'object' || Array.isArray(exp) || depth > 3) return null;
  const obj = exp as Record<string, unknown>;
  if (depth === 0 && '.' in obj) return exportsEntry(obj['.'], depth + 1);
  for (const k of ['import', 'node', 'default', 'require']) {
    const v = exportsEntry(obj[k], depth + 1);
    if (v) return v;
  }
  return null;
}

/**
 * The repo's map, from what it declares: each top-level folder with a note
 * (a wrangler `main` inside it, a workspace listing it, what its conventional
 * name means, the scripts that use it), any workspace config, then the entry
 * points the manifest names (`bin`, `exports`/`main`), traced back to their
 * source. Pure apart from asking git which files it tracks.
 */
export function detectLayout(dir: string, pkg: PackageJson | null, pm: string, git: boolean): DetectedLayout {
  const worker = wranglerMain(dir);
  const scripts = Object.entries(pkg?.scripts ?? {}).filter((e): e is [string, string] => typeof e[1] === 'string');
  const names = new Set(scripts.map(([k]) => k));
  // `pre<x>` / `post<x>` run with `<x>`; listing both is noise.
  const lifecycle = (k: string): boolean => /^(pre|post)/.test(k) && names.has(k.replace(/^(pre|post)/, ''));

  const folders = topFolders(dir, git).map((name): LayoutEntry => {
    const notes: string[] = [];
    if (worker && worker.main.startsWith(`${name}/`)) notes.push(`Cloudflare Worker (\`${worker.config}\` main: \`${worker.main}\`)`);
    else if (isWorkspaceFolder(dir, pkg, name)) notes.push('workspace packages');
    else if (NAMES[name]) notes.push(NAMES[name]);
    const users = scripts.filter(([k, v]) => !lifecycle(k) && scriptUsesFolder(v, name)).map(([k]) => `\`${scriptCommand(pm, k)}\``);
    if (users.length) notes.push(`used by ${users.slice(0, 4).join(', ')}${users.length > 4 ? ', …' : ''}`);
    return { path: `${name}/`, note: notes.length ? notes.join(', ') : null };
  });
  for (const f of WORKSPACE_FILES) if (existsSync(join(dir, f))) folders.push({ path: f, note: 'workspace config' });

  const ts = tsDirs(dir);
  const entries: LayoutEntry[] = [];
  const seen = new Set<string>();
  const add = (path: string | null, note: string): void => {
    if (path && !seen.has(path)) { seen.add(path); entries.push({ path, note }); }
  };
  if (pkg?.bin) {
    // A string `bin` installs under the package name without its scope; with no name, no command name.
    const unscoped = pkg.name?.replace(/^@[^/]+\//, '') ?? '';
    const bins: Record<string, string> = typeof pkg.bin === 'string' ? { [unscoped]: pkg.bin } : pkg.bin;
    const bySource = new Map<string, string[]>();
    for (const [cmd, target] of Object.entries(bins)) {
      const src = typeof target === 'string' ? sourceOf(dir, target, ts) : null;
      if (src) bySource.set(src, [...(bySource.get(src) ?? []), ...(cmd ? [`\`${cmd}\``] : [])]);
    }
    for (const [src, cmds] of bySource) {
      add(src, cmds.length ? `the ${cmds.join(' and ')} command${cmds.length > 1 ? 's' : ''}` : 'the package\'s command (`bin`)');
    }
  }
  const lib = exportsEntry(pkg?.exports) ?? (typeof pkg?.main === 'string' ? pkg.main : null);
  if (lib) add(sourceOf(dir, lib, ts), 'library entry');
  if (!entries.length) {
    for (const f of ENTRY_CANDIDATES) if (existsSync(join(dir, f))) entries.push({ path: f, note: null });
  }
  return { folders, entries };
}
