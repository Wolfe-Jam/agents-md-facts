# Changelog

All notable changes to this project are documented here. This project adheres
to [Semantic Versioning](https://semver.org/).

## Unreleased

- **Rust title and version:** with no package.json or pyproject.toml name, the block's title and version come from `Cargo.toml`'s `[package]`, not the folder name. A virtual workspace keeps the folder name; `version.workspace = true` shows no version.

## 0.2.1 (2026-11-12)

- **`--version`** prints the version.
- **An unknown option stops the run** (exit 2) and writes nothing. Before, it was ignored and the default run wrote AGENTS.md, so `--chek` in CI rewrote the file and passed.
- **Python title and version:** with no package.json, the block's title and version come from `pyproject.toml` (`[project]`, then `[tool.poetry]`), not the folder name. A version listed in `dynamic` isn't shown.

## 0.2.0 (2026-11-10)

Everything 0.1.0 authored is still authored (setup & build, tests, where things live with its key files, conventions, guardrails, definition of done, security & secrets, commit & PR); 0.2.0 adds to it. Detection reads what the repo declares (its scripts, manifests, workflows, folders and guides) and never judges what a command does.

New sections and facts:

- **Runtime as declared:** a package.json repo is Node.js unless `engines` names Bun and not Node. A `bunfig.toml` alone no longer makes a Node package "Bun" (Bun stays the package manager when it's the lockfile).
- **No CI said plainly:** a git repo with no GitHub Actions workflows says so, so an agent doesn't search for them.
- **Python:** `pyproject.toml` `[project.scripts]` and `[tool.poetry.scripts]` are entry points, as declared. Configured `ruff`, `mypy` and `black` give `ruff check .`, `mypy .` and `black --check .` next to `pytest`; with `uv.lock` or `poetry.lock` they run through `uv run` / `poetry run`, and the install is `uv sync` / `poetry install`.
- **Description:** package.json `description` under the title. **Node version:** `engines.node` on the orientation line.
- **Before a release:** what `npm publish` runs first (`prepublishOnly`, then `prepack`), or the `release` script, verbatim; for a publishable package with neither, that `npm publish` runs no checks first.
- **CI:** the GitHub Actions workflows that run on pull requests and pushes, each job's `if:`, runners and matrix, and each step that runs one of the repo's own scripts (also in workspace packages: `pnpm --filter x test`, `yarn workspace x test`) or its declared toolchain's commands (`bun test`, `tsc`, `eslint`, `vitest`, `cargo test`, `go test`, `pytest`, `ruff`, `make <target>` for a Makefile target), shown whole, so a check in the same step (`… && git diff --exit-code`) stays visible. A step's `if:`, directory and non-bash shell end its own line; a multi-line script sits indented under a header with its step name. Other steps are counted ("# 2 other steps in the file"), never copied. A git repo with no workflows says so: "No GitHub Actions workflows (`.github/workflows/`)." The main check comes first (`ci.yml`, `test.yml`, …); helpers that fix, format, label or check the changelog come last. A shared workflow is shown under the job that calls it. Tag-only pushes, pushes to main only, schedules, manual runs, `pull_request_target` bots and PRs that only run on close or label are named, not copied. Read as YAML (merge keys expanded); this adds the first runtime dependency, `yaml`.
- **Where things live:** the top-level folders git tracks (outside git, the folders minus what the root `.gitignore` ignores), each with what the repo says it is (a wrangler `main`, a workspace that lists it, a curated gloss for `cmd/`, `e2e/`, `fixtures/`, …, and the scripts that name its path: `test/ — used by npm test`), monorepo config files, and the entry points exactly as `bin`, `exports` or `main` declare them (a declared path git doesn't track says so, with the build script), then 0.1.0's key files (manifests, entry files, docs, config) that exist and aren't already shown. With no manifest entry, Cargo's `src/main.rs` / `src/lib.rs` (unless Cargo.toml moves or turns them off, or it's a virtual workspace) and a root `main.go` that is `package main` are listed, named as defaults.
- **Contributing:** Commit & PR points to the guide (`CONTRIBUTING.md`, `.github/` or `docs/`) and lists its headings; the rules stay in the guide.
- **Guardrails and Commit & PR say "the default branch",** not `main`. The Definition of Done names the gate scripts (`test`, `lint`, typecheck), not `test:*` variants.

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
- **CI runs on Windows too,** so CRLF checkouts and paths are tested for real.

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
