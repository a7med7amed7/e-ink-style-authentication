# HTTP API Contract

**Base**: `/api/auth` on the exact configured application origin. JSON uses UTF-8. All authentication responses, including failures, carry `Cache-Control: no-store`. No bearer-token storage, permissive CORS, or client-supplied session IDs.

## Common requests

POST signup/signin require `Content-Type: application/json` (a charset parameter is permitted), `X-Requested-With: XMLHttpRequest`, and exact trusted Origin. Logout has no body requirement but still requires the custom header and origin protection. If Origin is absent, a parsed Referer origin must match; null/untrusted/malformed Origin is not replaced with Referer. Missing both is rejected. A JSON body limit of 16 KiB bounds parsing before validation.

Frontend uses relative URLs and `credentials:"same-origin"`. Do not retry signup/signin automatically. GET identity is safe to repeat, with normal idle renewal as specified by session policy.

Strict request schemas reject unknown fields and wrong types. Passwords undergo NFC only; email/name canonicalization and password length/category rules are defined in [data model](../data-model.md) and C05. Backend validation is authoritative.

## Success payload

`PublicUser = {id: string, email: string, name: string}` where id is an ObjectId hex string and email is canonical. Account/password/session-store internals are excluded. Success for signup/signin/me is `{user: PublicUser}`.

| Method and path | Authentication | Request | Success | Per-IP limit |
| --- | --- | --- | --- | --- |
| `POST /api/auth/signup` | Public | `{email,name,password}` strings | 201 plus persisted regenerated session cookie and user | 5 / 900000 ms |
| `POST /api/auth/signin` | Public | `{email,password}` strings | 200 plus persisted regenerated session cookie and user | 10 / 60000 ms |
| `GET /api/auth/me` | Valid session | None | 200 plus verified user; accepted idle renewal persisted before response | 120 / 60000 ms |
| `POST /api/auth/logout` | Valid session | None | 204, empty body, after current session destruction and matching cookie clear | 30 / 60000 ms |

Signup/signin success must not be emitted before session save. `/me` denies absent/expired/malformed sessions with 401, rather than returning a successful anonymous DTO. If the referenced user no longer exists, detach/clear and deny; do not invent an account. Logout targets only the presented session and does not accept an id in body/query.

## Error envelope

`{error:{code:string, message:string, requestId:string, fields?:Record<string,string[]>}}`

`fields` appears only for validation, with recognized field names and safe messages; values, hashes, stack traces, connection URIs, and session IDs are never returned. Request IDs must be server-generated or narrowly validated, never reflected as arbitrary header text. Generic signin message: `Invalid email or password.` for both unknown email and wrong password.

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Missing/wrong/unknown fields, invalid email/name/password, malformed JSON, unsupported expected body shape/media type |
| 401 | `INVALID_CREDENTIALS` | Explicit signin credential rejection |
| 401 | `UNAUTHENTICATED` | Absent/expired/invalid protected session, including repeated unauthenticated logout |
| 403 | `UNTRUSTED_ORIGIN` | Missing/null/untrusted/unverifiable origin or Referer fallback |
| 403 | `CSRF_REJECTED` | Required AJAX header absent or wrong |
| 409 | `EMAIL_ALREADY_REGISTERED` | MongoDB unique-email collision, including concurrent duplicate insert |
| 429 | `RATE_LIMITED` | Per-IP route allowance exhausted; `Retry-After` whole seconds |
| 503 | `SESSION_STORE_UNAVAILABLE` | Recognized read/save/regenerate/destroy store outage; never success fallback |
| 503 | `AUTH_CAPACITY_EXCEEDED` | No waiting slot or maximum queue wait exceeded; `Retry-After: 1` initially |
| 503 | `SERVICE_UNAVAILABLE` | Recognized account-database connection/unavailability; no credential-success inference |
| 500 | `INTERNAL_ERROR` | Unexpected failure, sanitized; no guessed success |

Body-limit handling is normalized to the assessment's invalid-request 400. Unknown `/api` routes return JSON 404 and must not fall through to SPA HTML. Unsupported methods never become state-changing GET routes.

Origin/request-shape validation precedes session middleware on mutations. Session loading precedes Nest guards. One default throttler with route metadata runs before authorization/validation/service password work. Invalid JSON/origin may be rejected before throttler; no expensive hashing occurs. Rate-limit headers use the library's seconds-based output, not an additional `/1000` conversion.

Duplicate 409 intentionally reveals registered email status. Explicit signin 401 is the only invalid-credentials evidence. A 503/network rejection is not authentication or logout success. If signup inserted a user before session failure/lost response, retain it and recover by normal signin; do not auto-repeat the POST.

Cookies and expiry behavior are binding in [session-lifecycle.md](session-lifecycle.md); operation-success UI evidence is binding in [client-auth.md](client-auth.md).
