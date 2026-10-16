import { randomBytes, randomUUID } from "node:crypto";
import { defineConfig } from "@playwright/test";

const testOrigin = "http://127.0.0.1:4173";
const testRunId = randomUUID();
const testDatabase = `easygen_e2e_${testRunId.replaceAll("-", "")}`;
const testMongoUri = `mongodb://127.0.0.1:27017/${testDatabase}`;

export default defineConfig({
  metadata: { easygenE2eDatabase: { runId: testRunId, databaseName: testDatabase } },
  globalTeardown: "./tests/e2e/database-cleanup.ts",
  testDir: "./tests/e2e",
  workers: 1,
  use: {
    baseURL: testOrigin,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
    {
      name: "firefox",
      use: { browserName: "firefox" },
    },
    {
      name: "webkit",
      use: { browserName: "webkit" },
    },
  ],
  webServer: {
    command: "node apps/api/dist/main.js",
    url: testOrigin,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      NODE_ENV: "test",
      APP_ORIGIN: testOrigin,
      HOST: "127.0.0.1",
      PORT: "4173",
      SESSION_SECRET: randomBytes(32).toString("base64"),
      MONGODB_URI: testMongoUri,
      TRUSTED_PROXY_CIDRS: "",
    },
  },
});
