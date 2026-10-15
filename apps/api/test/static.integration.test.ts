import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import {
  resolveBuiltAssetsDirectory,
  resolveWorkspaceAssetsDirectory,
} from "../src/bootstrap.js";
import { createRealMongoFixture } from "./support/fixture.js";

function header(response: { readonly headers: Readonly<Record<string, unknown>> }, name: string): string {
  const value = response.headers[name];
  if (typeof value !== "string") throw new Error(`Expected response header ${name}`);
  return value;
}

void test("static: serves assets and SPA routes with Helmet while keeping API misses JSON", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "easygen-assets-"));
  const assetsDirectory = join(temporaryDirectory, "dist");
  await mkdir(assetsDirectory);
  await writeFile(join(assetsDirectory, "index.html"), "<!doctype html><title>Easygen</title>");
  await writeFile(join(assetsDirectory, "app.js"), "globalThis.easygen = true;");
  const fixture = await createRealMongoFixture({ assetsDirectory });

  try {
    const asset = await fixture.agent.get("/app.js").expect(200);
    assert.match(header(asset, "content-type"), /javascript/);
    assert.match(header(asset, "x-content-type-options"), /nosniff/);
    assert.equal(asset.text, "globalThis.easygen = true;");

    const route = await fixture.agent.get("/account/profile").expect(200);
    assert.match(header(route, "content-type"), /html/);
    assert.match(header(route, "x-content-type-options"), /nosniff/);
    assert.match(route.text, /<title>Easygen<\/title>/);

    const missingApi = await fixture.agent.get("/api/not-found").expect(404);
    assert.match(header(missingApi, "content-type"), /json/);
    assert.doesNotMatch(missingApi.text, /<title>Easygen<\/title>/);
  } finally {
    await fixture.teardown();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

void test("static: the normal build directory is optional outside production and required in production", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "easygen-assets-check-"));
  try {
    const absentDirectory = join(temporaryDirectory, "absent");
    await mkdir(absentDirectory);
    assert.equal(resolveBuiltAssetsDirectory(absentDirectory, false), undefined);
    assert.throws(() => resolveBuiltAssetsDirectory(absentDirectory, true), /Required web assets/);

    await writeFile(join(absentDirectory, "index.html"), "<!doctype html>");
    assert.equal(resolveBuiltAssetsDirectory(absentDirectory, true), resolve(absentDirectory));

    const repositoryRoot = join(temporaryDirectory, "workspace");
    const normalBuildDirectory = join(repositoryRoot, "apps", "web", "dist");
    await mkdir(normalBuildDirectory, { recursive: true });
    await writeFile(join(normalBuildDirectory, "index.html"), "<!doctype html>");
    assert.equal(
      resolveWorkspaceAssetsDirectory(repositoryRoot, false),
      resolve(normalBuildDirectory),
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
