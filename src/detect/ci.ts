import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/** One CI step that runs a command. */
export interface CiStep {
  /** The command, verbatim (a multi-line `run: |` block keeps its lines). */
  run: string;
  /** The step's `if:` condition, verbatim, when it has one. */
  if?: string;
}

/** What one GitHub Actions workflow runs. */
export interface DetectedWorkflow {
  /** Path from the repo root, e.g. `.github/workflows/ci.yml`. */
  file: string;
  /** Runners and versions from `runs-on:` and the matrix (`os`, `node`, `*-version`). */
  on: string[];
  /** The command steps, in file order; dependency installs are left out. */
  steps: CiStep[];
}

/** Install steps every agent already knows; they cache nothing worth a line. */
const INSTALL = /^(npm (ci|install)|bun install|pnpm install|yarn( install)?)(\s+--?[\w-]+)*$/;

function unquote(s: string): string {
  const t = s.trim();
  return /^(['"]).*\1$/.test(t) ? t.slice(1, -1) : t;
}

function flowList(s: string): string[] {
  return s.split(',').map(unquote).filter(Boolean);
}

/**
 * Read one workflow's `run:` steps and where it runs. A small line reader, not
 * a YAML parser: it takes what a workflow literally says — `runs-on:`, matrix
 * lists written `[a, b]`, and `run:` steps (single-line or a `|`/`>` block).
 * Anything it can't read is left out, and the file is named so an agent can
 * read the rest. Pure.
 */
export function parseWorkflow(text: string): { on: string[]; steps: CiStep[] } {
  const lines = text.split(/\r?\n/);
  const runners: string[] = [];
  const versions: string[] = [];
  const steps: CiStep[] = [];
  let cur: CiStep | null = null;
  let curIf: string | undefined;

  const flush = (): void => {
    if (cur) {
      if (curIf) cur.if = curIf;
      if (!INSTALL.test(cur.run)) steps.push(cur);
    }
    cur = null;
    curIf = undefined;
  };

  const at = (n: number): string => lines[n] ?? '';
  for (let i = 0; i < lines.length; i++) {
    const line = at(i);
    if (/^\s*-\s/.test(line)) flush();
    const body = line.replace(/^\s*-\s+/, (m) => ' '.repeat(m.length));

    const runsOn = /^\s*runs-on:\s*(.+?)\s*$/.exec(body)?.[1];
    if (runsOn !== undefined) {
      if (!runsOn.includes('${{')) {
        const v = runsOn.startsWith('[') ? flowList(runsOn.slice(1, -1)) : [unquote(runsOn)];
        for (const r of v) if (!runners.includes(r)) runners.push(r);
      }
      continue;
    }
    const matrix = /^\s*(os|node|node-version|[a-z]+-version):\s*\[(.*)\]\s*$/.exec(body);
    if (matrix) {
      const key = matrix[1] ?? '';
      const values = flowList(matrix[2] ?? '').filter((v) => !v.includes('${{'));
      if (key === 'os') { for (const v of values) if (!runners.includes(v)) runners.push(v); }
      else if (values.length) versions.push(`${key === 'node' || key === 'node-version' ? 'Node' : key} ${values.join(', ')}`);
      continue;
    }
    const cond = /^\s*if:\s*(.+?)\s*$/.exec(body)?.[1];
    if (cond !== undefined) { curIf = unquote(cond); continue; }

    const run = /^(\s*)run:\s*(.*?)\s*$/.exec(body);
    if (run) {
      const indent = (run[1] ?? '').length;
      let cmd = run[2] ?? '';
      if (/^[|>][-+]?$/.test(cmd)) {
        const block: string[] = [];
        while (i + 1 < lines.length && (at(i + 1).trim() === '' || at(i + 1).search(/\S/) > indent)) {
          block.push(at(++i));
        }
        const filled = block.filter((l) => l.trim());
        const pad = filled.length ? Math.min(...filled.map((l) => l.search(/\S/))) : 0;
        cmd = block.map((l) => l.slice(pad)).join('\n').trim();
      } else {
        cmd = unquote(cmd);
      }
      if (cmd) cur = { run: cmd };
    }
  }
  flush();
  return { on: [...runners, ...versions], steps };
}

/** Every GitHub Actions workflow in the repo that runs a command, by file name. Pure. */
export function detectCi(dir: string): DetectedWorkflow[] {
  const wf = join(dir, '.github', 'workflows');
  if (!existsSync(wf)) return [];
  let files: string[];
  try {
    files = readdirSync(wf).filter((f) => /\.ya?ml$/.test(f)).sort();
  } catch {
    return [];
  }
  const out: DetectedWorkflow[] = [];
  for (const f of files) {
    let text: string;
    try { text = readFileSync(join(wf, f), 'utf-8'); } catch { continue; }
    const { on, steps } = parseWorkflow(text);
    if (steps.length) out.push({ file: `.github/workflows/${f}`, on, steps });
  }
  return out;
}
