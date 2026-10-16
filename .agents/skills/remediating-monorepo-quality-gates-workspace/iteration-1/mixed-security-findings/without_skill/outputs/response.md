# Mixed security findings: classification and remediation

## Executive disposition

| Finding | Classification | Action | Gate effect |
| --- | --- | --- | --- |
| A. Gateway identity secret uses ordinary string equality | **Confirmed, actionable security finding** | Replace the reachable direct comparison with the repository's shared secret-verification primitive and add regression coverage at the request boundary. | **Blocks readiness until fixed and verified.** |
| B. Request HMAC signature is allegedly timing-vulnerable | **False positive for the inspected call path** | Preserve the implementation. Record the full call-chain and helper evidence, retain/add focused tests, and close or narrowly suppress this exact finding. | Does not block once the evidence is attached. |

The two reports must not be handled as a batch based only on similar words such as “secret” or “signature.” Each sink and its reachable implementation must be traced independently.

## Finding A: confirmed direct comparison

### Why it is valid

The inspected auth-service path reads attacker-controlled HTTP headers and compares the gateway secret with ordinary JavaScript equality:

- `platform/backend/services/auth/src/plugins/gateway-attestation.ts:20-21` reads `x-gateway-identity-secret` and uses `gwSecret === config.internal.gatewayIdentitySecret`.
- The hook is registered by `platform/backend/services/auth/src/index.ts:50`, and it runs for the `/api/auth` and `/api/v1/auth` route prefixes. This makes the comparison reachable from a request, rather than dead code or a test-only helper.
- `platform/backend/services/auth/src/services/auth.service.ts:448-475` contains a second direct comparison in `readGatewaySession`, reached through `resolveSession`; the controller calls it for logout and token-check handling. Even if the outer hook currently protects those routes, this is another secret comparison on the same trust boundary and should not remain as a latent unsafe implementation.

Ordinary string comparison may return as soon as it detects a mismatch. Network noise can make exploitation difficult, but it does not make an attacker-controlled, reachable secret comparison acceptable. This is a real implementation defect, not proof of secret compromise. Severity should be calibrated using actual network exposure, retry/rate limits, and secret entropy, but the security gate should remain failed until the code is remediated.

### Evidence required

The triage record should contain:

1. The scanner rule, commit, exact file and line, plus the expression being reported.
2. Data flow from the untrusted `x-gateway-identity-secret` header to the comparison and from configuration to the expected secret.
3. Reachability evidence: hook registration, affected route prefixes, and any controller/service call path that reaches a second comparison.
4. Existing boundary controls such as ingress restrictions and rate limits. These affect severity and exploitability, not whether the comparison is unsafe.
5. The remediation diff and fresh test, typecheck, lint, and security-scan output.

A repository-wide search is useful for finding candidates, but each hit must be separately inspected for reachability and semantics before expanding the finding's scope.

### Code that should change

Change only confirmed gateway-secret comparison sites, beginning with:

- `platform/backend/services/auth/src/plugins/gateway-attestation.ts`
- `platform/backend/services/auth/src/services/auth.service.ts`

Import and use the existing shared `verifySecret` function from `@wfe/shared-lib` instead of `===`/`!==` for the gateway secret. `verifySecret` fails closed for empty input and compares fixed-size HMAC-SHA256 digests with Node's `timingSafeEqual`, avoiding both prefix timing and direct secret-length comparison. Preserve the existing `x-gateway-verified` requirement, trimming/header normalization, response status, and error body. Do not introduce a new local crypto implementation.

For example, the hook's acceptance condition should be expressed in terms of `verifySecret(gwSecret, config.internal.gatewayIdentitySecret)`, and the `readGatewaySession` rejection condition should negate the same helper. Any additional reachable direct comparisons found on this trust boundary should receive the same narrowly scoped treatment.

### Regression tests required

Add or update auth-service tests at both the helper/call-site and HTTP boundary:

