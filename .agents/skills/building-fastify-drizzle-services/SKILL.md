---
name: building-fastify-drizzle-services
description: Use when writing or reviewing backend code in this monorepo — Fastify routes, controllers, services, or Drizzle repositories. Prevents the recurring runtime and data-layer bugs the team hits repeatedly: "reply already sent" crashes, N+1 queries and in-memory authorization, per-request re-creation of heavy SDK clients, module-level singletons that leak across Jest workers, forgetting to set updatedAt on updates, string-matching on error.message, DELETE-with-body, and duplicated validation logic.
---

# Building Fastify + Drizzle Services

## Overview

Most backend incidents here are not exotic — they are the same handful of mistakes made in a new
place. This skill is the checklist that keeps a route, service, or repository out of those ruts.
Core principle: **fail closed, do one round-trip, own resources at the right lifetime, and make
errors and responses unambiguous.**

## When to Use

Editing or reviewing anything under `**/backend/**`: route registration, controllers,
application services, Drizzle repositories, plugins, or their tests.

## Fastify Request/Response Safety

**Never double-send a reply.** Fastify throws an uncaught exception if you respond to a request
that already responded — a common crash in catch blocks and pre-handlers.

```typescript
try {
  await handleRequest();
} catch (error) {
  if (reply.sent) return;          // guard
  reply.status(500).send({ error: 'Internal Error' });
  return;                          // and return immediately
}
```

Pre-handlers/middleware must `return` right after `reply.send()` so the handler chain stops.

**HTTP method semantics:**
- Bulk delete → `POST /api/v1/.../delete`, never a `DELETE` with a body (proxies strip DELETE bodies).
- Register `HEAD` on the **exact same path** as its `GET`, never a bespoke path.
- Don't return duplicate shapes (flat fields alongside a nested object); version the endpoint for breaking changes.

**Validation is centralized.** Validate body/query/params with shared Zod pre-handlers at the
boundary. Never hand-roll or duplicate validator logic inside controllers.

**Multipart:** configure `attachFieldsToBody: 'keyValues'` so non-file fields land on
`request.body` without silently losing data; don't consume the file stream in `preValidation`.

## Drizzle Data-Layer Safety

**No queries in loops (N+1).** Batch with `WHERE id IN (...)` / `inArray`. One round-trip.

```typescript
// ❌ N+1
for (const id of ids) await repo.findById(id);
// ✅ one query
await db.select().from(table).where(inArray(table.id, ids));
```

**Authorize at the query level, not in memory.** Don't fetch rows then filter by owner/tenant in
JS — fold the isolation check into the `WHERE` clause so unauthorized rows never load.

**Set `updatedAt` explicitly on updates.** SQL Server column defaults fire only on INSERT, so an
`UPDATE` that relies on the default silently leaves `updatedAt` stale. Pass `updatedAt: new Date()`
(or the DB function) in every update query.

**Escape LIKE wildcards and cap input length.** Any user term flowing into `like()` must have
`%`, `_`, `[`, `]` escaped, and search terms/UUIDs need `maxLength` (≈255 / 36) in the Zod schema
to protect the query planner from DoS.

## Resource Lifetime

**Heavy clients are startup singletons, injected.** Azure/S3/SDK clients and DB pools are created
once at boot and passed via constructor DI (`new Controller(db)`, `app.db` decorator). Never
`new SomeClient()` per request.

**But module-level mutable singletons leak across tests.** Do not stash state or SDK instances in
a module-scope variable in a factory file — parallel Jest workers share the module registry and
pollute each other. Use dependency injection so each test constructs its own instance.

## Errors

**Type your errors; never string-match `error.message`.** Detect with custom operational error
classes + `instanceof`. Message text changes; types don't.

```typescript
// ❌ fragile
if (error.message.includes('not found')) ...
// ✅ robust
if (error instanceof NotFoundError) ...
```

Use standard JS errors (`TypeError`, `RangeError`) for developer/contract bugs; reserve custom
classes for operational failures. Never write a silent/empty catch. Route errors through the
shared error-handling plugin so the response envelope stays consistent.

## Quick Reference

| Symptom / smell | Fix |
|---|---|
| Crash "reply already sent" | `if (reply.sent) return;` + `return` after every send |
| Query inside `for`/`map` | Batch with `inArray` / `IN (...)` |
| Fetch-then-filter by owner in JS | Push the isolation check into the SQL `WHERE` |
| `updatedAt` never changes | Set it explicitly in the update query |
| New SDK client per request | Construct once at startup, inject as singleton |
| Flaky test state across workers | Remove module-level singletons; use DI |
| `error.message.includes(...)` | `instanceof` on a typed error class |
| `DELETE` with a body | `POST /.../delete` |
| Validation copied into controllers | Shared Zod pre-handler |

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "The loop is only a few ids" | It grows; make it one query now. It's the same amount of code. |
| "Filtering in memory is clearer" | It loads rows the caller must not see and doesn't scale. Filter in SQL. |
| "The default sets updatedAt" | Only on INSERT. Updates keep the stale value. Set it. |
| "One SDK client per request is fine" | Connection churn and handle leaks. Singleton + DI. |
| "Checking the message is quick" | Messages change and localize; the check silently breaks. Use `instanceof`. |
