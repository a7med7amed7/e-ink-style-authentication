import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { parseConfig } from "../src/config.js";

const strongSecret = randomBytes(32).toString("base64");

function developmentEnv(
  overrides: Readonly<Record<string, string | undefined>> = {}
): Record<string, string | undefined> {
  return {
    NODE_ENV: "development",
    APP_ORIGIN: "http://localhost:5173",
    MONGODB_URI: "mongodb://127.0.0.1:27017/easygen",
    SESSION_SECRET: strongSecret,
    HOST: "127.0.0.1",
    PORT: "3000",
    TRUSTED_PROXY_CIDRS: "",
    ...overrides,
  };
}

function productionEnv(
  overrides: Readonly<Record<string, string | undefined>> = {}
): Record<string, string | undefined> {
  return developmentEnv({
    NODE_ENV: "production",
    APP_ORIGIN: "https://app.example.com",
    MONGODB_URI: "mongodb://mongo.internal:27017/easygen",
    HOST: "10.20.0.5",
    TRUSTED_PROXY_CIDRS: "10.20.0.0/24",
    ...overrides,
  });
}

void test("config: accepts explicit development values and returns immutable parsed settings", () => {
  const config = parseConfig(developmentEnv());

  assert.equal(config.nodeEnv, "development");
  assert.equal(config.appOrigin, "http://localhost:5173");
  assert.equal(config.mongodbUri, "mongodb://127.0.0.1:27017/easygen");
  assert.equal(config.sessionSecret, strongSecret);
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 3000);
  assert.deepEqual(config.trustedProxyCidrs, []);
  assert.equal(Object.isFrozen(config), true);
  assert.equal(Object.isFrozen(config.trustedProxyCidrs), true);
  assert.throws(() => {
    (config as { port: number }).port = 4173;
  }, TypeError);
});

void test("config: requires an origin, MongoDB URI, and secret in development and test", () => {
  assert.throws(
    () => parseConfig(developmentEnv({ NODE_ENV: undefined })),
    "NODE_ENV must be explicit"
  );

  for (const key of ["APP_ORIGIN", "MONGODB_URI", "SESSION_SECRET"]) {
    assert.throws(() => parseConfig(developmentEnv({ [key]: undefined })), key);
    assert.throws(
      () =>
        parseConfig(
          developmentEnv({
            NODE_ENV: "test",
            [key]: undefined,
            ...(key === "SESSION_SECRET" ? { AUTH_TEST_BYPASS: "true" } : {}),
          })
        ),
      key
    );
  }
});

void test("config: rejects weak or malformed base64 session secrets", () => {
  assert.throws(
    () => parseConfig(developmentEnv({ SESSION_SECRET: randomBytes(31).toString("base64") })),
    "31 decoded bytes"
  );
  assert.throws(
    () => parseConfig(developmentEnv({ SESSION_SECRET: "not-base64!" })),
    "malformed base64"
  );
  assert.throws(
    () => parseConfig(developmentEnv({ SESSION_SECRET: `${strongSecret} ` })),
    "non-canonical base64"
  );
});

void test("config: rejects noncanonical origins and HTTP production origins", () => {
  for (const appOrigin of [
    "http://localhost:5173/",
    "http://localhost:5173/path",
    "http://user:pass@localhost:5173",
    "http://localhost:5173?query=1",
    "http://localhost:5173#fragment",
  ]) {
    assert.throws(() => parseConfig(developmentEnv({ APP_ORIGIN: appOrigin })), appOrigin);
  }

  assert.throws(
    () => parseConfig(productionEnv({ APP_ORIGIN: "http://app.example.com" })),
    "production HTTPS"
  );

  assert.equal(parseConfig(productionEnv()).appOrigin, "https://app.example.com");
});

void test("config: requires a MongoDB URI with a database name and valid port", () => {
  for (const mongodbUri of [
    "not a URI",
    "http://mongo.internal:27017/easygen",
    "mongodb://mongo.internal:27017",
    "mongodb://mongo.internal:99999/easygen",
  ]) {
    assert.throws(() => parseConfig(developmentEnv({ MONGODB_URI: mongodbUri })), mongodbUri);
  }
});

void test("config: accepts only valid numeric ports and private bind addresses", () => {
  assert.equal(parseConfig(developmentEnv({ PORT: "65535" })).port, 65535);
  assert.equal(parseConfig(productionEnv()).host, "10.20.0.5");
  assert.equal(
    parseConfig(developmentEnv({ HOST: "0:0:0:0:0:0:0:1" })).host,
    "0:0:0:0:0:0:0:1"
  );

  for (const port of ["0", "65536", "3000x", "-1", "1.5"]) {
    assert.throws(() => parseConfig(developmentEnv({ PORT: port })), port);
  }

  for (const host of ["0.0.0.0", "::", "8.8.8.8", "api.example.com"]) {
    assert.throws(() => parseConfig(developmentEnv({ HOST: host })), host);
  }
});

void test("config: requires narrow explicit proxy trust only for production", () => {
  assert.throws(
    () => parseConfig(developmentEnv({ TRUSTED_PROXY_CIDRS: "127.0.0.1" })),
    "development does not trust a proxy"
  );

  for (const trustedProxyCidrs of [
    "",
    "*",
    "true",
    "0.0.0.0/0",
    "::/0",
    "0.0.0.0/1",
    "10.0.0.0/8",
    "10.20.0.0/23",
    "fd00::/32",
    "fd00::/63",
    "invalid/24"
  ]) {
    assert.throws(
      () => parseConfig(productionEnv({ TRUSTED_PROXY_CIDRS: trustedProxyCidrs })),
      trustedProxyCidrs || "production requires a trusted proxy"
    );
  }

  const config = parseConfig(
    productionEnv({
      TRUSTED_PROXY_CIDRS: "10.20.0.0/24, 192.168.2.7, fd12:3456::/64, 2001:db8::7"
    })
  );
  assert.deepEqual(config.trustedProxyCidrs, [
    "10.20.0.0/24",
    "192.168.2.7",
    "fd12:3456::/64",
    "2001:db8::7"
  ]);
  assert.equal(Object.isFrozen(config.trustedProxyCidrs), true);
});

void test("config: test mode accepts explicit loopback settings without bypassing required checks", () => {
  const config = parseConfig(
    developmentEnv({
      NODE_ENV: "test",
      APP_ORIGIN: "http://127.0.0.1:4173",
      PORT: "4173",
      AUTH_TEST_BYPASS: "true",
    })
  );

  assert.equal(config.nodeEnv, "test");
  assert.equal(config.appOrigin, "http://127.0.0.1:4173");
  assert.throws(
    () => parseConfig(developmentEnv({ NODE_ENV: "test", SESSION_SECRET: undefined })),
    "test mode still requires a session secret"
  );
});
