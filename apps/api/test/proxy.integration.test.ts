import assert from "node:assert/strict";
import express from "express";
import { request as httpRequest, type IncomingHttpHeaders, type Server } from "node:http";
import { test, type TestContext } from "node:test";
import {
  createProxyApiFixture,
  createVerifiedHttpProxy,
  PROXY_APP_ORIGIN,
  PROXY_PUBLIC_HOST,
  type ProxyApiFixture,
  type ProxySocketAddress,
  type VerifiedProxy,
} from "./support/proxy.js";

interface HttpResult {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

interface HttpRequestOptions {
  readonly port: number;
  readonly localAddress: ProxySocketAddress;
  readonly method: string;
  readonly path: string;
  readonly headers?: IncomingHttpHeaders;
  readonly body?: string;
}

function sendHttp(options: HttpRequestOptions): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: "127.0.0.1",
      port: options.port,
      localAddress: options.localAddress,
      method: options.method,
      path: options.path,
      headers: options.headers,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
      response.on("error", reject);
    });
    request.on("error", reject);
    if (options.body !== undefined) request.write(options.body);
    request.end();
  });
}

function portOf(server: Server): number {
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Expected a TCP listener");
  return address.port;
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) reject(error);
      else resolve();
    });
  });
}

function closeFixture(context: TestContext, fixture: ProxyApiFixture): void {
  context.after(() => fixture.teardown());
}

function proxyHeaderAttackHeaders(): Record<string, string> {
  return {
    host: "forged.example.invalid",
    "x-forwarded-for": "198.51.100.77",
    "x-forwarded-host": "forged.example.invalid",
    "x-forwarded-proto": "http",
  };
}

void test("proxy: overwrites forwarded claims and only trusts the configured socket peer", async (context) => {
  const fixture = await createProxyApiFixture();
  closeFixture(context, fixture);

  const inspector = express();
  assert.deepEqual(fixture.config.trustedProxyCidrs, ["127.0.0.1"]);
  inspector.set("trust proxy", [...fixture.config.trustedProxyCidrs]);
  inspector.get("/inspect", (request, response) => {
    response.json({
      host: request.headers.host,
      forwardedFor: request.headers["x-forwarded-for"],
      forwardedHost: request.headers["x-forwarded-host"],
      forwardedProto: request.headers["x-forwarded-proto"],
      ip: request.ip,
      secure: request.secure,
      hostname: request.hostname,
    });
  });
  const inspectorServer = inspector.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    inspectorServer.once("listening", resolve);
    inspectorServer.once("error", reject);
  });
  context.after(() => closeServer(inspectorServer));

  const proxy: VerifiedProxy = await createVerifiedHttpProxy({
    upstreamPort: portOf(inspectorServer),
    upstreamLocalAddress: "127.0.0.1",
  });
  context.after(() => proxy.close());

  const trusted = await sendHttp({
    port: proxy.port,
    localAddress: "127.0.0.2",
    method: "GET",
    path: "/inspect",
    headers: proxyHeaderAttackHeaders(),
  });
  assert.equal(trusted.status, 200, trusted.body);
  assert.deepEqual(JSON.parse(trusted.body), {
    host: PROXY_PUBLIC_HOST,
    forwardedFor: "127.0.0.2",
    forwardedHost: PROXY_PUBLIC_HOST,
    forwardedProto: "https",
    ip: "127.0.0.2",
    secure: true,
    hostname: PROXY_PUBLIC_HOST,
  });

  const untrusted = await sendHttp({
    port: portOf(inspectorServer),
    localAddress: "127.0.0.2",
    method: "GET",
    path: "/inspect",
    headers: proxyHeaderAttackHeaders(),
  });
  assert.equal(untrusted.status, 200, untrusted.body);
  assert.deepEqual(JSON.parse(untrusted.body), {
    host: "forged.example.invalid",
    forwardedFor: "198.51.100.77",
    forwardedHost: "forged.example.invalid",
    forwardedProto: "http",
    ip: "127.0.0.2",
    secure: false,
    hostname: "forged.example.invalid",
  });
  assert.equal(fixture.config.trustedProxyCidrs.join(","), "127.0.0.1");
});

