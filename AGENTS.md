<!-- agents:from-facts:start -->
<!-- authored by agents-md-facts — from your repo's facts, never guessed · re-run to refresh · keep the start/end markers · authored: 2026-11-10T04:42:05.008Z -->

# AGENTS.md — agents-md-facts

Honest to a fault — a minimal AGENTS.md, authored from your repo's facts, never guessed.

TypeScript · CLI · Node.js >=18 · bun package manager · v0.1.0

*Authored: 2026-11-10*

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
# job test · ubuntu-latest
bun run lint
```

## Where things live

- `docs/`
- `examples/`
- `src/`
- `tests/`

Entry points:

- `dist/cli.js` — the `agents-md-facts` command (not in git; the build script is `bun run build`)
- `dist/index.js` — package entry (`exports`) (not in git; the build script is `bun run build`)

## Conventions

- TypeScript strict mode (tsconfig.json)
- ESM modules (`type: module`)
- Style: ESLint configs

## Contributing

- `CONTRIBUTING.md` — The governing filter · Develop · Test · Build · License
<!-- agents:from-facts:end -->
