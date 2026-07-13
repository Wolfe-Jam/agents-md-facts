<!-- agents:from-facts:start -->
<!-- authored by agents-md-facts — from your repo's facts, never guessed · re-run to refresh -->

# AGENTS.md — go

Go

## Setup & build

```bash
go build ./...    # build
```

## Run the tests

```bash
go test ./...
```

## Where things live

- `go.mod`
- `main.go`

## Guardrails

- **Always OK:** read files, run the tests (`go test ./...`), build the project.
- **Ask first:** dependency installs, deletions, migrations / schema changes.
- **Never:** force-push, commit secrets.

## Definition of Done

Done when: `go test ./...` passes · committed with a clear message.
<!-- agents:from-facts:end -->
