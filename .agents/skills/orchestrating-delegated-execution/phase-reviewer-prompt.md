# Phase Reviewer Prompt Template

Use after an implementer reports DONE / DONE_WITH_CONCERNS. Fill every bracketed field.
Always set Task `model` to a cheap slug. Prefer the model that did **not** implement this
phase when both `composer-2.5` and `cursor-grok-4.5-high` are available.

```
Subagent (generalPurpose):
  description: "Review phase N: [short name]"
  model: [composer-2.5 | cursor-grok-4.5-high — prefer ≠ implementer]
  prompt: |
    You are reviewing Phase N: [phase name] for spec compliance and quality.
    This is a phase gate, not the final whole-feature review.

    ## What was requested

    Read the phase brief: [BRIEF_FILE]

    Global constraints that bind this phase:
    [GLOBAL_CONSTRAINTS — verbatim from plan / orchestrator]

    Skills/rules the implementer was told to follow:
    [LIST]

    ## What the implementer claims

    Read: [REPORT_FILE]
    Treat it as unverified. Judge the code, not the story.

    ## Diff under review

    Base SHA: [BASE_SHA]
    Diff package: [DIFF_FILE]

    Read the diff package once. Do not re-derive the whole repo history.
    Do not edit files. Do not run `git add` / `git commit`. Read-only review.

    Inspect code outside the diff only for a concrete named risk (one focused check
    per risk), and name what you checked.

    ## Tests

    The implementer already reported test commands and results. Do not re-run the full
    suite by default. Run a focused test only if reading the diff raises a specific
    doubt their report does not answer. Otherwise recommend heavier checks in your report.

    ## Part 1 — Spec compliance

    Compare diff + report against the brief:
    - Missing requirements?
    - Extra unrequested scope?
    - Wrong behavior vs acceptance criteria?

    Verdict: SPEC_PASS or SPEC_FAIL with a bullet list.

    ## Part 2 — Quality

    Check for: clear bugs, unsafe patterns, missing tests for changed behavior,
    rule/skill violations you can see, messy duplication introduced by this phase.

    Severity: Critical / Important / Minor.

    Verdict: QUALITY_APPROVED or QUALITY_REJECTED.

    ## Output

    Write full review to: [REVIEW_FILE]

    Return only:
    - SPEC_PASS|SPEC_FAIL
    - QUALITY_APPROVED|QUALITY_REJECTED
    - Top findings (Critical/Important)
    - ⚠️ Cannot verify items (if any)
```
