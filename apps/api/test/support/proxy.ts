import { randomBytes, randomUUID } from "node:crypto";
import { createServer, request as httpRequest, type IncomingMessage, type OutgoingHttpHeaders, type Server } from "node:http";
import { getConnectionToken } from "@nestjs/mongoose";
import type { Db } from "mongodb";
import type { Connection } from "mongoose";
import { parseConfig } from "../../src/config.js";
import { buildApp } from "../../src/bootstrap.js";

const DEFAULT_MONGO_URI = "mongodb://127.0.0.1:27017/easygen";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export const PROXY_APP_ORIGIN = "https://app.example.test";
export const PROXY_PUBLIC_HOST = "auth.example.test";
export type ProxySocketAddress = "127.0.0.1" | "127.0.0.2";

export interface ProxyApiFixture {
  readonly config: ReturnType<typeof parseConfig>;
  readonly database: Db;
  readonly databaseName: string;
  readonly port: number;
  teardown(): Promise<void>;
}

export interface VerifiedProxyOptions {
  readonly upstreamPort: number;
  readonly upstreamLocalAddress: ProxySocketAddress;
  readonly publicHost?: string;
}

export interface VerifiedProxy {
  readonly port: number;
  close(): Promise<void>;
}

function isolateMongoUri(sourceUri: string, databaseName: string): string {
  let uri: URL;
  try {
    uri = new URL(sourceUri);
  } catch {
    throw new Error("A valid local MongoDB URI is required for proxy integration tests");
  }

  const hostname = uri.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (uri.protocol !== "mongodb:" || !LOOPBACK_HOSTS.has(hostname) || uri.hash.length > 0) {
    throw new Error("Proxy integration tests require a local MongoDB server");
  }

  uri.pathname = `/${databaseName}`;
  return uri.toString();
}

function serverPort(server: Server): number {
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected the HTTP server to have a TCP address");
  }
  return address.port;
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, "127.0.0.1");
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) reject(error);
      else resolve();
    });
  });
}

function clientAddress(request: IncomingMessage): string {
  const address = request.socket.remoteAddress;
  if (address === undefined) throw new Error("Proxy client socket has no remote address");
  return address.startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
}

function forwardedHeaders(request: IncomingMessage, publicHost: string): OutgoingHttpHeaders {
  const blockedHeaders = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
  ]);
  const connectionHeader = request.headers["connection"];
  if (typeof connectionHeader === "string") {
    for (const header of connectionHeader.split(",")) blockedHeaders.add(header.trim().toLowerCase());
  }

  const headers: OutgoingHttpHeaders = {};
  for (const [header, value] of Object.entries(request.headers)) {
    const normalizedHeader = header.toLowerCase();
    if (!blockedHeaders.has(normalizedHeader) && value !== undefined) {
      headers[normalizedHeader] = value;
    }
  }

  headers.host = publicHost;
  headers["x-forwarded-for"] = clientAddress(request);
  headers["x-forwarded-host"] = publicHost;
  headers["x-forwarded-proto"] = "https";
  return headers;
}

export async function createVerifiedHttpProxy(options: VerifiedProxyOptions): Promise<VerifiedProxy> {
  const publicHost = options.publicHost ?? PROXY_PUBLIC_HOST;
  const server = createServer((incoming, outgoing) => {
    let headers: OutgoingHttpHeaders;
    try {
      headers = forwardedHeaders(incoming, publicHost);
    } catch {
      outgoing.writeHead(400).end();
      return;
    }

    const upstream = httpRequest({
      hostname: "127.0.0.1",
      port: options.upstreamPort,
      localAddress: options.upstreamLocalAddress,
      method: incoming.method,
      path: incoming.url,
      headers,
    }, (upstreamResponse) => {
      const responseHeaders: OutgoingHttpHeaders = {};
      const blockedResponseHeaders = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade"]);
      for (const [header, value] of Object.entries(upstreamResponse.headers)) {
        if (!blockedResponseHeaders.has(header.toLowerCase()) && value !== undefined) {
          responseHeaders[header] = value;
        }
      }
      outgoing.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders);
      upstreamResponse.pipe(outgoing);
    });

    upstream.on("error", () => {
      if (outgoing.headersSent) {
        outgoing.destroy();
        return;
      }
      outgoing.writeHead(502).end();
    });
    incoming.pipe(upstream);
  });

  await listen(server);
  return Object.freeze({ port: serverPort(server), close: () => closeServer(server) });
}

export async function createProxyApiFixture(): Promise<ProxyApiFixture> {
  const databaseName = `easygen_test_${String(process.pid)}_${randomUUID().replaceAll("-", "")}`;
  const sourceUri = process.env["TEST_MONGODB_URI"] ?? process.env["MONGODB_URI"] ?? DEFAULT_MONGO_URI;
  const config = parseConfig({
    NODE_ENV: "production",
    APP_ORIGIN: PROXY_APP_ORIGIN,
    MONGODB_URI: isolateMongoUri(sourceUri, databaseName),
    SESSION_SECRET: randomBytes(32).toString("base64"),
    HOST: "127.0.0.1",
    PORT: "3000",
    TRUSTED_PROXY_CIDRS: "127.0.0.1",
  });

  // This fixture deliberately has no AppTestHooks. It exercises the documented
  // production trust list and secure __Host cookie configuration end to end.
  const app = await buildApp({ config });
  let database: Db | undefined;
  try {
    const connection = app.get<Connection>(getConnectionToken());
    database = connection.db;
    if (!database || database.databaseName !== databaseName) {
      throw new Error("Proxy fixture did not select its owned Mongo database");
    }

    await app.listen(0, "127.0.0.1");
    const port = serverPort(app.getHttpServer());
    let teardownPromise: Promise<void> | undefined;
    const teardown = (): Promise<void> => {
      teardownPromise ??= (async () => {
        let dropError: unknown;
        try {
          if (database?.databaseName === databaseName) await database.dropDatabase();
        } catch (error) {
          dropError = error;
        }
        try {
          await app.close();
        } catch (closeError) {
          if (dropError !== undefined) {
            throw new AggregateError([dropError, closeError], "Proxy fixture cleanup failed");
          }
          throw closeError;
        }
        if (dropError instanceof Error) throw dropError;
        if (dropError !== undefined) throw new Error("Proxy fixture database cleanup failed", { cause: dropError });
      })();
      return teardownPromise;
    };

    return Object.freeze({ config, database, databaseName, port, teardown });
  } catch (error) {
    try {
      if (database?.databaseName === databaseName) await database.dropDatabase();
    } finally {
      await app.close();
    }
    if (error instanceof Error) throw error;
    throw new Error("Proxy fixture setup failed", { cause: error });
  }
}
