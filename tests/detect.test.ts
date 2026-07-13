import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readPackageJson } from '../src/detect/pkg.ts';
import { detectCommands } from '../src/detect/commands.ts';
import { detectKeyFiles } from '../src/detect/key-files.ts';
import { detectConventions } from '../src/detect/conventions.ts';
import { detectSecrets } from '../src/detect/secrets.ts';
import {
  detectKind,
  detectLanguage,
  detectPackageManager,
  detectRuntime,
} from '../src/detect/orientation.ts';

const EX = join(import.meta.dir, '..', 'examples');
const nodeTs = join(EX, 'node-ts');
const python = join(EX, 'python');
const rust = join(EX, 'rust');
const go = join(EX, 'go');

describe('commands', () => {
  test('node-ts → npm run scripts', () => {
    expect(detectCommands(nodeTs, readPackageJson(nodeTs))).toEqual({
      build: 'npm run build',
      test: 'npm run test',
      lint: 'npm run lint',
      dev: 'npm run dev',
    });
  });

  test('python → pytest', () => {
    expect(detectCommands(python, null)).toEqual({ test: 'pytest' });
  });

  test('rust → cargo defaults', () => {
    expect(detectCommands(rust, null)).toEqual({
      build: 'cargo build --release',
      test: 'cargo test',
      lint: 'cargo clippy',
    });
  });

  test('go → go defaults', () => {
    expect(detectCommands(go, null)).toEqual({
      build: 'go build ./...',
      test: 'go test ./...',
    });
  });
});

describe('key-files', () => {
  test('node-ts', () => {
    expect(detectKeyFiles(nodeTs)).toEqual(['package.json', 'src/index.ts', 'tsconfig.json']);
  });
  test('python', () => {
    expect(detectKeyFiles(python)).toEqual(['pyproject.toml', 'main.py']);
  });
  test('rust', () => {
    expect(detectKeyFiles(rust)).toEqual(['Cargo.toml', 'src/main.rs']);
  });
  test('go', () => {
    expect(detectKeyFiles(go)).toEqual(['go.mod', 'main.go']);
  });
});

describe('conventions', () => {
  test('node-ts → strict + ESM + ESLint/Prettier', () => {
    expect(detectConventions(nodeTs, readPackageJson(nodeTs))).toEqual([
      'TypeScript strict mode (tsconfig.json)',
      'ESM modules (`type: module`)',
      'Style enforced by ESLint · Prettier — obey the configs',
    ]);
  });
  test('python → black · ruff · mypy', () => {
    expect(detectConventions(python, null)).toEqual([
      'Style enforced by black · ruff · mypy — obey the configs',
    ]);
  });
  test('rust → rustfmt', () => {
    expect(detectConventions(rust, null)).toEqual([
      'Style enforced by rustfmt — obey the configs',
    ]);
  });
  test('go → none', () => {
    expect(detectConventions(go, null)).toEqual([]);
  });
});

describe('secrets', () => {
  test('node-ts has only .env.example → no secrets file detected', () => {
    expect(detectSecrets(nodeTs)).toBeNull();
  });

  test('.env + .env.example → location + example', () => {
    const dir = mkdtempSync(join(tmpdir(), 'amf-secrets-'));
    try {
      writeFileSync(join(dir, '.env'), 'TOKEN=xyz\n');
      writeFileSync(join(dir, '.env.example'), 'TOKEN=\n');
      expect(detectSecrets(dir)).toEqual({ secrets: '.env', example: '.env.example' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('.env only → location, no example', () => {
    const dir = mkdtempSync(join(tmpdir(), 'amf-secrets-'));
    try {
      writeFileSync(join(dir, '.env'), 'TOKEN=xyz\n');
      expect(detectSecrets(dir)).toEqual({ secrets: '.env' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('orientation', () => {
  test('node-ts', () => {
    expect(detectLanguage(nodeTs)).toBe('TypeScript');
    expect(detectRuntime(nodeTs)).toBe('Node.js');
    expect(detectPackageManager(nodeTs)).toBe('npm');
    expect(detectKind(nodeTs, readPackageJson(nodeTs))).toBeNull();
  });
  test('python', () => {
    expect(detectLanguage(python)).toBe('Python');
    expect(detectRuntime(python)).toBe('Unknown');
  });
  test('rust', () => {
    expect(detectLanguage(rust)).toBe('Rust');
    expect(detectRuntime(rust)).toBe('Rust');
  });
  test('go', () => {
    expect(detectLanguage(go)).toBe('Go');
    expect(detectRuntime(go)).toBe('Go');
  });
});
