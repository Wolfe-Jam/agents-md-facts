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

From the review of those changes (every line is still a fact):

- **CI is read as YAML** (new dependency: `yaml`). Each job shows its own `if:`, runners and matrix; comments are dropped, folded blocks read as one line, `with: run:` is not a step. A multi-line step shows its `name:`. Workflows that run on push or pull requests come first; past 40 lines the rest are named by file.
- **Before a release** shows what `npm publish` runs: `prepublishOnly`, then `prepack`. `prepublish` is gone: since npm 7 it runs on install.
- **Watch and fix scripts** (`test:watch`, `lint:fix`) are not listed. The Definition of Done names only `test`, `lint` and typecheck.
- **Folders:** a script uses a folder only when it names its path (`NODE_ENV=test` doesn't count; `./scripts/x.sh` does). `lib/` and `spec/` get no guessed gloss; `packages/` is "workspace packages" only when a workspace lists it; `pnpm-workspace.yaml`, `turbo.json`, `nx.json` and `lerna.json` are listed. Outside git, folders the root `.gitignore` ignores are left out.
- **Entry points:** a scoped package's command is its unscoped name; `tsconfig.json` `outDir`/`rootDir` and nested `exports` conditions are followed.
- **Package manager:** package.json `packageManager` wins over lockfiles, for orientation and commands alike.
- **Git:** one check (`git rev-parse`) decides git rules and the folder list. The rules say "the default branch", not `main`.
- **`--check` on Windows:** a CRLF checkout is no longer stale.
- **Contributing headings** inside code fences are skipped.
- **The pre-commit hook works:** it runs `npx agents-md-facts@<this version> --check` (it failed to install before, because `dist/` isn't in git). It needs Node and network.
- **The Action defaults to its own version,** not `latest`, so `@v0.2.0` runs 0.2.0.

From a second review (goose, run on ~19 real repos):

- **CI shows only workflows that run on push or pull requests;** release, schedule and manual workflows are named, not copied, so no publish or secret-setting commands land in AGENTS.md. On goose's own repo the file went from 1,455 lines to 98.
- **A code fence inside a step can't close the block** (the block's fence is longer than any backtick run in it). A step's `working-directory` and `shell` are shown.
- **A file that kept the banner but lost its markers keeps its hand-written sections;** the block is added at the top. Only a file of nothing but the tool's own sections is replaced.
- **Folders:** git decides the list (a committed `dist/` is listed, submodules too); "used by" needs a path (`scripts/x`, `./scripts`), not a bare word, and a delete-only script doesn't count; notes that repeat the folder name (`docs/ — docs`) are gone.
- **wrangler `main`:** top level only, comments ignored, either quote style; `wrangler.jsonc` is parsed.
- **Entry points say what the manifest says:** `package entry (main)` / `(exports)`, not "library"; a bundled build isn't traced by file name (the built path is shown, with its build script); a file with a popular name and no manifest entry isn't listed (Cargo, Zig and Go defaults are, named as defaults); `exports` arrays and `rootDir: "."` are read.
- **Contributing headings** keep `C#`, lose link URLs, at most six.
- A description that starts like markup is escaped; a non-number script value no longer throws.

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
