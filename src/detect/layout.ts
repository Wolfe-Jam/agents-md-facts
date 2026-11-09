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
 * What a conventionally named folder holds, only where the name alone doesn't
 * say it and has one common meaning (a curated default). `docs/ — docs` would
 * add nothing; `lib` and `spec` mean different things in different repos.
 */
const NAMES: Record<string, string> = {
  cmd: 'commands', internal: 'internal packages', __tests__: 'tests',
  e2e: 'end-to-end tests', fixtures: 'test fixtures', migrations: 'database migrations',
};

/** Workspace configs: a monorepo's root says where its packages are. */
const WORKSPACE_FILES = ['pnpm-workspace.yaml', 'lerna.json', 'nx.json', 'turbo.json'];

/**
 * Entry points a toolchain defines by convention when its manifest names none:
 * Cargo's `src/main.rs` / `src/lib.rs`, Zig's `src/main.zig` / `src/root.zig`,
 * Go's root `main.go`. A file that merely has a popular name is not listed.
 */
const TOOLCHAIN_ENTRIES: Array<[string, string, string]> = [
  ['Cargo.toml', 'src/main.rs', 'binary crate root (Cargo default)'],
  ['Cargo.toml', 'src/lib.rs', 'library crate root (Cargo default)'],
  ['build.zig', 'src/main.zig', 'Zig executable root (zig init default)'],
  ['build.zig', 'src/root.zig', 'Zig library root (zig init default)'],
  ['go.mod', 'main.go', 'Go main package'],
];

/** Build scripts that bundle: their output can't be traced back to a source file by name. */
const BUNDLER = /\b(esbuild|tsup|rollup|webpack|vite|parcel|ncc|bun build|rspack|rolldown|unbuild|pkgroll)\b/;

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
  if (git) {
    try {
      // `-s` marks submodules (mode 160000): a top-level submodule is a folder too.
      const out = execFileSync('git', ['ls-files', '-s', '-z'], { cwd: dir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
      const names = new Set<string>();
      for (const rec of out.split('\0').filter(Boolean)) {
        const [meta = '', path = ''] = rec.split('\t');
        if (path.includes('/')) names.add(path.slice(0, path.indexOf('/')));
        else if (meta.startsWith('160000')) names.add(path);
      }
      // What git tracks is the repo, `dist/` included when it is committed.
      return [...names].filter((n) => !n.startsWith('.')).sort();
    } catch { /* git is there but unusable: read the folder below */ }
  }
  const ignored = ignoredAtRoot(dir);
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !ignored.has(e.name) && !e.name.startsWith('.') && !SKIP.has(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** The top-level `main` a wrangler config names (Cloudflare Workers), or null. */
function wranglerMain(dir: string): { config: string; main: string } | null {
  const clean = (m: string): { main: string } => ({ main: m.replace(/^\.\//, '') });
  for (const config of ['wrangler.jsonc', 'wrangler.json']) {
    const p = join(dir, config);
    if (!existsSync(p)) continue;
    try {
      const text = readFileSync(p, 'utf-8')
        .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_m, str: string | undefined) => str ?? '')
        .replace(/,(\s*[}\]])/g, '$1');
      const main = (JSON.parse(text) as { main?: unknown }).main;
      return typeof main === 'string' ? { config, ...clean(main) } : null;
    } catch { return null; }
  }
  const p = join(dir, 'wrangler.toml');
  if (!existsSync(p)) return null;
  // Top level only: stop at the first [table]; skip comments; either quote style.
  for (const line of readFileSync(p, 'utf-8').split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) break;
    const m = /^\s*main\s*=\s*(?:"([^"]+)"|'([^']+)')/.exec(line);
    if (m) return { config: 'wrangler.toml', ...clean(m[1] ?? m[2] ?? '') };
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
 * True when a script command names `folder` as a path: `folder/…` or
 * `./folder`. A bare word is not a path (`npm test`, `playwright test`,
 * `NODE_ENV=test`), and a script that only deletes (`rm -rf`, `rimraf`) doesn't use it.
 */
function scriptUsesFolder(command: string, folder: string): boolean {
  if (/^\s*(rm|rimraf|del|trash)\b/.test(command)) return false;
  const f = escape(folder);
  return new RegExp(`(?:^|[\\s"'(=,])(?:\\./${f}(?=[/\\s"')]|$)|${f}/)`).test(command);
}

/** Where tsc writes (`outDir`) and the source roots it maps from (`rootDir`, else `src` or the repo root). */
function tsDirs(dir: string): { outDir: string; rootDirs: string[] } | null {
  try {
    const text = readFileSync(join(dir, 'tsconfig.json'), 'utf-8');
    const out = /"outDir"\s*:\s*"([^"]+)"/.exec(text)?.[1];
    if (!out) return null;
    const clean = (p: string): string => p.replace(/^\.\//, '').replace(/\/$/, '') || '.';
    const root = /"rootDir"\s*:\s*"([^"]+)"/.exec(text)?.[1];
    return { outDir: clean(out), rootDirs: root ? [clean(root)] : ['src', '.'] };
  } catch {
    return null;
  }
}

