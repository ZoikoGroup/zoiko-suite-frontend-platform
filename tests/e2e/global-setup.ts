// Builds public-ai-svc once for the browser journeys.
//
// PUBLIC_AI_SVC_DIR points at services/public-ai-svc in a zoiko-suite-backend
// checkout that has the assistant (default: the sibling checkout).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BIN } from "./backend";

const here = path.dirname(fileURLToPath(import.meta.url));

export default function globalSetup() {
  const dir = path.resolve(process.env.PUBLIC_AI_SVC_DIR ?? path.join(here, "..", "..", "..", "zoiko-suite-backend", "services", "public-ai-svc"));
  if (!existsSync(path.join(dir, "cmd", "server"))) {
    throw new Error(`public-ai-svc not found at ${dir}. Set PUBLIC_AI_SVC_DIR to services/public-ai-svc in a backend checkout that has the assistant.`);
  }
  mkdirSync(path.dirname(BIN), { recursive: true });
  execFileSync("go", ["build", "-o", BIN, "./cmd/server"], { cwd: dir, stdio: "inherit" });
}
