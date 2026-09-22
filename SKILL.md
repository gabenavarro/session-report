---
name: session-report
description: Produce a dual-artifact session report — a canonical Markdown write-up (structured for two audiences) and a vibrant self-contained HTML render of it. Use this skill when the user wants the technical session "written up" and delivered as an HTML report, asks for a "session report", "write this up as HTML", a polished recap, or invokes it by name. Orchestrates two skills in lockstep: technical-session-writeup (authoring contract + audit gate) and md2html (rendering). Do NOT use for quick answers, code comments, or plain-Markdown-only requests.
---

# session-report

Convert a technical working session into a **dual artifact**: a canonical
Markdown write-up that a brilliant non-specialist and a domain expert can
both read, plus a vibrant, self-contained HTML render of that exact file
(Shiki code highlighting, KaTeX math, Mermaid diagrams, XY interactive
charts, light/dark themes).

This skill is an **orchestrator**. It does not re-implement authoring rules
or rendering — it wires two skills together and enforces the contract that
keeps them in lockstep:

| Skill | Role | Contract it enforces |
|---|---|---|
| `technical-session-writeup` | authoring | document structure, layering, corrections rule, figure rules, audit gate |
| `md2html` | rendering | Markdown-in → self-contained HTML-out; reproducible render |

## When to use

**Trigger** when any of these is true:

- The user wants the session written up **and** delivered as HTML
  ("write this up as a report", "session report", "HTML recap",
  "document what we did and make it pretty").
- A `technical-session-writeup` deliverable is being requested and the user
  previously said they want HTML reports, or the deliverable will be
  shared/sent to others.
- The user invokes this skill by name.

**Do NOT trigger** when:

- The user wants plain Markdown only (use `technical-session-writeup` alone).
- The user has existing Markdown they just want rendered (use `md2html` alone).
- The exchange is a quick answer or a single question.

## Setup (idempotent, run once per machine)

```bash
bash <skill-dir>/scripts/setup.sh
```

Clones both dependencies (shallow) into a managed location, then bootstraps
the `md2html` environment (Node deps + `.venv` with the XY charting library).
`technical-session-writeup` needs only Python 3 — no extra installs.
`setup.sh` prints the resolved skill paths; pass them to the pipeline below.

## The pipeline

Four phases. For reports above ~150 lines, execute phases 1–2 with
**parallel subagents** as described in `workflows/orchestration.md`;
phases 3–4 run on the main agent.

### Phase 1 — Audit environment

```bash
node <skill-dir>/scripts/pipeline.mjs check \
  --writeup <path-to-technical-session-writeup> \
  --md2html <path-to-md2html>
```

Verifies both skills are present and the render environment is ready.
Exit 0 before authoring begins.

### Phase 2 — Author the Markdown

Delegate to the `technical-session-writeup` skill. Its full contract
applies **unmodified** — required section order, per-section template
(Why this matters → Intuitively → Technically → Figure), the layering
rule, the corrections rule, glossary, Appendix C. This skill adds one
lockstep requirement:

> **The write-up is authored so that it passes both gates at once.**
> Before rendering, the same file must pass
> `technical-session-writeup/scripts/audit_writeup.py` (structure,
> corrections rule, figure existence) **and** render cleanly under
> `md2html`. The lockstep authoring rules below resolve every known
> conflict between the two contracts.

The dual-artifact frontmatter (the write-up's H1 title is also the HTML
report title; `date` is used by the HTML footer — keep it deterministic):
````markdown
---

title: <same as the H1>
description: <one line: what was built + key result>
date: YYYY-MM-DD
author: <author>
theme: auto
---
````

### Phase 3 — Chain gate (audit → render)

```bash
node <skill-dir>/scripts/pipeline.mjs run \
  <writeup.md> [more.md ... | dir] \
  --writeup <path-to-technical-session-writeup> \
  --md2html <path-to-md2html> \
  [--theme auto|light|dark] [--no-check] [--open]
```

The pipeline runs the write-up audit gate **first** for every input; on any
hard finding it stops that file, prints the findings, and no HTML is
produced from a failing document. A directory input expands to its
`*.md` files (README.md skipped). With multiple inputs, the pipeline
keeps going after a failure, reports each file, and exits non-zero with
`N of M file(s) failed`. Advisory findings are printed and do not block.

### Phase 4 — Verify the HTML

