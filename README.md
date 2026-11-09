# agents-md-facts

**Author a minimal [AGENTS.md](https://agents.md) from your repo’s facts. Never guessed.**

[![CI](https://github.com/Wolfe-Jam/agents-md-facts/actions/workflows/ci.yml/badge.svg)](https://github.com/Wolfe-Jam/agents-md-facts/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/agents-md-facts?color=cb3837)](https://www.npmjs.com/package/agents-md-facts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![DOI: Agents paper](https://img.shields.io/badge/DOI-Agents%20paper-FF6B35)](https://doi.org/10.5281/zenodo.21951641)
[![Business card · Get yours →](https://wolfe-jam.github.io/agent-business-card/badge.svg)](https://wolfe-jam.github.io/agent-business-card/?repo=Wolfe-Jam/agents-md-facts)

Hand-written agent files **rot**. LLM-written ones often **bloat** and can *reduce* task success ([Gloaguen et al., 2026](https://arxiv.org/abs/2602.11988)). This tool **authors** only what the tree declares — real build/test commands, entry points, toolchain conventions. Nothing invented. Nothing padded.

## Use

```bash
npx agents-md-facts            # author/refresh AGENTS.md (non-destructive; skip write if facts unchanged)
npx agents-md-facts --check    # exit 1 if missing or stale
npx agents-md-facts --dry-run  # print the block it would write; write nothing
npx agents-md-facts --stdout   # emit managed block to stdout
```

Refresh only the block between:

`<!-- agents:from-facts:start -->` … `<!-- agents:from-facts:end -->`

Everything you write outside those markers is preserved. Keep the markers when you edit or merge the file: a refresh finds its block by them. A file without the markers gets the block added on top; it is replaced only when it is exactly this tool's output.

It reads your manifests and config files and, in a git repo, the list of files git tracks. If git can't read the repo (for example "dubious ownership" in a container), it stops and says so rather than guess.

## What it authors

Description and orientation (language, kind, Node version) · setup & build · tests · before a release (what `npm publish` runs first: `prepublishOnly`, `prepack`) · CI (the GitHub Actions workflows that check pull requests and pushes, main check first, with any shared workflow they call; publish, deploy and push steps left out; other workflows named) · where things live (folders and entry points) · conventions · guardrails · definition of done · security (if secrets files exist) · commit & PR (with a pointer to your contributing guide).

Guardrails and Definition of Done always appear; every other section only when the repo has something for it.

Every line is a **detected fact** or a **curated default**. If it resolves no ambiguity, it is dropped.

Examples (exact tool output): [`examples/`](examples/) — Node/TS, Python, Rust, Go.

This repo dogfoods itself: see root [`AGENTS.md`](./AGENTS.md).

## CI

Fail the build when `AGENTS.md` drifts from the repo:

```yaml
# .github/workflows/agents-md.yml
name: AGENTS.md
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: Wolfe-Jam/agents-md-facts@v0.1.0
```

The tag pins the tool: `@v0.1.0` runs agents-md-facts 0.1.0. Or: `npx agents-md-facts --check`.

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

Then: `pre-commit install`. Pin `rev` to a release tag: the hook runs that release's published package with `npx`, so it needs Node and a network connection.

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

## Citation

`AGENTS.md` is how to work in a repo. `.fafa` is who the agent is. Complementary, not competing.

> Wolfe, J. (2026). *Why Agents Need a Passport: .fafa — Portable Identity for the Agentic Era*. Zenodo. https://doi.org/10.5281/zenodo.21951641

## License

MIT © James Wolfe · Built on the open [AGENTS.md](https://agents.md) standard.

Optional depth on facts-driven project DNA: [faf.one/agents](https://faf.one/agents)

---

⭐ [Star it on GitHub](https://github.com/Wolfe-Jam/agents-md-facts): bookmarks it for you, helps other devs find it too.
