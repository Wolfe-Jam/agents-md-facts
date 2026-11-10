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

describe('the Block is facts only', () => {
  test('git present → no commit or branch rules (instructions live outside the Block)', () => {
    const md = authorAgentsMd(base({ isGitRepo: true }));
    expect(md).not.toContain('push to the default branch');
    expect(md).not.toContain('## Commit & PR');
    expect(md).not.toContain('## Guardrails');
  });

  test('.env present → a Secrets fact naming the file, no advice', () => {
    const secrets: DetectedSecrets = { secrets: '.env' };
    const md = authorAgentsMd(base({ secrets }));
    expect(md).toContain('## Secrets\n\n- `.env`');
    expect(md.split('\n').slice(1).join('\n')).not.toMatch(/never|don't|do not/i);
  });

  test('.env absent → no Secrets section', () => {
    expect(authorAgentsMd(base({ secrets: null }))).not.toContain('## Secrets');
  });
});
