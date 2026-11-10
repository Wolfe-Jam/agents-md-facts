import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

/** One CI step, reduced to the commands in it that call the repo's own scripts or listed commands. */
export interface CiStep {
  /** Those commands, each as written (on one line, token-shaped strings masked). */
  commands: string[];
  /** The step's own `if:` condition, on one line. */
  if?: string;
  /** Where it runs, when not the repo root: step, then job, then workflow `defaults.run`. */
  dir?: string;
}

/**
 * True when a command calls something the repo declares: a package.json script
 * (in the folder the step runs in) or a command this file already lists.
 */
export type Known = (command: string, dir: string | undefined) => boolean;

/** One job of a workflow. */
export interface CiJob {
  /** The job's id under `jobs:`. */
  id: string;
  /** The job's own `if:` condition, on one line. */
  if?: string;
  /** Where it runs: `runs-on` (a label set joined with `+`), or the matrix `os` values it names. */
  runsOn: string[];
  /** Matrix axes, e.g. `node 22, 24`; `include: N more` when it adds legs; a note when set by an expression. */
  matrix: string[];
  steps: CiStep[];
  /** A local reusable workflow this job calls (`uses: ./.github/workflows/x.yml`), as a repo path. */
  calls?: string;
}

/** What one GitHub Actions workflow runs. */
export interface DetectedWorkflow {
  /** Path from the repo root, e.g. `.github/workflows/ci.yml`. */
  file: string;
  /** The events that start it (`on:`), in file order. */
  on: string[];
  /**
   * True when it runs as a check on a change: on `pull_request` (not only when
   * closed), on `push` to branches (not tags only), or in a merge queue.
   * `pull_request_target` is left out: it runs privileged bots, not checks.
   */
  checksChanges: boolean;
  jobs: CiJob[];
  /** True when the file isn't valid YAML; it is named, never guessed at. */
  unreadable?: boolean;
}

/**
 * Split a `run:` script into its commands at newlines, `&&`, `||`, `;` and `|`,
 * outside quotes. Comments and blank lines are dropped.
 */
export function commandsOf(script: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote = '';
  const flush = (): void => {
    const c = cur.trim();
    if (c && !c.startsWith('#')) out.push(c);
    cur = '';
  };
  for (let i = 0; i < script.length; i++) {
    const ch = script.charAt(i);
    if (quote) { if (ch === quote) quote = ''; cur += ch; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '\n' || ch === ';' || ch === '|' || (ch === '&' && script.charAt(i + 1) === '&')) {
      flush();
      if ((ch === '&' || ch === '|') && script.charAt(i + 1) === ch) i++;
      continue;
    }
    cur += ch;
  }
  flush();
  return out;
}

/** Token shapes that must never be copied into AGENTS.md, even if a workflow has one inline. */
const TOKEN = /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|npm_[A-Za-z0-9]{30,})\b/g;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const scalar = (v: unknown): string | null =>
  typeof v === 'string' ? v.trim() || null : typeof v === 'number' || typeof v === 'boolean' ? String(v) : null;
