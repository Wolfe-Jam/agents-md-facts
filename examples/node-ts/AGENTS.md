<!-- agents:from-facts:start -->
<!-- authored by agents-md-facts — from your repo's facts, never guessed · re-run to refresh · authored: 2026-08-20T03:08:41.941Z -->

# AGENTS.md — node-ts-example

TypeScript · Node.js · npm package manager · v1.0.0

*Authored: 2026-08-20*

## Setup & build

```bash
npm install    # install dependencies
npm run build    # build
npm run dev    # dev
```

## Run the tests

```bash
npm run test
npm run lint
```

## Where things live

- `package.json`
- `src/index.ts`
- `tsconfig.json`

## Conventions

- TypeScript strict mode (tsconfig.json)
- ESM modules (`type: module`)
- Style enforced by ESLint · Prettier — obey the configs

## Guardrails

- **Always OK:** read files, run the tests (`npm run test`), build the project.
- **Ask first:** dependency installs, deletions, migrations / schema changes.
- **Never:** force-push, commit secrets.

## Definition of Done

Done when: `npm run lint` exits 0 · `npm run test` passes · committed with a clear message.
<!-- agents:from-facts:end -->
