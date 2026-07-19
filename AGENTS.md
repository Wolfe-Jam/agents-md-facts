<!-- agents:from-facts:start -->
<!-- authored by agents-md-facts — from your repo's facts, never guessed · re-run to refresh -->

# AGENTS.md — agents-md-facts

TypeScript · CLI · Node.js · bun package manager · v0.1.0

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

## Where things live

- `package.json`
- `src/index.ts`
- `src/cli.ts`
- `src/detect/`
- `src/author.ts`
- `src/context.ts`
- `src/inject.ts`
- `tests/`
- `examples/`
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
- **Never:** force-push, push to `main`, commit secrets.

## Definition of Done

Done when: `bun run lint` exits 0 · `bun run typecheck` exits 0 · `bun run test` passes · committed with a clear message.

## Commit & PR

- Write a clear, descriptive commit message.
- Branch off `main`; never commit to `main` directly — open a PR for review.
- If build/test scripts or layout change, refresh this file in the **same PR** (`npx agents-md-facts`).
<!-- agents:from-facts:end -->
