# Authentication form accessibility evidence

Verified 2026-10-16 with Node `v24.22.0`, npm `11.19.1`, and the digest-pinned Playwright image `mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf` (`linux/amd64`). Browser versions are Chromium `156.0.8078.4`, Firefox `157.0`, and WebKit `27.2`. The build and browser runs used the project's healthy MongoDB service; auth identity checks were intercepted with deterministic anonymous/success responses where indicated by the tests.

## Results

The signup and signin forms retain their semantic labels and logical tab order. Keyboard tests verify the visible 3px focus ring, Enter/Space operation of the password visibility control with focus retained, client-validation summary announcement, first-invalid-field focus, and `aria-invalid`/`aria-describedby` association. Confirmed signup renders one welcome heading and no duplicate `alert` or `status` live region.

At 320px and 1280px, the forms fit without horizontal overflow or clipped main content. The primary submit controls meet the 44px minimum. Browser-computed text contrast and applicable control-boundary contrast pass the WCAG AA review thresholds (4.5:1 normal text, 3:1 large text and boundaries). Representative final color pairs are:

| Foreground / background | Contrast |
| --- | ---: |
| `#171717` page text / `#f2eee3` paper | 15.46:1 |
| `#171717` panel text / `#fffdf7` panel | 17.62:1 |
| `#003b70` links / `#f2eee3` paper | 9.74:1 |
| `#7b0000` validation text / `#fffdf7` panel | 11.21:1 |
| `#ffffff` primary-button text / `#111111` button | 18.88:1 |
| `#514d43` panel/control border / `#fffdf7` panel | 8.28:1 |

Reduced-motion emulation reports no transition or animation longer than `0.01ms`. The UI uses no animation to gate or delay form interaction.

## Commands and counts

An initial focused RED confirmed the unfinished behavior: the signup and signin validation tests could not find an error `role="alert"` and focus did not move to the first invalid field (2 failed, 18 skipped). The pre-style Chromium keyboard check also observed the browser-default outline (`auto`) rather than the required visible focus indicator. After implementation, the same focused tests passed 2/2; the complete forms file passed 20/20 at the T100 checkpoint.

The final page recovery updates were also checked in the form suite. Three signup cases prove that later verified or anonymous session observations replace contradictory recovery instructions while preserving applicable uncertainty; two signin cases prove the same for verified/anonymous recovery without inventing uncertainty for acknowledged POSTs. Those five new/strengthened paths failed before their page fixes and passed after. A later invalid-submit regression also failed on all three covered recovery paths before the pages gave field validation errors precedence; afterward, the validation summary wins while `AuthStatus` retains uncertain server-work disclosure. The final forms file passed 24/24, and the full web unit suite passed 105/105 across 10 files. These recovery-copy changes did not alter the form layout or stylesheet. The all-engine accessibility browser run and final focused 9/9 rerun occurred before T121/T122; no browser run of those recovery states is claimed.

`npm run build` passed after the final source and stylesheet changes. The full `accessibility:` browser run passed 15/15 (five scenarios in each of three engines). The final warm-paper/secondary-button CSS refinement was followed by a focused rerun of the changed style and keyboard surfaces, which passed 9/9 across the three engines:

```text
docker run --rm --platform linux/amd64 --ipc=host --network=host \
  --mount type=bind,source=/home/ahmed/projects/easygen_assessment,target=/workspace,readonly \
  --mount type=bind,source=/home/ahmed/.cache/easygen-toolchain/node-v24.22.0,target=/opt/node,readonly \
  --workdir /workspace \
  -e PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf \
  /opt/node/bin/node node_modules/@playwright/test/cli.js \
  test tests/e2e/accessibility.spec.ts -g 'keyboard order|layout' --output=/tmp/pw-t099-final
```

The full browser run used the same command with `-g 'accessibility:' --output=/tmp/pw-t098-final` and passed 15/15. Every current case in the file has the `accessibility:` prefix, so that run also covers the complete T100/K100 file; it was not rerun a second time without a grep that selects the same five cases. `npx eslint apps/web/src/components/auth-fields.tsx apps/web/src/main.tsx tests/e2e/accessibility.spec.ts apps/web/test/forms.test.tsx` and `git diff --check` exited 0.

## Screenshots

- [Signup at desktop width](accessibility/signup-desktop.png)
- [Signup at 320px](accessibility/signup-mobile.png)
- [Signup validation summary and focused field at 320px](accessibility/signup-errors-mobile.png)
- [Signin at desktop width](accessibility/signin-desktop.png)
- [Signin at 320px](accessibility/signin-mobile.png)

## Assistive-technology limits

The automated browser checks prove DOM semantics, focus behavior, computed contrast, layout, targets, and reduced-motion styles. They do not establish screen-reader speech. The Orca/Firefox bridge investigation confirmed Orca and Speech Dispatcher start and Gecko emits document-web focus. A bounded PyAT-SPI tree query timed out, and no field node or field/live-region spoken utterance was proven. Therefore actual spoken announcements remain **unverified**; this document does not claim full screen-reader conformance or complete accessibility certification. The T101 screen-reader acceptance point remains open until a field/error utterance is confirmed through the AT bridge.
