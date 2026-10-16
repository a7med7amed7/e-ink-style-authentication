import { Buffer } from "node:buffer";
import { isIP } from "node:net";

export type NodeEnvironment = "development" | "test" | "production";

export interface ApiConfig {
  readonly nodeEnv: NodeEnvironment;
  readonly appOrigin: string;
  readonly mongodbUri: string;
  readonly sessionSecret: string;
  readonly host: string;
  readonly port: number;
  readonly trustedProxyCidrs: readonly string[];
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = "3000";

function requiredValue(env: Readonly<Record<string, string | undefined>>, key: string): string {
  const value = env[key];

  if (value === undefined || value.length === 0) {
    throw new Error(`${key} is required`);
  }

  return value;
}

function parseNodeEnvironment(value: string | undefined): NodeEnvironment {
  if (value === undefined || value.length === 0) {
    throw new Error("NODE_ENV is required");
  }

  const nodeEnv = value;

  if (nodeEnv !== "development" && nodeEnv !== "test" && nodeEnv !== "production") {
    throw new Error("NODE_ENV must be development, test, or production");
  }

  return nodeEnv;
}

function validateOrigin(value: string, nodeEnv: NodeEnvironment): string {
  let origin: URL;

  try {
    origin = new URL(value);
  } catch {
    throw new Error("APP_ORIGIN must be a canonical origin");
  }

  if (
    origin.origin !== value ||
    origin.username.length > 0 ||
    origin.password.length > 0 ||
    origin.search.length > 0 ||
    origin.hash.length > 0
  ) {
    throw new Error("APP_ORIGIN must be a canonical origin");
  }

  if (nodeEnv === "production" && origin.protocol !== "https:") {
    throw new Error("APP_ORIGIN must use HTTPS in production");
  }

  return value;
}

function validateMongoUri(value: string): string {
  if (value !== value.trim()) {
    throw new Error("MONGODB_URI must be a valid MongoDB URI with a database name");
  }

  let uri: URL;

  try {
    uri = new URL(value);
  } catch {
    throw new Error("MONGODB_URI must be a valid MongoDB URI with a database name");
  }

  const isMongoScheme = uri.protocol === "mongodb:" || uri.protocol === "mongodb+srv:";
  const databaseName = uri.pathname.slice(1);

  if (
    !isMongoScheme ||
    uri.hostname.length === 0 ||
    databaseName.length === 0 ||
    databaseName.includes("/") ||
    uri.hash.length > 0 ||
    (uri.protocol === "mongodb+srv:" && uri.port.length > 0) ||
    (uri.port.length > 0 && Number(uri.port) < 1)
  ) {
    throw new Error("MONGODB_URI must be a valid MongoDB URI with a database name and valid port");
  }

  return value;
}

function validateSessionSecret(value: string): string {
  const decoded = Buffer.from(value, "base64");

  if (decoded.length < 32 || decoded.toString("base64") !== value) {
    throw new Error("SESSION_SECRET must be canonical base64 containing at least 32 bytes");
  }

  return value;
}

function isPrivateBindAddress(host: string): boolean {
  const version = isIP(host);

  if (version === 4) {
    const [first, second] = host.split(".").map(Number);

    return (
      first === 10 ||
      first === 127 ||
      (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }

  if (version === 6) {
    let normalizedHost: string;

    try {
      normalizedHost = new URL(`http://[${host}]/`).hostname.slice(1, -1).toLowerCase();
    } catch {
      return false;
    }

    const firstHextet = Number.parseInt(normalizedHost.split(":")[0] ?? "", 16);

    return normalizedHost === "::1" || (firstHextet >= 0xfc00 && firstHextet <= 0xfdff);
  }

  return false;
}

function validateHost(value: string): string {
  if (!isPrivateBindAddress(value)) {
    throw new Error("HOST must be a private IP bind address");
  }

  return value;
}

function parsePort(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error("PORT must be an integer from 1 to 65535");
  }

  const port = Number(value);

  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer from 1 to 65535");
  }

  return port;
}

function validateProxyAddress(value: string): string {
  const segments = value.split("/");

  if (segments.length > 2 || segments[0] === undefined) {
    throw new Error("TRUSTED_PROXY_CIDRS must contain explicit IP addresses or narrow CIDRs");
  }

  const address = segments[0];
  const version = isIP(address);

  if (version === 0) {
    throw new Error("TRUSTED_PROXY_CIDRS must contain explicit IP addresses or narrow CIDRs");
  }

  if (segments.length === 2) {
    const prefixText = segments[1];
    const minimumPrefix = version === 4 ? 24 : 64;
    const maximumPrefix = version === 4 ? 32 : 128;

    if (prefixText === undefined || !/^\d+$/.test(prefixText)) {
      throw new Error("TRUSTED_PROXY_CIDRS contains an invalid CIDR prefix");
    }

    const prefix = Number(prefixText);

    if (!Number.isInteger(prefix) || prefix < minimumPrefix || prefix > maximumPrefix) {
      throw new Error("TRUSTED_PROXY_CIDRS cannot contain wildcard or broad proxy trust");
    }
  }

  if (address === "0.0.0.0" || address === "::") {
    throw new Error("TRUSTED_PROXY_CIDRS cannot contain wildcard or broad proxy trust");
  }

  return value;
}

function parseTrustedProxyCidrs(
  value: string | undefined,
  nodeEnv: NodeEnvironment
): readonly string[] {
  const trimmedValue = value?.trim() ?? "";
  const trustedProxyCidrs = trimmedValue.length === 0
    ? []
    : trimmedValue.split(",").map((entry) => {
        const trimmedEntry = entry.trim();

        if (trimmedEntry.length === 0) {
          throw new Error("TRUSTED_PROXY_CIDRS contains an empty entry");
        }

        return validateProxyAddress(trimmedEntry);
      });

  if (nodeEnv !== "production" && trustedProxyCidrs.length > 0) {
    throw new Error("TRUSTED_PROXY_CIDRS must be empty outside production");
  }

  if (nodeEnv === "production" && trustedProxyCidrs.length === 0) {
    throw new Error("TRUSTED_PROXY_CIDRS is required in production");
  }

  return Object.freeze(trustedProxyCidrs);
}

export function parseConfig(
  env: Readonly<Record<string, string | undefined>>
): Readonly<ApiConfig> {
  const nodeEnv = parseNodeEnvironment(env["NODE_ENV"]);
  const appOrigin = validateOrigin(requiredValue(env, "APP_ORIGIN"), nodeEnv);
  const mongodbUri = validateMongoUri(requiredValue(env, "MONGODB_URI"));
  const sessionSecret = validateSessionSecret(requiredValue(env, "SESSION_SECRET"));
  const host = validateHost(env["HOST"] ?? DEFAULT_HOST);
  const port = parsePort(env["PORT"] ?? DEFAULT_PORT);
  const trustedProxyCidrs = parseTrustedProxyCidrs(env["TRUSTED_PROXY_CIDRS"], nodeEnv);

  return Object.freeze({
    nodeEnv,
    appOrigin,
    mongodbUri,
    sessionSecret,
    host,
    port,
    trustedProxyCidrs,
  });
}
