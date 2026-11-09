<!-- agents:from-facts:start -->
<!-- authored by agents-md-facts — from your repo's facts, never guessed · re-run to refresh · keep the start/end markers · authored: 2026-11-09T21:13:53.885Z -->

# AGENTS.md — node-ts-example

A tiny TypeScript + Node fixture for agents-md-facts.

TypeScript · Node.js · npm package manager · v1.0.0

*Authored: 2026-11-09*

## Setup & build

```bash
npm install    # install dependencies
npm run build    # build
npm run dev    # dev
```

## Run the tests

```bash
npm test
npm run lint
```

## Where things live

- `src/` — source, used by `npm run dev`

Entry points:

- `src/index.ts`

## Conventions

- TypeScript strict mode (tsconfig.json)
- ESM modules (`type: module`)
- Style enforced by ESLint · Prettier — obey the configs

## Guardrails

- **Always OK:** read files, run the tests (`npm test`), build the project.
- **Ask first:** dependency installs, deletions, migrations / schema changes.
- **Never:** force-push, commit secrets.

## Definition of Done

Done when: `npm run lint` exits 0 · `npm test` passes · committed with a clear message.
<!-- agents:from-facts:end -->
