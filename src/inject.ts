import { existsSync, readFileSync, writeFileSync } from 'fs';

/** Markers bounding the managed block. Everything outside them is the user's. */
export const START = '<!-- agents:from-facts:start -->';
export const END = '<!-- agents:from-facts:end -->';

/**
 * The tool's own banner fingerprint. A markerless file that begins with it is
 * legacy output we can safely reclaim — a user never hand-writes this line.
 */
const FINGERPRINT = '<!-- authored by agents-md-facts';

/** Wrap an authored block body in the start/end markers. */
export function wrapBlock(block: string): string {
  return `${START}\n${block.trim()}\n${END}`;
}

/**
 * Non-destructively write the managed block into a file.
 *
 *   - file does not exist       → create it containing just the block
 *   - file has the markers      → replace ONLY the content between them
 *   - markerless legacy output  → reclaim it (led by the tool's fingerprint)
 *   - genuine user file         → PREFIX the block; preserve everything else
 *
 * Idempotent: re-running updates the managed block in place and never touches a
 * byte outside the markers.
 */
export function injectBlock(path: string, block: string): void {
  const wrapped = wrapBlock(block);

  // 1. No file → create it with just the block.
  if (!existsSync(path)) {
    writeFileSync(path, `${wrapped}\n`, 'utf-8');
    return;
  }

  const existing = readFileSync(path, 'utf-8');
  const s = existing.indexOf(START);
  const e = existing.indexOf(END);

  // 2. Markers present → replace only the managed block; keep everything around it.
  if (s !== -1 && e !== -1 && e > s) {
    const before = existing.slice(0, s);
    const after = existing.slice(e + END.length);
    writeFileSync(path, `${before}${wrapped}${after}`, 'utf-8');
    return;
  }

  // 3. Markerless legacy output — led by the tool's own fingerprint. Reclaim it.
  if (existing.trimStart().startsWith(FINGERPRINT)) {
    writeFileSync(path, `${wrapped}\n`, 'utf-8');
    return;
  }

  // 4. Genuine user file → prefix the block; preserve all existing content.
  writeFileSync(path, `${wrapped}\n\n${existing}`, 'utf-8');
}

/**
 * Extract the current managed block body (between the markers, trimmed), or null
 * when the file is missing or carries no managed block. Used by `--check`.
 */
export function extractBlock(path: string): string | null {
  if (!existsSync(path)) return null;
  const existing = readFileSync(path, 'utf-8');
  const s = existing.indexOf(START);
  const e = existing.indexOf(END);
  if (s === -1 || e === -1 || e <= s) return null;
  return existing.slice(s + START.length, e).trim();
}
