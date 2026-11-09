import type { PackageJson } from './pkg.js';

/** The script that runs before a release, as the manifest declares it. */
export interface DetectedRelease {
  /** `prepublishOnly` / `prepack` / `prepublish` (npm lifecycle hooks) or `release` (a script of that name). */
  name: string;
  /** The script's command line, verbatim. */
  command: string;
  /** True for a lifecycle hook, which publishing runs by itself. */
  hook: boolean;
}

const HOOKS = ['prepublishOnly', 'prepack', 'prepublish'];

/**
 * The release gate a Node repo declares: the first of npm's pre-publish
 * lifecycle hooks it has, else a `release` script. Null when there is none. Pure.
 */
export function detectRelease(pkg: PackageJson | null): DetectedRelease | null {
  const scripts = pkg?.scripts ?? {};
  for (const name of HOOKS) {
    const command = scripts[name]?.trim();
    if (command) return { name, command, hook: true };
  }
  const release = scripts.release?.trim();
  return release ? { name: 'release', command: release, hook: false } : null;
}
