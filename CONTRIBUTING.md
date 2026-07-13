# Contributing

Thanks for helping keep AGENTS.md files true. This is a small, focused tool —
contributions that keep it small and focused are the most welcome.

## The governing filter

> **A line earns its place only if it resolves real ambiguity** (or caches
> expensive exploration an agent would otherwise repeat).

Everything this tool authors is a **detected fact** or a **curated default**.
It never guesses, pads, or restates rules a linter already enforces — the
research is clear that padding an instruction file *hurts* agent task-success.
When you add a detector or a section, ask: does this line tell an agent
something it could not cheaply learn itself? If not, drop it.

Two rules that follow from the filter:

- **Facts, not opinions.** A section is emitted only when detection produces
  content for it. No "detected nothing, so here's a plausible default" filler.
- **Point, don't restate.** For toolchain-governed conventions, point at the
  config ("obey `tsconfig.json`") instead of copying its rules into prose.

## Develop

Requires [Bun](https://bun.sh).

```bash
bun install          # install dev dependencies
bun run src/cli.ts   # run the CLI against the current directory
bun run src/cli.ts --stdout   # print the authored block, write nothing
```

## Test

```bash
bun test             # unit + golden + doctrine tests
bunx tsc --noEmit    # typecheck (strict)
```

The `examples/` fixtures are golden files: their committed `AGENTS.md` must
equal what the tool authors from them. If you change detection or authoring, the
golden tests will fail until you re-author the fixtures:

```bash
# from a fixture directory, e.g. examples/node-ts
bun run ../../src/cli.ts
```

Doctrine tests enforce the invariants: authored output stays minimal (≤ 150
lines), is deterministic, is non-destructive, and stays in the tool's own
vocabulary — it **authors** from facts, it never writes one up from nothing.

## Build

```bash
bun run build        # tsc → dist/
```

## License

By contributing you agree that your contributions are licensed under the MIT
License, the same license that covers this project.