Per the `md2html` non-negotiables, **a report is not done until the HTML is
visually inspected**:

1. Open the rendered file in a browser (the pipeline can `--open` it).
2. Check light **and** dark theme: code highlighting, table zebra rows,
   Mermaid diagrams rendered (not raw text), math typeset, XY chart
   iframes loading in both themes.
3. Check the TOC (if present) links to real headings.
4. Verify the footer shows the frontmatter title and date.

For large reports, delegate verification to a reviewer subagent that opens
the HTML and reports issues; fix and re-run phase 3 until clean.

## Lockstep authoring rules

These rules exist because the two skills' contracts interact. They are
cheap to follow while authoring and expensive to fix after a gate failure.

1. **Headings are render-critical.** The `##`/`###` headings of a write-up
   become the HTML table of contents (3+ `##` headings ⇒ sidebar TOC).
   Required-section headings are already well-named; do not add decorative
   `##`/`###` headings that exist only for layout — they become dead TOC
   entries readers will click. (Headings inside code fences are safe: the
   renderer ignores them.)
2. **Figures: PNG for write-up compliance, XY for HTML vibrancy.**
   `technical-session-writeup` requires real `figures/fig-NN-*.png` files
   on disk; `md2html` inlines them automatically (≤8 MB). Use **both**:
   generate the PNG (write-up rule), and where a figure would be more
   *useful* as an interactive chart, add a ` ```xy ` fenced block next to
   the static figure so the HTML gets a live version. Architecture/data-flow
   figures are ` ```mermaid ` blocks — the write-up's audit gate accepts
   mermaid in place of a PNG for a section figure.
3. **Math.** `$...$` / `$$...$$` are rendered by KaTeX in the HTML; they are
   invisible to the write-up gate. Use freely in the Technically passes.
4. **Code fences.** Fences with any language are safe in the HTML (unregistered
   languages fall back to plaintext). Fences are invisible to the write-up
   gate's correction-phrase scan — keep reproducible plotting scripts in
   Appendix C as fences, per the write-up rule.
5. **No `#` H1 inside fences, no extra H1s.** The write-up gate requires
   exactly one H1; the HTML title comes from frontmatter `title`. Keep the
   H1 and `title` identical.
6. **Dates.** The frontmatter `date` is what the HTML footer shows. Set it
   at authoring time; never rely on a render-time stamp.
7. **Appendix A/B/C headings are render-neutral.** They render as ordinary
   sections; their `### A.N` / glossary entries are fine in the TOC-free
   body. Do not rename them to satisfy either gate.

## Subagent orchestration

For reports above ~150 lines or with 3+ technical sections:

- **Phase 1** (environment): main agent.
- **Phase 2** (authoring): one writer subagent drafts the full document
  following the write-up contract; figure generation runs as its own step
  (write + **execute** the XY/matplotlib scripts). A reviewer subagent
  checks the draft against the write-up self-audit checklist *and* the
  lockstep rules above.
- **Phase 3** (chain gate): main agent — the pipeline is deterministic.
- **Phase 4** (verification): a reviewer subagent opens the HTML, reports
  light/dark issues; main agent fixes and re-runs phase 3.

The report is not done until a reviewer has verified **both** the Markdown
(write-up checklist) and the rendered HTML (phase 4).

## Deliverable

Two files, named after the project slug + date:

```
<project-slug>-writeup-YYYY-MM-DD.md      (canonical, diffable)
<project-slug>-writeup-YYYY-MM-DD.html    (self-contained render)
```

plus the `figures/` directory. Hand the user both paths and a one-paragraph
orientation note (tl;dr of the tl;dr, plus where the interesting detours
live in Appendix A). Do not paste the whole document into chat.

## Quality bar

- Write-up gate: **zero hard findings** (advisories reviewed).
- Render: clean exit; HTML verified in a browser, light and dark.
- The `.md` and `.html` are the same document — never edit the HTML.
- Re-rendering the same `.md` always produces the same HTML.

## Files

- `scripts/setup.sh` — clone both dependencies + bootstrap render env
- `scripts/pipeline.mjs` — `check` / `run` (audit → render chain)
- `workflows/orchestration.md` — subagent fan-out pattern
- `examples/sample.md` — minimal dual-compliant write-up (frontmatter + all required sections)
- `test/pipeline.test.mjs` — chain-gate behavior tests
