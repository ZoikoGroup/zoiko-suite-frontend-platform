import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/** Only allow in non-production environments */
function guardProd() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Docker control API is disabled in production" },
      { status: 403 }
    );
  }
  return null;
}

/**
 * GET /api/docker
 * Returns the status of all running containers.
 * Uses `docker compose ps` table output (compatible with all compose versions).
 */
export async function GET(_req: NextRequest) {
  const guard = guardProd();
  if (guard) return guard;

  try {
    // First try the JSON format (newer Docker Compose versions)
    let containers: Array<{ Name: string; Service: string; State: string; Status: string }> = [];

    try {
      const { stdout: jsonOut } = await execAsync(
        "docker compose ps --format json",
        { timeout: 8_000 }
      );

      const lines = jsonOut.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          containers.push(JSON.parse(line));
        } catch {
          // skip malformed line
        }
      }
    } catch {
      // JSON format not supported — fall back to table parsing
      containers = [];
    }

    // Fallback: parse the plain-text table from `docker compose ps`
    if (containers.length === 0) {
      const { stdout: tableOut } = await execAsync(
        "docker compose ps",
        { timeout: 8_000 }
      );

      const tableLines = tableOut.trim().split("\n");
      // Skip the header line (NAME   IMAGE   COMMAND   SERVICE   CREATED   STATUS   PORTS)
      for (let i = 1; i < tableLines.length; i++) {
        const line = tableLines[i].trim();
        if (!line) continue;
        // Columns are whitespace-separated; NAME is always the first token
        const cols = line.split(/\s{2,}/); // split on 2+ spaces
        const name = cols[0]?.trim() ?? "";
        const statusCol = cols[5]?.trim() ?? cols[4]?.trim() ?? "";
        const state = statusCol.toLowerCase().startsWith("up") ? "running" : "exited";
        if (name) {
          containers.push({
            Name: name,
            Service: cols[3]?.trim() ?? name,
            State: state,
            Status: statusCol,
          });
        }
      }
    }

    const running = containers.filter((c) => c.State === "running").length;

    return NextResponse.json({
      containers,
      total: containers.length,
      running,
      all_up: running === containers.length && containers.length > 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isDockerDown =
      message.includes("docker") ||
      message.includes("connect") ||
      message.includes("ENOENT") ||
      message.includes("not recognized");

    return NextResponse.json(
      {
        containers: [],
        total: 0,
        running: 0,
        all_up: false,
        error: isDockerDown
          ? "Docker is not running or not installed"
          : message,
      },
      { status: 200 }
    );
  }
}

/**
 * POST /api/docker
 * Body: { action: "up" | "down" | "build" }
 */
export async function POST(req: NextRequest) {
  const guard = guardProd();
  if (guard) return guard;

  let action = "up";
  try {
    const body = await req.json();
    if (body?.action) action = body.action;
  } catch {
    // no body — default to "up"
  }

  const commandMap: Record<string, string> = {
    up: "docker compose up -d",
    down: "docker compose down",
    build: "docker compose build",
  };

  const cmd = commandMap[action];
  if (!cmd) {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: 300_000 });
    return NextResponse.json({
      ok: true,
      action,
      stdout: stdout.slice(-2000),
      stderr: stderr.slice(-2000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, action, error: message }, { status: 500 });
  }
}