void test("proxy: API request buckets follow the verified client IP, not spoofed forwarding headers", async (context) => {
  const fixture = await createProxyApiFixture();
  closeFixture(context, fixture);
  const proxy = await createVerifiedHttpProxy({
    upstreamPort: fixture.port,
    upstreamLocalAddress: "127.0.0.1",
  });
  context.after(() => proxy.close());

  for (let attempt = 1; attempt <= 120; attempt += 1) {
    const response = await sendHttp({
      port: proxy.port,
      localAddress: "127.0.0.2",
      method: "GET",
      path: "/api/auth/me",
      headers: {
        ...proxyHeaderAttackHeaders(),
        "x-forwarded-for": `203.0.113.${String(attempt)}`,
      },
    });
    assert.equal(response.status, 401, `request ${String(attempt)} must share the verified .2 client bucket`);
  }

  const exhaustedClient = await sendHttp({
    port: proxy.port,
    localAddress: "127.0.0.2",
    method: "GET",
    path: "/api/auth/me",
    headers: { ...proxyHeaderAttackHeaders(), "x-forwarded-for": "198.51.100.199" },
  });
  assert.equal(exhaustedClient.status, 429, exhaustedClient.body);

  const distinctClient = await sendHttp({
    port: proxy.port,
    localAddress: "127.0.0.1",
    method: "GET",
    path: "/api/auth/me",
    headers: proxyHeaderAttackHeaders(),
  });
  assert.equal(distinctClient.status, 401, "a different socket client forwarded by the trusted proxy has its own bucket");

  const untrustedPeerSpoof = await sendHttp({
    port: fixture.port,
    localAddress: "127.0.0.2",
    method: "GET",
    path: "/api/auth/me",
    headers: { ...proxyHeaderAttackHeaders(), "x-forwarded-for": "192.0.2.217" },
  });
  assert.equal(untrustedPeerSpoof.status, 429,
    "a direct untrusted socket ignores XFF and remains in its actual 127.0.0.2 bucket");
});

void test("proxy: production API emits __Host Secure cookies only through the trusted HTTPS proxy", async (context) => {
  const fixture = await createProxyApiFixture();
  closeFixture(context, fixture);
  const proxy = await createVerifiedHttpProxy({
    upstreamPort: fixture.port,
    upstreamLocalAddress: "127.0.0.1",
  });
  context.after(() => proxy.close());

  const signupBody = JSON.stringify({
    email: "proxy@example.com",
    name: "Grace Hopper",
    password: "Abcdef1!",
  });
  const signup = await sendHttp({
    port: proxy.port,
    localAddress: "127.0.0.2",
    method: "POST",
    path: "/api/auth/signup",
    headers: {
      ...proxyHeaderAttackHeaders(),
      origin: PROXY_APP_ORIGIN,
      "x-requested-with": "XMLHttpRequest",
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(signupBody)),
    },
    body: signupBody,
  });
  assert.equal(signup.status, 201, signup.body);
  const signupCookies = signup.headers["set-cookie"];
  assert.ok(Array.isArray(signupCookies), "trusted HTTPS proxy must receive the session cookie");
  const sessionCookie = signupCookies.find((cookie) => cookie.startsWith("__Host-easygen.sid="));
  assert.ok(sessionCookie, "production must use the __Host session cookie name");
  assert.match(sessionCookie, /;\s*Secure(?:;|$)/i);
  assert.match(sessionCookie, /;\s*Path=\//i);
  assert.match(sessionCookie, /;\s*HttpOnly(?:;|$)/i);
  assert.match(sessionCookie, /;\s*SameSite=Strict(?:;|$)/i);
  assert.doesNotMatch(sessionCookie, /;\s*Domain=/i);

  const cookiePair = sessionCookie.split(";", 1)[0];
  const directUntrusted = await sendHttp({
    port: fixture.port,
    localAddress: "127.0.0.2",
    method: "GET",
    path: "/api/auth/me",
    headers: {
      ...proxyHeaderAttackHeaders(),
      host: "forged.example.invalid",
      "x-forwarded-proto": "https",
      origin: PROXY_APP_ORIGIN,
      cookie: cookiePair,
    },
  });
  assert.equal(directUntrusted.status, 200, directUntrusted.body);
  assert.equal(directUntrusted.headers["set-cookie"], undefined,
    "an untrusted 127.0.0.2 socket cannot make Express treat a forged HTTPS header as secure");

  const trustedRenewal = await sendHttp({
    port: proxy.port,
    localAddress: "127.0.0.2",
    method: "GET",
    path: "/api/auth/me",
    headers: {
      ...proxyHeaderAttackHeaders(),
      cookie: cookiePair,
      origin: PROXY_APP_ORIGIN,
    },
  });
  assert.equal(trustedRenewal.status, 200, trustedRenewal.body);
  const renewedCookies = trustedRenewal.headers["set-cookie"];
  assert.ok(Array.isArray(renewedCookies));
  const renewedSessionCookie = renewedCookies.find((cookie) => cookie.startsWith("__Host-easygen.sid="));
  assert.ok(renewedSessionCookie);
  assert.match(renewedSessionCookie, /;\s*Secure(?:;|$)/i);
  assert.doesNotMatch(renewedSessionCookie, /;\s*Domain=/i);
});
