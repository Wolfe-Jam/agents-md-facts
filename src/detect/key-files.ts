import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Detect a short list of important file paths — the "where things live" map.
 * Returns the subset of canonical entry points / manifests / configs that
 * actually exist, ordered by importance. Pure.
 */
export function detectKeyFiles(dir: string): string[] {
  const candidates = [
    // Manifests
    'package.json', 'Cargo.toml', 'pyproject.toml', 'go.mod',
    'build.zig', 'build.zig.zon',
    // Entry points (TS/JS)
    'src/index.ts', 'src/index.js', 'src/main.ts', 'src/cli.ts',
    // Common src layout (dirs — agents need the map, not only entry files)
    'src/detect/', 'src/commands/', 'src/core/', 'src/interop/',
    'src/author.ts', 'src/context.ts', 'src/inject.ts',
    // Entry points (Rust)
    'src/main.rs', 'src/lib.rs',
    // Entry points (Zig)
    'src/main.zig', 'src/root.zig',
    // Entry points (Python)
    'src/__init__.py', 'main.py', '__main__.py',
    // Entry points (Go)
    'main.go', 'cmd/main.go',
    // Tests / fixtures
    'tests/', 'test/', 'examples/',
    // Specs / docs (do not list AGENTS.md — circular: this file is the output)
    'README.md', 'SPECIFICATION.md', 'CHANGELOG.md',
    // Config
    'tsconfig.json', 'eslint.config.js', 'wrangler.toml', 'vercel.json',
  ];
  return candidates.filter((f) => {
    const p = join(dir, f.replace(/\/$/, ''));
    return existsSync(p);
  });
}
