# Isolated assistive-technology QA environment

**Status:** The disposable environment is ready for later use after the responsive CSS gate. Orca started in an isolated virtual desktop, recognized the Chromium application script, and logged two actual Orca `SPEECH OUTPUT` utterances. The small form fixture reached its expected keyboard focus sequence and rendered its invalid-form alert and session status, but Orca's log did **not** contain the email/password focus announcements or either live-region message. This is partial environment proof, not a T101 pass and not evidence that the app is accessible with a screen reader.

## Environment

- Base image: `mcr.microsoft.com/playwright:v1.64.1-noble`, pinned to `sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf` (linux/amd64).
- Temporary local QA image: `easygen-at-qa:local`, image ID `sha256:a8c678977306165f06f6b9fd6e090b1db5db781fc33bd9efe90f026616e4fc92`.
- Installed in the disposable image: Orca 46.1 (`46.1-1ubuntu1`), AT-SPI 2.52.0 (`2.52.0-1build1`), Speech Dispatcher and its eSpeak NG module (`0.12.0~rc2-2build3`), eSpeak NG 1.51 (`1.51+dfsg-12build1`), Xvfb 21.1.12 (`2:21.1.12-1ubuntu1.8`), openbox 3.6.1 (`3.6.1-12build5`), and xdotool (`1:3.20160805.1-5build1`).
- Runtime used for the browser fixture: Node v24.22.0 and npm 11.19.1 from `/home/ahmed/.cache/easygen-toolchain/node-v24.22.0`; the project Playwright runner is 1.64.1. The pinned Playwright browser is Chromium 156.0.8078.4.
- The fixture ran in `dbus-run-session` + `xvfb-run`; Orca, XDG config/cache, the session bus, Chromium and the Openbox window manager were confined to that container and virtual display. The workspace and runtime were mounted read-only. No host desktop audio, screen reader, package manager or app source was used.

The image build context and fixture scripts are outside the repository at `/home/ahmed/.cache/easygen-at-qa/`. The reusable files are `Dockerfile`, `scripts/fixture.mjs`, and `scripts/run-fixture.sh`; the full Orca debug log from the most recent complete fixture run is at `/home/ahmed/.cache/easygen-at-qa/output/orca-debug.log`. The prior application browser image check and digest provenance are documented in [browser-docker-environment.md](../../docs/evidence/signin/browser-docker-environment.md).

## Reproducible setup and fixture run

Build the disposable image from the pinned Playwright base:

```sh
docker build --platform linux/amd64 -t easygen-at-qa:local /home/ahmed/.cache/easygen-at-qa
```

Run the isolated fixture with the pinned Node runtime and read-only workspace mounts:

```sh
docker run --rm --platform linux/amd64 --shm-size=1g \
  --mount type=bind,source=/home/ahmed/.cache/easygen-at-qa/scripts,target=/opt/qa,readonly \
  --mount type=bind,source=/home/ahmed/.cache/easygen-at-qa/output,target=/output \
  --mount type=bind,source=/home/ahmed/projects/easygen_assessment,target=/workspace,readonly \
  --mount type=bind,source=/home/ahmed/.cache/easygen-toolchain/node-v24.22.0,target=/opt/node,readonly \
  --workdir /workspace -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  easygen-at-qa:local \
  dbus-run-session -- xvfb-run -a -s '-screen 0 1280x900x24 -nolisten tcp' /opt/qa/run-fixture.sh
```

The fixture launches Orca with `--debug-file=/tmp/orca-debug.log --debug`, opens a small local HTML form in headed Chromium with `--force-renderer-accessibility=complete`, and sends X11 keyboard input using xdotool. The runner prints Orca's `SPEECH OUTPUT` records and copies the complete debug log to `/output/orca-debug.log` before the temporary container exits.

Observed fixture result:

```text
fixture events: ["focus:email","focus:password","focus:BUTTON","submit:invalid","focus:password"]
fixture DOM: Unable to sign in. Check your email and password. / Your session could not be checked.
SPEECH OUTPUT: 'Screen reader on.'
SPEECH OUTPUT: 'Orca QA fixture - Google Chrome for Testing frame.'
```

The full Orca log shows the Chrome/Chromium script (`orca.scripts.toolkits.Chromium.script`) and the native “Address and search bar” focus, but no speech records for the page's labeled fields or live regions. Chromium also did not produce Orca focus-event log entries for the page fields in this run. The environment is ready, but the exact browser/app interaction needed for T101 still needs to be exercised and captured; do not treat the fixture's DOM state, Orca's tree access, or the two startup/window utterances as a form-announcement pass.

A short direct-Chromium launch attempt did not produce usable evidence, so the reproducible runner remains the successful Playwright-launched fixture. The next bounded environment option is to run the same fixture in Playwright Firefox/Gecko under Orca and AT-SPI, then test the actual app only after the CSS gate.

## Bounded Firefox/Gecko alternative

The same fixture was run once in the pinned image with the project Playwright Firefox browser (Firefox 157.0) and Orca 46.1. The isolated runner is `/home/ahmed/.cache/easygen-at-qa/scripts/run-firefox.sh`; it sets `MOZ_ENABLE_ACCESSIBILITY=1`, starts Orca under the same `dbus-run-session` + Xvfb + Openbox container, launches the fixture with Playwright `firefox.launch({ headless: false })`, and sends the same xdotool keyboard sequence. The temporary adapted fixture is `/home/ahmed/.cache/easygen-at-qa/scripts/fixture-firefox.mjs`. The exact Docker invocation is the command above with `run-fixture.sh` replaced by `run-firefox.sh`.

The fixture again confirms DOM focus sequence `email → password → submit → password` and both rendered messages. Orca's Gecko script initialized and logged the document load and browser-toolbar focus, but its only `SPEECH OUTPUT` records were `Screen reader on.` and `Nightly frame.`; there were no field-focus or alert/status utterances. The full trace is `/home/ahmed/.cache/easygen-at-qa/output/orca-firefox-debug.log`, with stdout at `/home/ahmed/.cache/easygen-at-qa/output/orca-firefox-stdout.log`. This alternative therefore does not close the gap: it is evidence that Firefox/Gecko is exposed to Orca, but not evidence of spoken page focus or live-region announcements. Keep T101 unverified until actual app utterances are captured after the CSS gate; do not infer a pass from DOM focus, the exposed document event, or browser-frame speech.

## References

- [Playwright Docker documentation](https://playwright.dev/docs/docker) describes versioned browser images and matching the image to the Playwright package.
- [Chromium accessibility overview](https://chromium.googlesource.com/chromium/src/+/master/docs/accessibility/overview.md) documents `--force-renderer-accessibility` and Linux accessibility APIs.
- [GNOME Orca README](https://github.com/GNOME/orca/blob/main/README.md) describes Orca's AT-SPI integration and accessible focus-event handling.
- [Ubuntu 24.04 accessibility stack](https://ubuntu.com/desktop/docs/en/24.04/explanation/accessibility-stack/) describes the Orca → Speech Dispatcher → eSpeak path.
