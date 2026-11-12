/**
 * 0.2.1: unknown options stop the run, --version answers, and a Python repo's
 * title and version come from pyproject.toml.
 */
import { spawnSync } from 'bun';
import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { authorAgentsMd } from '../src/author.ts';
import { buildRepoContext } from '../src/context.ts';

const CLI = join(import.meta.dir, '..', 'src', 'cli.ts');
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function repo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'amf-021-'));
  dirs.push(dir);
  for (const [path, text] of Object.entries(files)) writeFileSync(join(dir, path), text);
  return dir;
}
function run(cwd: string, ...args: string[]): { code: number; out: string; err: string } {
  const r = spawnSync(['bun', 'run', CLI, ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  return { code: r.exitCode ?? 1, out: new TextDecoder().decode(r.stdout), err: new TextDecoder().decode(r.stderr) };
}
const author = (dir: string): string => authorAgentsMd(buildRepoContext(dir), new Date('2026-11-12T00:00:00Z'));
const PKG = JSON.stringify({ name: 'tmp', version: '1.0.0', scripts: { test: 'echo ok' } });

describe('options', () => {
  test('--version prints this package version and writes nothing', () => {
    const dir = repo({ 'package.json': PKG });
    const r = run(dir, '--version');
    const own = JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8')).version;
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe(own);
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(false);
  });

  test('a typo like --chek exits 2, names it, and writes nothing', () => {
    const dir = repo({ 'package.json': PKG });
    const r = run(dir, '--chek');
    expect(r.code).toBe(2);
    expect(r.err).toContain('Unknown option: --chek');
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(false);
  });

  test('an unknown option next to --check still stops the run', () => {
    const dir = repo({ 'package.json': PKG });
    expect(run(dir, '--check', '--verbose').code).toBe(2);
  });

  test('known options behave as before', () => {
    const dir = repo({ 'package.json': PKG });
    expect(run(dir, '--help').code).toBe(0);
    expect(run(dir, '--stdout').code).toBe(0);
    expect(run(dir, '--check').code).toBe(1); // no AGENTS.md yet
    expect(run(dir).code).toBe(0);
    expect(run(dir, '--check').code).toBe(0);
  });
});

describe('Python title and version', () => {
  test('[project] name and version head the block', () => {
    const md = author(repo({ 'pyproject.toml': '[project]\nname = "tally"\nversion = "1.2.0"\n' }));
    expect(md).toContain('# AGENTS.md — tally');
    expect(md).toMatch(/· v1\.2\.0/);
  });

  test('[tool.poetry] when there is no [project] name', () => {
    const md = author(repo({ 'pyproject.toml': '[tool.poetry]\nname = "poet"\nversion = "0.3.1"\n' }));
    expect(md).toContain('# AGENTS.md — poet');
    expect(md).toMatch(/· v0\.3\.1/);
  });

  test('a dynamic version shows no version; the name still comes from the file', () => {
    const md = author(repo({ 'pyproject.toml': '[project]\nname = "dyn"\ndynamic = ["version"]\n' }));
    expect(md).toContain('# AGENTS.md — dyn');
    expect(md).not.toMatch(/· v\d/);
  });

  test('a version in another table is not read as the project version', () => {
    const md = author(repo({ 'pyproject.toml': '[project]\nname = "only"\n\n[tool.other]\nversion = "9.9.9"\n' }));
    expect(md).not.toContain('9.9.9');
  });

  test('package.json still wins when both exist', () => {
    const md = author(repo({ 'package.json': PKG, 'pyproject.toml': '[project]\nname = "py"\nversion = "2.0.0"\n' }));
    expect(md).toContain('# AGENTS.md — tmp');
    expect(md).not.toContain('2.0.0');
  });

  test('no pyproject.toml and no package.json: the folder name, as before', () => {
    const dir = repo({ 'README.md': '# x\n' });
    expect(author(dir)).toContain(`# AGENTS.md — ${dir.split(/[\\/]/).pop()}`);
  });
});
