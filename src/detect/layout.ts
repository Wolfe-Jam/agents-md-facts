import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join, normalize } from 'path';
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

/** Folders that usually hold build output, when a path points into one. */
const OUTPUT_DIRS = ['dist', 'build', 'out', 'lib'];

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

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const read = (path: string): string | null => {
  try { return readFileSync(path, 'utf-8'); } catch { return null; }
};

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
    .map((g) => g.replace(/^\.\//, '').split('/')[0] ?? '')
    .filter((g) => g && !/[*?[]/.test(g)));
}

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

/** tsconfig's `outDir` and `rootDir`, comments allowed, following one `extends` (a relative file). */
function tsDirs(dir: string): { outDir: string; rootDirs: string[] } | null {
  const own = readJsonc(join(dir, 'tsconfig.json'));
  if (!own) return null;
  const opts = (c: Record<string, unknown> | null): Record<string, unknown> =>
    (c?.compilerOptions && typeof c.compilerOptions === 'object' ? c.compilerOptions : {}) as Record<string, unknown>;
  const mine = opts(own);
  let parent: Record<string, unknown> = {};
  let base = '';
  if ((mine.outDir === undefined || mine.rootDir === undefined) && typeof own.extends === 'string' && own.extends.startsWith('.')) {
    const file = own.extends.endsWith('.json') ? own.extends : `${own.extends}.json`;
    parent = opts(readJsonc(join(dir, file)));
    base = dirname(file);
  }
  // A path set in the extended config is relative to that config's folder.
  const pick = (key: string): { value: unknown; from: string } =>
    mine[key] !== undefined ? { value: mine[key], from: '' } : { value: parent[key], from: base };
  const clean = (p: string, from: string): string => normalize(join(from, p)).replace(/\\/g, '/').replace(/\/$/, '') || '.';
  const out = pick('outDir');
  const root = pick('rootDir');
  if (typeof out.value !== 'string') return null;
  return {
    outDir: clean(out.value, out.from),
    rootDirs: typeof root.value === 'string' ? [clean(root.value, root.from)] : ['src', '.'],
  };
}

/**
 * True when every command of the build script compiles with plain `tsc` (or only
 * cleans, copies or makes folders). Only then does `dist/x.js` come from a
 * same-named `src/x.ts`; a bundler or a build file can take any input.
 */
function plainTscBuild(command: string): boolean {
  const segs = command.split(/&&|;/).map((s) => s.trim()).filter(Boolean);
  return segs.some((s) => /^tsc(\s|$)/.test(s))
    && segs.every((s) => /^(tsc|rimraf|rm|del|cp|mkdir|shx|chmod)(\s|$)/.test(s) || /^node -e\s/.test(s));
}

/**
 * Entry points a toolchain defines by convention when its manifest names none,
 * checked against the files: Cargo's `src/main.rs` / `src/lib.rs` (unless
 * Cargo.toml sets another path), Zig roots that `build.zig` names, and a root
 * `main.go` that is `package main`.
 */
function toolchainEntries(dir: string): LayoutEntry[] {
  const out: LayoutEntry[] = [];
  const cargo = read(join(dir, 'Cargo.toml'));
  if (cargo !== null) {
    const libPath = /\[lib\][^[]*\bpath\s*=/.test(cargo);
    const noAutoBins = /\bautobins\s*=\s*false/.test(cargo);
    if (!noAutoBins && existsSync(join(dir, 'src/main.rs'))) out.push({ path: 'src/main.rs', note: 'binary crate root (Cargo default)' });
    if (!libPath && existsSync(join(dir, 'src/lib.rs'))) out.push({ path: 'src/lib.rs', note: 'library crate root (Cargo default)' });
  }
  const zig = read(join(dir, 'build.zig'));
  if (zig !== null) {
    for (const f of ['src/main.zig', 'src/root.zig']) {
      if (zig.includes(`"${f}"`) && existsSync(join(dir, f))) out.push({ path: f, note: 'named in build.zig' });
    }
  }
  if (existsSync(join(dir, 'go.mod')) && /^\s*package\s+main\b/m.test(read(join(dir, 'main.go')) ?? '')) {
    out.push({ path: 'main.go', note: 'Go `package main`' });
  }
  return out;
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
 * explaining, the scripts that use it), any monorepo config, then the entry
 * points: what the manifest names (`bin`, `exports`, `main`), traced to source
 * only for a plain `tsc` build, else shown as declared; or the toolchain's own
 * default. Whether a file "is in the repo" comes from git when there is git, so
 * a local build can't change the output.
 */
export function detectLayout(dir: string, pkg: PackageJson | null, pm: string, tracked: GitFiles | null): DetectedLayout {
  const worker = wranglerMain(dir);
  const scripts = Object.entries(pkg?.scripts ?? {}).filter((e): e is [string, string] => typeof e[1] === 'string');
  const names = new Set(scripts.map(([k]) => k));
  // `pre<x>` / `post<x>` run with `<x>`; listing both is noise.
  const lifecycle = (k: string): boolean => /^(pre|post)/.test(k) && names.has(k.replace(/^(pre|post)/, ''));
  const workspaces = workspaceRoots(dir, pkg);

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

  // A file is part of the repo when git tracks it; outside git, when it exists and isn't build output.
  const ts = tsDirs(dir);
  const outputs = [...new Set([...(ts ? [ts.outDir] : []), ...OUTPUT_DIRS])];
  const underOutput = (p: string): string | undefined => outputs.find((o) => p.startsWith(`${o}/`));
  const inRepo = (p: string): boolean => (tracked ? tracked.files.has(p) : existsSync(join(dir, p)) && !underOutput(p));
  const buildScript = scripts.find(([k]) => /^(build|compile|bundle)$/.test(k));
  const traceable = buildScript ? plainTscBuild(buildScript[1]) : ts !== null;
  const built = buildScript ? ` (built by \`${scriptCommand(pm, buildScript[0])}\`)` : '';

  /** The source behind a declared path: itself when it's in the repo, else a same-named source for a plain tsc build. */
  const sourceOf = (declared: string): string | null => {
    const p = declared.replace(/^\.\//, '');
    if (inRepo(p)) return p;
    const out = underOutput(p);
    if (!out || !traceable) return null;
    const rest = p.slice(out.length + 1).replace(/\.(c|m)?js$/, '');
    for (const root of ts && out === ts.outDir ? ts.rootDirs : ['src']) {
      const stem = root === '.' ? rest : `${root}/${rest}`;
      for (const ext of ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs']) {
        if (inRepo(stem + ext)) return stem + ext;
      }
    }
    return null;
  };

  const entries: LayoutEntry[] = [];
  const seen = new Set<string>();
  const add = (path: string, note: string): void => {
    if (!seen.has(path)) { seen.add(path); entries.push({ path, note }); }
  };
  /** The source when it can be traced, else the declared path itself, marked as built. */
  const place = (target: string, note: string): void => {
    const src = sourceOf(target);
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
  if (!entries.length) for (const e of toolchainEntries(dir)) add(e.path, e.note ?? '');
  return { folders, entries };
}
