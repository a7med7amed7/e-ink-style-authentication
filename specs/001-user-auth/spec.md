# Feature Specification: Secure User Authentication

**Feature Branch**: `master` (existing branch; no branch hook configured)
**Feature Directory**: `specs/001-user-auth`
**Created**: 2026-10-15
**Status**: Draft — specification validated; ready for planning
**Input**: Build a small authentication assessment with signup, signin, a protected welcome page, logout, and a modern e-ink interface. The user's Final Security & Reliability Contract supersedes conflicting original wording.

The user-facing requirements below describe required behavior. [Implementation contract](implementation-contract.md) preserves the user's mandatory technology, deployment, security settings, verification obligations, and delivery constraints. Both documents are normative; their separation does not make any contract requirement optional. No application implementation or execution evidence is claimed by this specification.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create an account and enter the application (Priority: P1)

A visitor creates an account with an email address, name, and password, then enters the application with a verified session.

**Why this priority**: Account creation is a required entry point and establishes the identity used by every subsequent flow.

**Independent Test**: Starting with no account or browser session, submit valid details and verify the welcome page and the current user's identity. Inspect persistence to confirm one account exists for the normalized email.

**Acceptance Scenarios**:

1. **Given** a new email and valid details, **When** the visitor signs up, **Then** one account is created, the session is persisted, and the visitor sees "Welcome to the application." after authentication is verified.
2. **Given** invalid or missing fields, **When** the visitor submits, **Then** invalid controls have associated errors, the server rejects invalid input, and no account or authenticated success is produced.
3. **Given** email addresses differing only in surrounding whitespace or letter case, **When** two or more registration attempts run concurrently, **Then** exactly one account is created and all otherwise-valid competing insertions receive a duplicate-account response.
4. **Given** signup creates the account but cannot persist its session, **When** the response is returned, **Then** it reports failure rather than authenticated success, keeps the account, and permits recovery through normal signin once service is available.
5. **Given** a signup response is lost, **When** the visitor returns, **Then** the application does not automatically repeat registration, does not claim success without evidence, and explains that the account may exist and signin is the recovery path.
6. **Given** canonically equivalent composed and decomposed passwords, **When** one is registered and the other is used to sign in, **Then** they authenticate as the same password.

---

### User Story 2 - Sign in and retain authorized access (Priority: P1)

An existing user signs in, refreshes or revisits the application, and retains access only while the session remains valid.

**Why this priority**: Returning users need dependable access, and the server must enforce authorization independently of what the browser displays.

**Independent Test**: Use a seeded account to sign in, refresh, restart the browser with its persistent cookie, and access the protected identity resource. Repeat anonymously and after controlled idle and absolute deadlines.

**Acceptance Scenarios**:

1. **Given** an existing account and correct credentials, **When** the user signs in, **Then** a new session identity replaces the prior session identity, is persisted before success, and verifies the intended user before protected content appears.
2. **Given** incorrect credentials or an unknown email, **When** signin is attempted, **Then** the same generic invalid-credentials response is returned without disclosing which credential failed.
3. **Given** a valid persistent session, **When** the user refreshes or restarts the browser before its deadlines, **Then** the application verifies the session and restores access without another signin.
4. **Given** no valid session, **When** a visitor opens a protected page or directly requests protected information, **Then** the server denies access and the browser does not flash protected content.
5. **Given** a session idle for 30 minutes, **When** access is checked at or after the idle deadline, **Then** the server rejects it even if its stored record has not yet been cleaned up.
6. **Given** an actively used session, **When** eight hours have elapsed since authentication, **Then** the server rejects it regardless of previous activity, renewed cookies, or delayed storage cleanup.
7. **Given** a session service outage, **When** the user signs in or requests protected information, **Then** the application reports unavailability and never treats the outage as successful authentication.

---

### User Story 3 - End the current session (Priority: P1)

An authenticated user signs out of this browser session while independent device sessions remain usable.

**Why this priority**: Logout is a deliberate requirement of the chosen delivery contract and must revoke server-side access.

**Independent Test**: Capture the session cookie, log out, confirm anonymous identity, then retry protected access with the captured cookie. Verify a separate device session still works.

**Acceptance Scenarios**:

1. **Given** an authenticated session, **When** logout succeeds, **Then** the server confirms destruction of that session, the matching browser cookie is cleared, and a subsequent identity check confirms anonymity before the UI reports confirmed logout.
2. **Given** a captured cookie from the logged-out session, **When** it is reused, **Then** protected access is rejected.
3. **Given** an independent session on another device, **When** the current session logs out, **Then** the other session remains valid.
4. **Given** logout cannot invalidate the server session, **When** the failure is received, **Then** the UI does not report confirmed logout or invalidation, even if a later identity check is anonymous.
5. **Given** a session already invalidated, **When** logout is repeated, **Then** unauthenticated rejection is acceptable and authentication is never restored.

