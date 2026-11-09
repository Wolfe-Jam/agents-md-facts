<!-- agents:from-facts:start -->
<!-- authored by agents-md-facts — from your repo's facts, never guessed · re-run to refresh · keep the start/end markers · authored: 2026-11-09T21:13:54.198Z -->

# AGENTS.md — rust

Rust

*Authored: 2026-11-09*

## Setup & build

```bash
cargo build --release    # build
```

## Run the tests

```bash
cargo test
cargo clippy
```

## Where things live

- `src/` — source

Entry points:

- `src/main.rs`

## Conventions

- Style enforced by rustfmt — obey the configs

## Guardrails

- **Always OK:** read files, run the tests (`cargo test`), build the project.
- **Ask first:** dependency installs, deletions, migrations / schema changes.
- **Never:** force-push, commit secrets.

## Definition of Done

Done when: `cargo clippy` exits 0 · `cargo test` passes · committed with a clear message.
<!-- agents:from-facts:end -->
