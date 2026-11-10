import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { PackageJson } from './pkg.js';

/**
 * The scripts an agent runs to build, verify and develop, by role. A script is
 * picked by its name, so a renamed one (`compile` for `build`) is still found.
 * Order: build, test, lint/typecheck, dev — then package.json order within a role.
 */
const ROLES: RegExp[] = [
  /^(build|compile|bundle)$/,
  /^test(:.+)?$/,
  /^(lint(:.+)?|typecheck|type-check|check-types|format:check|check)$/,
  /^(dev|start|serve)$/,
];

/**
 * Variants that never exit or that change files (`test:watch`, `lint:fix`):
 * scripts a developer runs, never a check an agent should wait on.
 */
const NOT_A_CHECK = /:(watch|fix|ui|dev|update|debug|open|serve)([:-]|$)/;

/**
 * The checks the Definition of Done names: the plain `test`, `lint` and
 * typecheck scripts. Other `test:*` scripts are listed to run, not required:
 * the repo doesn't say they must pass.
 */
export function isGateScript(name: string): boolean {
  return /^(test|lint|typecheck|type-check|check-types|check)$/.test(name);
}

/** True for a script name that plays the build role (`build`, `compile`, `bundle`). */
export function isBuildScript(name: string): boolean {
  return /^(build|compile|bundle)$/.test(name);
}

/**
 * How this repo runs a package.json script, in its own package manager's
 * spelling: `npm test` and `npm start` (npm's own shorthands), `npm run x`
 * otherwise; `bun run x` (bare `bun test` runs Bun's test runner, not the
 * script); `pnpm` and `yarn` the same as npm.
 */
export function scriptCommand(pm: string, name: string): string {
  const short = name === 'test' || name === 'start';
  switch (pm) {
    case 'bun': return `bun run ${name}`;
    case 'pnpm': return short ? `pnpm ${name}` : `pnpm run ${name}`;
    case 'yarn': return short ? `yarn ${name}` : `yarn run ${name}`;
    default: return short ? `npm ${name}` : `npm run ${name}`;
  }
}

/**
 * The package manager a Node repo uses: the one package.json declares in
 * `packageManager` (e.g. `pnpm@9.1.0`), else the one its lockfile shows, else npm.
 */
export function nodePackageManager(dir: string, pkg?: PackageJson | null): string {
  const declared = typeof pkg?.packageManager === 'string' ? /^(npm|pnpm|yarn|bun)@/.exec(pkg.packageManager)?.[1] : undefined;
  if (declared) return declared;
  if (existsSync(join(dir, 'bun.lock')) || existsSync(join(dir, 'bun.lockb'))) return 'bun';
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(dir, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

/**
 * Detect build/test/lint/dev commands from the repo.
 *
 * Reads package.json scripts first (most reliable), then falls back to the
 * canonical defaults of whatever toolchain manifest is present (Cargo, Zig,
 * Go, Python). Returns a map of command name → shell command. Pure.
 */
export function detectCommands(dir: string, pkg: PackageJson | null): Record<string, string> {
  const commands: Record<string, string> = {};

  // From package.json scripts (most reliable)
  if (pkg?.scripts) {
    const pm = nodePackageManager(dir, pkg);
    const names = Object.keys(pkg.scripts)
      // By name only: what a script's command does isn't judged.
      .filter((k) => {
        const cmd = pkg.scripts?.[k];
        return typeof cmd === 'string' && cmd.trim() !== '' && !NOT_A_CHECK.test(k);
      });
    for (const role of ROLES) {
      for (const k of names) if (role.test(k)) commands[k] = scriptCommand(pm, k);
    }
  }

  // Cargo defaults (Rust)
  if (existsSync(join(dir, 'Cargo.toml'))) {
    if (!commands.build) commands.build = 'cargo build --release';
    if (!commands.test) commands.test = 'cargo test';
    if (!commands.lint) commands.lint = 'cargo clippy';
  }

  // Zig defaults
  if (existsSync(join(dir, 'build.zig'))) {
    if (!commands.build) commands.build = 'zig build';
    if (!commands.test) commands.test = 'zig build test';
  }

  // Go defaults
  if (existsSync(join(dir, 'go.mod'))) {
    if (!commands.build) commands.build = 'go build ./...';
    if (!commands.test) commands.test = 'go test ./...';
  }

  // Python: pytest, plus the checkers the repo configures; through uv or Poetry when it locks with one.
  const pyproject = existsSync(join(dir, 'pyproject.toml'));
  if (pyproject || existsSync(join(dir, 'pytest.ini'))) {
    let py = '';
    try { py = pyproject ? readFileSync(join(dir, 'pyproject.toml'), 'utf-8') : ''; } catch { /* unreadable: no tool tables */ }
    const runner = existsSync(join(dir, 'uv.lock')) ? 'uv run ' : existsSync(join(dir, 'poetry.lock')) ? 'poetry run ' : '';
    const has = (table: string, ...files: string[]): boolean =>
      new RegExp(`^\\[tool\\.${table}[\\].]`, 'm').test(py) || files.some((f) => existsSync(join(dir, f)));
    // The install a locked project needs (a package.json repo shows its own above).
    if (!pkg && runner === 'uv run ') commands.install = 'uv sync';
    if (!pkg && runner === 'poetry run ') commands.install = 'poetry install';
    if (!commands.test) commands.test = `${runner}pytest`;
    if (!commands.lint && has('ruff', 'ruff.toml', '.ruff.toml')) commands.lint = `${runner}ruff check .`;
    if (!commands.typecheck && has('mypy', 'mypy.ini', '.mypy.ini')) commands.typecheck = `${runner}mypy .`;
    if (!commands['format:check'] && has('black')) commands['format:check'] = `${runner}black --check .`;
  }

  return commands;
}
