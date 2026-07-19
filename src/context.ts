import { existsSync } from 'fs';
import { basename, join } from 'path';
import { readPackageJson } from './detect/pkg.js';
import { detectCommands } from './detect/commands.js';
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
  /** package.json name, else the directory basename. */
  name: string;
  /** package.json / Cargo-style version when declared, else null. */
  version: string | null;
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
  /** Canonical entry points / manifests / configs that exist. */
  keyFiles: string[];
  /** Toolchain-governed conventions (pointers, not restated rules). */
  conventions: string[];
  /** A detected secrets file (location only) or null. */
  secrets: DetectedSecrets | null;
}

/**
 * Run the detectors over a directory and collect their results into a plain
 * RepoContext. No merging, no external config, no interpretation — just facts.
 */
export function buildRepoContext(dir: string): RepoContext {
  const pkg = readPackageJson(dir);

  return {
    dir,
    name: pkg?.name ?? basename(dir),
    version: typeof pkg?.version === 'string' && pkg.version.trim() ? pkg.version.trim() : null,
    language: detectLanguage(dir),
    runtime: detectRuntime(dir),
    packageManager: detectPackageManager(dir),
    kind: detectKind(dir, pkg),
    hasNodeManifest: pkg != null,
    isGitRepo: existsSync(join(dir, '.git')),
    commands: detectCommands(dir, pkg),
    keyFiles: detectKeyFiles(dir),
    conventions: detectConventions(dir, pkg),
    secrets: detectSecrets(dir),
  };
}
