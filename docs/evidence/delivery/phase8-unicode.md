# Phase 8 Unicode browser evidence — T102 and T128

## T102 test design

`tests/e2e/unicode.spec.ts` imports the single fixture source at `packages/auth-contract/test/unicode-cases.ts`. It compares Node results with the actual built `packages/auth-contract/dist/password.js` loaded in each browser through a Playwright `route.fulfill` for `tests/e2e/fixtures/unicode.html` and the built module. The HTML/module URLs exist only in test routing; no production route was added.

Each browser case checks all eight required signup examples, six forbidden-category examples, the post-NFC 7/8/128/129-code-point values, composed/decomposed equivalence, combining-mark preservation, and signin's empty/short/overlong behavior. Each case also creates a real account through the API with the decomposed password and signs in through the application UI using its composed NFC equivalent.

## T128 root cause and correction

The first all-engine run was **2/3**: Chromium and WebKit passed, while Firefox differed on both isolated-surrogate (`Cs`) cases. Diagnostics confirmed Playwright preserved the exact input UTF-16 code units: high surrogate `55296` (`0xD800`) and low surrogate `56320` (`0xDC00`). In Firefox, raw `/\p{Cs}/u` and the combined forbidden-category regex matched both inputs. However, Firefox 157's direct `String.prototype.normalize('NFC')` converted either isolated surrogate to U+FFFD (`65533`); U+FFFD is a symbol, so the prior shared validator accepted it after normalization. This ruled out Playwright argument serialization and located the divergence in browser normalization.

T128 adds Node regression coverage showing canonicalization preserves lone high/low surrogate code units, signup rejects them, and signin retains its existing required/maximum-only behavior. `canonicalizePassword` now normalizes well-formed UTF-16 spans around isolated surrogate barriers. Valid surrogate pairs stay in those spans and remain normally normalized. The browser test continues to assert the shared forbidden fixture is rejected; no expectation was weakened.

## Verification

- `PATH=/home/ahmed/.cache/easygen-toolchain/node-v24.22.0/bin:$PATH npm run test:unit --workspace @easygen/auth-contract` — **54/54 passed** after the regression and fix.
- `PATH=/home/ahmed/.cache/easygen-toolchain/node-v24.22.0/bin:$PATH npm run build` — **exit 0** for shared package, API, and web app after T128.
- Focused Firefox rerun using the pinned Playwright image — **1/1 passed** after T128.
- Final all-engine K102 run — **3/3 passed**, one run per engine, including actual decomposed-signup/composed-signin authentication in each.
- The generated E2E database was absent after the final run; the Mongo database-name inspection returned `[]`.

The final browser command was:

```sh
docker run --rm --platform linux/amd64 --ipc=host --network=host \
  --mount type=bind,source=/home/ahmed/projects/easygen_assessment,target=/workspace,readonly \
  --mount type=bind,source=/home/ahmed/.cache/easygen-toolchain/node-v24.22.0,target=/opt/node,readonly \
  --workdir /workspace \
  -e PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf \
  /opt/node/bin/node node_modules/@playwright/test/cli.js test tests/e2e/unicode.spec.ts \
  --grep 'unicode:' --output=/tmp/pw-t102-final
```

The run recorded Node **24.22.0**, ICU **78.3**, Chromium **156.0.8078.4**, Firefox **157.0**, and WebKit **27.2**. Evidence covers linux/amd64 only; no Windows, macOS, arm64, or other Unicode/ICU runtime compatibility is claimed. Unicode category assignments for newly assigned characters remain runtime-version dependent as documented by the contract.
