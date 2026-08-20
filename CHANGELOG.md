# Changelog

All notable changes to this project are documented here. This project adheres
to [Semantic Versioning](https://semver.org/).

## Unreleased

- Default author **skips the write** when facts are unchanged (timestamp ignored). A no-op re-run does not dirty git.

## 0.1.0

Honest to a fault — a minimal AGENTS.md, authored from your repo's facts, never guessed.

Initial public release.

### Authored AGENTS.md (facts polish)

- Orientation includes package **version** when declared (`v0.1.0`).
- **Run the tests** includes lint/typecheck scripts when present (verify bar).
- Detect `typecheck` package.json script.
- Richer **where things live** (common `src/` layout dirs, `tests/`, `examples/`).
- Commit & PR: same-PR refresh reminder when scripts/layout change.

### Added

Initial release.

### Added

- **Author a minimal AGENTS.md from detected repo facts.** Reads the repo and
  writes only what is true — real build/test/lint/dev commands, real entry
  points, the conventions your linters already enforce. Every line traces to
  something in the repo; nothing is invented or padded.
- **Sections authored** (each emitted only when detection produces content):
  orientation · setup & build · run the tests · where things live · conventions
  · guardrails (three tiers — Always OK / Ask first / Never) · definition of
  done · security & secrets (location only) · commit & PR.
- **Detection-driven guardrails.** A git working tree adds a "never push to
  `main`" line and a Commit & PR section; a detected `.env` adds a "never commit
  `<env>`" line and a Security & secrets section. Absent facts are omitted.
- **Language coverage.** TypeScript/JavaScript (Node · Bun · Deno), Python,
  Rust, Go, Zig, and more — via package.json scripts first, then toolchain
  manifest defaults (Cargo, Go, Zig, pytest).
- **Non-destructive writes.** Refreshes only the block between
  `<!-- agents:from-facts:start -->` and `<!-- agents:from-facts:end -->`.
  Anything you hand-write outside the markers is preserved. Idempotent.
- **CLI flags:** default (author/refresh) · `--check` (exit 1 if missing or
  stale) · `--dry-run` · `--stdout` · `-h`/`--help`.
- **Library API:** `buildRepoContext(dir)` and `authorAgentsMd(ctx)`.
- **GitHub Action** (`action.yml`, composite) that runs `--check` so teams can
  keep their AGENTS.md true in CI.
- **Fixtures + tests.** Example repos under `examples/` (Node/TS, Python, Rust,
  Go) double as demos and golden files; a `bun test` suite covers the detectors,
  the author, the golden output, and the doctrine (minimal, deterministic,
  non-destructive).
