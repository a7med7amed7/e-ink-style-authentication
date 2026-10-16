---
name: orchestrating-delegated-execution
description: >
  Use when executing a multi-phase feature, plan, SpecKit tasks, or implementation
  prompt by delegating work to cheap subagents while you (the strong/expensive model)
  only orchestrate and do the final review. Trigger whenever the user asks to build or
  implement something in phases, run a plan with subagents, delegate to cheaper models,
  keep the expensive model from burning tokens on implementation, or pipeline
  implement-then-review with model diversity. Prefer this over implementing yourself or
  over subagent-driven-development when the session model is expensive and the goal is
  cost-efficient execution. Do not use for single-file one-liners you can finish in one
  turn, pure Q&A, or brainstorming/design before an execution plan exists.
---

# Orchestrating Delegated Execution

You are the **orchestrator**. Your job is coordination, gating, and a final review — not
implementation. Cheap models do the coding, tests, and per-phase reviews. You burn tokens
only on planning dispatches, reading short reports, resolving blockers, and the final
quality gate.

**Announce at start:** "I'm using orchestrating-delegated-execution — I'll dispatch cheap
implementers/reviewers and only do the final review myself."

## Why this exists

Strong models are expensive. Implementation turns (reading large trees, editing many files,
iterating on tests) dominate cost. This skill keeps that work on a fixed cheap roster and
reserves the strong model for judgment at the end — plus light orchestration in between.

If you catch yourself about to implement, deeply explore the codebase for how to build
something, or rewrite a phase yourself: **stop**. That is a token-burn event (see below).

## Roles and model roster

| Role | Who | Models (Cursor Task `model` slug) |
|------|-----|-----------------------------------|
| Orchestrator | Current session (strong/expensive) | Session model — do **not** implement |
| Phase implementer | Subagent | `composer-2.5` or `cursor-grok-4.5-high` only |
| Phase reviewer | Subagent | The **other** cheap model when both are usable; same model if only one is available |
| Final reviewer | Orchestrator (you) | Session model — allowed and required |

**Always pass `model` explicitly** on every Task dispatch. Omitting it inherits the
session model and silently burns the expensive budget.

### Model diversity (per phase)

- If phase N was **executed** by model Y, **review** it with model Z ≠ Y when both
  cheap models are available. Diversity catches mistakes one model family tends to miss.
- If only one cheap model is available (commonly `composer-2.5`), use it for both
  implement and review. Say so once in the progress ledger so the human knows diversity
  was unavailable.
- Alternate implementers across phases when both models are available (Y, Z, Y, …) so
  neither monopolizes the feature.

### Orchestrator never commits

Neither you nor any subagent may run `git add`, `git commit`, `git commit --amend`, or
equivalent staging/commit flows for this skill. Working-tree edits only. The human owns
commits. Say this in every implementer dispatch.

## Inputs (user-owned plan)

Accept whatever the human provides:

- SpecKit / superb artifacts
- A markdown plan
- A chat prompt listing phases or a feature description

Your job is to turn that into an ordered **phase list** with clear acceptance criteria,
file/ownership boundaries, and which skills/rules each phase must follow. If the input is
too vague to phase safely, ask **one** batched clarifying question — then proceed.

## Token-burn guard (orchestrator)

Before any non-trivial tool use, ask: "Is this orchestration, or am I doing the work?"

**Allowed for you (cheap enough / your job):**
- Read the plan and phase briefs you wrote
- Write short phase briefs and progress ledger updates
- Dispatch/resume Task subagents with explicit cheap models
- Read implementer/reviewer **report files** (not whole diffs unless adjudicating a blocker)
- Answer subagent questions with compact context
- Final review after all phases pass
- Escalate to the human when blocked

**Forbidden without flagging the human first:**
- Implementing or editing production/test code yourself
- Long exploratory reads to figure out how to implement a phase
- Fixing reviewer findings yourself instead of dispatching a cheap fixer
- Re-running full test suites "to be sure" after a subagent already reported results
- Pasting large diffs or entire files into your context when a path handoff would do

**When you are about to burn tokens:** stop mid-action, tell the human something like:

> Token-burn check: I was about to [implement X / read Y files / fix Z myself]. Per
> orchestrating-delegated-execution I should dispatch a cheap subagent instead. Proceed
> with dispatch, or do you want me to do this work myself?

Only continue the expensive work if the human explicitly opts in.

## Skills and rules

Attach the right process skills and repo rules **in each subagent prompt** — subagents do
not inherit your session skill choices.

**Typical process skills to point implementers at (when relevant):**
- `test-driven-development` — for behavior changes
- `verification-before-completion` — before they claim DONE
- `building-fastify-drizzle-services` / `fastify-best-practices` / `writing-mssql-drizzle-migrations` — when the phase hits those domains
- `systematic-debugging` — only for fix/debug phases

**Repo rules:** follow `.cursor/rules/monorepo-architecture.mdc` routing — tell the
subagent which `BE-*` / `FE-*` rules apply for the paths they will touch. Do not dump every
rule; name the matching ones.

**Reviewers** should follow `requesting-code-review` judgment style (spec + quality) via
the phase-reviewer template in this skill, and stay read-only on the tree.

## Process

