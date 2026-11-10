import { describe, expect, test } from 'bun:test';
import { authorAgentsMd } from '../src/author.ts';
import type { RepoContext } from '../src/context.ts';

/** A fully-populated context that should exercise every section. */
function fullContext(): RepoContext {
  return {
    dir: '/example/demo',
    name: 'demo',
    language: 'TypeScript',
    runtime: 'Node.js',
    packageManager: 'bun',
    kind: 'CLI',
    hasNodeManifest: true,
    isGitRepo: true,
    commands: {
      build: 'bun run build',
      test: 'bun test',
      lint: 'bun run lint',
      dev: 'bun run dev',
    },
    keyFiles: ['package.json', 'src/cli.ts'],
    conventions: ['TypeScript strict mode (tsconfig.json)', 'ESM modules (`type: module`)'],
    secrets: { secrets: '.env', example: '.env.example' },
  };
}

describe('authorAgentsMd', () => {
  test('renders every section for a full context', () => {
    const md = authorAgentsMd(fullContext());
    expect(md).toContain('# AGENTS.md — demo');
    expect(md).toContain('## Setup & build');
    expect(md).toContain('## Run the tests');
    expect(md).toContain('## Where things live');
    expect(md).toContain('## Conventions');
    expect(md).toContain('## Guardrails');
    expect(md).toContain('## Definition of Done');
    expect(md).toContain('## Security & secrets');
    expect(md).toContain('## Commit & PR');
  });

  test('all three guardrail tiers are present', () => {
    const md = authorAgentsMd(fullContext());
    expect(md).toContain('**Always OK:**');
    expect(md).toContain('**Ask first:**');
    expect(md).toContain('**Never:**');
  });

  test('install command follows the detected package manager', () => {
    const md = authorAgentsMd(fullContext());
    expect(md).toContain('bun install    # install dependencies');
  });

  test('orientation line reflects detected facts', () => {
    const md = authorAgentsMd(fullContext());
    expect(md).toContain('TypeScript · CLI · Node.js · bun package manager');
  });

  test('secrets section names location and example, never values', () => {
    const md = authorAgentsMd(fullContext());
    expect(md).toContain('Secrets live in `.env` (see `.env.example`)');
    expect(md).toContain('Never read or commit them.');
  });

  test('the banner does not contain "generate"', () => {
    const md = authorAgentsMd(fullContext());
    const banner = md.split('\n').find((l) => l.includes('authored by agents-md-facts')) ?? '';
    expect(banner).not.toMatch(/generat/i);
    expect(banner).toContain('authored');
  });

  test('a minimal context omits sections with no detected content', () => {
    const md = authorAgentsMd({
      dir: '/example/bare',
      name: 'bare',
      language: 'Unknown',
      runtime: 'Unknown',
      packageManager: 'npm',
      kind: null,
      hasNodeManifest: false,
      isGitRepo: false,
      commands: {},
      keyFiles: [],
      conventions: [],
      secrets: null,
    });
    expect(md).not.toContain('## Setup & build');
    expect(md).not.toContain('## Run the tests');
    expect(md).not.toContain('## Where things live');
    expect(md).not.toContain('## Conventions');
    expect(md).not.toContain('## Security & secrets');
    expect(md).not.toContain('## Commit & PR');
    // Guardrails + Definition of Done are always present.
    expect(md).toContain('## Guardrails');
    expect(md).toContain('## Definition of Done');
  });
});
