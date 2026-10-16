import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCpuLimit, parseMemoryLimit } from "../src/benchmark-hash-limits.js";

void test("benchmark-limits: CPU quota distinguishes bounded, unlimited, and unavailable", () => {
  assert.deepEqual(parseCpuLimit("100000 100000"), { status: "limited", quota: "100000 100000" });
  assert.deepEqual(parseCpuLimit("max 100000"), { status: "unlimited" });
  assert.deepEqual(parseCpuLimit(null), { status: "unavailable" });
});

void test("benchmark-limits: invalid CPU quota never appears unlimited", () => {
  for (const raw of ["", "max", "100000", "0 100000", "100000 0", "-1 100000", "max nope", "100000 100000 extra"]) {
    assert.deepEqual(parseCpuLimit(raw), { status: "unavailable" }, raw);
  }
});

void test("benchmark-limits: memory limit distinguishes bounded, unlimited, and unavailable", () => {
  assert.deepEqual(parseMemoryLimit("536870912"), { status: "limited", bytes: 536_870_912 });
  assert.deepEqual(parseMemoryLimit("max"), { status: "unlimited" });
  assert.deepEqual(parseMemoryLimit(null), { status: "unavailable" });
});

void test("benchmark-limits: invalid memory limit never appears unlimited", () => {
  for (const raw of ["", "MAX", "NaN", "0", "-1", "536870912 bytes", "9007199254740992"]) {
    assert.deepEqual(parseMemoryLimit(raw), { status: "unavailable" }, raw);
  }
});
