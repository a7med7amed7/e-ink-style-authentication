# Final lint, typecheck, and build evidence

K113 was run after the T133 route-limit correction, T134 session-recovery change, and T135 IPv6 private-bind validation fix. Its source content is the same as commit `e842bb5cdb5ae33ca6f87b93ad05cc283fc85b96`; the commit was created while the command was running, with no source changes during the run.

The exact command was:

```sh
npm run lint && npm run typecheck && npm run build
```

It ran in `mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf` on Linux/amd64, with Node v24.22.0 and npm 11.19.1 mounted from `/home/ahmed/.cache/easygen-toolchain/node-v24.22.0`, UID/GID 1000, and `HOME=/tmp`. Lint, workspace and E2E typechecks, and shared-contract, API, and web production builds all exited 0. Vite emitted the production SPA bundle.

The complete command output is preserved at `/home/ahmed/.cache/easygen-qa/repro-phase8/logs/phase9/k113-post-t135.log`. Earlier K113 logs from before T133/T134/T135 are retained separately and superseded by this run.

The built same-origin HTTP smoke for startup, SPA fallback, and JSON API 404 is recorded with the current-image verification in [final verification](final-verification.md); it was not part of this K113 command. The clean-source verification and current-image HTTP/native-Argon2 smoke also passed, as documented there.
