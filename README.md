# agents-md-facts

**Author a minimal [AGENTS.md](https://agents.md) from your repo’s facts. Never guessed.**

[![CI](https://github.com/Wolfe-Jam/agents-md-facts/actions/workflows/ci.yml/badge.svg)](https://github.com/Wolfe-Jam/agents-md-facts/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/agents-md-facts?color=cb3837)](https://www.npmjs.com/package/agents-md-facts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Hand-written agent files **rot**. LLM-written ones often **bloat** and can *reduce* task success ([Gloaguen et al., 2026](https://arxiv.org/abs/2602.11988)). This tool **authors** only what the tree declares — real build/test commands, entry points, toolchain conventions. Nothing invented. Nothing padded.

## Use

```bash
npx agents-md-facts            # author/refresh AGENTS.md (non-destructive)
npx agents-md-facts --check    # exit 1 if missing or stale
npx agents-md-facts --dry-run  # print plan; write nothing
npx agents-md-facts --stdout   # emit managed block to stdout
```

Refresh only the block between:

`<!-- agents:from-facts:start -->` … `<!-- agents:from-facts:end -->`

Everything you write outside those markers is preserved.

## What it authors

Orientation · setup & build · tests · where things live · conventions · guardrails · definition of done · security (if secrets files exist) · commit & PR.

Every line is a **detected fact** or a **curated default**. If it resolves no ambiguity, it is dropped.

Examples (exact tool output): [`examples/`](examples/) — Node/TS, Python, Rust, Go.

This repo dogfoods itself: see root [`AGENTS.md`](./AGENTS.md).

## CI

Fail the build when `AGENTS.md` drifts from the repo:

```yaml
# .github/workflows/agents-md.yml
- uses: Wolfe-Jam/agents-md-facts@v0.1.0
```

Or: `npx agents-md-facts --check`.

## Pre-commit hook

Catch stale `AGENTS.md` before it lands:

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/Wolfe-Jam/agents-md-facts
    rev: v0.1.0
    hooks:
      - id: agents-md-facts
```

Then: `pre-commit install`.

## Ladder

**BETTER on `main`.** Short model: [`docs/BETTER-BEST.md`](docs/BETTER-BEST.md).

## Develop

Requires [Bun](https://bun.sh).

```bash
bun install
bun test
bun run lint
bunx tsc --noEmit
bun run src/cli.ts          # refresh this repo’s AGENTS.md
```

See [CONTRIBUTING.md](CONTRIBUTING.md). Security: [SECURITY.md](SECURITY.md).

## License

MIT © James Wolfe · Built on the open [AGENTS.md](https://agents.md) standard.

Optional depth on facts-driven project DNA: [faf.one/agents](https://faf.one/agents)

---

⭐ **If this saved you a hand-written (or LLM-bloated) AGENTS.md, a star helps others find it.**
