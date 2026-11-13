<!-- agents:from-facts:start -->
<!-- authored by agents-md-facts — from your repo's facts, never guessed · re-run to refresh · keep the start/end markers · authored: 2026-11-13T17:16:32.794Z -->

# AGENTS.md — agents-md-facts

Honest to a fault — a minimal AGENTS.md, authored from your repo's facts, never guessed.

TypeScript · CLI · Node.js >=18 · bun package manager · v0.2.2

*Authored: 2026-11-13*

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

The repo's own commands each check runs on a change; everything else is in the workflow files.

`.github/workflows/ci.yml` (on push, pull_request)

```bash
# job test · ubuntu-latest, windows-latest
bunx tsc --noEmit
bun run lint
bun test
# 2 other steps in the file
```

## Where things live

- `docs/`
- `examples/`
- `src/` — used by `bun run dev`
- `tests/`

Entry points:

- `dist/cli.js` — the `agents-md-facts` command (not in git; the build script is `bun run build`)
- `dist/index.js` — package entry (`exports`) (not in git; the build script is `bun run build`)

Key files:

- `package.json`
- `src/index.ts`
- `src/cli.ts`
- `src/detect/`
- `src/author.ts`
- `src/context.ts`
- `src/inject.ts`
- `README.md`
- `CHANGELOG.md`
- `tsconfig.json`
- `eslint.config.js`

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
