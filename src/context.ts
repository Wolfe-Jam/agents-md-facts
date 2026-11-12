import { existsSync, readFileSync } from 'fs';
import { basename, join } from 'path';
import { readPackageJson } from './detect/pkg.js';
import { detectCommands, nodePackageManager } from './detect/commands.js';
import { detectRelease, type DetectedRelease } from './detect/release.js';
import { detectCi, ownCommands, type DetectedWorkflow } from './detect/ci.js';
import { detectContributing, type DetectedContributing } from './detect/contributing.js';
import { detectLayout, type DetectedLayout } from './detect/layout.js';
import { gitFiles } from './detect/git.js';
import { detectKeyFiles } from './detect/key-files.js';
import { detectConventions } from './detect/conventions.js';
import { detectSecrets, type DetectedSecrets } from './detect/secrets.js';
import { detectKind, detectLanguage, detectPackageManager, detectRuntime } from './detect/orientation.js';

/**
 * A neutral, vendor-free snapshot of what a repo literally declares. Every
 * field is a DETECTED fact — nothing here is guessed or authored. This is the
 * only input `authorAgentsMd` consumes.
 */
export interface RepoContext {
  /** Absolute path scanned. */
  dir: string;
  /** package.json name, else pyproject.toml's, else the directory basename. */
  name: string;
  /** package.json `description`, verbatim on one line, else null. */
  description?: string | null;
  /** package.json version, else pyproject.toml's (when not dynamic), else null. */
  version: string | null;
  /** package.json `engines.node` (the Node versions it needs), else null. */
  nodeVersion?: string | null;
  /** Primary language (TypeScript, Rust, Go, …) or "Unknown". */
  language: string;
  /** Runtime (Node.js, Bun, Deno, Rust, …) or "Unknown". */
  runtime: string;
  /** Detected package manager (bun/pnpm/yarn/npm/pub). */
  packageManager: string;
  /** Lightweight kind ("CLI" / "library") or null. */
  kind: string | null;
  /** True when a package.json is present (a Node/JS-ecosystem repo). */
  hasNodeManifest: boolean;
  /** True when the directory is a git working tree. */
  isGitRepo: boolean;
  /** command name → shell command (build/test/lint/dev/start + toolchain defaults). */
  commands: Record<string, string>;
  /** Canonical entry points / manifests / configs that exist (the map when `layout` is absent). */
  keyFiles: string[];
  /** Top-level folders and entry points, each with what the repo says it is. */
  layout?: DetectedLayout;
  /** The script that runs before a release (`prepublishOnly`, …), or null. */
  release?: DetectedRelease | null;
  /** GitHub Actions workflows and the commands they run. */
  ci?: DetectedWorkflow[];
  /** The contributing guide (location + headings), or null. */
  contributing?: DetectedContributing | null;
  /** Toolchain-governed conventions (pointers, not restated rules). */
  conventions: string[];
  /** A detected secrets file (location only) or null. */
  secrets: DetectedSecrets | null;
}

/**
 * Run the detectors over a directory and collect their results into a plain
 * RepoContext. No merging, no external config, no interpretation — just facts.
 */
/**
 * `name` and `version` as pyproject.toml declares them: `[project]` first, then
 * `[tool.poetry]`. A version listed in `dynamic` has no value to read, so it's left out.
 */
export function pyprojectMeta(dir: string): { name: string | null; version: string | null } {
  const file = join(dir, 'pyproject.toml');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  for (const table of ['project', 'tool.poetry']) {
    const start = text.search(new RegExp(`^\\[${table.replace(/\./g, '\\.')}\\]\\s*$`, 'm'));
    if (start === -1) continue;
    const body: string[] = [];
    for (const line of text.slice(start).split(/\r?\n/).slice(1)) {
      if (/^\s*\[/.test(line)) break;
      body.push(line);
    }
    const value = (key: string): string | null =>
      new RegExp(`^\\s*${key}\\s*=\\s*["']([^"'\\n]+)["']`, 'm').exec(body.join('\n'))?.[1]?.trim() || null;
    const name = value('name');
    if (name) return { name, version: value('version') };
  }
  return { name: null, version: null };
}

export function buildRepoContext(dir: string): RepoContext {
  const pkg = readPackageJson(dir);
  const py = pkg ? { name: null, version: null } : pyprojectMeta(dir);
  // One read of git: whether this is a work tree, and what it tracks (throws when git refuses).
  const tracked = gitFiles(dir);

  const commands = detectCommands(dir, pkg);
  return {
    dir,
    name: pkg?.name ?? py.name ?? basename(dir),
    description: typeof pkg?.description === 'string' && pkg.description.trim() ? pkg.description.trim().replace(/\s+/g, ' ') : null,
    version: typeof pkg?.version === 'string' && pkg.version.trim() ? pkg.version.trim() : py.version,
    nodeVersion: typeof pkg?.engines?.node === 'string' && pkg.engines.node.trim() ? pkg.engines.node.trim() : null,
    language: detectLanguage(dir),
    runtime: detectRuntime(dir),
    packageManager: detectPackageManager(dir),
    kind: detectKind(dir, pkg),
    hasNodeManifest: pkg != null,
    isGitRepo: tracked !== null,
    commands,
    keyFiles: detectKeyFiles(dir),
    layout: detectLayout(dir, pkg, nodePackageManager(dir, pkg), tracked),
    release: detectRelease(pkg),
    ci: detectCi(dir, ownCommands(dir, Object.values(commands))),
    contributing: detectContributing(dir),
    conventions: detectConventions(dir, pkg),
    secrets: detectSecrets(dir),
  };
}
