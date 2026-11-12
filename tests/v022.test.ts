/** 0.2.2: a Rust repo's title and version come from Cargo.toml's [package]. */
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { authorAgentsMd } from '../src/author.ts';
import { buildRepoContext } from '../src/context.ts';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function repo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'amf-022-'));
  dirs.push(dir);
  for (const [path, text] of Object.entries(files)) writeFileSync(join(dir, path), text);
  return dir;
}
const author = (dir: string): string => authorAgentsMd(buildRepoContext(dir), new Date('2026-11-12T00:00:00Z'));

describe('Rust title and version', () => {
  test('[package] name and version head the block', () => {
    const md = author(repo({ 'Cargo.toml': '[package]\nname = "crabby"\nversion = "0.4.2"\nedition = "2021"\n' }));
    expect(md).toContain('# AGENTS.md — crabby');
    expect(md).toMatch(/· v0\.4\.2/);
  });

  test('a virtual workspace (no [package]) keeps the folder name and no version', () => {
    const dir = repo({ 'Cargo.toml': '[workspace]\nmembers = ["a"]\n\n[workspace.package]\nversion = "1.0.0"\n' });
    const md = author(dir);
    expect(md).toContain(`# AGENTS.md — ${dir.split(/[\\/]/).pop()}`);
    expect(md).not.toContain('1.0.0');
  });

  test('version.workspace = true shows no version; the name still comes from [package]', () => {
    const md = author(repo({ 'Cargo.toml': '[package]\nname = "member"\nversion.workspace = true\n' }));
    expect(md).toContain('# AGENTS.md — member');
    expect(md).not.toMatch(/· v\d/);
  });

  test('a version in [dependencies] is not read as the crate version', () => {
    const md = author(repo({ 'Cargo.toml': '[package]\nname = "dep"\n\n[dependencies]\nversion = "9.9.9"\n' }));
    expect(md).not.toContain('9.9.9');
  });

  test('package.json and pyproject.toml still win', () => {
    const cargo = '[package]\nname = "crate"\nversion = "3.0.0"\n';
    const withPkg = author(repo({ 'Cargo.toml': cargo, 'package.json': JSON.stringify({ name: 'js', version: '1.0.0' }) }));
    expect(withPkg).toContain('# AGENTS.md — js');
    const withPy = author(repo({ 'Cargo.toml': cargo, 'pyproject.toml': '[project]\nname = "py"\n' }));
    expect(withPy).toContain('# AGENTS.md — py');
    expect(withPy).not.toContain('3.0.0');
  });
});
