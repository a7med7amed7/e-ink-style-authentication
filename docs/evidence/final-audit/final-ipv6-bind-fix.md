# T135 IPv6 private-bind fix

## Change

`isPrivateBindAddress` now parses the normalized IPv6 address's first hextet and accepts the ULA range `0xfc00` through `0xfdff`, alongside the existing `::1` loopback case. Config tests cover lower/upper ULA boundaries and reject `fc::1`, `fd1::1`, `fbff::1`, and `fe00::1`. IPv4 bind handling is unchanged.

The new regression failed against the old implementation: `config.test.js` reported “Missing expected exception: fc::1”. It passes after the range check.

## Verification

- Focused config test: 8/8 passed, zero skipped.
- Full API unit suite (`npm run test:unit:api`): 69/69 passed, zero skipped.
- `npm run lint`: passed.
- `npm run typecheck`: passed, including API, web, shared, and E2E checks.
- A pinned Node 24.22.0 direct `parseConfig` probe used only a synthetic 32-byte secret and printed no secret value; it confirmed `fc::1` and `fd1::1` now reject while `fc00::1`, `fd00::1`, and `::1` accept.

No integration or repository-wide final verification was run as part of this task.
