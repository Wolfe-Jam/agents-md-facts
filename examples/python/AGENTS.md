<!-- agents:from-facts:start -->
<!-- authored by agents-md-facts — from your repo's facts, never guessed · re-run to refresh · keep the start/end markers · authored: 2026-11-12T06:36:11.674Z -->

# AGENTS.md — python-example

Python · v0.1.0

*Authored: 2026-11-12*

## Run the tests

```bash
pytest
ruff check .
mypy .
black --check .
```

## CI

No GitHub Actions workflows (`.github/workflows/`).

## Where things live

- `tests/`

Key files:

- `pyproject.toml`
- `main.py`

## Conventions

- Style enforced by black · ruff · mypy — obey the configs

## Guardrails

- **Always OK:** read files, run the tests (`pytest`).
- **Ask first:** dependency installs, deletions, migrations / schema changes.
- **Never:** force-push, push to the default branch, commit secrets.

## Definition of Done

Done when: `ruff check .` exits 0 · `mypy .` exits 0 · `pytest` passes · committed with a clear message.

## Commit & PR

- Write a clear, descriptive commit message.
- Branch off the default branch; never commit to it directly — open a PR for review.
- If build/test scripts or layout change, refresh this file in the **same PR** (`npx agents-md-facts`).
<!-- agents:from-facts:end -->
