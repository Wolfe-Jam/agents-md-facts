<!-- agents:from-facts:start -->
<!-- authored by agents-md-facts — from your repo's facts, never guessed · re-run to refresh · keep the start/end markers · authored: 2026-11-09T22:10:50.536Z -->

# AGENTS.md — python

Python

*Authored: 2026-11-09*

## Run the tests

```bash
pytest
```

## Where things live

- `tests/` — tests

Entry points:

- `main.py`

## Conventions

- Style enforced by black · ruff · mypy — obey the configs

## Guardrails

- **Always OK:** read files, run the tests (`pytest`).
- **Ask first:** dependency installs, deletions, migrations / schema changes.
- **Never:** force-push, push to the default branch, commit secrets.

## Definition of Done

Done when: `pytest` passes · committed with a clear message.

## Commit & PR

- Write a clear, descriptive commit message.
- Branch off the default branch; never commit to it directly — open a PR for review.
- If build/test scripts or layout change, refresh this file in the **same PR** (`npx agents-md-facts`).
<!-- agents:from-facts:end -->
