import { describe, expect, test } from 'bun:test';
import { authorAgentsMd } from '../src/author.ts';
import type { RepoContext } from '../src/context.ts';
import type { DetectedSecrets } from '../src/detect/secrets.ts';

/** Base context with everything off; each test flips one detected fact. */
function base(overrides: Partial<RepoContext> = {}): RepoContext {
  return {
    dir: '/example',
    name: 'demo',
    language: 'TypeScript',
    runtime: 'Node.js',
    packageManager: 'npm',
    kind: null,
    hasNodeManifest: true,
    isGitRepo: false,
    commands: { test: 'npm run test' },
    keyFiles: ['package.json'],
    conventions: [],
    secrets: null,
    ...overrides,
  };
}

describe('detection-driven guardrails', () => {
  test('git present → "push to `main`" guardrail + Commit & PR section', () => {
    const md = authorAgentsMd(base({ isGitRepo: true }));
    expect(md).toContain('push to `main`');
    expect(md).toContain('## Commit & PR');
  });

  test('git absent → no "push to `main`", no Commit & PR', () => {
    const md = authorAgentsMd(base({ isGitRepo: false }));
    expect(md).not.toContain('push to `main`');
    expect(md).not.toContain('## Commit & PR');
  });

  test('.env present → "commit `.env`" guardrail + Security section', () => {
    const secrets: DetectedSecrets = { secrets: '.env' };
    const md = authorAgentsMd(base({ secrets }));
    expect(md).toContain('commit `.env`');
    expect(md).toContain('## Security & secrets');
  });

  test('.env absent → no "commit `.env`", no Security section', () => {
    const md = authorAgentsMd(base({ secrets: null }));
    expect(md).not.toContain('commit `.env`');
    expect(md).not.toContain('## Security & secrets');
  });

  test('both absent → neither detection-driven line appears', () => {
    const md = authorAgentsMd(base({ isGitRepo: false, secrets: null }));
    expect(md).not.toContain('push to `main`');
    expect(md).not.toContain('commit `.env`');
    // The static tiers still stand.
    expect(md).toContain('**Never:** force-push, commit secrets.');
  });
});
