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
    // Entry points (Rust)
    'src/main.rs', 'src/lib.rs',
    // Entry points (Zig)
    'src/main.zig', 'src/root.zig',
    // Entry points (Python)
    'src/__init__.py', 'main.py', '__main__.py',
    // Entry points (Go)
    'main.go', 'cmd/main.go',
    // Specs / docs
    'README.md', 'SPECIFICATION.md',
    // Config
    'tsconfig.json', 'wrangler.toml', 'vercel.json',
  ];
  return candidates.filter(f => existsSync(join(dir, f)));
}
