import type { RepoContext } from './context.js';

/**
 * The banner written at the top of the managed block. It says what authored the
 * file and how it stays true — from facts, never guessed. Carries the precise
 * ISO authoring timestamp for `--check` (or any tool) to parse mechanically.
 * Excluded from the `--check` equality diff — see `stripVolatile` in cli.ts.
 */
function banner(now: Date): string {
  return `<!-- authored by agents-md-facts — from your repo's facts, never guessed · re-run to refresh · authored: ${now.toISOString()} -->`;
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
  if (ctx.runtime !== 'Unknown' && ctx.runtime !== ctx.language) parts.push(ctx.runtime);
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
  const testCmd = testCmds[0]?.[1];
  const buildCmd = setupCmds.find(([k]) => k === 'build')?.[1];
  // Full verify list for "Run the tests" (tests first, then lint/typecheck)
  const verifyCmds = [...testCmds, ...lintCmds];

  // ── Header + orientation ────────────────────────────────────────────────
  push(banner(now));
  push();
  push(`# AGENTS.md — ${ctx.name}`);
  push();
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

  // §4 Where things live
  if (ctx.keyFiles.length) {
    push('## Where things live');
    push();
    for (const f of ctx.keyFiles) push(`- \`${f}\``);
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
  if (ctx.isGitRepo) never.push('push to `main`');
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
  for (const [, v] of lintCmds) dod.push(`\`${v}\` exits 0`);
  for (const [, v] of testCmds) dod.push(`\`${v}\` passes`);
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
  if (ctx.isGitRepo) {
    push('## Commit & PR');
    push();
    push('- Write a clear, descriptive commit message.');
    push('- Branch off `main`; never commit to `main` directly — open a PR for review.');
    push('- If build/test scripts or layout change, refresh this file in the **same PR** (`npx agents-md-facts`).');
    push();
  }

  return lines.join('\n').trimEnd();
}
