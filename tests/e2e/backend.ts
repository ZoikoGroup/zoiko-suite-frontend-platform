// Starts and stops the public-ai-svc binary that global-setup built, on its
// own port with the public KB (drafts allowed, dev) and the mock model.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const ASSISTANT_PORT = 18181;
export const BIN = path.resolve(here, ".bin", process.platform === "win32" ? "public-ai-svc.exe" : "public-ai-svc");

let proc: ChildProcess | null = null;

async function healthy(): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${ASSISTANT_PORT}/public-ai/v1/health/public`, {
      headers: { Origin: "http://localhost:3000" },
      signal: AbortSignal.timeout(1000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function startAssistant(): Promise<void> {
  if (proc) return;
  if (!existsSync(BIN)) throw new Error(`public-ai-svc binary missing at ${BIN}; global-setup builds it`);
  proc = spawn(BIN, [], {
    env: {
      ...process.env,
      PUBLIC_AI_ENABLED: "true",
      PUBLIC_AI_ENVIRONMENT: "dev",
      PUBLIC_AI_HTTP_ADDR: `127.0.0.1:${ASSISTANT_PORT}`,
      PUBLIC_AI_ALLOWED_ORIGINS: "http://localhost:3000",
      PUBLIC_AI_DATASET: "public-kb",
      KB_ALLOW_DRAFT: "true",
      MODEL_PROVIDER: "mock",
      PUBLIC_AI_RATE_LIMIT_IP_PER_MIN: "6000",
      PUBLIC_AI_RATE_LIMIT_SESSION_PER_MIN: "6000",
      PUBLIC_AI_RATE_LIMIT_SESSION_CREATE_PER_MIN: "6000",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  const started = proc;
  let stderr = "";
  started.stderr?.on("data", (b: Buffer) => {
    stderr = (stderr + b.toString()).slice(-2000);
  });
  for (let i = 0; i < 100; i++) {
    if (await healthy()) return;
    if (started.exitCode !== null) {
      // e.g. the port is still held: say why instead of timing out.
      proc = null;
      throw new Error(`public-ai-svc exited with code ${started.exitCode}: ${stderr.trim().split("\n").slice(-3).join(" | ")}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("public-ai-svc did not become healthy");
}

// Simulates an outage: the process is killed outright, and we wait until it
// has exited. A plain SIGTERM starts the service's graceful shutdown (Doc 08
// OPR-012: not ready, 5 s drain), during which it still holds the port, so a
// restart right after would fail to bind on Linux. (On Windows kill() is
// always immediate, which is why this only showed in CI.)
export async function stopAssistant(): Promise<void> {
  if (!proc) return;
  const p = proc;
  proc = null;
  if (p.exitCode === null && p.signalCode === null) {
    const exited = new Promise<void>((resolve) => p.once("exit", () => resolve()));
    p.kill("SIGKILL");
    await Promise.race([exited, new Promise((r) => setTimeout(r, 10_000))]);
  }
  for (let i = 0; i < 50 && (await healthy()); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
}
