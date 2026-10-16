import { readFile } from "node:fs/promises";
import { availableParallelism, cpus } from "node:os";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { AuthCapacityExceededError, HashWork } from "./security/hash-work.js";
import type { PasswordService } from "./security/password.service.js";
import { parseCpuLimit, parseMemoryLimit } from "./benchmark-hash-limits.js";
import { buildBenchmarkReport, type BenchmarkModeInput, type BenchmarkReportInput } from "./benchmark-hash-report.js";

class SampledHashWork extends HashWork {
  readonly serviceMs: number[] = []; readonly admittedMs: number[] = []; readonly queueWaitMs: number[] = [];
  override run<T>(work: () => Promise<T>): Promise<T> {
    const queuedAt = performance.now();
    return super.run(() => {
      const startedAt = performance.now();
      this.queueWaitMs.push(startedAt - queuedAt);
      return work().finally(() => this.serviceMs.push(performance.now() - startedAt));
    }).then((value) => {
      this.admittedMs.push(performance.now() - queuedAt);
      return value;
    });
  }
}

async function measure(service: PasswordService, gate: SampledHashWork, active: 1 | 2): Promise<BenchmarkModeInput> {
  const startedAt = performance.now();
  for (let sample = 0; sample < 100; sample += 1) {
    if (active === 1) await service.hash("benchmark-only-password");
    else await Promise.all([service.hash("benchmark-only-password"), service.hash("benchmark-only-password")]);
  }
  return {
    active, elapsedMs: performance.now() - startedAt,
    serviceMs: gate.serviceMs.splice(0), admittedMs: gate.admittedMs.splice(0), queueWaitMs: gate.queueWaitMs.splice(0),
  };
}

async function probeQueue(): Promise<BenchmarkReportInput["queue"]> {
  const gate = new HashWork(); let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const active = [gate.run(() => held), gate.run(() => held)];
  const startedAt = performance.now();
  const waiting = Array.from({ length: 4 }, () => gate.run(() => Promise.resolve(undefined)).then(() => false, (error: unknown) => error instanceof AuthCapacityExceededError && error.reason === "queue-timeout"));
  const saturatedReason = await gate.run(() => Promise.resolve(undefined)).then(() => "unexpected", (error: unknown) => error instanceof AuthCapacityExceededError ? error.reason : "unexpected");
  try {
    const timedOut = await Promise.all(waiting); const timeoutElapsedMs = performance.now() - startedAt;
    if (saturatedReason !== "saturated" || timedOut.some((expired) => !expired)) throw new Error("HashWork queue probe did not observe its bounded outcomes");
    return { saturatedReason, timedOutWaiters: timedOut.length, timeoutElapsedMs };
  } finally {
    release(); await Promise.allSettled(active); gate.close();
  }
}

async function readLimit(path: string): Promise<string | null> { try { return (await readFile(path, "utf8")).trim(); } catch { return null; } }

async function runBenchmark() {
  const { PasswordService } = await import("./security/password.service.js");
  const gate = new SampledHashWork(); const service = await PasswordService.create(gate);
  await service.hash("benchmark-warmup"); await Promise.all([service.hash("benchmark-warmup"), service.hash("benchmark-warmup")]);
  gate.serviceMs.length = 0; gate.admittedMs.length = 0; gate.queueWaitMs.length = 0;
  const baselineRssBytes = process.memoryUsage().rss; let peakRssBytes = baselineRssBytes;
  const rssSampler = setInterval(() => { peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss); }, 10);
  const cpuStarted = process.cpuUsage(); let modes!: BenchmarkModeInput[]; let queue!: BenchmarkReportInput["queue"];
  try {
    modes = [await measure(service, gate, 1), await measure(service, gate, 2)]; queue = await probeQueue();
  } finally { clearInterval(rssSampler); gate.close(); }
  peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
  const cpuUsage = process.cpuUsage(cpuStarted);
  const [cpuLimit, memoryLimit] = await Promise.all([readLimit("/sys/fs/cgroup/cpu.max"), readLimit("/sys/fs/cgroup/memory.max")]);
  return buildBenchmarkReport({
    modes, memory: { baselineRssBytes, peakRssBytes },
    runtime: {
      node: process.version, v8: process.versions.v8, icu: process.versions["icu"] ?? "unknown",
      platform: process.platform, architecture: process.arch, cpuModel: cpus()[0]?.model ?? "unknown",
      availableParallelism: availableParallelism(), cpuUsageUserMs: cpuUsage.user / 1_000, cpuUsageSystemMs: cpuUsage.system / 1_000,
    },
    limits: { cpu: parseCpuLimit(cpuLimit), memory: parseMemoryLimit(memoryLimit) },
    queue,
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.slice(2).some((argument) => argument !== "--stdout")) {
    console.error("Usage: npm run benchmark:hash -- [--stdout]"); process.exitCode = 2;
  } else {
    void runBenchmark().then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)).catch(() => {
      console.error("Hash benchmark failed; inspect the runtime and native Argon2 installation."); process.exitCode = 1;
    });
  }
}
