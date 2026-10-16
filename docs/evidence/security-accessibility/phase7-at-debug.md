# Bounded T101 AT environment investigation

## Result

T101 remains **unverified for actual form-field and live-error speech**. The existing Firefox/Orca trace proves the Gecko accessibility path reaches Orca at document level, and Orca's speech dispatcher is active. It does not prove that the email/password fields, invalid state, alert, or status are exposed and announced. The bounded PyAT-SPI tree query timed out before returning nodes, so I cannot identify whether the remaining failure is a field-tree exposure issue or Orca focus/event handling. Do not mark V18 or full T101 as passed from the DOM event sequence or the two startup/window utterances.

## Environment and evidence

The probe used the disposable `easygen-at-qa:local` image (`sha256:a8c678977306165f06f6b9fd6e090b1db5db781fc33bd9efe90f026616e4fc92`), based on pinned Playwright `mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf` (`linux/amd64`). It used the project Playwright runner 1.64.1, Firefox 157.0, Node 24.22.0/npm 11.19.1, Orca 46.1, AT-SPI 2.52.0, Speech Dispatcher 0.12.0, and eSpeak NG 1.51. XDG directories, D-Bus session, Orca, Firefox, and Xvfb were isolated in the container. The repository and Node runtime mounts were read-only. I installed `python3-pyatspi` only inside the disposable container; there were no host package or app-source changes.

The existing `orca-firefox-debug.log` records `SPEECH OUTPUT` and Speech Dispatcher calls for “Screen reader on.” and “Nightly frame.” It also records Gecko (`orca.scripts.toolkits.Gecko.script`) receiving `document web` focus and document load-complete events for “Orca QA fixture.” That rules out a completely absent Firefox-to-AT-SPI document bridge and globally disabled Orca speech. The log contains no email/password focus or alert/status speech output.

The earlier fixture run recorded DOM focus `email → password → submit → password` and the rendered error/status text, but the Orca log still contained only the startup and frame utterances. That is DOM evidence only; it does not satisfy T101's screen-reader requirement.

## Bounded diagnostic command

The isolated diagnostic command was:

```sh
docker run --rm --platform linux/amd64 --shm-size=1g \
  --mount type=bind,source=/home/ahmed/.cache/easygen-at-qa/scripts,target=/opt/qa,readonly \
  --mount type=bind,source=/home/ahmed/.cache/easygen-at-qa/output,target=/output \
  --mount type=bind,source=/home/ahmed/projects/easygen_assessment,target=/workspace,readonly \
  --mount type=bind,source=/home/ahmed/.cache/easygen-toolchain/node-v24.22.0,target=/opt/node,readonly \
  --workdir /workspace -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  easygen-at-qa:local \
  dbus-run-session -- xvfb-run -a -s '-screen 0 1280x900x24 -nolisten tcp' \
  /opt/qa/inspect-firefox-atspi.sh
```

The cache-only runner set `DBUS_SESSION_BUS_ADDRESS` through `dbus-run-session`, `DISPLAY=:99`, `XDG_RUNTIME_DIR` to its private runtime directory, `MOZ_ENABLE_ACCESSIBILITY=1`, and `NO_AT_BRIDGE=0`; `GTK_MODULES` and `GTK_A11Y` were unset. It opened the existing Firefox form fixture, focused its window, sent keyboard input, and attempted a bounded PyAT-SPI tree snapshot at each focus/error phase. Each snapshot hit its seven-second timeout (`status 124`) without returning a node tree. I stopped only that disposable diagnostic container after the timeouts; no other container or workspace process was stopped.

The cache-only diagnostic scripts are `/home/ahmed/.cache/easygen-at-qa/scripts/inspect-firefox-atspi.sh` and `atspi-tree.py`; they are environment probes, not project files. The full prior setup, logs, and commands remain in [accessibility-environment.md](accessibility-environment.md). No further environment probe is warranted in this bounded lane. Preserve T101/V18 as an explicit open evidence gap until a real screen reader speaks a focused page field and the live error/status after the CSS gate; do not infer application failure from this inconclusive tree-client timeout.
