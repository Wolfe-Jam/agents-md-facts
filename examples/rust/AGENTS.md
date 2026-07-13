<!-- agents:from-facts:start -->
<!-- authored by agents-md-facts — from your repo's facts, never guessed · re-run to refresh -->

# AGENTS.md — rust

Rust

## Setup & build

```bash
cargo build --release    # build
```

## Run the tests

```bash
cargo test
```

## Where things live

- `Cargo.toml`
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