---

### User Story 4 - Understand delayed and uncertain authentication (Priority: P1)

A user sees accurate authentication status during slow requests, network failures, and overlapping actions, with a way to check the session again.

**Why this priority**: A reassuring but false success message is a correctness failure, particularly after a delayed signin or failed logout.

**Independent Test**: Control request completion order and network outcomes in client tests. Delay an old identity response, request logout during signin, and simulate a rejected mutation response followed by successful and failed reconciliation.

**Acceptance Scenarios**:

1. **Given** an old identity check is pending, **When** a newer authentication transition completes and the old response arrives, **Then** the old response cannot restore or overwrite the newer authentication state.
2. **Given** signin remains unresolved, **When** the UI waiting threshold elapses, **Then** a non-blocking "Still verifying" message appears, the original mutation remains tracked, and no competing authentication mutation starts.
3. **Given** signin is pending, **When** logout is requested, **Then** logout waits for that tracked signin to settle before it starts; the two mutations do not overlap within the tab.
4. **Given** signin is unresolved, **When** a concurrent identity check reports anonymity, **Then** that observation does not establish that signin failed or that the final browser state is signed out.
5. **Given** a mutation settles with an ambiguous network outcome, **When** identity reconciliation also fails, **Then** the state remains unknown, protected content stays hidden, and the user can explicitly check the session again.
6. **Given** mutation transport rejects but older server work may still run, **When** a later identity check is anonymous, **Then** the application may describe that observed browser state without claiming the older operation or session invalidation was proven complete.
7. **Given** the browser shares a cookie across tabs, **When** a tab regains focus or enters relevant navigation, **Then** it rechecks identity; no global action ordering across tabs is promised.

---

### User Story 5 - Receive safe, accessible feedback (Priority: P1)

A visitor can use signup and signin on mobile or desktop, with keyboard and assistive technology, and understand validation, security rejection, and temporary capacity limits.

**Why this priority**: These are mandatory usability and abuse-resistance requirements, rather than optional styling work.

**Independent Test**: Exercise both forms using keyboard-only interaction and accessible names, inspect field/error associations and announcements, test narrow screens and reduced motion, then submit requests from untrusted origins and beyond configured limits.

**Acceptance Scenarios**:

1. **Given** either authentication form, **When** used by keyboard or assistive technology, **Then** all controls have explicit labels, logical focus order, visible focus, accessible error associations, and operable password visibility.
2. **Given** invalid data or a submission failure, **When** feedback appears, **Then** affected fields are identified and submission errors are announced without relying on color alone.
3. **Given** a narrow viewport or reduced-motion preference, **When** using the application, **Then** content remains usable, touch targets remain practical, contrast is sufficient, and animations never obstruct interaction.
4. **Given** an untrusted, null, or unverifiable request origin, **When** account creation, signin, or logout is attempted, **Then** the operation is rejected before account/session mutation.
5. **Given** an authentication attempt exceeds its rate limit, **When** submitted, **Then** it is rejected with retry guidance before expensive password work runs.
6. **Given** password-processing capacity is exhausted or a queued request waits too long, **When** another attempt is processed, **Then** it receives temporary-unavailability feedback with retry guidance instead of unbounded waiting or resource growth.

---

### User Story 6 - Reproduce and assess the delivery (Priority: P2)

An evaluator can obtain the public source, configure and run the application, reproduce checks, and understand the boundaries of its security and performance claims.

**Why this priority**: Reproducibility and honest evidence are mandatory delivery gates after the critical behavior works.

**Independent Test**: Follow the documented setup from a clean checkout, run the documented checks, inspect AI disclosure and evidence, and verify the public source location without needing undisclosed configuration.

**Acceptance Scenarios**:

1. **Given** a clean checkout and documented prerequisites, **When** an evaluator follows the README, **Then** configuration, startup validation, local startup, and verification commands are reproducible.
2. **Given** the submission, **When** its evidence is reviewed, **Then** every mandatory contract has a recorded result and implemented-and-tested, implemented-but-unverified, and deferred-and-documented behavior are distinguished.
3. **Given** password-processing measurements, **When** the evaluator reads them, **Then** hardware/runtime, one- and two-operation latency and memory, saturation/wait results, and target-performance verification status are explicit.
4. **Given** AI assistance was used, **When** AI.md is read, **Then** it describes actual assistance, effective prompts, refinements, corrections, engineering decisions, and verification results without invented work.

