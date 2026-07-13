import { existsSync } from 'fs';
import { join } from 'path';
import type { PackageJson } from './pkg.js';

/**
 * Detect build/test/lint/dev/start commands from the repo.
 *
 * Reads package.json scripts first (most reliable), then falls back to the
 * canonical defaults of whatever toolchain manifest is present (Cargo, Zig,
 * Go, Python). Returns a map of command name → shell command. Pure.
 */
export function detectCommands(dir: string, pkg: PackageJson | null): Record<string, string> {
  const commands: Record<string, string> = {};

  // From package.json scripts (most reliable)
  if (pkg?.scripts) {
    for (const key of ['build', 'test', 'lint', 'dev', 'start']) {
      if (pkg.scripts[key]) {
        // Determine the runner — prefer bun if a bun lockfile is present, else npm
        const runner = existsSync(join(dir, 'bun.lock')) || existsSync(join(dir, 'bun.lockb'))
          ? 'bun run'
          : 'npm run';
        commands[key] = `${runner} ${key}`;
      }
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

  // Python defaults (if pytest is detectable)
  if (existsSync(join(dir, 'pyproject.toml')) || existsSync(join(dir, 'pytest.ini'))) {
    if (!commands.test) commands.test = 'pytest';
  }

  return commands;
}