```text
[Ingest plan] → [Phase list + ledger] →
  for phase N (only if 1..N-1 approved):
    [Dispatch implementer Y] →
    [Dispatch reviewer Z ≠ Y] →
    [Fix loop on cheap models until approved or blocked] →
    [Ledger: phase N approved]
→ [Orchestrator final review] → [Report to human; no commits]
```

### 1. Pre-flight

1. Confirm workspace / branch expectations with the human if unclear (do not switch to
   main/master to implement without consent).
2. Record `BASE_SHA=$(git rev-parse HEAD)` and note whether the tree is already dirty.
3. Create or resume a progress ledger:
   `$(git rev-parse --show-toplevel)/.superpowers/delegated-execution/progress.md`
4. Build the ordered phase list (ids, titles, acceptance criteria, likely paths, skills/rules,
   suggested implementer model). Show the phase list once to the human if the plan was only
   a vague prompt; if they already gave an ordered plan, execute without ceremony.

### 2. Phase gate (strict)

**Do not start phase N until phases 1..N-1 are DONE and review-approved.**

No overlapping implementers across dependent phases. Safe parallelism is only **inside**
one phase: if you split a phase into independent sub-tasks with **no shared files** and no
ordering dependency, you may dispatch those implementers in parallel — you own merge
conflicts and must serialize if ownership overlaps.

### 3. Dispatch implementer

1. Write a phase brief file (requirements only — exact values live there, not in chat paste).
2. Name a report path for the implementer.
3. Dispatch `generalPurpose` (or `shell` only for pure command work) with:
   - `model`: `composer-2.5` or `cursor-grok-4.5-high`
   - Template: [implementer-prompt.md](implementer-prompt.md)
4. On return, read the short status + report file. Handle statuses:

| Status | Action |
|--------|--------|
| DONE | Build review package; dispatch reviewer |
| DONE_WITH_CONCERNS | Read concerns; if correctness/scope risk, address before review; else review |
| NEEDS_CONTEXT | Answer compactly; re-dispatch same model |
| BLOCKED | Escalate: more context, other cheap model, smaller phase, or human |

Retry cap: **2** fix/re-implement cycles per phase after a failed review, then escalate to
the human (do not burn endless cheap turns either).

### 4. Dispatch phase reviewer (diversity)

1. Produce a **working-tree** review package (no commits):
   `scripts/review-package-workdir BASE_SHA [paths...]`
   Prefer scoping paths to the phase's ownership when known.
2. Dispatch reviewer with the **other** cheap model when available.
3. Template: [phase-reviewer-prompt.md](phase-reviewer-prompt.md)
4. Reviewer is read-only: no edits, no commits.

**Verdicts required:** spec compliance **and** quality. Missing either = not approved.

**On failure:** dispatch a cheap **fixer** (prefer the original implementer model for
continuity of approach, or the other model if the implementer is stuck). Re-review with
diversity rules again. Do not start the next phase until approved.

**On "⚠️ cannot verify":** you adjudicate from plan context (short reads only). Real gaps
count as failed review.

### 5. Progress ledger

After each approved phase, append one line:

```text
Phase N: approved (implementer=<model>, reviewer=<model>, retries=<k>)
```

After compaction or resume, trust the ledger over memory — do not re-dispatch approved phases.

### 6. Final review (orchestrator — required)

When all phases are approved:

1. You perform the final review yourself (this is the intentional expensive gate).
2. Scope: whole change since `BASE_SHA` (`git diff --stat` + targeted reads of
   high-risk hunks). Prefer the review package script over dumping everything into chat.
3. Check: plan acceptance criteria, cross-phase consistency, skills/rules adherence,
   tests present and reported green for changed behavior, no accidental commits from agents.
4. If Critical/Important issues remain: dispatch **one** cheap fixer with the full list
   (not one agent per finding), then re-check yourself. Do not silently ship.
5. Report to the human: what landed, residual risks, suggested commit/MR next steps.
   **Do not commit.**

## Dispatch hygiene

- Self-contained prompts: task brief path, skills/rules names, constraints, report path,
  "no git commit/add".
- Do **not** paste the full session history or prior-phase novels into later dispatches —
  only interfaces/decisions the brief cannot know.
- Hand large artifacts as **files**; keep return summaries short.
- Never tell a reviewer what not to flag.

## vs related skills

| Skill | When to prefer it |
|-------|-------------------|
| **This skill** | Expensive session model; multi-phase execution; maximize cheap delegation |
| `subagent-driven-development` | Same-session SDD with commits + per-task review; model selection freer |
| `executing-plans` | Human or agent executes the plan without this orchestration pattern |
| `dispatching-parallel-agents` | Independent investigations, not phased feature delivery |
| `requesting-code-review` | Ad-hoc review of already-done work |

## Red flags

- Implementing in the orchestrator session "just this once"
- Omitting `model` on Task so the expensive model inherits the job
- Same model for implement + review when the other cheap model is available
- Starting phase N while N-1 is still in review or failed
- `git commit` / `git add` from any agent
- Skipping final review because phase reviews passed
- Fixing findings yourself instead of dispatching a cheap fixer
- Dumping the entire monorepo rule set into every prompt

## Prompt templates

- [implementer-prompt.md](implementer-prompt.md)
- [phase-reviewer-prompt.md](phase-reviewer-prompt.md)
- Review package (workdir): [scripts/review-package-workdir](scripts/review-package-workdir)
