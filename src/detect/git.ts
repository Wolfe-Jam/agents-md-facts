import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';

/** What git tracks under a folder: file paths (relative to it) and top-level submodules. */
export interface GitFiles {
  files: Set<string>;
  submodules: string[];
}

/**
 * Git is there (`.git` exists) but refuses to read the repo, e.g. "detected
 * dubious ownership" in a container job. The output would silently differ from
 * a machine where git works, so the CLI stops and says why instead.
 */
export class GitUnreadableError extends Error {
  constructor(dir: string, detail: string) {
    const hint = /dubious ownership/i.test(detail)
      ? ` Fix: git config --global --add safe.directory ${dir}`
      : '';
    super(
      `git can't read ${dir}${detail ? ` (${detail})` : ''}. ` +
      `agents-md-facts reads the file list from git, so it stops rather than guess.${hint}`,
    );
    this.name = 'GitUnreadableError';
  }
}

function git(dir: string, args: string[]): string {
  // A big repo's file list runs to megabytes; the 1 MB default would fail it (ENOBUFS).
  return execFileSync('git', args, { cwd: dir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 30 });
}

/** What went wrong, in git's words (its first stderr line), or the spawn error. */
function reason(e: unknown): string {
  const err = e as { code?: unknown; stderr?: unknown; message?: unknown };
  if (err.code === 'ENOENT') return 'git is not installed or not on PATH';
  const line = String(err.stderr ?? '').split('\n').find((l) => l.trim());
  return (line ?? String(err.message ?? '')).replace(/^fatal:\s*/, '').trim();
}

/** True when `dir` or a folder above it has a `.git`. */
function underGit(dir: string): boolean {
  for (let d = dir; ; d = dirname(d)) {
    if (existsSync(join(d, '.git'))) return true;
    if (dirname(d) === d) return false;
  }
}

/**
 * The files git tracks under `dir`, or null when `dir` isn't in a git work tree.
 * Throws GitUnreadableError when `dir` has a `.git` that git won't read.
 */
export function gitFiles(dir: string): GitFiles | null {
  let inside = false;
  try {
    inside = git(dir, ['rev-parse', '--is-inside-work-tree']).trim() === 'true';
  } catch (e) {
    const why = reason(e);
    // Git found no repo here or above (an empty `.git` folder too): read the folder, as for any non-git folder.
    // A `.git` file pointing nowhere says "not a git repository: <path>" and stops below.
    if (/not a git repository \(or any/i.test(why)) return null;
    // Git (or a .git above) is there but won't read it, e.g. dubious ownership from a subfolder.
    if (/dubious ownership/i.test(why) || underGit(dir)) throw new GitUnreadableError(dir, why);
    return null;
  }
  if (!inside) return null;
  let out: string;
  try {
    out = git(dir, ['ls-files', '-s', '-z']);
  } catch (e) {
    throw new GitUnreadableError(dir, reason(e));
  }
  const files = new Set<string>();
  const submodules: string[] = [];
  for (const rec of out.split('\0').filter(Boolean)) {
    const tab = rec.indexOf('\t');
    const meta = rec.slice(0, tab);
    const path = rec.slice(tab + 1);
    if (meta.startsWith('160000') && !path.includes('/')) submodules.push(path);
    else files.add(path);
  }
  return { files, submodules };
}
