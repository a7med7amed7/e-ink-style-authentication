# Playwright browser environment readiness

Runtime was checked with the pinned toolchain on this machine: Node `v24.22.0`, npm `11.19.1`, and `npx --no-install playwright --version` reported `1.64.1`.

The exact installation command, `PATH=/tmp/easygen-node-v24.22.0/bin:$PATH npx playwright install chromium firefox webkit`, exited 0 and downloaded the pinned Chromium 156.0.8078.4, Firefox 157.0, and WebKit 27.2 browser bundles.

A headless Playwright launch smoke succeeded for Chromium and Firefox. WebKit did not launch because the host is missing `libavif16` (`libavif.so.16`). The installer also reported this missing host dependency. `sudo -n true` confirmed that noninteractive privileged installation is unavailable. I downloaded/extracted candidate libraries under `/tmp` and retried with host validation skipped, but WebKit's launcher still could not locate `libavif.so.16`; no system packages or repository files were changed.

This is browser-environment readiness evidence only; no E2E tests were run. Chromium and Firefox are ready locally. WebKit remains blocked on the host dependency.
