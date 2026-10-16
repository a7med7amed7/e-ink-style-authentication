# Phase 8 temporary Docker QA firewall proof and cleanup

## Final status (supersedes historical pending and failure notes below)

The final bounded private app/auth proof passed after the exact scoped rule was placed before the live firewalld policy jump. On network `phase8-recap_private` (bridge `br-8bc0a5d52bb7`), app `172.30.0.3` reached Mongo `172.30.0.2`; the rule comment was `phase8-t107-qa-9260db27-5f70-49ba-96a8-6981ad33914d`, handle 433, with 4 packets / 240 bytes. App readiness passed; the SPA returned HTTP 200, signup returned 201, and cookie-authenticated identity returned 200. The unique temporary rule marker was deleted by exact handle and its absence verified. The phase8 app/Mongo containers, task volume/network, probe/diagnostic containers, exited benchmark container, and temporary env file were removed. Baseline easygen_assessment Mongo remains running with its volume. No phase8 nft marker or persistent host rule remains. Final commands/results and image metadata are in .superpowers/delegated-execution/phase8-docker.md and docs/evidence/container.md.

All pending/failure statements farther down this file describe earlier attempts and are superseded by this final status and the final successful proof section.

**Historical pre-final status (superseded by the final status above):** earlier bounded app proofs and trace diagnostics had been cleaned, but the final policy-jump-positioned proof had not yet run. The runtime QA proof wrapper is `.superpowers/delegated-execution/phase8-docker-firewall-proof.sh`; the trace-only diagnostic wrapper is `.superpowers/delegated-execution/phase8-docker-nftrace-proof.sh`. Both use live topology checks and exact unique comments/handles. The trace diagnostic proved that an allow placed before the final reject in `filter_FORWARD` is unreachable because a nested firewalld policy chain rejects the task bridge packet first. The final proof later inserted the single approved runtime rule before the freshly verified policy jump; it was removed and verified absent.

## Historical initial-attempt topology (superseded by final proof above)

- Docker context is default; Engine 29.8.0, Ubuntu Core 24, x86_64; the host uses the iptables nft backend and firewalld's nftables table.
- Compose project/network are phase8-recap / phase8-recap_private. The live network ID is 9effbc82c16ff7a99507199645d03826dfa82ed28875f2d9f4d9862b8dfad262 (64 hex chars); subnet is 172.30.0.0/24; Docker bridge is derived as br- plus the network ID's first 12 characters, br-9effbc82c16f.
- Network labels identify com.docker.compose.project=phase8-recap and com.docker.compose.network=private. Mongo is 172.30.0.2 and the same-image app probe is 172.30.0.3 on this network. Node DNS lookup of mongo from the probe returned 172.30.0.2.
- The probe route uses eth0 and the ARP table resolved Mongo at 172.30.0.2 (MAC 3a:eb:c3:70:2d:3e). The bridge has two UP/LOWER_UP veth ports; each reports operstate up and carrier 1.
- A fresh bounded TCP probe from 172.30.0.3 to 172.30.0.2:27017 returned EHOSTUNREACH. The bridge capture showed the SYN followed by 172.30.0.1 replying ICMP "host 172.30.0.2 unreachable - admin prohibited filter".
- Before and after that probe, the raw-table rule "ip daddr 172.30.0.2 iifname != br-9effbc82c16f counter packets 0 bytes 0 drop" remained at 0 packets / 0 bytes. It excludes ingress on this bridge and does not explain this app-to-Mongo packet.

## Historical initial-attempt forwarding hook and chain capture

Read-only nft output contained exactly three forward/ingress hooks:

    type filter hook forward priority filter + 10; policy accept;
    type filter hook forward priority filter; policy accept;
    type filter hook forward priority filter; policy accept;

The ordered firewalld chain was:

    ct state { established, related } accept                 # handle 127
    ct status dnat accept                                    # handle 128
    iifname "lo" accept                                     # handle 129
    ct state invalid drop                                    # handle 130
    IPv6 special-destination reject                          # handle 145
    jump filter_FORWARD_POLICIES                            # handle 132
    reject with icmpx admin-prohibited                       # handle 133

The first hook is Docker's ip filter/FORWARD chain; the last is ip6 filter/FORWARD. Firewalld's global established/related accept is before its final reject, so the approved proof needed only a new outbound app-to-Mongo exception; the established Mongo reply followed the existing accept. This is the initial-attempt ruleset snapshot; the final wrapper reread and validated the live topology immediately before its successful insertion.

