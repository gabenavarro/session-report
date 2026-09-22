# session-report

A dual-artifact skill for AI agents: turn a technical working session into
a **canonical Markdown write-up** and a **vibrant, self-contained HTML
render** of that exact file.

It orchestrates two skills in lockstep:

| Dependency | Role |
|---|---|
| [`technical-session-writeup`](https://github.com/gabenavarro/technical-session-writeup) | authoring contract + audit gate (structure, layering, corrections rule, figures, glossary) |
| [`md2html`](https://github.com/gabenavarro/md2html) | Markdown → self-contained HTML (Shiki, KaTeX, Mermaid, XY charts, light/dark themes) |

The lockstep rule: **no HTML is produced from a document that fails the
write-up audit gate.** One document, both gates, two artifacts.

## Install

Portable across any agent harness that supports skills (Claude, OMP, and
similar): clone this repo into your skills directory, or point your harness
at the `SKILL.md`.

```bash
git clone https://github.com/gabenavarro/session-report.git
```

The skill itself is zero-dependency. `scripts/setup.sh` clones the two
dependency skills into `~/.session-report/skills/` (override with
`SESSION_REPORT_HOME`) and bootstraps the md2html render environment
(Node deps + a `.venv` with the XY charting library). `technical-
session-writeup` needs only Python 3.

## Use

```bash
# 1. environment (once per machine, idempotent)
bash <skill-dir>/scripts/setup.sh

# 2. chain gate: audit → render (one file, many files, or a directory)
node <skill-dir>/scripts/pipeline.mjs run <writeup.md> [more.md ... | dir] \
  --writeup <path-to-technical-session-writeup> \
  --md2html <path-to-md2html> \
  [--theme auto|light|dark] [--no-check] [--open]
```

Exit 0 only when every audited document is clean **and** every render
succeeded. With multiple inputs the pipeline keeps going after a failure,
reports each file, and exits 1 with `N of M file(s) failed`. Advisory
audit findings print but do not block.

## What the HTML gets you

- Syntax-highlighted code (Shiki, light/dark themes)
- Live Mermaid diagrams, theme-aware, syntax-checked at build time
- Interactive XY charts (light/dark iframe variants)
- KaTeX math, inlined fonts
- Auto table of contents — links resolve to real heading anchors
- Self-contained single file: no external references, copy it anywhere

## Quality bar

- Write-up gate: zero hard findings.
- HTML verified in a browser, light and dark.
- Re-rendering the same `.md` always produces the same HTML.
- The `.md` and `.html` are the same document — the HTML is never edited.

See `SKILL.md` for the full contract, including the lockstep authoring
rules and the subagent orchestration pattern
(`workflows/orchestration.md`).

## Tests

```bash
node --test test/
```

The suite covers the chain gate: audit failure blocks render (no HTML
produced), clean audit renders, render failure propagates, `check`
environment validation, flag handling.
