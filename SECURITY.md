# Security Policy

## Supported versions

Security fixes are applied to the **latest published release** on npm (`agents-md-facts`).

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |
| &lt; 0.1  | No        |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security reports.**

Email **security@faf.one** (or the maintainer listed on npm) with:

- A description of the issue
- Steps to reproduce
- Affected versions (if known)
- Optional: suggested fix

We aim to acknowledge within **7 days**.

## Scope notes

This tool **authors Markdown from local repo facts**. It does not execute untrusted remote code as a service. Still report:

- Path traversal or unexpected file writes outside the target tree
- Secrets leaking into authored AGENTS.md
- Supply-chain issues in published packages or the GitHub Action
