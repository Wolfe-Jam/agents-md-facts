import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { basename, join } from 'path';
import { readPackageJson } from './detect/pkg.js';
import { detectCommands, nodePackageManager } from './detect/commands.js';
import { detectRelease, type DetectedRelease } from './detect/release.js';
import { detectCi, type DetectedWorkflow } from './detect/ci.js';
import { detectContributing, type DetectedContributing } from './detect/contributing.js';
import { detectLayout, type DetectedLayout } from './detect/layout.js';
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
  /** package.json `description`, verbatim on one line, else null. */
  description?: string | null;
  /** package.json / Cargo-style version when declared, else null. */
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
 * True when `dir` is inside a git work tree (a repo root or any folder in one),
 * as git itself reports it. One answer, used for the layout and the git rules.
 */
function insideGitWorkTree(dir: string): boolean {
  try {
    return execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: dir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === 'true';
  } catch {
    return existsSync(join(dir, '.git'));
  }
}

/**
 * Run the detectors over a directory and collect their results into a plain
 * RepoContext. No merging, no external config, no interpretation — just facts.
 */
export function buildRepoContext(dir: string): RepoContext {
  const pkg = readPackageJson(dir);
  const git = insideGitWorkTree(dir);

  return {
    dir,
    name: pkg?.name ?? basename(dir),
    description: typeof pkg?.description === 'string' && pkg.description.trim() ? pkg.description.trim().replace(/\s+/g, ' ') : null,
    version: typeof pkg?.version === 'string' && pkg.version.trim() ? pkg.version.trim() : null,
    nodeVersion: typeof pkg?.engines?.node === 'string' && pkg.engines.node.trim() ? pkg.engines.node.trim() : null,
    language: detectLanguage(dir),
    runtime: detectRuntime(dir),
    packageManager: detectPackageManager(dir),
    kind: detectKind(dir, pkg),
    hasNodeManifest: pkg != null,
    isGitRepo: git,
    commands: detectCommands(dir, pkg),
    keyFiles: detectKeyFiles(dir),
    layout: detectLayout(dir, pkg, nodePackageManager(dir, pkg), git),
    release: detectRelease(pkg),
    ci: detectCi(dir),
    contributing: detectContributing(dir),
    conventions: detectConventions(dir, pkg),
    secrets: detectSecrets(dir),
  };
}
