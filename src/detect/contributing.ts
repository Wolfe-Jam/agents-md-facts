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
    // CommonMark fences: a fence closes only on the same character, at least as long as the opener.
    let fence: string | null = null;
    // The paragraph so far: a setext heading is the whole paragraph above its `---`.
    let para: string[] = [];
    let lines = text.split(/\r?\n/);
    // YAML front matter (Jekyll / GitHub Pages) isn't part of the guide.
    if (/^---\s*$/.test(lines[0] ?? '')) {
      const close = lines.findIndex((l, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(l));
      if (close > 0) lines = lines.slice(close + 1);
    }
    for (const line of lines) {
      const f = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (f) {
        if (fence === null) fence = f;
        else if (f[0] === fence[0] && f.length >= fence.length && /^ {0,3}[`~]+\s*$/.test(line)) fence = null;
        para = [];
        continue;
      }
      if (fence !== null) continue;
      // `## Heading` (a closing `#` run needs a space before it: `## Why C#` keeps its `#`),
      // or a setext heading: a paragraph underlined with `---`.
      const atx = /^ {0,3}##\s+(.+?)(?:\s+#+)?\s*$/.exec(line)?.[1];
      const first = para[0] ?? '';
      const setext = /^ {0,3}-{2,}\s*$/.test(line) && para.length && !/^\s*([-*+]|\d+[.)])\s|^\s*[#>|]/.test(first)
        ? para.map((l) => l.trim()).join(' ') : null;
      const h = atx ?? setext;
      if (h) sections.push(h.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_]/g, '').trim());
      para = h || !line.trim() || /^ {0,3}#/.test(line) ? [] : [...para, line];
    }
    return { file, sections };
  }
  return null;
}
