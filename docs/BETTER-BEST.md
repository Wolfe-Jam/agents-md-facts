# NONE · GOOD · BETTER · BEST

How this project sits on the [AGENTS.md](https://agents.md) ladder — short version for contributors and reviewers.

## The model

```text
NONE  →  GOOD  →  BETTER  →  BEST
```

| State | Meaning |
|-------|---------|
| **NONE** | No agent instruction file |
| **GOOD** | Some `AGENTS.md` (or peer file) exists — quality varies |
| **BETTER** | A short, current, **facts-based** `AGENTS.md` an agent can trust |
| **BEST** | BETTER **plus** durable project DNA (`.faf`) that authors/refreshes instruction files from verified facts |

This repository is intentionally a **real open-source tool**, not a toy fixture.

## This repo

| State | Where |
|-------|--------|
| **BETTER** | **`main`** and release tags (e.g. `v0.1.0`) — no `project.faf` |
| **BEST** | Branch/tag **`better-best/2026-07-21`** — same product software **plus** `project.faf` (falsifiable git diff) |

**Product default = BETTER.** You do not need FAF (or any other stack) to install or run `agents-md-facts`.

```bash
npx agents-md-facts          # author/refresh AGENTS.md from repo facts
npx agents-md-facts --check  # fail if missing or stale
```

## Why BETTER matters

Hand-written files rot. LLM-freewritten files often **bloat** and can hurt agent success (see research cited in the [README](../README.md)).  

`agents-md-facts` authors only what the repo **declares** — real commands, real paths, real toolchain conventions. Nothing invented.

## Falsifiable checks

**BETTER baseline (example: `v0.1.0`):**

```bash
git checkout v0.1.0
test -f AGENTS.md
test ! -f project.faf   # product BETTER does not require project DNA
npx agents-md-facts --check
```

**BEST print slice (`better-best/2026-07-21`):**

```bash
git fetch origin
git diff v0.1.0..better-best/2026-07-21 --stat
git diff v0.1.0..better-best/2026-07-21 -- project.faf docs/BETTER-BEST.md

# Optional worktrees (side-by-side)
# git worktree add ../agents-md-facts-better v0.1.0
# git worktree add ../agents-md-facts-best   better-best/2026-07-21
```

Or GitHub compare: `v0.1.0...better-best/2026-07-21`.

## Naming note

We do **not** call production slices “demos.”  
Evidence is **tags, SHAs, and diffs** of real software.

## Further reading

- [agents.md](https://agents.md) — the open standard  
- [README](../README.md) — install, usage, research pointer  
- Optional depth on facts-driven project DNA: [faf.one/agents](https://faf.one/agents)
