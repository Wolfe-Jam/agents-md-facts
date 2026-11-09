<!-- agents:from-facts:start -->
<!-- authored by agents-md-facts — from your repo's facts, never guessed · re-run to refresh · keep the start/end markers · authored: 2026-11-09T22:10:50.971Z -->

# AGENTS.md — agents-md-facts

Honest to a fault — a minimal AGENTS.md, authored from your repo's facts, never guessed.

TypeScript · CLI · Node.js >=18 · bun package manager · v0.1.0

*Authored: 2026-11-09*

## Setup & build

```bash
bun install    # install dependencies
bun run build    # build
bun run dev    # dev
```

## Run the tests

```bash
bun run test
bun run lint
bun run typecheck
```

## Before a release

`npm publish` runs `prepublishOnly` first:

```bash
bun run build
```

## CI

`.github/workflows/ci.yml` (on push, pull_request)

```bash
# job test · ubuntu-latest
bunx tsc --noEmit
bun run lint
bun test
bun run src/cli.ts --check
```

## Where things live

- `docs/` — docs
- `examples/` — examples
- `src/` — source, used by `bun run dev`, `bun run lint`
- `tests/` — tests

Entry points:

- `src/cli.ts` — the `agents-md-facts` command
- `src/index.ts` — library entry

## Conventions

- TypeScript strict mode (tsconfig.json)
- ESM modules (`type: module`)
- Style enforced by ESLint — obey the configs

## Guardrails

- **Always OK:** read files, run the tests (`bun run test`), build the project.
- **Ask first:** dependency installs, deletions, migrations / schema changes.
- **Never:** force-push, push to the default branch, commit secrets.

## Definition of Done

Done when: `bun run lint` exits 0 · `bun run typecheck` exits 0 · `bun run test` passes · committed with a clear message.

## Commit & PR

- Follow `CONTRIBUTING.md` (The governing filter · Develop · Test · Build · License).
- Write a clear, descriptive commit message.
- Branch off the default branch; never commit to it directly — open a PR for review.
- If build/test scripts or layout change, refresh this file in the **same PR** (`npx agents-md-facts`).
<!-- agents:from-facts:end -->
