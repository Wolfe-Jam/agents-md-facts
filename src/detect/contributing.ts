import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** A contributing guide: where it is and its section headings. */
export interface DetectedContributing {
  file: string;
  /** The guide's `##` headings as plain text, in order — what it covers, not what it says. */
  sections: string[];
}

const PLACES = ['CONTRIBUTING.md', '.github/CONTRIBUTING.md', 'docs/CONTRIBUTING.md'];

/**
 * Find the repo's contributing guide. AGENTS.md points to it rather than
 * copying its rules: the guide is the owner's own words and stays the source. Pure.
 */
export function detectContributing(dir: string): DetectedContributing | null {
  for (const file of PLACES) {
    const p = join(dir, file);
    if (!existsSync(p)) continue;
    let text = '';
    try { text = readFileSync(p, 'utf-8'); } catch { /* the file is still there */ }
    const sections: string[] = [];
    let fence: string | null = null;
    for (const line of text.split(/\r?\n/)) {
      const f = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
      if (f) {
        if (fence === null) fence = f[0] ?? null;
        else if (f[0] === fence) fence = null;
        continue;
      }
      if (fence !== null) continue;
      // A closing `#` run needs a space before it (`## Why C#` keeps its `#`); links keep their text.
      const h = /^##\s+(.+?)(?:\s+#+)?\s*$/.exec(line)?.[1];
      if (h) sections.push(h.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_]/g, '').trim());
    }
    return { file, sections };
  }
  return null;
}
