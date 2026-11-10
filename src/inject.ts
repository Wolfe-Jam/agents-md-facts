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

/**
 * The file has more than one start-marker line, so which block is the tool's
 * can't be told. Nothing is written; the CLI says so and exits 2.
 */
export class MarkerError extends Error {
  constructor(path: string, starts: number) {
    super(`${path} has ${starts} \`${START}\` lines; keep one (the managed block's) and re-run. Nothing was written.`);
    this.name = 'MarkerError';
  }
}

/** A marker counts only as a whole line (trailing spaces / CR allowed): never inside a sentence or code span. */
const lineRe = (m: string): RegExp => new RegExp(`^\uFEFF?${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \t\r]*$`, 'gm');
const START_LINE = lineRe(START);
const END_LINE = lineRe(END);

/**
 * Where the managed block is: the start-marker line and the first end-marker
 * line after it, as [start of START, end of END]. Null when there's no such
 * pair. Throws MarkerError when more than one start-marker line exists.
 */
export function findBlock(text: string, path = 'AGENTS.md'): [number, number] | null {
  const starts = [...text.matchAll(START_LINE)];
  if (starts.length > 1) throw new MarkerError(path, starts.length);
  const first = starts[0];
  if (!first) return null;
  const s = (first.index ?? 0) + (first[0].startsWith('\uFEFF') ? 1 : 0);
  END_LINE.lastIndex = s;
  const end = END_LINE.exec(text);
  if (!end) return null;
  return [s, end.index + END.length];
}

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
  // CRLF only when every line end is CRLF; a mixed file gets LF in the new lines.
  const crlf = existing.includes('\r\n') && !/(^|[^\r])\n/.test(existing);
  const wrapped = crlf ? wrapBlock(block).replace(/\n/g, '\r\n') : wrapBlock(block);
  const nl = crlf ? '\r\n' : '\n';
  const bom = existing.startsWith('\uFEFF') ? '\uFEFF' : '';

  // 2. Markers present (each a whole line) → replace only the managed block; keep everything around it.
  const at = findBlock(existing, path);
  if (at) {
    writeFileSync(path, `${existing.slice(0, at[0])}${wrapped}${existing.slice(at[1])}`, 'utf-8');
    return 'replaced-block';
  }

  // 3. Markerless, and identical to what this tool writes now (timestamp aside) → reclaim.
  const body = existing.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '').trim();
  if (body.startsWith(FINGERPRINT) && stripVolatile(body) === stripVolatile(block.trim())) {
    writeFileSync(path, `${bom}${wrapped}${nl}`, 'utf-8');
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
  const at = findBlock(existing, path);
  if (!at) return null;
  return existing.slice(at[0] + START.length, at[1] - END.length).trim();
}
