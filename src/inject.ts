import { existsSync, readFileSync, writeFileSync } from 'fs';
import { stripVolatile } from './volatile.js';

/** Markers bounding the managed block. Everything outside them is the user's. */
export const START = '<!-- agents:from-facts:start -->';
export const END = '<!-- agents:from-facts:end -->';

/** The tool's own banner fingerprint: a markerless file that begins with it was once this tool's output. */
const FINGERPRINT = '<!-- authored by agents-md-facts';

/**
 * What injectBlock did, so the CLI can say so. `kept` means a markerless file
 * that starts with the banner had other text in it: the block went on top and
 * nothing was removed.
 */
export type InjectResult = 'created' | 'replaced-block' | 'reclaimed' | 'kept' | 'prefixed';

/** Wrap an authored block body in the start/end markers. */
export function wrapBlock(block: string): string {
  return `${START}\n${block.trim()}\n${END}`;
}

/**
 * Non-destructively write the managed block into a file.
 *
 *   - file does not exist            → create it containing just the block
 *   - file has the markers           → replace ONLY the content between them
 *   - markerless, and exactly what   → reclaim it (it is this tool's output,
 *     this tool writes now             the timestamp aside)
 *   - anything else                  → PREFIX the block; keep every byte of the
 *                                      file (`kept` when it starts with the banner)
 *
 * A markerless file is replaced only when nothing in it could be the user's: a
 * hand-added line under a tool heading is user text too, so no heading rule can
 * tell. A CRLF file keeps CRLF line ends.
 */
export function injectBlock(path: string, block: string): InjectResult {
  // 1. No file → create it with just the block.
  if (!existsSync(path)) {
    writeFileSync(path, `${wrapBlock(block)}\n`, 'utf-8');
    return 'created';
  }

  const existing = readFileSync(path, 'utf-8');
  const crlf = existing.includes('\r\n');
  const wrapped = crlf ? wrapBlock(block).replace(/\n/g, '\r\n') : wrapBlock(block);
  const nl = crlf ? '\r\n' : '\n';
  const s = existing.indexOf(START);
  const e = existing.indexOf(END);

  // 2. Markers present → replace only the managed block; keep everything around it.
  if (s !== -1 && e !== -1 && e > s) {
    writeFileSync(path, `${existing.slice(0, s)}${wrapped}${existing.slice(e + END.length)}`, 'utf-8');
    return 'replaced-block';
  }

  // 3. Markerless, and identical to what this tool writes now (timestamp aside) → reclaim.
  const body = existing.replace(/\r\n/g, '\n').trim();
  if (body.startsWith(FINGERPRINT) && stripVolatile(body) === stripVolatile(block.trim())) {
    writeFileSync(path, `${wrapped}${nl}`, 'utf-8');
    return 'reclaimed';
  }

  // 4. Anything else → prefix the block; keep all existing content.
  writeFileSync(path, `${wrapped}${nl}${nl}${existing}`, 'utf-8');
  return body.startsWith(FINGERPRINT) ? 'kept' : 'prefixed';
}

/**
 * Extract the current managed block body (between the markers, trimmed), or null
 * when the file is missing or carries no managed block. Used by `--check`.
 */
export function extractBlock(path: string): string | null {
  if (!existsSync(path)) return null;
  // A Windows checkout (core.autocrlf) has CRLF line ends; the authored block has LF.
  const existing = readFileSync(path, 'utf-8').replace(/\r\n/g, '\n');
  const s = existing.indexOf(START);
  const e = existing.indexOf(END);
  if (s === -1 || e === -1 || e <= s) return null;
  return existing.slice(s + START.length, e).trim();
}
