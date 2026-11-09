# Changelog

All notable changes to this project are documented here. This project adheres
to [Semantic Versioning](https://semver.org/).

## Unreleased

- Default author **skips the write** when facts are unchanged (timestamp ignored). A no-op re-run does not dirty git.

From agent runs on two real repos, where an agent reading the authored file
missed facts the repo already stated:

- **Before a release:** the `prepublishOnly` chain (or `prepack`, `prepublish`, a `release` script), verbatim.
- **CI:** each GitHub Actions workflow's runners, versions and `run:` steps, with `if:` conditions; installs left out.
- **Contributing guide:** Commit & PR points to `CONTRIBUTING.md` and lists its headings; the rules stay in the guide.
- **Description:** package.json `description` under the title.
- **Command spelling:** `npm test` / `npm start`; `pnpm` and `yarn` repos use their own runner (`bun run test` stays).
- **Where things live:** the top-level folders git tracks, each with what the repo says it is (a wrangler `main`, the scripts that use it, or the folder's usual meaning), then the entry points from `bin` / `exports` / `main`, traced to source. Config files are no longer listed.
- **Node version:** `engines.node` on the orientation line.
- **Renamed scripts:** scripts are picked by role, so `compile`/`bundle` count as the build, and `test:*`, `format:check`, `type-check` are verify commands.
- **The banner says to keep the start/end markers,** so a merged file can still be refreshed.

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