const hasExpr = (s: string): boolean => s.includes('${{');
/** A label (`if:`, `name:`, a directory) on one line, at most 120 characters. */
const oneLine = (s: string | null): string | null => {
  if (!s) return null;
  const t = s.replace(/\s+/g, ' ').replace(TOKEN, '<token>').trim();
  return t.length > 120 ? `${t.slice(0, 117)}…` : t;
};
const cleanDir = (s: string | null): string | null => {
  const d = s?.replace(/^\.\//, '').replace(/\/+$/, '') ?? null;
  return d && d !== '.' ? d : null;
};

function triggers(on: unknown): string[] {
  if (typeof on === 'string') return [on];
  if (Array.isArray(on)) return on.map(scalar).filter((s): s is string => s !== null);
  if (isObj(on)) return Object.keys(on);
  return [];
}

function checksChanges(on: unknown): boolean {
  const events = triggers(on);
  const cfg = (e: string): Obj => (isObj(on) && isObj(on[e]) ? on[e] : {});
  if (events.includes('merge_group')) return true;
  if (events.includes('pull_request')) {
    // Only on close, label or assign: a bot, not a check. No `types` = opened, synchronize, reopened.
    const types = cfg('pull_request').types;
    const list = Array.isArray(types) ? types : typeof types === 'string' ? [types] : [];
    if (!list.length || list.some((t) => /^(opened|synchronize|reopened|ready_for_review|edited)$/.test(String(t)))) return true;
  }
  if (events.includes('push') && !events.includes('pull_request')) {
    const push = cfg('push');
    const tagsOnly = (push.tags !== undefined || push['tags-ignore'] !== undefined)
      && push.branches === undefined && push['branches-ignore'] === undefined;
    // Only on push to main / master (no pull_request): runs after the merge, e.g. a deploy.
    const branches = Array.isArray(push.branches) ? push.branches : typeof push.branches === 'string' ? [push.branches] : [];
    const mainOnly = branches.length > 0 && branches.every((b) => b === 'main' || b === 'master');
    if (!tagsOnly && !mainOnly) return true;
  }
  return false;
}

function readJob(id: string, job: Obj, wfDefaults: Obj, known: Known): CiJob {
  const strategy = isObj(job.strategy) ? job.strategy : {};
  const matrixRaw = strategy.matrix;
  const matrix = isObj(matrixRaw) ? matrixRaw : {};
  const axes = new Map<string, string[]>();
  const notes: string[] = [];
  if (typeof matrixRaw === 'string' && hasExpr(matrixRaw)) notes.push('matrix set by an expression');
  for (const [rawKey, value] of Object.entries(matrix)) {
    if (rawKey === 'include' || rawKey === 'exclude') continue;
    const key = oneLine(rawKey) ?? '';
    if (typeof value === 'string' && hasExpr(value)) { notes.push(`${key} set by an expression`); continue; }
    if (!Array.isArray(value)) continue;
    const plain = value.map((v) => oneLine(scalar(v))).filter((s): s is string => s !== null && !hasExpr(s));
    if (plain.length) axes.set(key, plain.length < value.length ? [...plain, '…'] : plain);
  }

  // `runs-on` is one label set; `${{ matrix.os }}` takes the matrix's os values.
  let runsOn: string[] = [];
  const ro = job['runs-on'];
  if (typeof ro === 'string') {
    runsOn = /^\$\{\{\s*matrix\.os\s*\}\}$/.test(ro.trim()) ? axes.get('os') ?? [] : hasExpr(ro) ? [] : [oneLine(ro) ?? ''].filter(Boolean);
  } else if (Array.isArray(ro)) {
    const labels = ro.map((v) => oneLine(scalar(v))).filter((s): s is string => s !== null && !hasExpr(s));
    if (labels.length === ro.length && labels.length) runsOn = [labels.join('+')];
  }

  const jobDefaults = isObj(job.defaults) && isObj(job.defaults.run) ? job.defaults.run : {};
  const steps: CiStep[] = [];
  for (const step of Array.isArray(job.steps) ? job.steps : []) {
    if (!isObj(step)) continue;
    const raw = scalar(step.run);
    if (!raw) continue;
    const dir = oneLine(cleanDir(scalar(step['working-directory']) ?? scalar(jobDefaults['working-directory']) ?? scalar(wfDefaults['working-directory'])));
    const commands = commandsOf(raw).map((c) => oneLine(c) ?? '').filter((c) => c && known(c, dir ?? undefined));
    if (!commands.length) continue;
    const out: CiStep = { commands };
    const cond = oneLine(scalar(step.if));
    if (cond) out.if = cond;
    if (dir) out.dir = dir;
    steps.push(out);
  }

  const out: CiJob = {
    id: oneLine(id) ?? id,
    runsOn,
    matrix: [
      ...[...axes].filter(([k]) => k !== 'os').map(([k, v]) => `${k} ${v.join(', ')}`),
      ...(Array.isArray(matrix.include) && matrix.include.length ? [`include: ${matrix.include.length} more`] : []),
      ...notes,
    ],
    steps,
  };
  const cond = oneLine(scalar(job.if));
  if (cond) out.if = cond;
  const uses = scalar(job.uses);
  if (uses?.startsWith('./.github/workflows/')) out.calls = uses.slice(2).replace(/@.*$/, '');
  return out;
}

/**
 * Read one workflow: its triggers, and for each job its condition, runners,
 * matrix and `run:` steps. Parsed as YAML (merge keys expanded), so a job's
 * `if:` stays with its job, comments are dropped and folded blocks read as the
 * shell sees them. A file that isn't valid YAML is `unreadable`. Pure.
 */
export function parseWorkflow(text: string, known: Known = () => true): Omit<DetectedWorkflow, 'file'> {
  let doc: unknown;
  try {
    doc = parse(text, { merge: true });
  } catch {
    return { on: [], checksChanges: false, jobs: [], unreadable: true };
  }
  if (!isObj(doc)) return { on: [], checksChanges: false, jobs: [], unreadable: true };
  const wfDefaults = isObj(doc.defaults) && isObj(doc.defaults.run) ? doc.defaults.run : {};
  const jobs: CiJob[] = [];
  if (isObj(doc.jobs)) {
    for (const [id, job] of Object.entries(doc.jobs)) {
      if (isObj(job)) jobs.push(readJob(id, job, wfDefaults, known));
    }
  }
  return { on: triggers(doc.on), checksChanges: checksChanges(doc.on), jobs };
}

/** Every GitHub Actions workflow in the repo, by file name, readable or not. Pure. */
export function detectCi(dir: string, known: Known = () => true): DetectedWorkflow[] {
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
    out.push({ file: `.github/workflows/${f}`, ...parseWorkflow(text, known) });
  }
  return out;
}

