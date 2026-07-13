# agents-md-facts

**Honest to a fault** — a minimal AGENTS.md, authored from your repo's facts, never guessed.

AI coding agents (Copilot, Cursor, Claude Code, Codex) read one file to learn how to work in your repo: [AGENTS.md](https://agents.md). There are two ways to get one wrong:

- **Write it by hand → it rots.** The code moves; the file quietly lies, and your agent obeys the stale version at full confidence.
- **Let an LLM write it → it bloats.** Peer-reviewed research — Gloaguen et al. (2026), from Prof. Vechev's SRI Lab at ETH Zürich (arXiv:2602.11988) — found LLM-written instruction files *measurably reduce* agent task-success and raise cost, because the model pads them with plausible-sounding rules the agent then over-obeys. The paper's own conclusion: describe only **minimal requirements**.

`agents-md-facts` is that conclusion, mechanized. It **reads your repo and authors a minimal AGENTS.md from detected facts** — your real build/test commands, your real entry points, the conventions your linters already enforce. Every line traces to something true in the repo. Nothing invented, nothing padded.

## Use

```bash
npx agents-md-facts            # scan the repo → author/refresh AGENTS.md (non-destructive)
npx agents-md-facts --check    # CI / pre-commit: exit 1 if AGENTS.md is missing or stale
npx agents-md-facts --dry-run  # print what it would write; change nothing
npx agents-md-facts --stdout   # emit to stdout (for piping)
```

**Non-destructive.** It refreshes only inside `<!-- agents:from-facts:start -->` … `<!-- agents:from-facts:end -->` markers — anything you hand-write outside them is preserved. Re-run it whenever the code moves to keep the file true.

## What it authors

A minimal, [standard](https://agents.md)-conformant AGENTS.md: orientation · setup & build · tests · where things live · conventions · guardrails · definition of done · security. Target ~35 lines. Every line is a **detected fact** or a **curated default**; if a line resolves no real ambiguity, it's dropped.

See it authored across languages in [`examples/`](examples/) — Node/TS, Python, Rust, Go — each fixture ships the exact AGENTS.md the tool wrote for it.

## Keep it true in CI

Add the [composite Action](action.yml) to fail the build whenever `AGENTS.md` drifts from the repo — so the file your agents read is never a stale lie:

```yaml
# .github/workflows/agents-md.yml
name: AGENTS.md
on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Wolfe-Jam/agents-md-facts@v0.1.0   # runs `agents-md-facts --check`
```

Prefer a raw step? `run: npx agents-md-facts --check` does the same thing. Either way, re-run the tool locally and commit the refreshed file to go green.

## Authored, not invented

The whole point: this tool **doesn't invent** an AGENTS.md — it **authors** one from what's *true* in your repo. That's the exact difference the research measured: minimal-from-facts *helps*; LLM-freewritten *hurts*. Author clean, and there's no bloat for a linter to catch later.

## License

MIT © James Wolfe · Built on the open [AGENTS.md](https://agents.md) standard.
