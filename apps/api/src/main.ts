import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { parseConfig } from "./config.js";
import { buildApp } from "./bootstrap.js";

export async function startApi(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<NestExpressApplication> {
  const config = parseConfig(env);
  const app = await buildApp({ config });

  try {
    app.enableShutdownHooks(["SIGINT", "SIGTERM"]);
    await app.listen(config.port, config.host);
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}

const entryPath = process.argv[1];
if (entryPath !== undefined && import.meta.url === pathToFileURL(resolve(entryPath)).href) {
  void startApi().catch(() => {
    process.stderr.write("API startup failed; check configuration and service availability.\n");
    process.exitCode = 1;
  });
}
