# Container build and runtime evidence

Observed on 2026-10-16 with Docker Engine 29.8.0 on Linux/amd64 (Ubuntu Core 24), Node 24.22.0, and the default Docker context. This evidence covers this host and architecture; it does not claim execution on Docker Desktop, Windows, macOS, or arm64.

## Image and native runtime

The final K106 build command completed successfully:

    docker build -t easygen-auth:assessment .

Both stages use the official Node 24.22.0 Bookworm-slim image pinned to OCI index digest sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5. The final image recorded after this build is sha256:530f8cc835670263184d5f6ceca0ec6e5e5a7439df7b82c367db19d6dae0d017, 260,131,613 bytes, Linux/amd64. Its configured user is node and command is node apps/api/dist/main.js. It contains the built shared contract, API, SPA, production Node dependencies, native Argon2 module, and compiled hash benchmark. The production image check confirmed playwright, @playwright/test, vite, tests, and apps/api/test are absent.

The final image loaded Argon2 and completed a hash/verify round trip:

    docker run --rm easygen-auth:assessment node -e 'import("argon2").then(async a=>{const hash=await a.hash("Phase8-Docker-Native-Smoke!");const verify=await a.verify(hash,"Phase8-Docker-Native-Smoke!");console.log(JSON.stringify({loaded:true,verify}));process.exitCode=verify?0:1})'
    {"loaded":true,"verify":true}

The one-active/two-active constrained measurements were captured earlier from image sha256:f0476519688e8861d2115bbd35c69cec87b803be35048f0f1949834de1c46d62 (tag easygen-auth:local, same pinned base, production dependency set and built application). The later assessment-tag rebuild changed root package scripts for tooling only; the lockfile and application sources/dependencies were unchanged. The final assessment image passed the native Argon2 smoke above.

## Resource-constrained hash observation

Before cleanup, the run container easygen-phase8-benchmark had exited 0. Its ID was d1d17184b5de577b64e1941045f166bb115834ed7a73c9108ba0186948b20516; it ran as node from the image noted above with command node apps/api/dist/benchmark-hash.js --stdout, bridge networking, NanoCpus=1000000000 (one CPU), and Memory=536870912 bytes (512 MiB). The measured cgroup limits were present: CPU quota 100000 100000, memory 536870912. Its metadata was saved to this evidence and the delegated-execution report, then the exited container was removed.

The raw JSON, including all per-operation service/admission/queue-wait observations, is in [container-hash-benchmark.json](container-hash-benchmark.json), SHA-256 6226d50ce1e98d48480abfdb747ce4dd7c002c43dbc15c59388b0891b1654757. It uses Argon2id with memory cost 19,456 KiB, time cost 2, parallelism 1, and 32-byte output.

| Active jobs | Operations | Throughput | Service p50 / p95 / max | Admitted p95 | Queue-wait p95 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 100 | 36.342/s | 26.808 / 30.812 / 44.895 ms | 30.830 ms | 0.022 ms |
| 2 | 200 | 31.384/s | 78.503 / 83.298 / 95.726 ms | 83.366 ms | 0.083 ms |

Process RSS was 92,663,808 bytes at baseline and 134,737,920 bytes at peak. The queue saturation probe saturated the gate and four waiters timed out at 1,001.700 ms. These are local, one-vCPU/512-MiB container observations on an AMD Ryzen 5 4500U host. The documented target hardware was not exercised; target performance remains unverified.

Reproduce the constrained raw run with:

    docker run --rm --cpus=1 --memory=512m easygen-auth:assessment node apps/api/dist/benchmark-hash.js --stdout

The CLI writes the JSON report to stdout. Keep that output intact when saving a new observation.

## Portable app Compose and private ingress proof

compose.app.yaml provides a separate app/Mongo stack on a regular bridge network. Its default Compose project is easygen-app; this was verified without -p. An explicit -p phase8-recap override was also verified for isolated testing. The unchanged baseline compose.yaml remains project easygen_assessment; its Mongo service and easygen_assessment_mongo-data volume remained running/present after the Docker proof and cleanup.

Compose configuration uses app address 172.30.0.3 on private subnet 172.30.0.0/24, publishes only 127.0.0.1:3000:3000, and does not publish the separate Mongo service. The app receives HOST=172.30.0.3, PORT=3000, APP_ORIGIN=http://localhost:3000, local development cookie settings, no trusted proxy addresses, and a required SESSION_SECRET. The healthcheck fetches the app at its configured private bind address; up --wait does not report readiness until the built app returns HTTP 200.

The tested configuration and normal local commands are:

    cp .env.example .env
    # Set SESSION_SECRET in .env to the output of: openssl rand -base64 32
    docker compose -f compose.app.yaml config --quiet
    docker compose -f compose.app.yaml up --build --wait --wait-timeout 60
    curl --fail http://localhost:3000/
    docker compose -f compose.app.yaml down

The configured secret requirement rejects a missing or empty value. The checked-in example contains no usable secret default. If the default subnet overlaps a local route or Docker network, set a different private DOCKER_APP_SUBNET and a matching private DOCKER_APP_HOST.

The successful built SPA/API/auth proof ran with explicit project phase8-recap, on fresh network ID 8bc0a5d52bb791b8277b82ccabe203d019282ea8e01fae3c7eca63795c7b9f49 (172.30.0.0/24, bridge br-8bc0a5d52bb7). The app was 172.30.0.3; the private Mongo endpoint and in-container DNS result for mongo were 172.30.0.2. The app container was healthy, ran as user node, and reported Node v24.22.0 linux x64.

The app's own HTTP fetch, host-to-bridge direct request, and host-loopback published request each returned 200. The app listener was bound to its private 172.30.0.3:3000 address; docker-proxy targeted that same endpoint, while the host published listener was 127.0.0.1:3000. The built SPA root returned 200, signup returned 201, and cookie-authenticated GET /api/auth/me returned 200 for the newly created smoke user.

This host's firewalld policy rejected new Docker-bridge forwarding by default. A single task-owned, temporary test rule was therefore inserted immediately before the freshly verified jump filter_FORWARD_POLICIES in inet firewalld filter_FORWARD. Its exact scope was bridge br-8bc0a5d52bb7 in both directions, source 172.30.0.3, destination 172.30.0.2, TCP destination port 27017, and ct state new; it accepted 4 packets / 240 bytes during the proof. Rule comment phase8-t107-qa-9260db27-5f70-49ba-96a8-6981ad33914d and handle 433 were deleted by the cleanup trap, and absence of the marker was verified. The unrelated raw-table drop counter stayed at 0 packets / 0 bytes. No persistent or broad host firewall changes were made.

After the proof, the private app/Mongo containers, task-owned volume and bridge, probe and diagnostic containers, and temporary environment file were removed. The baseline Mongo container remained running and its volume remained present. The production app's local Compose workflow does not use host networking; the temporary host rule above was only an accommodation for this verification machine's firewalld policy.

The Compose profile is for local HTTP development. Production HTTPS, secure host cookies, trusted proxy addresses, and actual deployment-resource performance remain separate deployment-contract requirements; these local container checks do not prove them.
