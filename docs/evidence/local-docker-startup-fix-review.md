# T137 local Docker startup fix review

## Verdict

Approved. The Compose topology and updated Docker guidance address the reproduced launch failure. No blocking source or documentation findings remain.

## Review evidence

- The prior app-to-Mongo connection to `172.30.0.2:27017` failed with `EHOSTUNREACH`. The new layout gives the Mongo container the private address, binds Mongo only to namespace loopback, and has the app share that network namespace and connect to `127.0.0.1:27017`. The app retains its private-interface bind.
- Read-only container inspection confirms the app runs as `node`, uses `network_mode: service:mongo`, mounts the generated-secret volume with `RW=false`, and receives no published ports of its own. Mongo's only host publish is `127.0.0.1:3000`; port 27017 has no host publish. Mongo runs with `--bind_ip 127.0.0.1`.
- The persisted T137 report records the exact documented `up --build --wait` command succeeding on the existing project with its Mongo and session-secret volumes preserved, then succeeding again. It records SPA/sign-in 200, signup 201, authenticated `/api/auth/me` 200, logout 204, and logged-out `/api/auth/me` 401.
- A Compose-managed Mongo restart restarted the dependent app, returned both health checks to healthy, and preserved the authenticated session. The test account/session were removed; the final default launch left both services healthy and the baseline Mongo untouched.
- README now describes the shared namespace as the current layout, retains T136's bridge failure only as historical evidence, and explains the one-time `down` without `-v` migration while preserving named volumes. The Linux/amd64 verification scope is explicit. No firewall rule was changed.
- `git diff --check` passed. No source edits or broad test suites were run during this review.

Evidence: `.superpowers/delegated-execution/local-docker-startup-fix.md` and the retained captures under `/home/ahmed/.cache/easygen-qa/t137-docker-startup/`.