- A valid `x-gateway-verified: 1` plus the exact configured secret is accepted.
- Missing, empty, wrong same-length, wrong different-length, and multi-valued secrets are rejected with the existing status/body.
- A correct secret without the verified marker is rejected.
- `resolveSession`/token-check behavior still returns identity only for a valid gateway attestation, and logout does not trust forged identity headers.
- Shared `verifySecret` behavior covers equality, mismatch, empty/undefined input, and fixed-size digest comparison.

Behavioral acceptance/rejection tests alone would also pass with `===`, so add an enforceable structural regression guard (for example, a narrowly scoped lint/Semgrep rule forbidding direct equality of gateway/internal secret values), or a focused test that verifies the call site delegates to the shared primitive. Do not use wall-clock timing assertions; they are noisy and do not reliably prove constant-time behavior.

## Finding B: false positive on the inspected HMAC path

### Why it is not vulnerable as reported

The full production call chain is:

`platform/backend/services/integrations/src/routes/integrations.routes.ts`
→ `createStrictHmacPreHandler` / `verifyStrictHmacRequest` in `platform/backend/services/integrations/src/plugins/strict-hmac.ts`
→ `verifyRequestHmacSignature` in `platform/backend/shared/lib/src/security/request-hmac.ts`.

The shared verifier:

1. Rejects missing/empty signatures.
2. Decodes Base64 and requires exactly 32 decoded bytes, the fixed size of an HMAC-SHA256 digest.
3. Re-encodes the bytes and requires exact equality with the wire value, rejecting whitespace, invalid characters, missing/extra padding, and alternative encodings with changed unused pad bits.
4. Generates the expected HMAC over the bound method, path, canonical body, timestamp, and caller tag.
5. Rejects unequal decoded lengths before calling Node's `crypto.timingSafeEqual`.
6. Uses `timingSafeEqual` for the authenticity decision and has no fallback to ordinary string equality.

The pre-length check is correct: Node requires equal-length buffers, and the length here is the public, fixed SHA-256 digest size rather than secret material. The canonical Base64 string equality is an encoding-validation check performed before authentication; it does not compare the provided signature with the expected signature. Therefore the reported timing vulnerability does not exist on this resolved path.

### Evidence required

Attach all of the following rather than merely citing the helper's name:

- The route registration showing the internal endpoint uses the strict-HMAC pre-handler.
- The wrapper showing the received signature is passed unchanged to `verifyRequestHmacSignature` and that no alternate or legacy equality fallback exists.
- The resolved workspace/package version of `@wfe/shared-lib`, proving production builds use the inspected helper rather than a stale installed copy.
- The verifier source showing canonical decoding, fixed/unequal-length rejection, and the final `timingSafeEqual` call.
- Fresh test output for the shared helper and route-level HMAC suite.

Close the exact scanner occurrence as a false positive or add the narrowest possible line/rule suppression with that evidence. Do not globally suppress timing-attack rules.

### Code and tests

No production code should change in `strict-hmac.ts` or `request-hmac.ts` for finding B. Replacing the helper, adding custom padding, or comparing encoded strings would be a regression.

The shared tests in `platform/backend/shared/lib/src/security/__tests__/request-hmac.test.ts` already exercise valid signatures, unequal decoded length, malformed/non-canonical Base64, altered inputs, and wrong secrets. The route suite in `platform/backend/services/integrations/src/plugins/__tests__/strict-hmac.test.ts` already covers valid and invalid request behavior. Retain these tests and, if the scanner requires end-to-end proof, add route-level cases for a short decoded signature and non-canonical Base64 so the production wrapper-to-helper path is explicitly demonstrated. Fresh execution is still required; source inspection is not a substitute for passing test output.

## Final readiness verdict

**Not ready / security gate failed.** Finding B can be closed as an evidence-backed false positive and requires no remediation change, but finding A is confirmed and remains a release blocker. The verdict may change to **ready** only after all reachable in-scope direct gateway-secret comparisons are replaced with the shared verifier, the regression guard and boundary tests pass, typecheck/lint pass, and a fresh security scan no longer reports the actionable occurrence. No broad suppression or unrelated HMAC rewrite is justified.
