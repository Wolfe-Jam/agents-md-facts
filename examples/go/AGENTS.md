<!-- agents:from-facts:start -->
<!-- authored by agents-md-facts — from your repo's facts, never guessed · re-run to refresh · keep the start/end markers · authored: 2026-11-09T21:13:54.383Z -->

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

- `main.go`

## Guardrails

- **Always OK:** read files, run the tests (`go test ./...`), build the project.
- **Ask first:** dependency installs, deletions, migrations / schema changes.
- **Never:** force-push, commit secrets.

## Definition of Done

Done when: `go test ./...` passes · committed with a clear message.
<!-- agents:from-facts:end -->
