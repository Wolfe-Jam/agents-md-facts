# Changelog

All notable changes to this project are documented here. This project adheres
to [Semantic Versioning](https://semver.org/).

## Unreleased

**The block is facts, not instructions.** Every line is read from a file the repo declares: its scripts, manifest, workflows, folders and guides. What a command does is never judged, so a line is either a fact or it isn't there. Guardrails, Definition of Done and the commit rules are no longer written: instructions belong to the hand-written part of AGENTS.md, outside the markers. (They may come back in a later version.)

New sections and facts:

- **Description:** package.json `description` under the title. **Node version:** `engines.node` on the orientation line.
- **Before a release:** what `npm publish` runs first (`prepublishOnly`, then `prepack`), or the `release` script, verbatim.
- **CI:** the GitHub Actions workflows that run on pull requests and pushes, each job's `if:`, runners and matrix, and the lines in it that call the repo's own scripts or listed commands (`npm test`, `pnpm run lint`, `cargo test`), with each step's `if:` and directory. Everything else a workflow runs stays in the file. A shared workflow is shown under the job that calls it. Tag-only pushes, pushes to main only, schedules, manual runs, `pull_request_target` bots and PRs that only run on close or label are named, not copied. Read as YAML (merge keys expanded); this adds the first runtime dependency, `yaml`.
- **Where things live:** the top-level folders git tracks (outside git, the folders minus what the root `.gitignore` ignores), each with what the repo says it is (a wrangler `main`, a workspace that lists it, or a curated gloss for `cmd/`, `e2e/`, `fixtures/`, …), monorepo config files, and the entry points exactly as `bin`, `exports` or `main` declare them (a declared path git doesn't track says so, with the build script). With no manifest entry, Cargo's `src/main.rs` / `src/lib.rs` (unless Cargo.toml moves or turns them off, or it's a virtual workspace) and a root `main.go` that is `package main` are listed, named as defaults.
- **Secrets:** the secrets file and its example, by name.
- **Contributing:** the guide (`CONTRIBUTING.md`, `.github/` or `docs/`) and its headings; the rules stay in the guide.

How facts are read:

- **Scripts by name:** `compile`/`bundle` are the build; `test:*`, `format:check`, `type-check` are checks; `:watch`, `:fix`, `:update` variants are left out. Each package manager's own spelling (`npm test`, `pnpm run x`, `bun run test`); package.json `packageManager` wins over lockfiles.
- **Git:** the folder list comes from the files git tracks, so a local build can't change the output. If git can't read the repo (dubious ownership, even from a subfolder; git not installed), the run stops (exit 2) with git's reason and, for dubious ownership, the `safe.directory` fix. A file list of any size is read.
- **Markers count only on a line of their own;** a marker quoted in prose is just text, and a file with two start-marker lines is not written (exit 2). A file that kept the banner but lost its markers keeps its text; it is replaced only when it is exactly this tool's output. CRLF files stay CRLF; a BOM is kept.
- **Default author skips the write** when facts are unchanged (timestamp ignored), and `--check` reads a CRLF checkout the same as LF.
- **CONTRIBUTING headings** follow CommonMark (fences, setext headings), skip YAML front matter, keep `C#`, lose link URLs; at most six are shown.
- A description that starts like markup is escaped; a non-string script value doesn't throw. Token-shaped strings are masked.

Integrations:

- **The pre-commit hook works:** it runs `npx agents-md-facts@<this version> --check` (it failed to install before, because `dist/` isn't in git). It needs Node and network, and pre-commit 3.2.0 or later.
- **The Action defaults to its own version,** not `latest`.

**Upgrading from 0.1.0:** run `npx agents-md-facts` once. The output changed, so `--check` reports the old file as stale until you refresh it.

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
