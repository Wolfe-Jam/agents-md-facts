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

/** What a conventionally named folder holds (a curated default, like the conventions list). */
const NAMES: Record<string, string> = {
  src: 'source', lib: 'source', app: 'app source', cmd: 'commands', pkg: 'packages', internal: 'internal packages',
  test: 'tests', tests: 'tests', __tests__: 'tests', spec: 'tests', e2e: 'end-to-end tests', fixtures: 'test fixtures',
  docs: 'docs', doc: 'docs', examples: 'examples', example: 'examples', scripts: 'scripts', bin: 'executables',
  bench: 'benchmarks', benchmarks: 'benchmarks', packages: 'workspace packages', apps: 'workspace apps',
  public: 'static assets', static: 'static assets', migrations: 'database migrations',
};

/** Fallback entry points, for repos whose manifest names none. */
const ENTRY_CANDIDATES = [
  'src/index.ts', 'src/index.js', 'src/main.ts', 'src/cli.ts',
  'src/main.rs', 'src/lib.rs', 'src/main.zig', 'src/root.zig',
  'src/__init__.py', 'main.py', '__main__.py', 'main.go', 'cmd/main.go',
];

/** Top-level folders git tracks (or, outside git, that exist), in name order. */
function topFolders(dir: string): string[] {
  let names: string[] = [];
  try {
    const out = execFileSync('git', ['ls-files', '-z'], { cwd: dir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    names = [...new Set(out.split('\0').filter((p) => p.includes('/')).map((p) => p.slice(0, p.indexOf('/'))))];
  } catch { /* not a git repo: read the folder */ }
  if (!names.length) {
    try {
      names = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
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

/** The source file behind a built path (`dist/cli.js` → `src/cli.ts`), when it exists. */
function sourceOf(dir: string, built: string): string | null {
  const p = built.replace(/^\.\//, '');
  if (existsSync(join(dir, p)) && !/^(dist|build|out|lib)\//.test(p)) return p;
  const stem = p.replace(/^(dist|build|out|lib)\//, 'src/').replace(/\.(c|m)?js$/, '');
  for (const ext of ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs']) {
    if (existsSync(join(dir, stem + ext))) return stem + ext;
  }
  return null;
}

/** The import target of `exports['.']`, when it is written as a path. */
function exportsEntry(exp: unknown): string | null {
  if (typeof exp === 'string') return exp;
  if (exp && typeof exp === 'object') {
    const dot = (exp as Record<string, unknown>)['.'] ?? exp;
    if (typeof dot === 'string') return dot;
    if (dot && typeof dot === 'object') {
      for (const k of ['import', 'default', 'require', 'node']) {
        const v = (dot as Record<string, unknown>)[k];
        if (typeof v === 'string') return v;
      }
    }
  }
  return null;
}

/**
 * The repo's map, from what it declares: each top-level folder with a note
 * (a wrangler `main` inside it, the scripts that use it, or what its
 * conventional name means), then the entry points the manifest names (`bin`,
 * `main`/`exports`), traced back to their source. Pure.
 */
export function detectLayout(dir: string, pkg: PackageJson | null, pm: string): DetectedLayout {
  const worker = wranglerMain(dir);
  const scripts = Object.entries(pkg?.scripts ?? {}).filter(([, v]) => typeof v === 'string');

  const folders = topFolders(dir).map((name): LayoutEntry => {
    const notes: string[] = [];
    if (worker && worker.main.startsWith(`${name}/`)) notes.push(`Cloudflare Worker (\`${worker.config}\` main: \`${worker.main}\`)`);
    else if (NAMES[name]) notes.push(NAMES[name]);
    const ref = new RegExp(`(?<![\\w.@/-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=/|\\s|["']|$)`);
    const users = scripts.filter(([k, v]) => ref.test(v) && !/^(pre|post)/.test(k)).map(([k]) => `\`${scriptCommand(pm, k)}\``);
    if (users.length) notes.push(`used by ${users.slice(0, 4).join(', ')}${users.length > 4 ? ', …' : ''}`);
    return { path: `${name}/`, note: notes.length ? notes.join(', ') : null };
  });

  const entries: LayoutEntry[] = [];
  const seen = new Set<string>();
  const add = (path: string | null, note: string): void => {
    if (path && !seen.has(path)) { seen.add(path); entries.push({ path, note }); }
  };
  if (pkg?.bin) {
    const bins = typeof pkg.bin === 'string' ? { [pkg.name ?? 'bin']: pkg.bin } : pkg.bin;
    const bySource = new Map<string, string[]>();
    for (const [cmd, target] of Object.entries(bins)) {
      const src = sourceOf(dir, target);
      if (src) bySource.set(src, [...(bySource.get(src) ?? []), `\`${cmd}\``]);
    }
    for (const [src, cmds] of bySource) add(src, `the ${cmds.join(' and ')} command${cmds.length > 1 ? 's' : ''}`);
  }
  const lib = exportsEntry(pkg?.exports) ?? pkg?.main ?? null;
  if (lib) add(sourceOf(dir, lib), 'library entry');
  if (!entries.length) {
    for (const f of ENTRY_CANDIDATES) if (existsSync(join(dir, f))) entries.push({ path: f, note: null });
  }
  return { folders, entries };
}