### Edge Cases

- Concurrent same-email insertions must resolve through persistent uniqueness, including case/whitespace variants. A preflight availability check alone is insufficient.
- Passwords at 8 and 128 code points, and outside those boundaries, are evaluated after canonicalization. A supplementary-plane symbol counts as one code point.
- Spaces are preserved in passwords but do not fulfill the special-character rule. Canonically equivalent passwords compare equivalently; forbidden invisible/control characters are rejected at signup.
- Unknown-account signin, wrong-password signin, and signin passwords that no longer meet signup composition rules must follow the distinct signin validation contract.
- A rolling session near the eight-hour deadline cannot acquire more authenticated lifetime through cookie renewal or storage refresh. Expiration enforcement cannot wait for record cleanup.
- Session read, save, or destruction failures cannot silently fall back to a successful result or volatile substitute. Account creation followed by session failure is a recoverable partial failure.
- A UI waiting message, abandoned promise, cancelled request, or network rejection is not proof that a mutation stopped on the server or that a browser cookie was never set.
- Anonymous identity evidence and acknowledged session destruction are different outcomes; failed destruction must remain distinguishable from a signed-out browser observation.
- Rapid double submissions and signin/logout overlap must be prevented within each supported tab. Cross-tab and arbitrary direct-client operation ordering are outside this guarantee.
- Requests with no Origin require a verifiable trusted Referer origin; missing both, an explicit null Origin, malformed origins, wrong content types, and missing/wrong AJAX headers are rejected under the contract.
- Forwarding headers supplied by an arbitrary public client must not bypass rate limits or change trusted origin/security decisions.
- Background tabs may temporarily display stale state; backend authorization remains authoritative and focus/navigation triggers revalidation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Visitors MUST be able to sign up with email, name, and password, sign in with email and password, and reach a protected page displaying exactly "Welcome to the application.".
- **FR-002**: Email MUST be required, trimmed, consistently lowercased, syntactically valid, and at most 254 characters. Provider-specific address rewriting MUST NOT be applied. Concurrent registration MUST create at most one account for each normalized email.
- **FR-003**: Name MUST be required and trimmed, with a minimum of 3 and a maximum of 80 characters. The shared interpretation and boundary tests are specified in the implementation contract.
- **FR-004**: Signup passwords MUST be normalized to NFC before validation and hashing, contain 8–128 Unicode code points, and contain at least one Unicode letter, decimal digit, and punctuation or symbol. Spaces MUST NOT satisfy the special-character rule. Control characters, formatting controls, lone surrogates, and line/paragraph separators MUST be rejected. Passwords MUST NOT be trimmed, case-folded, or otherwise modified.
- **FR-005**: Signin passwords MUST undergo the same NFC normalization, required-value check, and 128-code-point maximum check before verification, without reapplying signup minimum/composition rules or trimming.
- **FR-006**: Client feedback and authoritative server validation MUST agree on password canonicalization and signup rules; the specified Unicode examples, canonical equivalence, and code-point boundaries MUST be verified across the documented supported runtimes.
- **FR-007**: Invalid signin credentials MUST receive a generic rejection. Duplicate registration MUST receive a distinct conflict response; documentation MUST acknowledge this exposes account existence despite generic signin errors.
- **FR-008**: Protected information MUST require a valid server-verified session. Browser navigation protection MUST prevent protected-content flashes and MUST NOT replace server enforcement.
- **FR-009**: Successful authentication MUST change the session identifier, store only minimal session metadata, and persist the session before returning success. Password storage and bounded processing MUST follow the implementation contract.
- **FR-010**: A persistent session MUST survive refresh and browser restart until expiration. Activity MAY renew its 30-minute idle lifetime only while valid; the eight-hour lifetime from authentication MUST never be extended. Both deadlines MUST be enforced on the server during authentication, independently of eventual record cleanup.
- **FR-011**: Independent sessions MUST be permitted on separate devices. Tabs within one browser share its session. Logout MUST target only the presented current session and MUST NOT invalidate independent sessions.
- **FR-012**: Logout MUST destroy the current server-side session and clear its matching cookie. Confirmed logout requires both acknowledged destruction and subsequent anonymous identity confirmation. Reusing a destroyed session MUST fail; repeated logout MUST never restore authentication.
- **FR-013**: Session storage failures MUST fail closed. Recognized unavailability MUST produce a temporary service error. Failure to invalidate a session MUST NOT be reported as successful logout; no volatile fallback store is permitted.
- **FR-014**: If account creation succeeds but session persistence fails, the account MUST remain, authenticated success MUST NOT be returned, and normal signin MUST be the documented recovery route.
- **FR-015**: Every state-changing authentication operation, including signup and signin, MUST validate the trusted request origin and required request characteristics. Untrusted, null, or unverifiable origins MUST be rejected. Read operations MUST NOT change business state; ordinary idle renewal is permitted by session policy.
- **FR-016**: The deployment MUST use one explicitly configured public application origin, protected transport in production, narrowly trusted proxy behavior, validated required startup configuration, and the session/cookie protections defined in the implementation contract.
- **FR-017**: Per-client-IP request limits MUST be applied before expensive password operations: signup 5 per 15 minutes; signin 10 per minute; identity checks 120 per minute; logout 30 per minute. Rejections SHOULD provide usable retry guidance. Limiter test state MUST be isolated.
- **FR-018**: Signup password hashing and signin password verification MUST share a capacity boundary of at most 2 active operations, at most 4 waiting operations, and an initial maximum queue wait of 1 second. Saturation and wait exhaustion MUST return temporary unavailability with retry guidance. Unknown-account dummy work, if used, MUST share this boundary.
- **FR-019**: The application MUST distinguish unauthenticated, authenticating, authenticated, and unknown states. Unauthenticated requires verified anonymity without a conflicting tracked mutation; authenticated requires verified identity without such a conflict. Network ambiguity and session-storage errors MUST NOT become verified success.
- **FR-020**: Identity checks MUST be associated with the authentication/request generation; responses made stale by newer authentication transitions MUST be ignored.
- **FR-021**: Duplicate form submissions MUST be blocked. Session-mutating operations MUST be serialized within each supported tab. Logout requested during unresolved signin MUST wait until the tracked signin settles.
- **FR-022**: After the documented UI waiting threshold, the application MUST show a non-blocking "Still verifying" message and retain the unresolved mutation. The threshold MUST NOT release mutation serialization or imply cancellation/failure.
- **FR-023**: When a mutation settles, the application MUST reconcile identity. Failed confirmation MUST leave an unknown state and offer a session recheck. An anonymous identity response during unresolved signin MUST NOT prove signin failed. Cancellation or network rejection MUST NOT prove that server work ended.
- **FR-024**: User-facing outcomes MUST be evidence-based: intended-user confirmation for signin; explicit credential rejection for invalid credentials; authoritative anonymous identity for observed signed-out state or expiration when no conflicting tracked mutation remains; and acknowledged destruction plus anonymous confirmation for confirmed logout. Unacknowledged older server work MUST remain a documented limitation.
- **FR-025**: The application MUST revalidate identity on focus and relevant navigation. No atomic ordering across tabs or arbitrary external clients is promised; backend authorization MUST remain authoritative.
- **FR-026**: Signup and signin MUST NOT be automatically retried. Identity checks MAY be repeated. Credentials and cookies MUST NOT be cached/replayed for retry; a capture used solely to verify logout invalidation is test evidence, not application retry behavior. Signup MUST NOT be described as fully idempotent merely because duplicate attempts conflict.
- **FR-027**: Forms MUST use semantic controls, explicit accessible labels, invalid-state attributes, field/error associations, submission-error announcements, visible focus, logical tab order, keyboard-operable password visibility, sufficient contrast, and mobile-friendly touch targets.
- **FR-028**: The interface MUST use a modern e-ink/Kindle-inspired aesthetic, responsive layouts, and simple non-blocking animations that respect reduced-motion preferences. Usability takes precedence over visual polish.
- **FR-029**: Expected validation, authentication, origin, conflict, rate-limit, and recognized availability failures MUST have the exact response semantics defined in the implementation contract and understandable user feedback without exposing secrets.
- **FR-030**: Delivery MUST include public GitHub source, reproducible README instructions, and an honest AI.md describing actual assistance, prompts/approaches, corrections, decisions, and verification. Documentation MUST cover every topic in contract section C14.
- **FR-031**: Before completion claims, every mandatory behavior MUST be inspected against the actual implementation and supported by the critical verification evidence defined in the implementation contract. Optional checks MUST NOT be represented as executed when deferred.
- **FR-032**: Password-processing latency and process memory MUST be measured at one and two active operations, with bounded-queue/saturation evidence. Target-environment performance MUST be labeled unverified if the target was not exercised. Missed targets MUST report observations and revised capacity/resources before claiming the objective.
- **FR-033**: Production-readiness claims MUST be limited to the documented single-instance, same-origin secure deployment and available evidence. Unimplemented backups, monitoring, redundancy, email verification, and account recovery MUST be documented.

