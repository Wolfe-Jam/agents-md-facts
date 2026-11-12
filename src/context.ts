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
  /** package.json name, else pyproject.toml's, else Cargo.toml's, else the directory basename. */
  name: string;
  /** package.json `description`, verbatim on one line, else null. */
  description?: string | null;
  /** package.json version, else pyproject.toml's (when not dynamic), else Cargo.toml's, else null. */
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
/** A `key = "value"` string inside one TOML table (up to the next `[` line), else null. */
function tomlTable(text: string, table: string): ((key: string) => string | null) | null {
  const start = text.search(new RegExp(`^\\[${table.replace(/\./g, '\\.')}\\]\\s*$`, 'm'));
  if (start === -1) return null;
  const body: string[] = [];
  for (const line of text.slice(start).split(/\r?\n/).slice(1)) {
    if (/^\s*\[/.test(line)) break;
    body.push(line);
  }
  const joined = body.join('\n');
  return (key) => new RegExp(`^\\s*${key}\\s*=\\s*["']([^"'\\n]+)["']`, 'm').exec(joined)?.[1]?.trim() || null;
}

const readText = (file: string): string => (existsSync(file) ? readFileSync(file, 'utf8') : '');

/**
 * `name` and `version` as pyproject.toml declares them: `[project]` first, then
 * `[tool.poetry]`. A version listed in `dynamic` has no value to read, so it's left out.
 */
export function pyprojectMeta(dir: string): { name: string | null; version: string | null } {
  const text = readText(join(dir, 'pyproject.toml'));
  for (const table of ['project', 'tool.poetry']) {
    const value = tomlTable(text, table);
    const name = value?.('name');
    if (value && name) return { name, version: value('version') };
  }
  return { name: null, version: null };
}

/**
 * `name` and `version` from Cargo.toml's `[package]`. A virtual workspace has no
 * `[package]`, and `version.workspace = true` has no literal version: both read as null.
 */
export function cargoMeta(dir: string): { name: string | null; version: string | null } {
  const value = tomlTable(readText(join(dir, 'Cargo.toml')), 'package');
  const name = value?.('name') ?? null;
  return value && name ? { name, version: value('version') } : { name: null, version: null };
}

export function buildRepoContext(dir: string): RepoContext {
  const pkg = readPackageJson(dir);
  const none = { name: null, version: null };
  const py = pkg ? none : pyprojectMeta(dir);
  const crate = pkg || py.name ? none : cargoMeta(dir);
  // One read of git: whether this is a work tree, and what it tracks (throws when git refuses).
  const tracked = gitFiles(dir);

  const commands = detectCommands(dir, pkg);
  return {
    dir,
    name: pkg?.name ?? py.name ?? crate.name ?? basename(dir),
    description: typeof pkg?.description === 'string' && pkg.description.trim() ? pkg.description.trim().replace(/\s+/g, ' ') : null,
    version: typeof pkg?.version === 'string' && pkg.version.trim() ? pkg.version.trim() : py.version ?? crate.version,
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
