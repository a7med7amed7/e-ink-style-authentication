# Unicode browser/runtime verification

T102 ran the one shared fixture source in `packages/auth-contract/test/unicode-cases.ts` through Chromium, Firefox, and WebKit. Each browser loaded the actual built `packages/auth-contract/dist/password.js` via test-only Playwright routes, compared its results with Node, and then exercised real canonical-equivalent authentication: API signup with the decomposed password followed by browser signin with the composed equivalent.

The first browser run was **2/3**. Chromium and WebKit passed; Firefox exposed that `String.normalize('NFC')` converted isolated UTF-16 surrogates to U+FFFD before signup validation. The inputs arrived intact (`0xD800`/decimal **55296** and `0xDC00`/**56320**); raw `\p{Cs}` and the combined forbidden-category regex matched. The normalized code unit was **65533** in Firefox 157. T128 changed shared canonicalization to NFC-normalize well-formed spans and preserve lone surrogate units as barriers, so the existing Cs validator rejects them consistently. Tests retain the rejection expectation and verify signin's existing nonempty/max-length-only contract.

After the correction, the auth-contract unit suite passed **54/54**, full `npm run build` passed, focused Firefox passed **1/1**, and final K102 passed **3/3** across all configured browsers. Real composed/decomposed signup-to-signin authentication succeeded in all three. The final E2E teardown left no generated runner database.

Recorded runtime versions:

| Runtime | Version |
|---|---|
| Node | 24.22.0 |
| ICU | 78.3 |
| Chromium | 156.0.8078.4 |
| Firefox | 157.0 |
| WebKit | 27.2 |

The browser run used the pinned Playwright container on linux/amd64. It does not establish Windows, macOS, arm64, or other browser/runtime Unicode compatibility. Unicode category tables can vary for newly assigned characters across runtime versions.
