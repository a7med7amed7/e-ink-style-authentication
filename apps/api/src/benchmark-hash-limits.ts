export type CpuLimit =
  | { readonly status: "limited"; readonly quota: string }
  | { readonly status: "unlimited" }
  | { readonly status: "unavailable" };

export type MemoryLimit =
  | { readonly status: "limited"; readonly bytes: number }
  | { readonly status: "unlimited" }
  | { readonly status: "unavailable" };

function isPositiveInteger(value: string | undefined): boolean {
  if (value === undefined || !/^\d+$/.test(value)) return false;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0;
}

export function parseCpuLimit(raw: string | null): CpuLimit {
  if (raw === null) return { status: "unavailable" };
  const [quota, period, extra] = raw.trim().split(/\s+/);
  if (extra !== undefined || !isPositiveInteger(period)) return { status: "unavailable" };
  if (quota === "max") return { status: "unlimited" };
  if (!isPositiveInteger(quota) || quota === undefined || period === undefined) return { status: "unavailable" };
  return { status: "limited", quota: `${quota} ${period}` };
}

export function parseMemoryLimit(raw: string | null): MemoryLimit {
  if (raw === null) return { status: "unavailable" };
  const value = raw.trim();
  if (value === "max") return { status: "unlimited" };
  if (!isPositiveInteger(value)) return { status: "unavailable" };
  return { status: "limited", bytes: Number(value) };
}
