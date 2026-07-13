import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * The subset of package.json fields the detectors read. Pure data — nothing
 * here is interpreted beyond what a manifest literally declares.
 */
export interface PackageJson {
  name?: string;
  version?: string;
  description?: string;
  keywords?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  type?: string;
  main?: string;
  types?: string;
  exports?: unknown;
  bin?: string | Record<string, string>;
  private?: boolean;
  workspaces?: string[] | { packages?: string[] };
  files?: string[];
}

/** Read and parse package.json from a directory. Returns null if absent/invalid. */
export function readPackageJson(dir: string): PackageJson | null {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return null;
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf-8'));
  } catch {
    return null;
  }
}
