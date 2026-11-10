import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import type { PackageJson } from './pkg.js';
import { scriptCommand } from './commands.js';
import type { GitFiles } from './git.js';

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

/** Build output, dependencies and caches: outside git, never part of the map. */
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

/** Root files that configure a monorepo, and what each one is. */
const WORKSPACE_FILES: Array<[string, string]> = [
  ['pnpm-workspace.yaml', 'pnpm workspace config'],
  ['lerna.json', 'Lerna config'],
  ['nx.json', 'Nx config'],
  ['turbo.json', 'Turborepo config'],
];

const read = (path: string): string | null => {
  try { return readFileSync(path, 'utf-8'); } catch { return null; }
};

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * True when a script uses `folder`: a command in it names the folder as a path
 * (`folder/…`, `./folder`) or `cd`s into it. A bare word is not a path (`npm test`,
 * `playwright test`, `NODE_ENV=test`), and a delete (`rm -rf`, `rimraf`) is not a use.
 */
function scriptUsesFolder(command: string, folder: string): boolean {
  const f = escape(folder);
  const path = new RegExp(`(?:^|[\\s"'(=,])(?:\\./${f}(?=[/\\s"')]|$)|${f}/)`);
  const cd = new RegExp(`^\\s*cd\\s+(?:\\./)?${f}/?\\s*$`);
  return command.split(/&&|\|\||;|\|/).some((seg) => !/^\s*(rm|rimraf|del|trash)\b/.test(seg) && (path.test(seg) || cd.test(seg)));
}

/** JSON with comments and trailing commas (tsconfig, wrangler.jsonc), or null. */
function readJsonc(path: string): Record<string, unknown> | null {
  const text = read(path);
  if (text === null) return null;
  try {
    const plain = text
      .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_m, str: string | undefined) => str ?? '')
      .replace(/,(\s*[}\]])/g, '$1');
    const v = JSON.parse(plain) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Top-level names the root `.gitignore` ignores (plain `name`, `name/`, `/name` lines only). */