/** Subcommands pnpm and yarn run themselves; `pnpm install` is never a script call. */
const BUILTIN = new Set(('add audit bin cache config create dedupe deploy dlx env exec fetch import info init install i link '
  + 'list ls login logout npm outdated pack patch prune publish rebuild remove rm root run set store unlink up update '
  + 'upgrade version why workspace workspaces').split(' '));

/**
 * The repo's own commands, for matching CI lines: a package.json script called
 * as `npm test` / `npm run x`, `pnpm x` / `pnpm run x`, `yarn x`, `bun run x`
 * (read from the package.json in the folder the step runs in), or a command
 * already listed (`cargo test`). Anything else a workflow runs isn't judged; it
 * is left in the file.
 */
export function ownCommands(repoDir: string, listed: string[]): Known {
  const cache = new Map<string, Set<string>>();
  const scriptsIn = (sub: string): Set<string> => {
    let names = cache.get(sub);
    if (!names) {
      names = new Set();
      try {
        const pkg = JSON.parse(readFileSync(join(repoDir, sub, 'package.json'), 'utf-8')) as { scripts?: unknown };
        if (isObj(pkg.scripts)) for (const k of Object.keys(pkg.scripts)) names.add(k);
      } catch { /* no package.json there: no scripts */ }
      cache.set(sub, names);
    }
    return names;
  };
  return (command, dir) => {
    const c = command.replace(/^(\w+=\S*\s+)+/, '');
    if (!dir && listed.some((l) => c === l || c.startsWith(`${l} `))) return true;
    const m = /^(npm|pnpm|yarn|bun)\s+(?:(run|run-script)\s+)?([^\s-]\S*)/.exec(c);
    if (!m) return false;
    const [, pm, run, name = ''] = m;
    if (!run && (pm === 'bun' || (pm === 'npm' ? !/^(test|t|start)$/.test(name) : BUILTIN.has(name)))) return false;
    return scriptsIn(dir ?? '').has(pm === 'npm' && name === 't' ? 'test' : name);
  };
}