/**
 * The source file behind a built path, when the build is a plain compile
 * (`dist/cli.js` → `src/cli.ts`). Null when a bundler builds it: the output
 * name says nothing about which file it came from.
 */
function sourceOf(dir: string, built: string, ts: { outDir: string; rootDirs: string[] } | null, bundled: boolean): string | null {
  const p = built.replace(/^\.\//, '');
  const outs = [...new Set([...(ts ? [ts.outDir] : []), 'dist', 'build', 'out', 'lib'])];
  const out = outs.find((o) => p.startsWith(`${o}/`));
  if (!out) return existsSync(join(dir, p)) ? p : null;
  if (!bundled) {
    const rest = p.slice(out.length + 1).replace(/\.(c|m)?js$/, '');
    const roots = ts && out === ts.outDir ? ts.rootDirs : ['src'];
    for (const root of roots) {
      const stem = root === '.' ? rest : `${root}/${rest}`;
      for (const ext of ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs']) {
        if (existsSync(join(dir, stem + ext))) return stem + ext;
      }
    }
  }
  // A committed file with no source behind it (a hand-written `lib/`) is the source.
  return existsSync(join(dir, p)) ? p : null;
}

/** The path `exports['.']` resolves to, through condition objects and fallback arrays. */
function exportsEntry(exp: unknown, depth = 0): string | null {
  if (typeof exp === 'string') return /\.d\.[cm]?ts$/.test(exp) ? null : exp;
  if (Array.isArray(exp)) {
    for (const e of exp) { const v = exportsEntry(e, depth + 1); if (v) return v; }
    return null;
  }
  if (!exp || typeof exp !== 'object' || depth > 4) return null;
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
 * (a wrangler `main` inside it, a workspace listing it, a name that needs
 * explaining, the scripts that use it), any workspace config, then the entry
 * points: what the manifest names (`bin`, `exports`, `main`), traced to source
 * when a plain compile builds them, or the toolchain's own default.
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
  const buildScript = scripts.find(([k]) => /^(build|compile|bundle)$/.test(k));
  const bundled = scripts.some(([k, v]) => /^(build|compile|bundle)(:.+)?$/.test(k) && BUNDLER.test(v));
  const built = buildScript ? ` (built by \`${scriptCommand(pm, buildScript[0])}\`)` : '';
  const entries: LayoutEntry[] = [];
  const seen = new Set<string>();
  const add = (path: string, note: string): void => {
    if (!seen.has(path)) { seen.add(path); entries.push({ path, note }); }
  };
  /** The source when it can be traced, else the declared path itself, marked as built. */
  const place = (target: string, note: string): void => {
    const src = sourceOf(dir, target, ts, bundled);
    if (src) add(src, note);
    else add(target.replace(/^\.\//, ''), `${note}${built}`);
  };
  if (pkg?.bin) {
    // A string `bin` installs under the package name without its scope; with no name, no command name.
    const unscoped = pkg.name?.replace(/^@[^/]+\//, '') ?? '';
    const bins: Record<string, string> = typeof pkg.bin === 'string' ? { [unscoped]: pkg.bin } : pkg.bin;
    const byTarget = new Map<string, string[]>();
    for (const [cmd, target] of Object.entries(bins)) {
      if (typeof target === 'string') byTarget.set(target, [...(byTarget.get(target) ?? []), ...(cmd ? [`\`${cmd}\``] : [])]);
    }
    for (const [target, cmds] of byTarget) {
      place(target, cmds.length ? `the ${cmds.join(' and ')} command${cmds.length > 1 ? 's' : ''}` : 'the package\'s command (`bin`)');
    }
  }
  const exp = exportsEntry(pkg?.exports);
  if (exp) place(exp, 'package entry (`exports`)');
  else if (typeof pkg?.main === 'string' && pkg.main.trim()) place(pkg.main.trim(), 'package entry (`main`)');
  if (!entries.length) {
    for (const [manifest, file, note] of TOOLCHAIN_ENTRIES) {
      if (existsSync(join(dir, manifest)) && existsSync(join(dir, file))) add(file, note);
    }
  }
  return { folders, entries };
}
