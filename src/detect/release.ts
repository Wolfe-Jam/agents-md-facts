import type { PackageJson } from './pkg.js';

/** A script that runs before a release, as the manifest declares it. */
export interface ReleaseScript {
  name: string;
  /** The script's command line, verbatim. */
  command: string;
}

/** What runs before a release. */
export interface DetectedRelease {
  /**
   * `publish`: the npm lifecycle hooks `npm publish` runs first, in its order
   * (`prepublishOnly`, then `prepack`). `script`: a `release` script, run by hand.
   * `none`: a publishable package that declares neither, so `npm publish` runs no checks.
   */
  kind: 'publish' | 'script' | 'none';
  scripts: ReleaseScript[];
}

/**
 * npm ≥ 7 runs these on `npm publish`, in this order. `prepublish` is not here:
 * since npm 7 it runs on install, not on publish.
 */
const PUBLISH_HOOKS = ['prepublishOnly', 'prepack'];

/**
 * The release gate a Node repo declares: the pre-publish lifecycle hooks it
 * has, else a `release` script, else `none` for a package that can be
 * published (not `private`). Null for no package.json or a private one. Pure.
 */
export function detectRelease(pkg: PackageJson | null): DetectedRelease | null {
  const scripts = pkg?.scripts ?? {};
  const pick = (name: string): ReleaseScript | null => {
    const command = typeof scripts[name] === 'string' ? scripts[name].trim() : '';
    return command ? { name, command } : null;
  };
  const hooks = PUBLISH_HOOKS.map(pick).filter((s): s is ReleaseScript => s !== null);
  if (hooks.length) return { kind: 'publish', scripts: hooks };
  const release = pick('release');
  if (release) return { kind: 'script', scripts: [release] };
  return pkg && pkg.private !== true ? { kind: 'none', scripts: [] } : null;
}
