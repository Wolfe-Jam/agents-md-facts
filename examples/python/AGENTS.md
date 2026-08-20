<!-- agents:from-facts:start -->
<!-- authored by agents-md-facts — from your repo's facts, never guessed · re-run to refresh · authored: 2026-08-20T03:08:41.990Z -->

# AGENTS.md — python

Python

*Authored: 2026-08-20*

## Run the tests

```bash
pytest
```

## Where things live

- `pyproject.toml`
- `main.py`
- `tests/`

## Conventions

- Style enforced by black · ruff · mypy — obey the configs

## Guardrails

- **Always OK:** read files, run the tests (`pytest`).
- **Ask first:** dependency installs, deletions, migrations / schema changes.
- **Never:** force-push, commit secrets.

## Definition of Done

Done when: `pytest` passes · committed with a clear message.
<!-- agents:from-facts:end -->
