# Final browser evidence

K114 ran against commit `e842bb5cdb5ae33ca6f87b93ad05cc283fc85b96`, after the T133 route-limit correction, T134 session-recovery change, and T135 IPv6 private-bind validation fix. It invoked the repository runner with all discovered specs and an output directory outside the workspace:

```sh
npm run test:e2e -- --output /tmp/phase9-e2e-post-t135
```

The command ran in `mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf` on Linux/amd64, with Node v24.22.0, ICU 78.3, npm 11.19.1, UID/GID 1000, and `HOME=/tmp`. The runner executed each spec in a fresh application process. All 24 tests passed with no skips: accessibility 15/15, auth 6/6, and Unicode 3/3. Chromium 156.0.8078.4, Firefox 157.0, and WebKit 27.2 each completed the configured browser cases, including persistent-browser restart authentication and Unicode parity.

The full output is preserved at `/home/ahmed/.cache/easygen-qa/repro-phase8/logs/phase9/k114-post-t135.log`. The fresh clean-source `npm run verify` repeated these 24 browser tests as part of 294 passing checks; its archive and complete results are in [final verification](final-verification.md). Earlier browser runs from before T133/T134/T135 are retained as historical evidence and superseded by these runs. Cross-tab behavior remains deferred; actual Orca speech/error announcements remain unverified (T101).
