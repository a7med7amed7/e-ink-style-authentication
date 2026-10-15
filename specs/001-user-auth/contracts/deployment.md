# Deployment and Configuration Contract

## Runtime topology

Production: browser → one public HTTPS origin/TLS proxy → private NestJS server serving both React assets and `/api`; MongoDB is separate and private. Initial backend allocation is 1 vCPU/512 MiB. Only one application process, including one in-memory throttler and one shared hash gate. No Redis or orchestrator is required.

The proxy must overwrite, not append arbitrary client claims for, X-Forwarded-For/Host/Proto. Backend trust is an explicit verified address/CIDR list. Do not use `trust proxy:true`, blindly select first raw XFF, or set express-session `proxy:true`. Backend reachability must exclude public bypass. A numeric hop count is not the default design. Verify actual proxy/client-IP behavior before deployment claims.

Development: browser `http://localhost:5173`; Vite forwards `/api` to `http://127.0.0.1:3000` without rewriting the browser Origin. Backend uses `APP_ORIGIN=http://localhost:5173`, secure cookie off, separate development name, and no trusted forwarding headers. `localhost` and `127.0.0.1` are different origins; documentation must use the chosen hostname consistently.

## Validated environment

| Variable | Meaning / validation |
| --- | --- |
| `NODE_ENV` | `development`, `test`, or `production`; no insecure production fallback |
| `APP_ORIGIN` | Required canonical origin only: `new URL(value).origin === value`, no path/credentials/query/fragment; HTTPS in production |
| `MONGODB_URI` | Required database connection URI and database name; no default production credentials/connection |
| `SESSION_SECRET` | Required high-entropy secret, at least 32 decoded random bytes using a documented encoding; never commit or log it |
| `HOST` | Local/private bind address, initially `127.0.0.1`; production topology must prevent public direct access |
| `PORT` | Integer valid port, initially 3000 in local examples |
| `TRUSTED_PROXY_CIDRS` | Empty in development; explicit verified non-wildcard proxy addresses in production; required for the TLS-terminating proxy target |

Do not expose arbitrary session-duration/hash/rate configuration through environment toggles that could silently relax policy. Tests inject deterministic clocks/schedulers/route-policy overrides through the test app factory only; production startup never reads test-bypass variables.

Use a small shared Mongo pool (initial max 10/min 0), bounded driver connection/server-selection timeouts, and owned shutdown. Validate readiness of unique email and session TTL indexes before listening. No fallback memory store. `.env.example` describes required values but contains no usable production secret. `.env`, browser storage, cookies, logs with sensitive payloads, and private credentials are excluded from Git.

## HTTP and static assets

Apply Helmet/security headers and metadata-only request logging to both API and assets. Serve built React assets and a non-API GET SPA fallback from the same process in production. Unknown `/api` routes remain JSON 404; they must not return the SPA. Do not run Vite's development server in production.

Session middleware is scoped to authentication API routes, not every asset request. Authentication responses are no-store. No broad credentialed CORS is enabled. Browser code uses only relative API URLs and the HttpOnly cookie; do not place session IDs in storage or JavaScript-readable tokens.

Record request ID, method/route, status, and elapsed time. Redact/omit body, password/hash, session cookie, authorization headers, connection URI, and stack traces from user-facing responses. Unexpected errors are logged without giving the client sensitive internals.

## Verification and operational limits

Test an actual proxy fixture that overwrites spoofed headers, maps different clients into the correct IP buckets, and makes HTTPS cookie decisions only from trusted ingress. Also test an untrusted socket peer's forged forwarding headers are ignored; for local fixtures, bind that client to a separate loopback address rather than merely changing a header.

Development/production cookie attributes, missing/invalid startup values, exact-origin fallback/rejection, API fallback routing, and native Argon2/image startup need execution evidence. A local Docker resource limit alone does not verify production hardware performance.

Multiple application instances would require shared/gateway rate limiting and a reconsidered global hash capacity boundary; Mongo sessions alone do not provide distributed admission or cross-tab ordering. Backup strategy, monitoring, redundancy, email verification, account recovery, and deployment automation remain disclosed operational gaps. Public GitHub delivery must contain source/configuration guidance without secrets; it is not deployment of this topology.
