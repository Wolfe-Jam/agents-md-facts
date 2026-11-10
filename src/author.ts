import type { RepoContext } from './context.js';
import { isBuildScript, isGateScript } from './detect/commands.js';
import type { CiJob, DetectedWorkflow } from './detect/ci.js';

/**
 * Lines the CI section may use, so the whole file stays short (the doctrine
 * test caps it at 150 lines). The most important workflow always gets a block;
 * the rest share what's left, then are named.
 */
const CI_BUDGET = 40;

/** Fewest lines worth giving a second workflow; below that it is named instead. */
const CI_MIN_BLOCK = 8;

/** Workflows named on the "Also:" line before the count takes over. */
const ALSO_MAX = 6;

/**
 * Rank a workflow: the repo's main check first (`ci.yml`, `test.yml`, …), then
 * names with ci / test / build in them, then check / lint / verify, then the
 * rest; helpers that fix, format, label or update things (`lint-autofix.yml`,
 * `check-changelog.yml`) last. Pull-request ones first within a rank.
 */
function rank(wf: DetectedWorkflow): [number, number, string] {
  const base = wf.file.replace(/^.*\//, '').replace(/\.ya?ml$/, '').toLowerCase();
  const word = (re: string): boolean => new RegExp(`(^|[-_.])(${re})([-_.]|$)`).test(base);
  const main = word('(auto)?fix|format|bot|labell?er|label|update|changelog|release|deploy|publish|stale') ? 4
    : /^(ci|tests?|checks?|build|lint|main|verify|validate|pr)$/.test(base) ? 0
      : word('ci|tests?|build') ? 1
        : word('checks?|lint|verify') ? 2 : 3;
  return [main, wf.on.includes('pull_request') ? 0 : 1, wf.file];
}
const byRank = (a: DetectedWorkflow, b: DetectedWorkflow): number => {
  const [x, y] = [rank(a), rank(b)];
  return x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0);
};

