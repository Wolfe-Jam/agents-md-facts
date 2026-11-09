import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** A contributing guide: where it is and its section headings. */
export interface DetectedContributing {
  file: string;
  /** The guide's `##` headings, in order — what it covers, not what it says. */
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
    const sections = [...text.matchAll(/^##\s+(.+?)\s*#*\s*$/gm)].map((m) => (m[1] ?? "").trim());
    return { file, sections };
  }
  return null;
}