### Key Entities *(include if feature involves data)*

- **User account**: A persistent identity with a unique normalized email, display name, and password verifier. The password itself is not retained as account data.
- **Authenticated session**: A server-backed relationship to one user, with an identifier, authentication time, idle-expiration information, and a non-extendable absolute deadline. A user can have multiple independent sessions.
- **Client authentication state**: The current verified/unknown status, verified user when available, request generation, and tracked session mutation used to prevent stale or conflicting outcomes.
- **Admission state**: Temporary per-IP request counts and a bounded shared population of active/waiting password operations; these enforce capacity rather than represent durable account data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every mandatory signup, signin, protected-access, refresh, expiration, and logout acceptance scenario passes reproducibly; anonymous visitors receive zero protected user data in those scenarios.
- **SC-002**: For two or more concurrent otherwise-valid registrations using the same normalized email within configured request limits, exactly one account exists, one registration succeeds, and all duplicate insertions return conflicts.
- **SC-003**: Access is denied at or after both the 30-minute inactivity deadline and the eight-hour absolute deadline, even when expired storage records remain; replaying a logged-out session grants zero protected access.
- **SC-004**: Every required Unicode example and boundary case produces its specified result, and canonically equivalent password inputs authenticate equivalently in each documented supported runtime.
- **SC-005**: Every controlled delayed-response and uncertain-network scenario avoids false verified success; zero stale identity responses overwrite a newer authentication transition, and same-tab signin/logout mutations never overlap.
- **SC-006**: All required untrusted-origin and throttling scenarios are rejected. Throttled attempts perform zero expensive password operations; active password work never exceeds 2, the waiting population never exceeds 4, and queue wait exhaustion follows the 1-second policy under deterministic verification.
- **SC-007**: Every required form action can be completed using only a keyboard, required labels/error associations and announcements work with assistive technology, and the pages remain usable at a 320-CSS-pixel viewport with reduced motion enabled.
- **SC-008**: An evaluator can reproduce setup and all mandatory verification from the public source using the supplied instructions; every mandatory requirement has a recorded verification status and no unexecuted test is reported as passing.
- **SC-009**: Under the documented target configuration, the initial objective is a 95th-percentile password-processing latency below 500 ms at two active operations. The delivery records actual latency and memory for one and two operations and explicitly reports whether target performance is verified, missed, or unverified; a development-machine result alone cannot satisfy the target claim.
- **SC-010**: README.md and AI.md contain all mandated disclosures and boundaries; the final review assigns every mandatory contract to implemented-and-tested, implemented-but-unverified, or deferred-and-documented status. A missing mandatory security/correctness gate precludes the chosen production-readiness claim.