In the initial-attempt snapshot, the rule in the nested firewalld policy chain routes wlp2s0 and virbr0; the generic path falls through to admin-prohibited. The task bridge was not included.

## Historical first placement (superseded by final proof below)

For the current topology, the exact rule expression is:

    insert rule inet firewalld filter_FORWARD position <fresh reject handle> iifname "br-9effbc82c16f" oifname "br-9effbc82c16f" ip saddr 172.30.0.3 ip daddr 172.30.0.2 tcp dport 27017 ct state new counter accept comment "phase8-t107-qa-<invocation UUID>"

This was the initial approved placement, before the trace identified the nested policy-chain reject. The wrapper then inserted before the terminal reject in `filter_FORWARD`, which was too late because `filter_FORWARD_POLICIES` had a nested catch-all reject. That first placement is superseded by the successful final proof: the same narrowly scoped tuple was inserted immediately before the freshly verified `jump filter_FORWARD_POLICIES`, producing the 4-packet / 240-byte counter recorded above. The final trap deleted handle 433 and verified the marker absent. No reply rule, zone edit or persistent configuration was made.

## Historical failed attempts and root-cause evidence (superseded by final success)

- The corrected `.env` session value was 64 characters / 48 decoded bytes, canonical Base64 round-trip true, and `parseConfig` accepted it. The value was never printed. The latest app startup log fails at the Mongo boundary with `connect EHOSTUNREACH 172.30.0.2:27017`; do not attribute the failure to secret format.
- On an earlier attempt, before the final rule placement, app startup exited during Mongo retry before readiness. The later successful proof below supersedes this failure state.
- The approved exact app→Mongo runtime rule was inserted once as handle 432 under comment `phase8-t107-qa-e4da69f3-7464-4ed4-9267-c7fb540b8957`; its counter was not captured before trap cleanup on that failure. The trap verified marker absence and removed only the task-owned stack/volume/network. The later trace-only probe conclusively located the nested firewalld catch-all; see `.superpowers/delegated-execution/phase8-docker-nftrace.md` for its exact marker, handle, packet, counter and cleanup.
- The trace-only rule used comment `phase8-t107-nftrace-4846c28a-8a36-4f7c-aba9-ade83daac17c`, handle 99, and counter 1 packet / 60 bytes. It was removed by exact handle; absence was verified. No allow was present in that diagnostic run.

## Final successful proof

The final proof command was `bash .superpowers/delegated-execution/phase8-docker-firewall-proof.sh`. It used fresh network ID `8bc0a5d52bb791b8277b82ccabe203d019282ea8e01fae3c7eca63795c7b9f49`, bridge `br-8bc0a5d52bb7`, app `172.30.0.3`, and Mongo `172.30.0.2`. The exact runtime-only rule was inserted before the freshly read `jump filter_FORWARD_POLICIES`; marker `phase8-t107-qa-9260db27-5f70-49ba-96a8-6981ad33914d`, handle 433, counted 4 packets / 240 bytes. The SPA/auth smoke passed (200/201/200). Cleanup removed the rule by its verified handle and confirmed marker absence, then removed the task Compose stack, volume, bridge, probe/diagnostic containers, and temporary env file. The baseline Mongo container and volume remained present. The exited benchmark container was removed after its metadata was saved. No phase8 task-owned resources or nft markers remain.

## Cleanup contract

The same shell process installs EXIT, INT, TERM, and HUP traps before mutation. The trap verifies that the captured handle still contains the invocation marker; if a reload changed the handle, it resolves only that unique marker in the same chain. It deletes only the verified matching handle, then verifies the marker is absent from the chain and ruleset.

Cleanup first removes the task-owned phase8-app-network-probe so it cannot hold the network open, then runs:

    docker compose --env-file /tmp/easygen-recap.env -p phase8-recap -f compose.app.yaml down --volumes

If Compose leaves the now-empty task network behind, the wrapper removes only phase8-recap_private after verifying it has zero attached containers. It removes phase8-diag-tools only after firewall absence is verified, deletes the temporary env file, and verifies phase8-recap_mongo-data and phase8-recap_private are absent while baseline easygen_assessment-mongo-1 remains running and easygen_assessment_mongo-data remains present. No persistent host rule is written.
