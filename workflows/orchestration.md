# Subagent orchestration for session-report

Fan-out pattern for reports above ~150 lines or with 3+ technical
sections. The pipeline (phases 3–4) is deterministic and runs on the main
agent; authoring (phase 2) is where parallelism pays.

## Phase 2 — parallel authoring

```
main agent
  ├── writer subagent          (task)   full document draft per the
  │                                      write-up contract + lockstep rules
  └── figures subagent         (task)   write + execute plotting scripts
                                         (XY / matplotlib) → figures/*.png
```

- The **writer** receives the session transcript/summary plus the
  `technical-session-writeup` SKILL.md path and the lockstep authoring
  rules from the parent SKILL.md. It must produce the complete document
  (all required sections, frontmatter, glossary, appendices). It does not
  run the audit gate — that is deterministic and runs in phase 3.
- The **figures** subagent runs in parallel. It writes and **executes**
  every plotting script (the write-up rule: a figure you did not produce
  does not exist), saving `figures/fig-NN-<slug>.png`. If a chart type is
  not available in XY, it says so in one line in its result and falls back
  to matplotlib for that figure.
- If a section needs a figure the figures subagent cannot produce, the
  writer omits the figure (permitted by the write-up contract) and the
  main agent notes the gap.

**Merge:** the main agent verifies every `![...](figures/...)` reference
in the writer's draft points at a file the figures subagent produced, then
fixes mismatches before phase 3.

## Phase 2.5 — review (optional, for large reports)

A **reviewer** subagent (read-only) checks the draft against:

1. The write-up self-audit checklist (structure, layering, corrections
   rule, glossary, Appendix C).
2. The lockstep authoring rules (headings render-critical, no dead TOC
   candidates, frontmatter consistent with H1).

It returns a findings list. The main agent applies fixes — the reviewer
does not edit.

## Phase 3 — chain gate (main agent)

```bash
node <skill-dir>/scripts/pipeline.mjs run <writeup.md> \
  --writeup <path> --md2html <path>
```

Deterministic: audit gate → render. A failure here means the authoring
had a defect; go back to phase 2 (fix, re-run). Do not `--no-check` to
skip around a real finding.

## Phase 4 — verification (reviewer subagent)

The reviewer opens the rendered HTML (browser) and reports:

- Light **and** dark theme: code highlighting, tables, math, Mermaid
  diagrams (rendered, not raw text), XY iframes (both variants).
- TOC links resolve (click each entry; no dead links).
- Footer title/date match the frontmatter.

Findings → main agent fixes the **Markdown**, re-runs phase 3, re-verifies
only the affected region. The HTML is never edited directly.

## Completion criteria

- `pipeline.mjs run` exits 0 (audit clean, render clean).
- Reviewer confirms the HTML in both themes.
- Both artifact paths handed to the user with an orientation note.
