import type { CpuLimit, MemoryLimit } from "./benchmark-hash-limits.js";

export interface BenchmarkModeInput {
  readonly active: 1 | 2;
  readonly elapsedMs: number;
  /** Native work duration, measured after the production gate admits the callback. */
  readonly serviceMs: readonly number[];
  /** Full PasswordService call duration, from invocation through its resolved result. */
  readonly admittedMs: readonly number[];
  /** Time from HashWork.run invocation until its callback begins. */
  readonly queueWaitMs: readonly number[];
}

export interface BenchmarkReportInput {
  readonly modes: readonly BenchmarkModeInput[];
  readonly memory: { readonly baselineRssBytes: number; readonly peakRssBytes: number };
  readonly runtime: {
    readonly node: string;
    readonly v8: string;
    readonly icu: string;
    readonly platform: string;
    readonly architecture: string;
    readonly cpuModel: string;
    readonly availableParallelism: number;
    readonly cpuUsageUserMs: number;
    readonly cpuUsageSystemMs: number;
  };
  readonly limits: { readonly cpu: CpuLimit; readonly memory: MemoryLimit };
  readonly queue: { readonly saturatedReason: string; readonly timedOutWaiters: number; readonly timeoutElapsedMs: number };
}

export interface SampleSummary {
  readonly count: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
}

export function summarizeSamples(values: readonly number[]): SampleSummary {
  if (values.length === 0) throw new RangeError("Expected at least one sample");
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new RangeError("Samples must be finite non-negative measurements");
  }
  const sorted = [...values].sort((left, right) => left - right);
  const nearestRank = (fraction: number): number => {
    const sample = sorted[Math.ceil(sorted.length * fraction) - 1];
    if (sample === undefined) throw new RangeError("Expected at least one sample");
    return sample;
  };
  return {
    count: sorted.length,
    p50Ms: nearestRank(0.5),
    p95Ms: nearestRank(0.95),
    maxMs: nearestRank(1),
  };
}

export function buildBenchmarkReport(input: BenchmarkReportInput) {
  const modesByActive = new Map(input.modes.map((mode) => [mode.active, mode]));
  if (input.modes.length !== 2 || !modesByActive.has(1) || !modesByActive.has(2)) {
    throw new TypeError("Benchmark requires separate one- and two-active measurements");
  }
  const modes = ([1, 2] as const).map((active) => {
    const mode = modesByActive.get(active);
    if (!mode) throw new TypeError(`Missing ${String(active)}-active measurements`);
    const count = mode.serviceMs.length;
    if (!Number.isFinite(mode.elapsedMs) || mode.elapsedMs <= 0 || count < 100) {
      throw new RangeError("Each concurrency mode requires 100 samples and positive elapsed time");
    }
    if (mode.admittedMs.length !== count || mode.queueWaitMs.length !== count) {
      throw new RangeError("Service, admitted, and queue-wait samples must align");
    }
    return {
      active,
      elapsedMs: mode.elapsedMs,
      samples: count,
      throughputPerSecond: count * 1_000 / mode.elapsedMs,
      rawSamples: { serviceMs: [...mode.serviceMs], admittedMs: [...mode.admittedMs], queueWaitMs: [...mode.queueWaitMs] },
      serviceLatency: summarizeSamples(mode.serviceMs),
      admittedLatency: summarizeSamples(mode.admittedMs),
      queueWait: summarizeSamples(mode.queueWaitMs),
    };
  });
  if (input.queue.saturatedReason !== "saturated" || input.queue.timedOutWaiters !== 4) {
    throw new TypeError("Queue probe must observe saturation and all four waiting timeouts");
  }
  return {
    schemaVersion: 1,
    profile: { algorithm: "argon2id", memoryCostKiB: 19_456, timeCost: 2, parallelism: 1, hashLengthBytes: 32 },
    modes,
    memory: { ...input.memory },
    runtime: { ...input.runtime },
    limits: { ...input.limits },
    queue: { ...input.queue },
    target: {
      status: "unverified" as const,
      reason: "The documented target hardware was not exercised.",
    },
  };
}
