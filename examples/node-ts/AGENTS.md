<!-- agents:from-facts:start -->
<!-- authored by agents-md-facts — from your repo's facts, never guessed · re-run to refresh · keep the start/end markers · authored: 2026-11-10T05:19:09.930Z -->

# AGENTS.md — node-ts-example

A tiny TypeScript + Node fixture for agents-md-facts.

TypeScript · Node.js · npm package manager · v1.0.0

*Authored: 2026-11-10*

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

- `src/`

Key files:

- `package.json`
- `src/index.ts`
- `tsconfig.json`

## Conventions

- TypeScript strict mode (tsconfig.json)
- ESM modules (`type: module`)
- Style enforced by ESLint · Prettier — obey the configs

## Guardrails

- **Always OK:** read files, run the tests (`npm test`), build the project.
- **Ask first:** dependency installs, deletions, migrations / schema changes.
- **Never:** force-push, push to the default branch, commit secrets.

## Definition of Done

Done when: `npm run lint` exits 0 · `npm test` passes · committed with a clear message.

## Commit & PR

- Write a clear, descriptive commit message.
- Branch off the default branch; never commit to it directly — open a PR for review.
- If build/test scripts or layout change, refresh this file in the **same PR** (`npx agents-md-facts`).
<!-- agents:from-facts:end -->
