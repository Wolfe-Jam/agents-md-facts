import { existsSync } from 'fs';
import { join } from 'path';
import { readPackageJson, type PackageJson } from './pkg.js';
import { nodePackageManager } from './commands.js';

/** Detect the primary language of a project. Pure. */
export function detectLanguage(dir: string): string {
  const pkg = readPackageJson(dir);

  // TypeScript
  if (pkg?.devDependencies?.typescript || pkg?.dependencies?.typescript) return 'TypeScript';
  if (existsSync(join(dir, 'tsconfig.json'))) return 'TypeScript';

  // Common language indicators
  if (existsSync(join(dir, 'Cargo.toml'))) return 'Rust';
  if (existsSync(join(dir, 'go.mod'))) return 'Go';
  if (existsSync(join(dir, 'pyproject.toml')) || existsSync(join(dir, 'setup.py'))) return 'Python';
  if (existsSync(join(dir, 'Gemfile'))) return 'Ruby';
  if (existsSync(join(dir, 'pom.xml')) || existsSync(join(dir, 'build.gradle'))) return 'Java';
  if (existsSync(join(dir, 'Package.swift'))) return 'Swift';
  if (existsSync(join(dir, 'build.zig'))) return 'Zig';
  if (existsSync(join(dir, 'pubspec.yaml'))) return 'Dart';

  // Fallback to JS if package.json exists
  if (pkg) return 'JavaScript';

  return 'Unknown';
}

/** Detect the runtime. Pure. */
export function detectRuntime(dir: string): string {
  if (existsSync(join(dir, 'bunfig.toml'))) return 'Bun';
  if (existsSync(join(dir, 'deno.json')) || existsSync(join(dir, 'deno.jsonc'))) return 'Deno';
  if (readPackageJson(dir)) return 'Node.js';
  if (existsSync(join(dir, 'Cargo.toml'))) return 'Rust';
  if (existsSync(join(dir, 'go.mod'))) return 'Go';
  if (existsSync(join(dir, 'pubspec.yaml'))) return 'Dart';
  return 'Unknown';
}

/**
 * Detect the package manager. A Node repo uses the same rule as its commands
 * (`packageManager` field, then lockfile); Dart's `pub` only when there is no
 * package.json. Pure.
 */
export function detectPackageManager(dir: string): string {
  const pkg = readPackageJson(dir);
  if (pkg) return nodePackageManager(dir, pkg);
  if (existsSync(join(dir, 'pubspec.yaml'))) return 'pub';
  return 'npm';
}

/**
 * A lightweight repo "kind" for the orientation line, from cheap manifest
 * signals only (no framework registry). MCP server when the SDK is declared
 * — checked before CLI, since an MCP server typically also ships a bin entry
 * and would otherwise be misclassified. CLI when a bin is declared; library
 * when there's a main/exports entry but no bin. Null when neither applies.
 */
export function detectKind(_dir: string, pkg: PackageJson | null): string | null {
  if (pkg?.dependencies?.['@modelcontextprotocol/sdk'] || pkg?.devDependencies?.['@modelcontextprotocol/sdk']) {
    return 'MCP server';
  }
  if (pkg?.bin) return 'CLI';
  if (pkg && (pkg.main || pkg.exports) && !pkg.bin) return 'library';
  return null;
}
