import { spawnSync } from 'bun';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const CLI = join(import.meta.dir, '..', 'src', 'cli.ts');

interface Run {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCli(cwd: string, ...args: string[]): Run {
  const res = spawnSync(['bun', 'run', CLI, ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  return {
    exitCode: res.exitCode ?? 1,
    stdout: new TextDecoder().decode(res.stdout),
    stderr: new TextDecoder().decode(res.stderr),
  };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'amf-cli-'));
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'tmp-cli', version: '1.0.0', scripts: { test: 'echo ok' } }, null, 2),
  );
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('cli', () => {
  test('default → authors AGENTS.md and exits 0', () => {
    const r = runCli(dir);
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(true);
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf-8')).toContain('# AGENTS.md — tmp-cli');
  });

  test('--check is idempotent: fresh authored file → exit 0', () => {
    runCli(dir); // author
    const r = runCli(dir, '--check');
    expect(r.exitCode).toBe(0);
  });

  test('--check → exit 1 when AGENTS.md is missing', () => {
    const r = runCli(dir, '--check');
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/missing|no agents-md-facts block/i);
  });

  test('--check → exit 1 when the file is stale (facts moved)', () => {
    runCli(dir); // author against current facts
    // The code moves: add a strict tsconfig → new language/convention/key file.
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true } }));
    const r = runCli(dir, '--check');
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/stale/i);
  });

  test('--stdout → emits the wrapped block and writes nothing', () => {
    const r = runCli(dir, '--stdout');
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('<!-- agents:from-facts:start -->');
    expect(r.stdout).toContain('<!-- agents:from-facts:end -->');
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(false);
  });

  test('default re-run skips the write when facts are unchanged', () => {
    const first = runCli(dir);
    expect(first.exitCode).toBe(0);
    expect(first.stderr).toMatch(/authored from facts/);
    const before = readFileSync(join(dir, 'AGENTS.md'), 'utf-8');
    const second = runCli(dir);
    expect(second.exitCode).toBe(0);
    expect(second.stderr).toMatch(/write skipped/);
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf-8')).toBe(before);
  });

  test('default re-run still writes when facts moved', () => {
    runCli(dir);
    const before = readFileSync(join(dir, 'AGENTS.md'), 'utf-8');
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true } }));
    const r = runCli(dir);
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toMatch(/authored from facts/);
    const after = readFileSync(join(dir, 'AGENTS.md'), 'utf-8');
    expect(after).not.toBe(before);
    expect(after).toContain('TypeScript strict mode');
  });

  test('default is non-destructive: hand-written content is preserved on re-run', () => {
    runCli(dir); // author
    const authored = readFileSync(join(dir, 'AGENTS.md'), 'utf-8');
    writeFileSync(join(dir, 'AGENTS.md'), `# Human preamble\nkeep me.\n\n${authored}\n## Human appendix\nkeep me too.\n`);
    runCli(dir); // re-run
    const out = readFileSync(join(dir, 'AGENTS.md'), 'utf-8');
    expect(out).toContain('# Human preamble');
    expect(out).toContain('## Human appendix');
    expect(out).toContain('# AGENTS.md — tmp-cli');
  });

  test('--help prints usage and never says "generate"', () => {
    const r = runCli(dir, '--help');
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('Usage:');
    expect(r.stdout).not.toMatch(/generat/i);
  });

  test('no user-facing output ever says "generate"', () => {
    const authored = runCli(dir);
    const skipped = runCli(dir);
    const stdout = runCli(dir, '--stdout');
    for (const r of [authored, skipped, stdout]) {
      expect(r.stdout).not.toMatch(/generat/i);
      expect(r.stderr).not.toMatch(/generat/i);
    }
  });
});
