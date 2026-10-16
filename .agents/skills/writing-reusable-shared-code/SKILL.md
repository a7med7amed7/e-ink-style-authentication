---
name: writing-reusable-shared-code
description: Use when moving code into a shared workspace package (@wfe/shared-lib, @wfe/shared-schemas, @wfe/design-system, or any cross-service/cross-app library), deciding whether to extract an abstraction, or reviewing shared code for DRY and adoptability. Prevents the recurring failures: copy-pasting security/validation helpers across services, baking one service's policy into a generic package, hardcoding caller assumptions (table: any, fixed column names), inverted dependencies where a low-level package imports a high-level one, and abstractions built for a single consumer.
---

# Writing Reusable Shared Code

## Overview

A shared package earns its place only if the next consumer can adopt it by importing — writing
nothing by hand. Shared code fails that promise quietly: it compiles, its own tests pass, and the
gap surfaces only when a *second* team tries to use it and hits a hardcoded column name, a policy
rule that isn't theirs, or a dependency on a framework they don't want. Core principle:
**extraction is proven by simulating the next adopter, not by your package's green tests.**

## When to Extract (and When Not To)

- **One consumer** → keep it local. Extracting for a single user is premature abstraction.
- **"For every possible future service"** → over-generalization from code that doesn't exist.
- **A confirmed second consumer** (shipped + confirmed adopter, or two real callers) → extract the
  shared contract now, while the seam is fresh.

Security-critical and validation helpers are the exception that must be shared eagerly: the team
standard is to centralize verification helpers (secret comparison, injection guards, shared Zod
schemas) in `@wfe/shared-lib` / `@wfe/shared-schemas` rather than copy-paste them, because a
divergent copy is a latent vulnerability.

## The Adoption Walk-Through (do before claiming reusability)

Pick the confirmed next consumer and write out, on paper:

1. **What it imports** from shared packages — mark each ✓ (clean import) or ✗ (must copy/rewrite).
2. **What it must still write locally** — and confirm each is *correctly* local (its own policy),
   not *accidentally* local (a leak you forgot to share).

Every ✗ is a defect to fix before push. "Mostly no copy-paste" is not done — the remaining bit is
what the next team hits first.

## The Recurring Leaks

### 1. Copy-pasted helpers instead of a shared import
If two services hand-roll the same validation, secret check, or SQL guard, one will drift and
become a bug. Move the invariant helper into `@wfe/shared-lib` and import it. This is explicitly
mandated for security-critical comparisons.

### 2. Service policy baked into a generic package (Principle I)
A generic package ships the **invariant kernel + an interface**; each caller injects its
**policy**. Limits, concrete config/catalogs, and named presets are policy and belong in the
service, injected at the call site. Litmus test: *could the next team adopt the package and supply
different limits/config without editing the package?* If not, you've baked in policy.

### 3. Hardcoded caller assumptions (`any`, fixed identifiers)
A shared query/uniqueness helper typed `table: any` or hardcoding `[deletedAt]` / `[id]` breaks at
**runtime** for any consumer whose columns differ. Type the table properly (`AnyMsSqlTable`, never
`any` — that violates the no-`any` rule), accept caller-specific identifiers as validated options,
and build clauses via `sql.identifier(...)`.

### 4. Inverted dependency (low-level imports high-level)
The arrow points one way: apps → UI packages → utility packages → primitives. A low-level utility
that imports the full design system (just to read one default) drags MUI/Emotion/etc. into every
headless consumer and risks a workspace cycle. Take the value as an injected option or read it
from the lower package it already depends on — never import upward. `pnpm lint:boundaries` catches
some of this; design intent must prevent it.

### 5. Generic code stranded inside a service (the reverse leak)
Swagger fragments, error envelopes, header schemas, serialize/parse helpers that are 100%
service-agnostic but live in one service force the next backend to copy the file. If it's generic,
move it to the shared package; keep only genuinely service-specific wording local.

## Placement & Naming Discipline

- All shared packages are scoped `@wfe/*`; new deps must stay compatible with pinned React/Node.
- Prefer **named exports**; run `pnpm verify:public-api` when adding to a package's surface.
- Keep backend-only concerns (SQL helpers) out of an isomorphic package's public API even if the
  code technically runs in a browser — it misleads frontend consumers.
- If you place a symbol somewhere other than the agreed design, update the design doc's location
  table and record why. Code and ground-truth must never disagree; the next team follows the doc.

## Quick Reference

| Smell | Fix |
|---|---|
| Same helper in two services | Move to `@wfe/shared-lib`, import it |
| Limits/config/presets hardcoded in generic pkg | Ship interface + kernel; inject policy per caller |
| `table: any` / hardcoded `[id]`,`[deletedAt]` | Type as `AnyMsSqlTable`; parameterize + `sql.identifier` |
| Utility package depends on UI package | Inject the value; drop the upward dependency |
| Generic Swagger/error schema locked in a service | Move to shared package; keep only wording local |
| Symbol placed off the agreed design | Update the doc's location table + rationale |

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "My package's tests pass, so it's reusable" | Reusability is proven by the next adopter. Do the walk-through. |
| "Copy-pasting the helper is faster" | Two copies drift; for security helpers that's a vulnerability. Share it. |
| "The limits are the same everywhere" | They're policy. Inject them so a different consumer can differ without editing the package. |
| "`any` on the table is harmless" | It fails at runtime for different column names and breaks the no-`any` rule. Type it. |
| "One import from the UI package is fine" | It drags the whole UI stack into headless consumers and risks a cycle. |
