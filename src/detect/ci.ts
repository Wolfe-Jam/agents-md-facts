import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

/** One CI step that runs a command. */
export interface CiStep {
  /** The command, verbatim (token-shaped strings masked). A folded (`>`) block is already one line. */
  run: string;
  /** The step's own `if:` condition, on one line. */
  if?: string;
  /** The step's `name:`, on one line. */
  name?: string;
  /** Where it runs, when not the repo root: step, then job, then workflow `defaults.run`. */
  dir?: string;
  /** Its shell, when set and not bash / sh: step, then job, then workflow `defaults.run`. */
  shell?: string;
  /** Part of the step publishes, deploys or pushes (the rest is a check). */
  ships?: true;
}

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
  /** Steps left out because they publish, deploy or push. */
  skipped: number;
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
 * A dependency install alone on its line: every agent already knows it. Only
 * flags may follow (`npm ci --prefix web`, `pnpm i --filter x`); a chain
 * (`npm ci && npm test`) or a script (`yarn test`) is a check, and is kept.
 */
const INSTALL = /^(npm (ci|i|install)|bun (i|install)|pnpm (i|install)|yarn( install)?)(\s+((--prefix|--filter|--cwd|--registry|--network-timeout|-C|-F)(=\S+|\s+[^\s&|;<>-]\S*)|--?[\w-]+(=\S+)?))*\s*$/;

/**
 * One command that publishes, deploys or pushes: never a check an agent should
 * run. Matched at the start of a command (after any `VAR=x` and `npx`), so a
 * mention in an `echo` doesn't count; a `--dry-run` is a check, not a ship.
 */
const SHIP_CMD = new RegExp('^(?:sudo\\s+)?(?:(?:npx|pnpx|bunx|(?:pnpm|yarn) dlx|(?:npm|pnpm|yarn) exec)(?:\\s+-\\S+)*\\s+)?(?:' + [
  '(?:npm|pnpm|yarn|bun)(?:\\s+-\\S+(?:\\s+[^-\\s]\\S*)?)*\\s+publish\\b',
  '(?:npm|pnpm|yarn|bun)\\s+(?:run\\s+)?(?:deploy|release)(?::\\S+)?\\s*$',
  '(?:lerna|pkg-pr-new|changeset|mcp-publisher|vsce|ovsx|cargo|uv|poetry)\\s+publish\\b',
  'git(?:\\s+-[cC]\\s+\\S+)*\\s+push\\b',
  'gh\\s+(?:pr\\s+(?:create|merge|edit|comment)|release\\s+(?:create|upload|edit|delete))\\b',
  'wrangler\\s+(?:deploy|publish)\\b', 'twine\\s+upload\\b', 'gem\\s+push\\b',
  'docker\\s+push\\b', 'docker\\s+buildx\\s+build\\b.*\\s--push\\b',
  'semantic-release\\b', 'goreleaser\\b', 'vercel\\b.*\\s--prod\\b', 'netlify\\s+deploy\\b',
  'firebase\\s+deploy\\b', 'fly(?:ctl)?\\s+deploy\\b',
].join('|') + ')');

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

/** True when this one command publishes, deploys or pushes. */
export function ships(command: string): boolean {
  const c = command.replace(/^(\w+=\S*\s+)+/, '');
  return SHIP_CMD.test(c) && !/\s--dry-run\b/.test(c);
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

function readJob(id: string, job: Obj, wfDefaults: Obj): CiJob {
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
  let skipped = 0;
  for (const step of Array.isArray(job.steps) ? job.steps : []) {
    if (!isObj(step)) continue;
    const raw = scalar(step.run);
    if (!raw || INSTALL.test(raw)) continue;
    const cmds = commandsOf(raw);
    const shipping = cmds.filter(ships).length;
    if (shipping && shipping === cmds.length) { skipped++; continue; }
    const out: CiStep = { run: raw.replace(TOKEN, '<token>') };
    if (shipping) out.ships = true;
    const cond = oneLine(scalar(step.if));
    if (cond) out.if = cond;
    const name = oneLine(scalar(step.name));
    if (name) out.name = name;
    const dir = oneLine(cleanDir(scalar(step['working-directory']) ?? scalar(jobDefaults['working-directory']) ?? scalar(wfDefaults['working-directory'])));
    if (dir) out.dir = dir;
    // bash / sh is what a reader assumes for a `run:` block; only another shell is worth a line.
    const shell = oneLine(scalar(step.shell) ?? scalar(jobDefaults.shell) ?? scalar(wfDefaults.shell));
    if (shell && !/^(bash|sh)\b/.test(shell)) out.shell = shell;
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
    skipped,
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
export function parseWorkflow(text: string): Omit<DetectedWorkflow, 'file'> {
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
      if (isObj(job)) jobs.push(readJob(id, job, wfDefaults));
    }
  }
  return { on: triggers(doc.on), checksChanges: checksChanges(doc.on), jobs };
}

/** Every GitHub Actions workflow in the repo, by file name, readable or not. Pure. */
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
    out.push({ file: `.github/workflows/${f}`, ...parseWorkflow(text) });
  }
  return out;
}
