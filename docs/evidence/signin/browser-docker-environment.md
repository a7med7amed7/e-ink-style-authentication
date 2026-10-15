# Docker Playwright browser environment check

## Result

The official pinned image is available and all three Playwright browsers launch successfully in it. This validates browser/runtime availability only; it does not run the application or claim E2E coverage.

- Image tag: `mcr.microsoft.com/playwright:v1.64.1-noble`
- Pulled image/index digest: `sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf`
- Pulled platform: `linux/amd64`; the registry manifest also lists `linux/arm64` (`sha256:68456172e8d99f42cf391e835f5d566b3ab0a2c6a745decd9590c4d73c54d2fb`). The amd64 platform manifest is `sha256:bdfda2a8fdf48707c5e50a49bd3e06d8d0c759153dc8ee057d8a81c3450bb3e9`.
- Daemon: Docker Engine 29.8.0, default context, Linux x86_64; Docker data root `/var/snap/docker/common/var-lib-docker`.
- Project runner: `@playwright/test` 1.64.1 (`npm ls --depth=0`); browser CLI evidence `npx playwright --version` was 1.64.1.
- Browser image's built-in Node is v24.21.0. To use the project's exact Node v24.22.0 during the probe, I copied the existing extracted runtime to `/home/ahmed/.local/share/easygen-node-v24.22.0-container` because the Snap daemon could not see the `/tmp` bind source. The workspace, including `node_modules`, was mounted read-only; no host dependency files were written.

## Exact commands and results

```sh
docker manifest inspect mcr.microsoft.com/playwright:v1.64.1-noble
docker pull --platform linux/amd64 mcr.microsoft.com/playwright:v1.64.1-noble
docker image inspect mcr.microsoft.com/playwright:v1.64.1-noble --format 'RepoDigests={{json .RepoDigests}} OS={{.Os}} ARCH={{.Architecture}} ID={{.Id}}'
docker pull --platform linux/amd64 mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf
```

The manifest lists both amd64 and arm64. Pull succeeded; inspect reported `OS=linux ARCH=amd64` and the digest above. Pulling the digest reference succeeded as up to date.

Browser probe (same command run once with the tag and once with the immutable digest; both exited 0):

```sh
docker run --rm --platform linux/amd64 --ipc=host \
  --mount type=bind,source=/home/ahmed/projects/easygen_assessment,target=/workspace,readonly \
  --mount type=bind,source=/home/ahmed/.local/share/easygen-node-v24.22.0-container,target=/opt/node,readonly \
  --workdir /workspace -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf \
  /opt/node/bin/node --input-type=module -e 'import { chromium, firefox, webkit } from "@playwright/test"; for (const [name, browserType] of Object.entries({ chromium, firefox, webkit })) { const browser = await browserType.launch(); try { const page = await browser.newPage(); await page.setContent("<html><head><title>Docker probe</title></head><body>ok</body></html>"); if (await page.title() !== "Docker probe") throw new Error(`${name} page probe failed`); console.log(`${name}: launch OK, version=${browser.version()}, title=${await page.title()}`); } finally { await browser.close(); } }'
```

Output:

```text
chromium: launch OK, version=156.0.8078.4, title=Docker probe
firefox: launch OK, version=157.0, title=Docker probe
webkit: launch OK, version=27.2, title=Docker probe
```

## Official references

Playwright documents its versioned Docker images, their included browsers/system dependencies, and the requirement to keep the image version aligned with the project runner: [Playwright Docker documentation](https://playwright.dev/docs/docker). The official v1.64.1 release is listed by Microsoft: [Playwright v1.64.1 release](https://github.com/microsoft/playwright/releases/tag/v1.64.1). The official Noble Dockerfile uses the `mcr.microsoft.com/playwright:v%version%-noble` naming template: [Playwright Dockerfile.noble](https://github.com/microsoft/playwright/blob/main/utils/docker/Dockerfile.noble). Direct registry manifest inspection and digest-pinned pulls confirmed this exact image tag and platform set.
