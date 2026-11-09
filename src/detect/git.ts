import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

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
    super(
      `git can't read ${dir}${detail ? ` (${detail})` : ''}. ` +
      `agents-md-facts reads the file list from git, so it stops rather than guess. ` +
      `If git reports dubious ownership: git config --global --add safe.directory ${dir}`,
    );
    this.name = 'GitUnreadableError';
  }
}

function git(dir: string, args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
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
    if (!existsSync(join(dir, '.git'))) return null;
    const detail = String((e as { stderr?: unknown }).stderr ?? '').split('\n').find((l) => l.trim()) ?? '';
    throw new GitUnreadableError(dir, detail.replace(/^fatal:\s*/, '').trim());
  }
  if (!inside) return null;
  let out: string;
  try {
    out = git(dir, ['ls-files', '-s', '-z']);
  } catch (e) {
    const detail = String((e as { stderr?: unknown }).stderr ?? '').split('\n').find((l) => l.trim()) ?? '';
    throw new GitUnreadableError(dir, detail.replace(/^fatal:\s*/, '').trim());
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
