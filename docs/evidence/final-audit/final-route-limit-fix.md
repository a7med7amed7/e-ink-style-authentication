# Final audit: route-case rate-limit policy correction

## Finding and reproduction

The global Nest guard selected a policy using `req.originalUrl` before the matched Express route and looked up paths case-sensitively. Express matched uppercase aliases to the same auth handlers, while the guard missed the lowercase route-policy keys and used the default 120/minute policy.

The real-Mongo RED was captured after adding the regression and before changing production code. Commands, with Node 24.22.0 on `PATH`:

    npm run build:shared
    npm run build:test:api
    node --test --test-name-pattern='case variants and URL suffixes' apps/api/dist-test/test/test/security.integration.test.js

The focused integration test exited 1 as expected. With five lowercase signups followed by `POST /API/AUTH/SIGNUP/?source=case`, the variant returned 201, performed hash number six, and left six users. After ten lowercase signins, `POST /API/AUTH/SIGNIN?source=case` returned 401 and performed dummy verification number eleven. After thirty lowercase logouts, `POST /API/AUTH/LOGOUT/?source=case` returned 401. All three variant requests reached their case-insensitive Express handlers, but used the default policy.

## Change

In `apps/api/src/security/rate-limit.guard.ts`, the guard now selects `route.route.path` with `baseUrl` when Express has matched a route, then falls back to Express `path`/`url`/`originalUrl`. Policy normalization lowercases the path and removes query strings and trailing slashes. Route policy limits are unchanged; the fix does not alter Express routing, proxy handling, cookies, or environment semantics.

`apps/api/test/security.integration.test.ts` now checks that signup, signin, logout, and identity limits remain canonical for uppercase paths with query/trailing-slash variants. It verifies the respective 6th, 11th, 31st, and 121st requests are rate limited, include positive `Retry-After`, and rejected signup/signin requests perform no additional password hashing or verification.

## Verification

After the change, the focused integration regression passed (1/1), and `node --test apps/api/dist-test/test/test/rate-limit.test.js` passed 3/3. `npm run test:unit` passed 231 tests: 54 shared, 105 web, 69 API, and 3 tooling. `npm run test:integration` passed 35/35 against the real local MongoDB fixture.

The fresh full `npm run verify` is being held at the root's direction while it investigates a separate ProtectedRoute recovery audit candidate. The docs agent owns the K113/K114 browser/build checks and will run the required fresh final checks after that audit clears.
