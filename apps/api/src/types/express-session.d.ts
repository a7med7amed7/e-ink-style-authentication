import type { SessionAuthMetadata } from "../session/policy.js";

declare module "express-session" {
  interface SessionData {
    auth?: SessionAuthMetadata;
  }
}
