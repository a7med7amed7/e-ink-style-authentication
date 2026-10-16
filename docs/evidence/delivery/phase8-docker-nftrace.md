# Phase 8 bounded Docker packet trace

## Pre-mutation cleanup record

The only planned host ruleset mutation is a temporary trace-only rule in `ip filter FORWARD`, inserted before the freshly inspected first Docker jump. It matches only source `172.30.0.3`, destination `172.30.0.2`, TCP destination port `27017`, and `ct state new`; it sets `meta nftrace` and increments a counter. It has no `accept`, `drop`, `reject`, NAT, or interface mutation. The rule carries a per-invocation UUID comment beginning `phase8-t107-nftrace-`.

The durable wrapper is `.superpowers/delegated-execution/phase8-docker-nftrace-proof.sh`. Its EXIT/INT/TERM/HUP trap searches only `ip filter FORWARD` for that exact unique marker, verifies the exact current handle, deletes only that handle, and verifies the marker is absent before removing the diagnostic container. It then removes only the task-owned `phase8-recap` probe/Compose containers, volume, network and temporary env file; the baseline Mongo service and volume are checked afterward. If the shell is interrupted before its trap completes, inspect the exact chain with `docker exec phase8-diag-tools nft -a list chain ip filter FORWARD`, verify a single full marker and matching handle, delete only `nft delete rule ip filter FORWARD handle <verified-handle>`, and verify the marker is absent from that chain before tearing down the task-owned stack.

The trace is bounded to one TCP connection from the existing app-network probe. `nft monitor trace` runs for at most 8 seconds inside the disposable diagnostic container. The Compose app remains stopped. No accept rule is installed as part of this trace investigation.

## Execution record

Trace-only proof completed and cleaned successfully:

- Docker context `default`, Engine `29.8.0` (`linux/amd64`); IPv4 forwarding is enabled (`/proc/sys/net/ipv4/ip_forward=1`).
- Fresh Compose project/network `phase8-recap` / `phase8-recap_private`, network ID `9ed39a8eeef82a63b890f150f8f74a5c9af6d9262c157d758372e86b059a8be8`, subnet `172.30.0.0/24`, bridge `br-9ed39a8eeef8`. App probe `172.30.0.3`, Mongo `172.30.0.2`, and the probe's DNS lookup of `mongo` returned `172.30.0.2`.
- Exact rule comment `phase8-t107-nftrace-4846c28a-8a36-4f7c-aba9-ade83daac17c`, inserted as handle 99 in `ip filter FORWARD` immediately before the freshly read first `DOCKER-USER` jump. Its counter reached 1 packet / 60 bytes.
- The one TCP probe was `172.30.0.3:55612 -> 172.30.0.2:27017`, iif/oif `br-9ed39a8eeef8`, `ct state new`, and returned `EHOSTUNREACH`.
- `nft monitor trace` showed `ip filter FORWARD` → `DOCKER-USER` → `DOCKER-FORWARD`; Docker's task-bridge ingress accept returned accept from that base chain. The packet continued to `inet firewalld filter_FORWARD` → `filter_FORWARD_POLICIES` → `filter_FWD_public` pre/log/deny/allow/post and returned, then matched the `filter_FORWARD_POLICIES` catch-all `reject with icmpx admin-prohibited` (verdict drop). This explains why an allow inserted immediately before the later `filter_FORWARD` reject was unreachable behind the nested policy reject.
- No accept rule was installed during this trace run. The exact trace handle was deleted; marker absence was verified. The probe and diagnostic container were removed, `phase8-recap` was brought down with its owned volume/network removed, and baseline `easygen_assessment-mongo-1` plus `easygen_assessment_mongo-data` were verified present.

At the time of this trace run, the app proof was pending. That state was superseded by the final successful proof in `.superpowers/delegated-execution/phase8-docker.md`: the exact scoped rule was positioned before the freshly verified policy jump, the SPA/auth smoke passed, and cleanup removed the temporary marker. No host rules were persisted or broadly changed.
