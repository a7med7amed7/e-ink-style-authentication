# Implementer Subagent Prompt Template

Use this template when dispatching a phase implementer. Fill every bracketed field.
Always set Task `model` to `composer-2.5` or `cursor-grok-4.5-high`.

```
Subagent (generalPurpose):
  description: "Implement phase N: [short name]"
  model: [composer-2.5 | cursor-grok-4.5-high]
  prompt: |
    You are implementing Phase N: [phase name]

    ## Phase brief (read first)

    Read: [BRIEF_FILE]
    That file is the source of requirements and exact values. Follow it.

    ## Where this fits

    [One short paragraph: feature goal, what prior approved phases already did,
     interfaces you must respect. No novel-length history.]

    ## Skills and rules you must follow

    Process skills (read and apply when relevant):
    - [e.g. test-driven-development]
    - [e.g. verification-before-completion]
    - [domain skills if any]

    Repo rules for paths you will touch:
    - [e.g. monorepo-architecture routing → BE-database-drizzle, FE-ids-components, …]

    ## Hard constraints

    - Do **not** run `git add`, `git commit`, or any commit/amend. Working-tree edits only.
    - Stay inside this phase's ownership: [paths / modules]. Do not "while I'm here" other phases.
    - Prefer small, reviewable diffs. Match existing project patterns.
    - Write/update tests for behavior you change unless the brief says not to.
    - If blocked or missing context, stop and report — do not guess architecture.

    ## Before you begin

    If requirements, approach, or dependencies are unclear, **ask now**. Otherwise implement.

    ## Your job

    1. Implement exactly what the brief specifies
    2. Add or update tests as appropriate
    3. Run the focused verification the brief names (or the narrowest sensible check)
    4. Self-review against the brief
    5. Write your full report to: [REPORT_FILE]
    6. Return only: status, one-line summary, test command+result, concerns (if any)

    Work from: [WORKTREE / repo root]

    ## Status values (use exactly one)

    - DONE — requirements met, tests run, report written
    - DONE_WITH_CONCERNS — done, but list doubts in the report
    - NEEDS_CONTEXT — missing info; say what you need
    - BLOCKED — cannot proceed; say why and what you tried

    ## Report file format

    Write markdown to [REPORT_FILE] including:
    - What you changed (paths)
    - What you did not change (and why, if relevant)
    - Tests: commands and outcomes
    - Self-review notes
    - Concerns / follow-ups
```
