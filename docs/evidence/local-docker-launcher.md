# T136 local Docker launcher

**Historical T136 evidence:** the bridge-startup limitation below is superseded by the [T137 default startup fix](local-docker-startup-fix.md). The current command has been verified on this host without firewall changes.


Observed on 2026-10-16 with Docker Compose 2.29.2, Docker Engine 29.8.0, and Linux/amd64. This report covers only `compose.app.yaml` and the Docker guidance in `README.md`; the Dockerfile, API secret validation, deployment contract, and baseline `compose.yaml` were left unchanged. No `.env` was present, no secret value was printed, and no host firewall rule was added or changed.

## Configuration and secret initialization

`docker compose -f compose.app.yaml config --quiet` exited 0 with `SESSION_SECRET`, `DOCKER_APP_HOST`, and `DOCKER_APP_SUBNET` unset. The default project resolves to `easygen-app`; app bind address is `172.30.0.3` on `172.30.0.0/24`; the only app publish is `127.0.0.1:3000:3000`; Mongo has no published port. The app mounts the `session-secret` volume read-only. Its actual container command, confirmed through `docker inspect` without inspecting environment values, is:

    sh -c 'export SESSION_SECRET="${SESSION_SECRET:-$(cat /run/easygen-session/session-secret)}"; exec node apps/api/dist/main.js'

The initializer runs as `0:0` with `network_mode: none` and uses the same digest-pinned Node 24.22.0 Bookworm-slim image as the app. It validates an existing key as a regular file containing canonical base64 for exactly 32 bytes, or creates one from `crypto.randomBytes(32)`. A metadata-only probe reported UID:GID `1000:1000`, file mode `0400`, 44 encoded bytes, and 32 decoded bytes; the directory was owned by `1000:1000` with mode `0500`. The initializer ran a second time and an internal hash equality check confirmed it reused the same file; no hash or key was emitted.

On the same QA volume, the app's blank-environment fallback check returned `fallbackMatches=true`, `decodedBytes=32`, `canonical=true`. A separately generated random override check returned `overrideWins=true`. Both checks ran inside the Node image as UID `node`, with the volume mounted read-only, and emitted only those booleans and numeric metadata.

## Compose startup and host limitation

The bounded full Compose command was run in a unique project to avoid touching the default `easygen-app` project:

    env -u SESSION_SECRET -u DOCKER_APP_HOST -u DOCKER_APP_SUBNET \
      docker compose -p easygen-launcher-qa-20261016 -f compose.app.yaml \
      up --build --wait --wait-timeout 60

The build completed as image `sha256:a1dd89ba978aeaeb1739e22f6d37e8c3483dedd57431d9685f93e8f056d0f6c0`. The initializer exited 0 and Mongo became healthy. Compose then started the non-root app, which exited 1 when its connection to the private Mongo endpoint `172.30.0.2:27017` returned `EHOSTUNREACH`. This is the already documented host firewalld forwarding restriction; no firewall rule was changed. The observed logs show Nest startup followed by the database connection failure, with no missing/invalid secret error. This direct private-bridge attempt did not pass the app healthcheck.

## Bounded HTTP adapter

To verify app startup without changing the host firewall or using baseline Mongo, the same uniquely named QA Compose project was recreated with its own Mongo data volume. A temporary Compose override published only Mongo's port as `127.0.0.1:27018:27017`; the override lived under `/tmp`, not in the repository. The image app ran in a temporary host-network QA container as user `node`, with the generated Compose secret volume mounted read-only and `SESSION_SECRET` empty. The shell fallback wrapper was the same as the Compose command. Its Mongo URI targeted only `mongodb://127.0.0.1:27018/easygen_launcher_qa_20261016`; the API bound to `127.0.0.1:35173`.

The bounded app container used this secret-loading wrapper and invoked the compiled API's exported `startApi()` through Node's ESM eval so any startup exception would include its message and stack in the retained log:

    export SESSION_SECRET="${SESSION_SECRET:-$(cat /run/easygen-session/session-secret)}"; \
      exec node --input-type=module -e 'import { startApi } from "file:///app/apps/api/dist/main.js"; startApi().then(()=>console.log("ADAPTER_APP_STARTED")).catch((error)=>{console.error(JSON.stringify({name:error?.name,code:error?.code,message:error?.message,stack:error?.stack}));process.exitCode=1;});'

The bounded HTTP checks passed: `/` returned 200, `/signin` returned 200, and anonymous `/api/auth/me` returned 401. The app process remained running as `node`. This adapter verifies the image startup and secret-volume fallback against an isolated Mongo service; host networking is a QA-only accommodation and does not validate the recommended private-bridge forwarding path. App and Mongo logs are retained at:

    /home/ahmed/.cache/easygen-qa/t136-docker-launcher/host-network-adapter-app.log
    /home/ahmed/.cache/easygen-qa/t136-docker-launcher/host-network-adapter-mongo.log

Earlier temporary-Mongo adapter attempts did not pass HTTP. The diagnostic attempt reported `MongoServerError` code `14031`; its error message and stack were not retained, so its cause is unknown and it is not treated as a product finding. The approved follow-up against the normal Compose Mongo service passed HTTP checks above.

## Cleanup

The QA Compose project was stopped with `down -v`; its app/Mongo/init containers, both named volumes, private bridge, temporary loopback publish, and `/tmp` override were removed. The host-network app adapter container was removed after its logs were saved. Ports 27018 and 35173 are free. No QA project container, volume, or network remains. The baseline `easygen_assessment-mongo-1` remained healthy with the same container ID before and after cleanup: `7187768d9908c40d2ebbdece57270db297461d165e4c861359f5ef3a3f5d26fc`.

The documented default `docker compose -f compose.app.yaml up --build --wait` now needs no `.env`, host Node, or manual session key. On hosts with a forwarding policy like this machine's, the private app-to-Mongo path still needs that host policy to permit the flow; Compose intentionally does not alter host firewall settings.

Root independently ran exact K136 with all three optional environment variables unset and `--env-file /dev/null`: Compose configuration exited 0 without output. Runtime code, dependencies, Dockerfile, and frontend were unchanged; the 294-test application result remains attributed to its earlier tested revision, and was not rerun for this Compose/documentation follow-up.
