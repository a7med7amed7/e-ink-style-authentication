# Mini plan — ODE eval fixture

## Goal

Tiny two-phase feature for skill evaluation only.

## Phase 1 — Config getter

- Add `getAppName(): string` that returns `"ode-eval"`.
- Place it in `src/config.ts` under the eval work directory the orchestrator names.

## Phase 2 — Thin wrapper

- Add `greet(): string` in `src/greet.ts` that returns ``Hello, ${getAppName()}``.
- Do not expand scope beyond this wrapper.

## Global constraints

- No `git add` / `git commit`.
- Prefer tests only if trivial; not required for this eval fixture.
- Follow whatever skills/rules the orchestrator attaches.
