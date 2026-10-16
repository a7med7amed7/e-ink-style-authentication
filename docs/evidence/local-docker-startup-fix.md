# T137 local Docker startup fix

Status: implemented and verified on the default `easygen-app` project. Source changes are limited to `compose.app.yaml` and `README.md`; no host firewall policy, API source, or Dockerfile was changed.

## Reproduced cause and correction

Before migration, the default project had an exited app container and a healthy Mongo container. The saved app log contains `MongoNetworkError: connect EHOSTUNREACH 172.30.0.2:27017` (`errno -113`, `syscall connect`, `address 172.30.0.2`, `port 27017`). The prior layout placed the app at `172.30.0.3` and Mongo at `.2`, so database startup crossed the host's rejected private-bridge forwarding path.

The updated Compose topology keeps separate app and Mongo containers but gives the Mongo container the configured private app address (default `172.30.0.3`) and publishes only `127.0.0.1:3000`. Mongo listens on `127.0.0.1:27017`; the app uses `network_mode: service:mongo` and connects to `mongodb://127.0.0.1:27017/easygen`. The app retains its private-interface `HOST` binding, non-root runtime, health check, and readonly generated-secret mount. The app's Compose dependency restarts it when Mongo is explicitly restarted through Compose.

## Preserved state and execution

Before changing the running project, private captures were saved in `/home/ahmed/.cache/easygen-qa/t137-docker-startup/`. The old app was exited and Mongo healthy. The original named volumes were `easygen-app_mongo-data` and `easygen-app_session-secret`; the `easygen` database had zero users and zero sessions. I ran `docker compose -f compose.app.yaml down` without `-v`, confirmed both volumes remained, and confirmed the unrelated baseline `easygen_assessment-mongo-1` stayed healthy with ID `7187768d9908c40d2ebbdece57270db297461d165e4c861359f5ef3a3f5d26fc`.

With no `.env` session-key override, `docker compose -f compose.app.yaml config --quiet` passed. The exact command `docker compose -f compose.app.yaml up --build --wait`, run with an external 120-second guard, exited 0; it was repeated and again exited 0. The final app image ID is `sha256:cb77692199bfa96936f782257c5ad22608c49ba2adeda7712d0022d83b2c74b4`.

Runtime inspection showed project network `easygen-app_private`, subnet `172.30.0.0/24`, Mongo address `172.30.0.3`, app network mode `container:4c35a53118efb5d2e881754119fa3ffcc7f23a9f320b8a1f4c3ffff723c75ed2`, and host port binding `127.0.0.1:3000 -> 3000/tcp`. Mongo was started with `mongod --bind_ip 127.0.0.1`. The running app process was `node apps/api/dist/main.js`, UID 1000, Node `v24.22.0`. Mongo's database port was not host-published.

Initial HTTP checks against the documented `http://localhost:3000` returned SPA `200`, `/signin` `200`, and anonymous `/api/auth/me` `401`. A first disposable test account was signed up via `127.0.0.1`; its cookie authenticated `/api/auth/me` (`200`). The account and session stayed present during the repeated exact `up --build --wait` command.

I then ran `docker compose -f compose.app.yaml restart mongo`. Compose restarted both Mongo and its dependent app. `docker compose -f compose.app.yaml up --wait` returned both health checks to healthy, and the same first account's cookie still resolved to that identity (`200`), proving the session and stored Mongo state survived the restart. I logged out that session (`204`), confirmed the cookie then received `401`, and deleted that test account. The database returned to zero users and zero sessions.

After the restart check, I created a second disposable test account through the documented `http://localhost:3000` hostname. Signup returned `201`, cookie-authenticated `/api/auth/me` returned `200`, logout returned `204`, and the same cookie then received `401`. That second account and session were also deleted; the database again returned to zero users and zero sessions.

The preserved generated-key file remained 44 bytes (canonical base64 for 32 random bytes), UID:GID `1000:1000`, mode `0400`, mounted readonly to the app. The app's PID 1 `SESSION_SECRET` matched that stored file. A locally computed SHA-256 fingerprint before migration and after all restarts was equal; the digest and key are intentionally not recorded. The named volumes remained `easygen-app_mongo-data` and `easygen-app_session-secret`.

The final exact `up --build --wait` invocation exited 0 after test cleanup. Both app and Mongo were healthy; only `127.0.0.1:3000` was published; the baseline Mongo container remained unchanged and healthy. The default stack was left running. No host firewall rules were changed.

One initial fingerprint-comparison wrapper ran before its post-migration fingerprint file had been generated; that comparison was invalid and did not modify Docker state. The post-migration fingerprint was then captured from the running app's mounted secret and compared equal to the pre-migration fingerprint.

Raw command captures, private test-cookie/email files, and before/after secret fingerprints are kept under `/home/ahmed/.cache/easygen-qa/t137-docker-startup/` with owner-only permissions. Secret values, fingerprints, cookie values, and test-account identifiers are not included here.
