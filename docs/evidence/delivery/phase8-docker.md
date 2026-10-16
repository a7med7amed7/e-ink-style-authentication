# Phase 8 Docker lane report

## Final status

T106/T129/T107 evidence is complete for Docker Engine 29.8.0 on Linux/amd64. The built image, production runtime contents, native Argon2 loading, effective resource-limited hash run, private bridge app/Mongo workflow, loopback ingress, built SPA, signup, and cookie-authenticated identity smoke were exercised. The successful auth proof's scoped temporary firewall exception and all task-owned test resources were removed. The unchanged baseline Mongo service and volume remain running/present. No commit or tasks.md edit was made by this lane.

## T106 image

The exact K106 build completed with exit 0:

    docker build -t easygen-auth:assessment .

The final current image is sha256:530f8cc835670263184d5f6ceca0ec6e5e5a7439df7b82c367db19d6dae0d017, Linux/amd64, 260,131,613 bytes, user node, command node apps/api/dist/main.js. Build and runtime stages use official node:24.22.0-bookworm-slim pinned to sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5. A direct container hash/verify smoke returned {"loaded":true,"verify":true}. Runtime checks found playwright, @playwright/test, vite, tests, and apps/api/test absent.

The completed constrained benchmark and auth proof earlier used image sha256:f0476519688e8861d2115bbd35c69cec87b803be35048f0f1949834de1c46d62 (easygen-auth:local). After those runs, the tooling lane changed only root package.json scripts; the lockfile, app sources and dependency declarations did not change. The current assessment-tag image was rebuilt from the final source and independently passed the native Argon2 smoke. The two image IDs and their exact roles are reported in docs/evidence/container.md.

## T107 constrained native evidence

The raw per-operation report is docs/evidence/container-hash-benchmark.json, SHA-256 6226d50ce1e98d48480abfdb747ce4dd7c002c43dbc15c59388b0891b1654757. It records Argon2id m=19456 KiB, t=2, p=1, output 32 bytes; one active job / 100 operations at 36.342 ops/s and service p95 30.812 ms; two active jobs / 200 operations at 31.384 ops/s and service p95 83.298 ms. Baseline/peak RSS was 92,663,808 / 134,737,920 bytes. The queue saturated and four waiters timed out after 1,001.700 ms.

The actual retained benchmark container metadata was captured before cleanup: container ID d1d17184b5de577b64e1941045f166bb115834ed7a73c9108ba0186948b20516, name easygen-phase8-benchmark, image sha256:f0476519688e8861d2115bbd35c69cec87b803be35048f0f1949834de1c46d62, command node apps/api/dist/benchmark-hash.js --stdout, configured user node, bridge mode, NanoCpus=1000000000, Memory=536870912, exit 0. Inside the container the observed cgroup CPU quota was 100000 100000 and memory was 536870912 bytes. This is one constrained local Linux host observation; documented target hardware remains unverified.

## T129 Compose topology and config

compose.app.yaml and .env.example define the separate local app/Mongo profile. The top-level Compose name is easygen-app to keep plain Compose commands isolated from the existing easygen_assessment baseline project. Before that name was added, safe config-only inspection showed the app defaulting to easygen_assessment; after the change, safe config-only checks returned app-default=easygen-app, explicit override=phase8-recap, baseline=easygen_assessment. The active baseline Mongo container and volume labels remain easygen_assessment.

App HOST defaults to private bridge IP 172.30.0.3 on subnet 172.30.0.0/24; only 127.0.0.1:3000 is published. Mongo is a separate private service without a host-published port. SESSION_SECRET remains required with no usable default. The app has a Node fetch HTTP healthcheck against its configured private HOST/PORT, and finite Compose wait was used.

## T107 private app/auth proof

The successful proof command was:

    bash .superpowers/delegated-execution/phase8-docker-firewall-proof.sh

It used explicit task project phase8-recap and a fresh network ID 8bc0a5d52bb791b8277b82ccabe203d019282ea8e01fae3c7eca63795c7b9f49, subnet 172.30.0.0/24, bridge br-8bc0a5d52bb7, app 172.30.0.3, Mongo 172.30.0.2, and successful in-network mongo DNS resolution. Compose up --wait --wait-timeout 60 observed the app healthy. The app ran as node on Node v24.22.0 linux x64. App-self HTTP, host direct bridge IP, and host-loopback published port all returned 200. docker-proxy targeted 172.30.0.3:3000 and the app listener was bound to that private address. The built SPA returned 200, signup returned 201, and cookie-authenticated GET /api/auth/me returned 200.

### Host firewall cause and temporary proof accommodation

An initial exact app-to-Mongo allow placed before filter_FORWARD's terminal reject did not match because nftrace showed that inet firewalld filter_FORWARD first jumps to filter_FORWARD_POLICIES, whose filter_FWD_public path returned and then reached a nested catch-all admin-prohibited reject. The trace-only diagnostic rule was removed and its marker absence verified. Exact packet/chain trace evidence is in phase8-docker-nftrace.md.

After root authorization and reviewer acknowledgment, the final proof inserted one runtime-only rule immediately before the freshly verified jump filter_FORWARD_POLICIES in inet firewalld filter_FORWARD, after established/related and invalid-state checks. Its tuple was iif/oif br-8bc0a5d52bb7, source 172.30.0.3, destination 172.30.0.2, TCP dport 27017, ct state new, counter accept. Comment phase8-t107-qa-9260db27-5f70-49ba-96a8-6981ad33914d, handle 433, counter 4 packets / 240 bytes. The trap deleted only this exact verified handle/comment and confirmed marker absence. No reply rule, broad host policy change, persistent firewall rule, or host-network app configuration was added. The unrelated raw-table drop counter stayed at 0 packets / 0 bytes.

## Cleanup and remaining deployment scope

The wrapper removed the private app/Mongo stack, its task-owned volume and bridge, probe and diagnostic containers, and temporary env file. It verified the baseline easygen_assessment-mongo-1 remained running and easygen_assessment_mongo-data remained present. The trace diagnostic likewise removed its exact trace marker and owned resources.

The exited easygen-phase8-benchmark container metadata above was saved to docs/evidence/container.md and this report; the container itself was then removed. No phase8-recap containers, private network/volume, diagnostic containers, temporary secret file, or phase8 nft markers remain. Production HTTPS, secure production cookie behavior, proxy trust deployment, cross-platform Docker Desktop execution, and target-hardware performance are not established by this local Docker lane.
