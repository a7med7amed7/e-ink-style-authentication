import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import "../src/benchmark-hash.js";
import { buildBenchmarkReport, summarizeSamples } from "../src/benchmark-hash-report.js";

void test("benchmark: sample summaries use nearest-rank p50, p95, and maximum", () => {
  const summary = summarizeSamples(Array.from({ length: 20 }, (_, index) => index + 1));

  assert.deepEqual(summary, { count: 20, p50Ms: 10, p95Ms: 19, maxMs: 20 });
});

void test("benchmark: sample summaries reject empty and invalid measurements", () => {
  assert.throws(() => summarizeSamples([]), /at least one sample/);
  assert.throws(() => summarizeSamples([1, Number.NaN]), /finite non-negative/);
  assert.throws(() => summarizeSamples([1, -1]), /finite non-negative/);
});

void test("benchmark: reports keep one/two-active service and admission metrics distinct", () => {
  const samples = Array.from({ length: 100 }, (_, index) => index + 1);
  const report = buildBenchmarkReport({
    modes: [
      {
        active: 1,
        elapsedMs: 10_000,
        serviceMs: samples,
        admittedMs: samples,
        queueWaitMs: samples.map((sample) => sample / 2),
      },
      {
        active: 2,
        elapsedMs: 12_000,
        serviceMs: Array.from({ length: 200 }, (_, index) => (index + 1) * 2),
        admittedMs: Array.from({ length: 200 }, (_, index) => index + 1),
        queueWaitMs: Array.from({ length: 200 }, (_, index) => (index + 1) / 2),
      },
    ],
    memory: { baselineRssBytes: 40_000_000, peakRssBytes: 75_000_000 },
    runtime: {
      node: "v24.22.0",
      v8: "13.6.233.10-node.31",
      icu: "77.1",
      platform: "linux",
      architecture: "x64",
      cpuModel: "Example CPU",
      availableParallelism: 8,
      cpuUsageUserMs: 12_000,
      cpuUsageSystemMs: 1_000,
    },
    limits: {
      cpu: { status: "limited", quota: "100000 100000" },
      memory: { status: "limited", bytes: 536_870_912 },
    },
    queue: { saturatedReason: "saturated", timedOutWaiters: 4, timeoutElapsedMs: 1_002 },
  });

  assert.deepEqual(report.modes.map(({ active }) => active), [1, 2]);
  const oneActive = report.modes[0];
  const twoActive = report.modes[1];
  assert.ok(oneActive);
  assert.ok(twoActive);
  assert.equal(oneActive.serviceLatency.p50Ms, 50);
  assert.equal(oneActive.admittedLatency.p95Ms, 95);
  assert.equal(oneActive.queueWait.p95Ms, 47.5);
  assert.deepEqual(oneActive.rawSamples, {
    serviceMs: samples,
    admittedMs: samples,
    queueWaitMs: samples.map((sample) => sample / 2),
  });
  assert.equal(twoActive.serviceLatency.maxMs, 400);
  assert.equal(twoActive.admittedLatency.maxMs, 200);
  assert.equal(twoActive.queueWait.maxMs, 100);
  assert.equal(twoActive.rawSamples.serviceMs.length, 200);
  assert.equal(twoActive.rawSamples.serviceMs.at(-1), 400);
  assert.equal(oneActive.throughputPerSecond, 10);
  assert.equal(twoActive.throughputPerSecond, 200 / 12);
  assert.deepEqual(report.memory, { baselineRssBytes: 40_000_000, peakRssBytes: 75_000_000 });
  assert.equal(report.runtime.node, "v24.22.0");
  assert.equal(report.runtime.cpuModel, "Example CPU");
  assert.equal(report.runtime.cpuUsageUserMs, 12_000);
  assert.deepEqual(report.limits, {
    cpu: { status: "limited", quota: "100000 100000" },
    memory: { status: "limited", bytes: 536_870_912 },
  });
  assert.deepEqual(report.queue, { saturatedReason: "saturated", timedOutWaiters: 4, timeoutElapsedMs: 1_002 });
  assert.equal(report.profile.algorithm, "argon2id");
  assert.equal(report.profile.memoryCostKiB, 19_456);
  assert.equal(report.profile.timeCost, 2);
  assert.equal(report.profile.parallelism, 1);
  assert.equal(report.profile.hashLengthBytes, 32);
  assert.equal(report.target.status, "unverified");
  assert.match(report.target.reason, /target hardware was not exercised/);
});

void test("benchmark: importing the compiled runner does not start a benchmark", () => {
  const runnerPath = fileURLToPath(new URL("../src/benchmark-hash.js", import.meta.url));
  const child = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `await import(${JSON.stringify(pathToFileURL(runnerPath).href)})`],
    { encoding: "utf8", timeout: 3_000 },
  );
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, "");
  assert.equal(child.stderr, "");
});
