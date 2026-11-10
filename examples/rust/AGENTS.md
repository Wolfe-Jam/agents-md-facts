<!-- agents:from-facts:start -->
<!-- authored by agents-md-facts — from your repo's facts, never guessed · re-run to refresh · keep the start/end markers · authored: 2026-11-10T14:16:28.757Z -->

# AGENTS.md — rust

Rust

*Authored: 2026-11-10*

## Setup & build

```bash
cargo build --release    # build
```

## Run the tests

```bash
cargo test
cargo clippy
```

## CI

No GitHub Actions workflows (`.github/workflows/`).

## Where things live

- `src/`

Entry points:

- `src/main.rs` — binary crate root (Cargo default)

Key files:

- `Cargo.toml`

## Conventions

- Style enforced by rustfmt — obey the configs

## Guardrails

- **Always OK:** read files, run the tests (`cargo test`), build the project.
- **Ask first:** dependency installs, deletions, migrations / schema changes.
- **Never:** force-push, push to the default branch, commit secrets.

## Definition of Done

Done when: `cargo clippy` exits 0 · `cargo test` passes · committed with a clear message.

## Commit & PR

- Write a clear, descriptive commit message.
- Branch off the default branch; never commit to it directly — open a PR for review.
- If build/test scripts or layout change, refresh this file in the **same PR** (`npx agents-md-facts`).
<!-- agents:from-facts:end -->
