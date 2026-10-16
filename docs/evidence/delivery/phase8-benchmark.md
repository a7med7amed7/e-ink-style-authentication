# Phase 8 benchmark lane

**Status:** T103/T104/T127 are green, the T125 CLI compiled and passed the inert-import test, and one native run completed after T102 went green. The exact raw measurements and summaries are in `docs/evidence/hash-benchmark.json`; no target-hardware performance claim is made.

## Runtime and task evidence

Commands used the persistent toolchain at `/home/ahmed/.cache/easygen-toolchain/node-v24.22.0/bin`: Node `v24.22.0`, npm `11.19.1`. The shell's default Node/npm are older and were not used.

- **T103 RED:** K103 initially failed compilation because `benchmark-hash-report.ts` did not exist (`TS2307`), as intended. After implementation, the exact K103 command passed 4/4, 0 skipped. It checks nearest-rank p50/p95/max, empty/invalid inputs, one/two-active report shape, separate native service/admitted/queue-wait metrics, lossless raw vectors, RSS/runtime/resource/target metadata, and that importing the compiled CLI produces no output and does not launch work.
- **T104/K104:** The same focused command passed 4/4 on the final tree. The pure reporter uses nearest-rank `ceil(p*n)-1`, requires at least 100 samples for both active profiles, preserves raw vectors beside summaries, reports throughput and queue outcomes, and labels target hardware unverified.
- **T127 RED/GREEN:** K127 first failed compilation on the missing limit helper, then passed 4/4. `parseCpuLimit` and `parseMemoryLimit` distinguish bounded, unlimited, and unavailable observations; malformed values return unavailable, never unlimited.
- **T125/K125:** `npm run build:api` passed after CLI/helper integration and the one gated K125 native invocation completed successfully. Owned ESLint passed for the CLI, report, limit helper, and both tests. The final K103/K104 run also verifies that compiled CLI import is inert with zero skips.

The final production-file sizes are within the task caps: `benchmark-hash.ts` 90 lines, `benchmark-hash-report.ts` 100 lines, and `benchmark-hash-limits.ts` 32 lines. Service latency measures native work after the gate starts it; admitted latency spans the `PasswordService.hash` call through its result; queue wait spans `HashWork.run` until callback start. The separate runtime queue probe holds two active jobs, observes four waiting jobs and seventh-job saturation, and waits for the actual 1000-ms gate timers before releasing the blockers. These are implementation facts; the probe's runtime result will only be claimed after the native command executes.

## Native observation (single K125/T105 run)

After T102 passed on Chromium, Firefox, and WebKit, the native command ran once under pinned Node 24.22.0/npm 11.19.1. Its JSON stdout, including every raw service/admitted/queue-wait sample, was captured in `docs/evidence/hash-benchmark.json`; the same observation serves K125 and T105, with no duplicate Argon2 run. The report's JSON structure was validated with `jq`; both modes have aligned raw counts, 100 one-active samples and 200 two-active samples, saturation was observed, all four queued jobs expired, and measured queue time was 1001.424 ms.

On this Linux x64 host (AMD Ryzen 5 4500U, Node v24.22.0, V8 13.6.233.17-node.57, ICU 78.3, six available parallel workers), one-active service p50/p95/max was 27.091/37.693/42.836 ms with 35.087 operations/s; two-active service p50/p95/max was 33.202/40.413/56.481 ms with 57.423 operations/s. Two-active admitted-call p95 was 40.455 ms. Baseline/peak RSS was 94,715,904/136,658,944 bytes. The cgroup CPU and memory limit files were unavailable, represented as `unavailable` rather than unlimited. These are local-host observations; the documented one-vCPU/512-MiB target remains unverified.

The single command was `npm run build:api && npm run benchmark:hash -- --stdout`; stdout was filtered only to remove npm's lifecycle preamble before saving the JSON. The direct K103 rerun before this sample was 4/4 with no skips, so it also checked the current compiled CLI import guard.

## Portable Docker task proposal

The current T106 image plus manual T107 ingress smoke does not provide a friendly portable app workflow. Add a supplemental T129 Compose task (root-owned task-plan update) to build/run the non-root app service beside the existing separate Mongo service. It should bind the app to an explicitly selected private bridge address, publish only a host-loopback port, require the documented secret and app environment without fallbacks, and use local development HTTP for the built same-origin SPA/API path. Keep the production HTTPS reverse-proxy instructions separate. Do not recommend Linux-only `--network host`; only claim tested Docker Engine behavior on the observed platform/architecture.

Read-only Docker Hub inspection with `docker buildx imagetools inspect node:24.22.0-bookworm-slim` verified the official Node 24.22.0 Bookworm-slim OCI index digest `sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5`, matching the research pin. Its runnable descriptors are `linux/amd64` (`sha256:ec857ea6bb60cb3d0fa4d97495590c5fe7d51be8572c307b55957eeb06569cf7`), `linux/arm64/v8` (`sha256:156e9bc7a0a267cc6ca77b4283e32b123479342df684ce297455d7b95ff5a6b5`), and `linux/ppc64le` (`sha256:aebbbd33159ba6a85f2374ab6e91688d3126d45217b3e7551bc5c40826648daa`); the other three index descriptors are attestation manifests with `unknown/unknown` platform metadata. This verifies registry metadata only; no image was pulled, built, or run and no platform execution is claimed.
