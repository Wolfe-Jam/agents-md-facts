import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

/** One CI step that runs a command. */
export interface CiStep {
  /** The command, verbatim. A folded (`>`) block is already one line, as the shell sees it. */
  run: string;
  /** The step's own `if:` condition, verbatim, when it has one. */
  if?: string;
  /** The step's `name:`, when it has one. */
  name?: string;
  /** Where it runs, when not the repo root (`working-directory`, step or job default). */
  dir?: string;
  /** Its shell, when not the default (`shell:`, step or job default). */
  shell?: string;
}

/** One job of a workflow that runs at least one command. */
export interface CiJob {
  /** The job's id under `jobs:`. */
  id: string;
  /** The job's own `if:` condition, when it has one. */
  if?: string;
  /** Where it runs: `runs-on` (a label set joined with `+`), or the matrix `os` values it names. */
  runsOn: string[];
  /** Matrix axes with plain values, e.g. `node 22, 24` (`os` is in `runsOn`); `include: N` when it adds legs. */
  matrix: string[];
  steps: CiStep[];
}

/** What one GitHub Actions workflow runs. */
export interface DetectedWorkflow {
  /** Path from the repo root, e.g. `.github/workflows/ci.yml`. */
  file: string;
  /** The events that start it (`on:`), in file order. */
  on: string[];
  jobs: CiJob[];
}

/** Dependency installs every agent already knows; they cache nothing worth a line. */
const INSTALL = /^(npm (ci|i|install)|bun (i|install)|pnpm (i|install)|yarn( install)?)(\s+\S+)*$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const scalar = (v: unknown): string | null =>
  typeof v === 'string' ? v.trim() || null : typeof v === 'number' || typeof v === 'boolean' ? String(v) : null;
const hasExpr = (s: string): boolean => s.includes('${{');

function triggers(on: unknown): string[] {
  if (typeof on === 'string') return [on];
  if (Array.isArray(on)) return on.map(scalar).filter((s): s is string => s !== null);
  if (isObj(on)) return Object.keys(on);
  return [];
}

function readJob(id: string, job: Obj): CiJob | null {
  const strategy = isObj(job.strategy) ? job.strategy : {};
  const matrix = isObj(strategy.matrix) ? strategy.matrix : {};
  const axes = new Map<string, string[]>();
  for (const [key, value] of Object.entries(matrix)) {
    if (key === 'include' || key === 'exclude' || !Array.isArray(value)) continue;
    const plain = value.map(scalar).filter((s): s is string => s !== null && !hasExpr(s));
    if (plain.length === value.length && plain.length) axes.set(key, plain);
  }

  // `runs-on` is one label set; `${{ matrix.os }}` takes the matrix's os values.
  let runsOn: string[] = [];
  const ro = job['runs-on'];
  if (typeof ro === 'string') {
    runsOn = /^\$\{\{\s*matrix\.os\s*\}\}$/.test(ro.trim()) ? axes.get('os') ?? [] : hasExpr(ro) ? [] : [ro.trim()];
  } else if (Array.isArray(ro)) {
    const labels = ro.map(scalar).filter((s): s is string => s !== null && !hasExpr(s));
    if (labels.length === ro.length && labels.length) runsOn = [labels.join('+')];
  }

  const defaults = isObj(job.defaults) && isObj(job.defaults.run) ? job.defaults.run : {};
  const steps: CiStep[] = [];
  for (const step of Array.isArray(job.steps) ? job.steps : []) {
    if (!isObj(step)) continue;
    const run = scalar(step.run);
    if (!run || INSTALL.test(run)) continue;
    const out: CiStep = { run };
    const cond = scalar(step.if);
    if (cond) out.if = cond;
    const name = scalar(step.name);
    if (name) out.name = name;
    const dir = scalar(step['working-directory']) ?? scalar(defaults['working-directory']);
    if (dir && dir !== '.') out.dir = dir;
    const shell = scalar(step.shell) ?? scalar(defaults.shell);
    if (shell) out.shell = shell;
    steps.push(out);
  }
  if (!steps.length) return null;

  const cond = scalar(job.if);
  const out: CiJob = {
    id,
    runsOn,
    matrix: [
      ...[...axes].filter(([k]) => k !== 'os').map(([k, v]) => `${k} ${v.join(', ')}`),
      ...(Array.isArray(matrix.include) && matrix.include.length ? [`include: ${matrix.include.length} more`] : []),
    ],
    steps,
  };
  if (cond) out.if = cond;
  return out;
}

/**
 * Read one workflow: its triggers, and for each job its condition, runners,
 * matrix and `run:` steps. Parsed as YAML, so a job's `if:` stays with its job,
 * comments are dropped and folded blocks read as the shell sees them. Reusable
 * workflows and `uses:` steps run no command here and are left out. Pure.
 */
export function parseWorkflow(text: string): { on: string[]; jobs: CiJob[] } {
  let doc: unknown;
  try {
    doc = parse(text);
  } catch {
    return { on: [], jobs: [] };
  }
  if (!isObj(doc)) return { on: [], jobs: [] };
  const jobs: CiJob[] = [];
  if (isObj(doc.jobs)) {
    for (const [id, job] of Object.entries(doc.jobs)) {
      if (!isObj(job)) continue;
      const read = readJob(id, job);
      if (read) jobs.push(read);
    }
  }
  return { on: triggers(doc.on), jobs };
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
    const { on, jobs } = parseWorkflow(text);
    if (jobs.length) out.push({ file: `.github/workflows/${f}`, on, jobs });
  }
  return out;
}
