<!-- agents:from-facts:start -->
<!-- authored by agents-md-facts — from your repo's facts, never guessed · re-run to refresh · keep the start/end markers · authored: 2026-11-09T22:48:21.192Z -->

# AGENTS.md — go

Go

*Authored: 2026-11-09*

## Setup & build

```bash
go build ./...    # build
```

## Run the tests

```bash
go test ./...
```

## Where things live

Entry points:

- `main.go` — Go main package

## Guardrails

- **Always OK:** read files, run the tests (`go test ./...`), build the project.
- **Ask first:** dependency installs, deletions, migrations / schema changes.
- **Never:** force-push, push to the default branch, commit secrets.

## Definition of Done

Done when: `go test ./...` passes · committed with a clear message.

## Commit & PR

- Write a clear, descriptive commit message.
- Branch off the default branch; never commit to it directly — open a PR for review.
- If build/test scripts or layout change, refresh this file in the **same PR** (`npx agents-md-facts`).
<!-- agents:from-facts:end -->
