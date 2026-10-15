# Session Lifecycle and Commit Contract

## Configuration and ownership

Use express-session 1.19.0 and connect-mongo 6.0.0. Configure required flags exactly as C03. Production name is `__Host-easygen.sid`; localhost HTTP name is `easygen.sid`. Cookie is HttpOnly, SameSite Strict, Path=/, no Domain, Secure in production, initial maxAge 1800000 ms. Omit the session `proxy` override; Express's verified trust policy owns `req.secure`. Keep default `unset:"keep"` so detaching a failed request cannot schedule another automatic destruction.

MongoStore uses the Mongoose-owned client, collection `sessions`, `autoRemove:"native"`, `touchAfter:0`, fallback `ttl:1800` seconds, and ordinary acknowledged writes. Await startup collection/index readiness. The application owns connection shutdown once; do not close a shared Mongo client from two owners.

## Deadline policy

For valid metadata, `idle = lastActivityAt + 1800000`, `absolute = authenticatedAt + 28800000`, `deadline = min(idle,absolute)`. Deny at equality or later; reject malformed/future-inconsistent metadata rather than deriving a fresh lifetime. Inject an application wall clock for boundary tests; Mongo TTL uses real database time and is cleanup only.

Loading pins cookie expiry to the existing deadline; it does not renew activity. Rejected origin/throttle/validation/authorization requests do not extend expiration. Accepted `/me` renewal sets lastActivityAt to current time, re-pins cookie expiry to the new minimum, and explicitly saves before returning the user. Recheck expiry after asynchronous work before emitting protected success if an absolute deadline was crossed. Normal reads never reset authenticatedAt.

Each persisted `sessions.expires` equals serialized `cookie.expires` and cannot exceed absolute. A persistent cookie may survive restart only until that date. Browser TTL cleanup is not the authorization mechanism; captured expired cookies must fail even if storage records remain.

## Compatibility boundary

`SessionStoreAdapter` extends `express-session.Store`, delegates `get/set/destroy` to MongoStore, and deliberately has no `touch` method. Map recognized Mongo connection/timeout failures into a typed store-unavailable error; unexpected failures remain sanitized server errors with metadata-only logs. Relay/handle underlying error events so outages never become unhandled process events or an in-memory fallback.

Immediately after loading an express session, and after every regeneration, install a nonenumerable own `touch()` returning that session without altering its cookie. Pin cookie.expires explicitly through policy. Do not use reload; if introduced later, it must reinstall the helper. Helpers are excluded from serialized state. This prevents express-session's response-end resetMaxAge from shifting the pinned date.

An adapter `set(sid,data,callback)` delegates unless the same data object has a successful-write receipt for both the same sid and the SHA-256 digest of its exact serialized snapshot. Record the receipt only after acknowledged persistence. An identical subsequent library write completes locally, synchronously; a changed sid/snapshot/object delegates and can fail. Use a WeakMap so receipts do not retain session objects. Receipts hold no reusable response, password, or raw cookie value and are not a general retry cache.

Reason: express-session regeneration bypasses its usual method wrapping and may schedule an otherwise duplicate save at response end even after explicit save. The receipt removes that extra database operation, which could otherwise fail after headers. Pinning touch keeps the compared snapshot stable. There must be no mutation after the explicit commit; add tests that count underlying MongoStore operations on the regeneration path and at response end.

## Route lifecycle

1. POST origin/header/media middleware runs before session loading. Session middleware calls its callback and maps load errors before Nest route execution. Set no-store/cache/logging protections for errors too.
2. Nest route rate-limit guard runs before password work; private session guard validates metadata/deadlines without renewing. Shared schemas parse credentials before the auth service.
3. Signup: admitted Argon2 hash → unique indexed insert → regenerate → reinstall helper → set minimal auth metadata/pinned cookie → await save → return 201. No authenticated success before save. If insert succeeds but later work fails, keep account and document signin recovery.
4. Signin: canonical email lookup → admitted real/dummy Argon2 verify → generic 401 on failure; on success regenerate, set/pin/save as above, then 200. Stored hashes encode their verification parameters.
5. `/me`: validate → load public user → renew/pin → await save → final deadline check → 200. A save outage returns 503 rather than a verified identity response.
6. Logout: validate without renewal → await `req.session.destroy()` → clear matching cookie (omit expires/maxAge options when clearing) → 204. No arbitrary session id is accepted.
7. Expired/malformed auth: detach request session, clear cookie, return 401. Synchronous deletion is unnecessary for expiry; future authentication still checks deadlines and TTL cleanup is eventual. This is not a claim of confirmed logout.

On regenerate/save failure, detach request session before the error response so automatic saving/rolling cannot authenticate the failed attempt. On destroy failure, return 503 for recognized unavailability and do not claim invalidation. A surviving browser cookie remains untrusted until a later server check. Middleware errors must not rely on Nest exception filters intercepting raw Express callbacks.

## Required proof and scope

Prove cookie/document deadline equality; bounded rolling near 8 hours; server expiry with retained records; regeneration and save-before-response; zero delegated response-end persistence; failed-save detachment; acknowledged destroy; old-cookie replay rejection; independent-device survival; recognized get/set/destroy failure semantics; no extension for rejected requests.

This is a source-researched compatibility design pending execution. It does not promise globally ordered mutations or linearizable revocation across simultaneous requests in other tabs/direct clients. Captured-cookie use after an acknowledged logout has completed must fail. Do not add tombstones, distributed locks, or a server operation-status protocol to imply broader guarantees.