function ignoredAtRoot(dir: string): Set<string> {
  const out = new Set<string>();
  for (const line of (read(join(dir, '.gitignore')) ?? '').split(/\r?\n/)) {
    const m = /^\/?([^\s/*!#?[\]]+)\/?$/.exec(line.trim());
    if (m?.[1]) out.add(m[1]);
  }
  return out;
}

/**
 * Top-level folders, in name order: in git, the ones it tracks (a committed
 * `dist/` and submodules included); outside git, the folders that exist minus
 * build output and what the root `.gitignore` ignores.
 */
function topFolders(dir: string, tracked: GitFiles | null): string[] {
  if (tracked) {
    const names = new Set(tracked.submodules);
    for (const p of tracked.files) if (p.includes('/')) names.add(p.slice(0, p.indexOf('/')));
    return [...names].filter((n) => !n.startsWith('.')).sort();
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
  const clean = (m: string): string => m.replace(/^\.\//, '');
  for (const config of ['wrangler.jsonc', 'wrangler.json']) {
    const main = readJsonc(join(dir, config))?.main;
    if (typeof main === 'string') return { config, main: clean(main) };
  }
  // TOML: top level only (stop at the first [table]); skip comments; either quote style.
  for (const line of (read(join(dir, 'wrangler.toml')) ?? '').split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) break;
    const m = /^\s*main\s*=\s*(?:"([^"]+)"|'([^']+)')/.exec(line);
    if (m) return { config: 'wrangler.toml', main: clean(m[1] ?? m[2] ?? '') };
  }
  return null;
}

/** The first path segment of each workspace glob: package.json `workspaces`, pnpm-workspace.yaml `packages`. */
function workspaceRoots(dir: string, pkg: PackageJson | null): Set<string> {
  const ws = Array.isArray(pkg?.workspaces) ? pkg.workspaces : pkg?.workspaces?.packages ?? [];
  const globs: unknown[] = [...ws];
  try {
    const doc = parseYaml(read(join(dir, 'pnpm-workspace.yaml')) ?? '') as { packages?: unknown } | null;
    if (Array.isArray(doc?.packages)) globs.push(...doc.packages);
  } catch { /* not readable: no workspace roots from it */ }
  return new Set(globs.filter((g): g is string => typeof g === 'string' && !g.startsWith('!'))
    // `packages/*` names a folder of packages; a literal path (`tools/x`) is one package, not a root.
    .map((g) => /^(?:\.\/)?([^/*?[!]+)\/\*{1,2}$/.exec(g)?.[1] ?? '')
    .filter(Boolean));
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
 * Entry points Cargo and Go define by documented default when the manifest
 * names none (curated defaults, named as such): Cargo's `src/main.rs` /
 * `src/lib.rs` unless Cargo.toml turns them off or moves them, and a root
 * `main.go` that is `package main`. Kept by decision (2026-11-10): Rust and Go
 * support isn't removed without a discussion.
 */
function toolchainEntries(dir: string, has: (p: string) => boolean): LayoutEntry[] {
  const out: LayoutEntry[] = [];
  const cargo = read(join(dir, 'Cargo.toml'));
  if (cargo !== null) {
    // `path =` inside the `[lib]` table (it ends at the next line starting with `[`).
    const lib = /^\[lib\][^\n]*\n((?:(?!\s*\[)[^\n]*\n?)*)/m.exec(cargo)?.[1] ?? '';
    const libPath = /^\s*path\s*=/m.test(lib);
    const virtual = /^\[workspace\]/m.test(cargo) && !/^\[package\]/m.test(cargo);
    const noAutoBins = /\bautobins\s*=\s*false/.test(cargo);
    if (!virtual && !noAutoBins && has('src/main.rs')) out.push({ path: 'src/main.rs', note: 'binary crate root (Cargo default)' });
    if (!virtual && !libPath && has('src/lib.rs')) out.push({ path: 'src/lib.rs', note: 'library crate root (Cargo default)' });
  }
  const goMain = has('main.go') ? read(join(dir, 'main.go')) ?? '' : '';
  // `//go:build ignore` marks a generator script run by `go run`, not the program.
  if (existsSync(join(dir, 'go.mod')) && /^\s*package\s+main\b/m.test(goMain) && !/^\/\/go:build\s+ignore\b/m.test(goMain)) {
    out.push({ path: 'main.go', note: 'Go `package main`' });
  }
  return out;
}

/**
 * The repo's map, from what it declares: each top-level folder with a note
 * (a wrangler `main` inside it, a workspace listing it, a name that needs
 * explaining, the scripts that use it), any monorepo config, then the entry points exactly as the
 * manifest names them (`bin`, `exports`, `main`), else Cargo's and Go's defaults. A declared path git doesn't
 * track says so, with the build script's name; nothing is traced to a source
 * file, which would mean judging what the build does.
 */
export function detectLayout(dir: string, pkg: PackageJson | null, pm: string, tracked: GitFiles | null): DetectedLayout {
  const worker = wranglerMain(dir);
  const workspaces = workspaceRoots(dir, pkg);

  const scripts = Object.entries(pkg?.scripts ?? {}).filter((e): e is [string, string] => typeof e[1] === 'string');
  const names = new Set(scripts.map(([k]) => k));
  // `pre<x>` / `post<x>` run with `<x>`; listing both is noise.
  const lifecycle = (k: string): boolean => /^(pre|post)/.test(k) && names.has(k.replace(/^(pre|post)/, ''));

  const folders = topFolders(dir, tracked).map((name): LayoutEntry => {
    const notes: string[] = [];
    if (worker && worker.main.startsWith(`${name}/`)) notes.push(`Cloudflare Worker (\`${worker.config}\` main: \`${worker.main}\`)`);
    else if (workspaces.has(name)) notes.push('workspace packages');
    else if (NAMES[name]) notes.push(NAMES[name]);
    const users = scripts.filter(([k, v]) => !lifecycle(k) && scriptUsesFolder(v, name)).map(([k]) => `\`${scriptCommand(pm, k)}\``);
    if (users.length) notes.push(`used by ${users.slice(0, 4).join(', ')}${users.length > 4 ? ', …' : ''}`);
    return { path: `${name}/`, note: notes.length ? notes.join(', ') : null };
  });
  for (const [f, note] of WORKSPACE_FILES) if (existsSync(join(dir, f))) folders.push({ path: f, note });

  const buildScript = Object.keys(pkg?.scripts ?? {}).find((k) => /^(build|compile|bundle)$/.test(k));
  const untracked = buildScript ? ` (not in git; the build script is \`${scriptCommand(pm, buildScript)}\`)` : ' (not in git)';

  const entries: LayoutEntry[] = [];
  const seen = new Set<string>();
  /** The declared path; in a git repo, marked when git doesn't track it. */
  const place = (target: string, note: string): void => {
    const path = target.replace(/^\.\//, '');
    if (seen.has(path)) return;
    seen.add(path);
    entries.push({ path, note: tracked && !tracked.files.has(path) ? `${note}${untracked}` : note });
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
    const has = (p: string): boolean => (tracked ? tracked.files.has(p) : existsSync(join(dir, p)));
    entries.push(...toolchainEntries(dir, has));
  }
  return { folders, entries };
}