## Assumptions

- The later Final Security & Reliability Contract is authoritative. Signup/signin are public but guarded against abuse and cross-site request forgery; identity and logout require authentication. Logout is included despite being optional in the original brief.
- The assessment serves one ordinary user role. Identity-platform features, password reset, account recovery, and email verification are outside the delivery scope and must be disclosed as deferred.
- The target is one application-server instance with a separate persistent database and one secure public origin; development uses an explicitly configured localhost origin. Exact technology and operational constraints are binding in the linked implementation contract.
- Email/name limits use Unicode code points after their specified trimming/normalization so frontend and backend can agree. This fills an unspecified counting detail without changing the contract's explicit password rules.
- The UI waiting threshold is initially 5 seconds. This affects messaging only, never HTTP lifetime, server completion evidence, or mutation serialization. It must be documented and testable.
- The frontend support baseline is current stable Chromium, Firefox, and WebKit, with exact engine versions recorded when tested. Unicode-version compatibility limits must be documented alongside the pinned Node runtime; claiming support requires execution evidence.
- Accessibility review will use WCAG AA contrast benchmarks (4.5:1 normal text and 3:1 large text and applicable control boundaries) and at least 44-by-44-CSS-pixel primary touch targets. These are review defaults, not a claim of complete accessibility certification.
- No Spec Kit scaffold, active template, constitution, preset configuration, extension hooks, or feature directories existed at invocation. A minimal local template follows the standard Spec Kit section order; default sequential numbering selects `001-user-auth`. No branch creation or application scaffolding is implied.
- Distributed infrastructure, cross-tab atomic ordering, generic idempotency infrastructure, advanced fault injection, scale testing, full monitoring, deployment automation, and nonessential polish remain deferred as specified in the implementation contract. Mandatory security gates are not traded for optional polish.