/** A code fence longer than any backtick run inside the block, so the block can't close early. */
function fenceFor(lines: string[]): string {
  const longest = Math.max(0, ...lines.map((l) => Math.max(0, ...(l.match(/`+/g) ?? []).map((m) => m.length))));
  return '`'.repeat(Math.max(3, longest + 1));
}

/** A job's header and steps, as lines inside the block. */
function jobLines(job: CiJob, prefix: string): string[] {
  const out: string[] = [];
  const where = [...job.runsOn.length ? [job.runsOn.join(', ')] : [], ...job.matrix];
  out.push(`# job ${prefix}${job.id}${job.if ? ` · if: ${job.if}` : ''}${where.length ? ` · ${where.join(' · ')}` : ''}`);
  for (const step of job.steps) {
    const notes = [...step.if ? [`if: ${step.if}`] : [], ...step.dir ? [`in ${step.dir}/`] : [], ...step.shell ? [`shell: ${step.shell}`] : [],
      ...step.ships ? ['part of this step publishes / deploys / pushes'] : []];
    if (notes.length) out.push(`# ${notes.join(' · ')}`);
    const lines = step.run.split('\n');
    if (lines.length === 1) { out.push(step.run); continue; }
    // A script: named by the repo's own step name when it has a plain one; else its first real line.
    if (step.name && !step.name.includes('${{')) { out.push(`# step "${step.name}": ${lines.length}-line script in the file`); continue; }
    const first = lines.find((l) => l.trim() && !/^\s*(set -|#)/.test(l)) ?? lines[0] ?? '';
    out.push(first);
    out.push(`# … ${lines.length - 1} more line${lines.length > 2 ? 's' : ''} in this step`);
  }
  if (job.skipped) out.push(`# ${job.skipped} publish / deploy / push step${job.skipped > 1 ? 's' : ''} left out`);
  return out;
}

/**
 * One workflow as a fenced block, at most `max` lines. A job that calls a local
 * reusable workflow shows that workflow's jobs under it (one level).
 */
function workflowLines(wf: DetectedWorkflow, byFile: Map<string, DetectedWorkflow>, max: number): string[] {
  const body: string[] = [];
  for (const job of wf.jobs) {
    if (job.calls) {
      const callee = byFile.get(job.calls);
      body.push(`# job ${job.id}${job.if ? ` · if: ${job.if}` : ''} · calls \`${job.calls}\``);
      for (const inner of callee?.jobs ?? []) {
        // One level: a callee's own call is named, not opened; a job with nothing kept isn't printed.
        if (inner.calls) body.push(`# job ${job.id} → ${inner.id} · calls \`${inner.calls}\``);
        else if (inner.steps.length || inner.skipped) body.push(...jobLines(inner, `${job.id} → `));
      }
      continue;
    }
    if (job.steps.length || job.skipped) body.push(...jobLines(job, ''));
  }
  const room = Math.max(1, max - 2);
  const shown = body.length > room ? [...body.slice(0, room - 1), '# … more in the file'] : body;
  const fence = fenceFor(shown);
  return [`${fence}bash`, ...shown, fence];
}

const runsSomething = (wf: DetectedWorkflow): boolean =>
  wf.jobs.some((j) => j.steps.length > 0 || j.skipped > 0 || j.calls !== undefined);

/**
 * The banner written at the top of the managed block. It says what authored the
 * file and how it stays true — from facts, never guessed. Carries the precise
 * ISO authoring timestamp for `--check` (or any tool) to parse mechanically.
 * Excluded from the `--check` equality diff — see `stripVolatile` in cli.ts.
 */
function banner(now: Date): string {
  return `<!-- authored by agents-md-facts — from your repo's facts, never guessed · re-run to refresh · keep the start/end markers · authored: ${now.toISOString()} -->`;
}

/** Human-readable companion to the banner's ISO timestamp — visible while reading, not just parseable. */
function authoredLine(now: Date): string {
  return `*Authored: ${now.toISOString().slice(0, 10)}*`;
}

/** The explicit dependency-install command for a Node repo, from the detected package manager. */
function installCommand(ctx: RepoContext): string | null {
  if (!ctx.hasNodeManifest) return null;
  switch (ctx.packageManager) {
    case 'bun': return 'bun install';
    case 'pnpm': return 'pnpm install';
    case 'yarn': return 'yarn';
    case 'npm': return 'npm install';
    default: return `${ctx.packageManager} install`;
  }
}

/** One-line orientation from detected language / kind / runtime / package manager / version. */
function orientationLine(ctx: RepoContext): string {
  const parts: string[] = [];
  if (ctx.language !== 'Unknown') parts.push(ctx.language);
  if (ctx.kind) parts.push(ctx.kind);
  if (ctx.runtime !== 'Unknown' && ctx.runtime !== ctx.language) {
    parts.push(ctx.runtime === 'Node.js' && ctx.nodeVersion ? `Node.js ${ctx.nodeVersion}` : ctx.runtime);
  }
  if (ctx.hasNodeManifest) parts.push(`${ctx.packageManager} package manager`);
  if (ctx.version) parts.push(`v${ctx.version}`);
  return parts.join(' · ');
}

/**
 * Author a minimal, standard-conformant AGENTS.md from a RepoContext.
 *
 * A section is emitted only when detection produced content for it — a line
 * earns its place only if it resolves real ambiguity or caches expensive
 * exploration. The result is the managed block body (banner + sections); the
 * surrounding markers are added by the injector.
 */
export function authorAgentsMd(ctx: RepoContext, now: Date = new Date()): string {
  const lines: string[] = [];
  const push = (s = ''): void => { lines.push(s); };

  // Classify detected commands (a key is counted once, in this order).
  const entries = Object.entries(ctx.commands).filter(([, v]) => v && v.trim());
  const testCmds = entries.filter(([k]) => /test/i.test(k));
  // lint + typecheck (+ other *check*) — verify bar, not setup
  const lintCmds = entries.filter(([k]) => /lint|check/i.test(k) && !/test/i.test(k));
  const setupCmds = entries.filter(([k]) => !/test|lint|check/i.test(k));
  // The guardrail names the plain `test` script when there is one.
  const testCmd = (testCmds.find(([k]) => k === 'test') ?? testCmds[0])?.[1];
  const buildCmd = setupCmds.find(([k]) => isBuildScript(k))?.[1];
  // Full verify list for "Run the tests" (tests first, then lint/typecheck)
  const verifyCmds = [...testCmds, ...lintCmds];

  // ── Header + orientation ────────────────────────────────────────────────
  push(banner(now));
  push();
  push(`# AGENTS.md — ${ctx.name}`);
  push();
  if (ctx.description) {
    // Plain text: a description that starts like markup (`#`, `<`, `-`) mustn't become it.
    push(/^[#<>\-*+|]/.test(ctx.description) ? `\\${ctx.description}` : ctx.description);
    push();
  }
  const orientation = orientationLine(ctx);
  if (orientation) {
    push(orientation);
    push();
  }
  push(authoredLine(now));
  push();

  // §2 Setup & build
  const setupLines: string[] = [];
  const install = installCommand(ctx);
  if (install) setupLines.push(`${install}    # install dependencies`);
  for (const [k, v] of setupCmds) setupLines.push(`${v}    # ${k}`);
  if (setupLines.length) {
    push('## Setup & build');
    push();
    push('```bash');
    for (const l of setupLines) push(l);
    push('```');
    push();
  }

  // §3 Run the tests — verify bar: tests + lint/typecheck when detected
  if (verifyCmds.length) {
    push('## Run the tests');
    push();
    push('```bash');
    for (const [, v] of verifyCmds) push(v);
    push('```');
    push();
  }

  // §3b Before a release — the gate the manifest declares
  const release = ctx.release;
  if (release?.scripts.length) {
    push('## Before a release');
    push();
    const names = release.scripts.map((r) => `\`${r.name}\``).join(', then ');
    push(release.kind === 'publish'
      ? `\`npm publish\` runs ${names} first:`
      : 'The `release` script runs:');
    push();
    push('```bash');
    for (const r of release.scripts) {
      if (release.scripts.length > 1) push(`# ${r.name}`);
      push(r.command);
    }
    push('```');
    push();
  }

  // §3c CI — what the checks on a change run, so CI-only checks aren't a surprise.
  // Workflows that don't check changes (release, schedule, manual, bots) are
  // named, not copied: an agent verifying a change has no business running them.
  const allCi = ctx.ci ?? [];
  if (allCi.length) {
    const byFile = new Map(allCi.map((wf) => [wf.file, wf]));
    const checks = allCi.filter((wf) => wf.checksChanges && !wf.unreadable && runsSomething(wf)).sort(byRank);
    const label = (wf: DetectedWorkflow): string =>
      `\`${wf.file}\`${wf.unreadable ? ' (not valid YAML)' : wf.on.length ? ` (on ${wf.on.join(', ')})` : ''}`;
    push('## CI');
    push();
    let used = 0;
    const named: DetectedWorkflow[] = [];
    for (const wf of checks) {
      const left = CI_BUDGET - used - 2;
      if (used > 0 && left < CI_MIN_BLOCK) { named.push(wf); continue; }
      const block = workflowLines(wf, byFile, used === 0 ? CI_BUDGET - 2 : left);
      push(label(wf));
      push();
      for (const l of block) push(l);
      push();
      used += block.length + 2;
    }
    // Everything else, by name: overflow first, then the rest (a reusable workflow
    // shown under its caller isn't named again).
    const shown = new Set(checks.filter((wf) => !named.includes(wf)));
    const expanded = new Set([...shown].flatMap((wf) => wf.jobs.map((j) => j.calls).filter((c): c is string => !!c)));
    const rest = [...named, ...allCi.filter((wf) => !shown.has(wf) && !named.includes(wf) && !(expanded.has(wf.file) && !wf.checksChanges))];
    if (rest.length) {
      const list = rest.slice(0, ALSO_MAX).map(label);
      const more = rest.length - list.length;
      push(`Also: ${list.join(' · ')}${more ? ` · and ${more} more in \`.github/workflows/\`` : ''}.`);
      push();
    }
  }

  // §4 Where things live — folders and entry points, each with what the repo says it is
  // (A hand-built context without `layout` keeps the older flat list of key files.)
  const { folders, entries: entryPoints } = ctx.layout
    ?? { folders: [], entries: ctx.keyFiles.map((path) => ({ path, note: null })) };
  if (folders.length || entryPoints.length) {
    push('## Where things live');
    push();
    for (const f of folders) push(f.note ? `- \`${f.path}\` — ${f.note}` : `- \`${f.path}\``);
    if (entryPoints.length) {
      if (folders.length) push();
      push('Entry points:');
      push();
      for (const e of entryPoints) push(e.note ? `- \`${e.path}\` — ${e.note}` : `- \`${e.path}\``);
    }
    push();
  }

  // §5 Conventions
  if (ctx.conventions.length) {
    push('## Conventions');
    push();
    for (const c of ctx.conventions) push(`- ${c}`);
    push();
  }

  // §6 Guardrails — three tiers, derived from detection where possible
  const always = ['read files'];
  if (testCmd) always.push(`run the tests (\`${testCmd}\`)`);
  if (buildCmd) always.push('build the project');
  const never = ['force-push'];
  if (ctx.isGitRepo) never.push('push to the default branch');
  never.push('commit secrets');
  if (ctx.secrets) never.push(`commit \`${ctx.secrets.secrets}\``);
  push('## Guardrails');
  push();
  push(`- **Always OK:** ${always.join(', ')}.`);
  push('- **Ask first:** dependency installs, deletions, migrations / schema changes.');
  push(`- **Never:** ${never.join(', ')}.`);
  push();

  // §7 Definition of Done — composed from detected lint + test commands
  const dod: string[] = [];
  for (const [k, v] of lintCmds) if (isGateScript(k)) dod.push(`\`${v}\` exits 0`);
  for (const [k, v] of testCmds) if (isGateScript(k)) dod.push(`\`${v}\` passes`);
  dod.push('committed with a clear message');
  push('## Definition of Done');
  push();
  push(`Done when: ${[...new Set(dod)].join(' · ')}.`);
  push();

  // §8 Security & secrets — only when a secrets file was detected (location only)
  if (ctx.secrets) {
    push('## Security & secrets');
    push();
    const ex = ctx.secrets.example ? ` (see \`${ctx.secrets.example}\`)` : '';
    push(`- Secrets live in \`${ctx.secrets.secrets}\`${ex}. Never read or commit them.`);
    push();
  }

  // §9 Commit & PR — a sane static default (a repo without git has no PRs)
  if (ctx.isGitRepo || ctx.contributing) {
    push('## Commit & PR');
    push();
    if (ctx.contributing) {
      const secs = ctx.contributing.sections;
      const covers = secs.length ? ` (${secs.slice(0, 6).join(' · ')}${secs.length > 6 ? ' · …' : ''})` : '';
      push(`- Follow \`${ctx.contributing.file}\`${covers}.`);
    }
    if (ctx.isGitRepo) {
      push('- Write a clear, descriptive commit message.');
      push('- Branch off the default branch; never commit to it directly — open a PR for review.');
      push('- If build/test scripts or layout change, refresh this file in the **same PR** (`npx agents-md-facts`).');
    }
    push();
  }

  return lines.join('\n').trimEnd();
}
