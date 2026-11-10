import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { PackageJson } from './pkg.js';

/**
 * Detect the toolchain that governs code conventions. Emits POINTERS ("obey the
 * configs"), never restated lint rules — restating toolchain-enforced rules is a
 * known AGENTS.md anti-pattern (toolchain-first). Pure.
 */
export function detectConventions(dir: string, pkg: PackageJson | null): string[] {
  const conv: string[] = [];
  const has = (f: string): boolean => existsSync(join(dir, f));
  const read = (f: string): string => {
    try {
      return readFileSync(join(dir, f), 'utf-8');
    } catch {
      return '';
    }
  };

  if (has('tsconfig.json') && /"strict"\s*:\s*true/.test(read('tsconfig.json'))) {
    conv.push('TypeScript strict mode (tsconfig.json)');
  }
  if (pkg?.type === 'module') conv.push('ESM modules (`type: module`)');

  const tools: string[] = [];
  const dev = pkg?.devDependencies ?? {};
  if (
    has('.eslintrc') || has('.eslintrc.json') || has('.eslintrc.cjs') ||
    has('eslint.config.js') || has('eslint.config.mjs') || 'eslint' in dev
  ) {
    tools.push('ESLint');
  }
  if (has('.prettierrc') || has('.prettierrc.json') || has('prettier.config.js') || 'prettier' in dev) {
    tools.push('Prettier');
  }
  const py = has('pyproject.toml') ? read('pyproject.toml') : '';
  if (/\[tool\.black\]/.test(py)) tools.push('black');
  if (/\[tool\.ruff\]/.test(py)) tools.push('ruff');
  if (/\[tool\.mypy\]/.test(py)) tools.push('mypy');
  if (has('rustfmt.toml') || has('.rustfmt.toml')) tools.push('rustfmt');
  if (tools.length) conv.push(`Style enforced by ${tools.join(' · ')} — obey the configs`);

  return conv;
}
