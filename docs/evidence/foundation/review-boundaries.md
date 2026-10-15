# Phase 2 foundation review

Read-only review of `apps/api/src/config.ts`, `apps/api/src/security/hash-work.ts`, `apps/api/src/security/password.service.ts`, and `apps/api/src/common/api-error.filter.ts` against the deployment, HTTP API, C05/C08, and T021/T022/T027/T034 contracts. Existing focused verification reports were used; I did not rerun broad suites.

## Spec compliance verdict

HashWork, PasswordService, and the API error boundary match the reviewed requirements. HashWork enforces 2 active / 4 FIFO waiters, monotonic 1000 ms deadlines checked by timer and dequeue, rejects excess/expired work without invoking it, releases slots after either settlement, and closes queued/future admissions. PasswordService uses Argon2id m=19456/t=2/p=1 with a 32-byte output, library-generated salts, and one precomputed dummy verifier; all hash/verify/dummy work uses the injected gate. The error helper emits the shared sanitized envelope, no-store, a validated/generated UUIDv4 echoed in `X-Request-Id`, and capacity `Retry-After: 1` without trusting inbound request-ID headers.

One actionable config gap remains: `validateProxyAddress` rejects only prefix `/0` (and wildcard literals), so production accepts broad CIDRs such as `10.0.0.0/8` and even `0.0.0.0/1`. T018/T021 explicitly require broad proxy trust to reject; currently tests exercise `/0` only. This can widen Express proxy trust beyond a verified narrow ingress. Add a policy bound for accepted CIDR width (or require literal IPs) and tests proving broad prefixes reject while the intended narrow proxy subnet still passes. Relevant code: `apps/api/src/config.ts:175-187`; current test: `apps/api/test/config.test.ts:137-153`.

## Quality verdict

The bounded work and password paths have meaningful deterministic/native coverage, and the error mapper has focused tests for sanitization, field allowlisting, status mapping, headers, and request IDs. Per-lane reports record passing focused K022 (5/5), K027 (3/3), and K034 (6/6), plus relevant targeted lint/API typechecks. I found no other contract mismatch in these four files. Config focused K021 coverage is useful but misses broad nonzero CIDR prefixes, as noted above.

No files in the repository were modified for this review.
