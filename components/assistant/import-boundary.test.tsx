// The public chatbot must never reach dashboard, health, auth or session
// code (Docs 01 FR-16, 03 §27, 04 INV-01; product decision 2026-10-28: the
// authenticated admin/account copilot is deferred to R2). This test reads
// every chatbot source file and fails on any import outside the allowlist,
// and on any reference to the dashboard's data sources. ESLint enforces the
// same rule while editing (eslint.config.mjs, "public chatbot boundary").

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");

/** Chatbot source: the widget, its API clients, its proxy route and its page. */
const CHATBOT_DIRS = ["components/assistant", "app/public-ai", "app/assistant"];
const CHATBOT_FILES = ["lib/api/public-ai.ts", "lib/api/public-ai-proxy.ts"];

/** The only modules chatbot code may import. Relative imports must stay inside the chatbot dirs. */
const ALLOWED = new Set([
  "react",
  "next",
  "next/navigation",
  "lucide-react",
  "@/lib/api/public-ai",
  "@/lib/api/public-ai-proxy",
  "@/lib/utils",
  // tests only
  "vitest",
  "@testing-library/react",
  "node:test",
  "node:assert/strict",
  "node:fs",
  "node:path",
]);

/** Names that must never appear in chatbot code, imported or not. */
const FORBIDDEN_TEXT = [/getDomainHealth/, /lib\/api\/health/, /components\/admin/, /@\/lib\/auth/, /next\/headers/, /\bdocument\.cookie\b/, /\blocalStorage\.getItem\(["']zoiko_session/];

function sources(dir: string): string[] {
  const abs = join(ROOT, dir);
  return readdirSync(abs).flatMap((name) => {
    const p = join(abs, name);
    if (statSync(p).isDirectory()) return sources(join(dir, name));
    return /\.(ts|tsx|mjs)$/.test(name) ? [join(dir, name)] : [];
  });
}

const files = [...CHATBOT_DIRS.flatMap(sources), ...CHATBOT_FILES];
const importRe = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g;

describe("public chatbot import boundary", () => {
  it("finds the chatbot sources", () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files).toContain(join("app", "public-ai", "v1", "[...path]", "route.ts"));
  });

  for (const file of files) {
    it(`${file} imports only allowlisted modules`, () => {
      const text = readFileSync(join(ROOT, file), "utf8");
      const code = file.endsWith("import-boundary.test.tsx") ? "" : text; // this file names the forbidden patterns
      for (const re of FORBIDDEN_TEXT) expect(code, `${file} references ${re}`).not.toMatch(re);
      for (const [, spec] of text.matchAll(importRe)) {
        if (spec.startsWith(".")) {
          const target = relative(ROOT, join(ROOT, file, "..", spec));
          const inside = CHATBOT_DIRS.some((d) => target === join(d) || target.startsWith(join(d) + "\\") || target.startsWith(join(d) + "/"));
          expect(inside, `${file} imports ${spec} from outside the chatbot`).toBe(true);
        } else {
          expect(ALLOWED.has(spec), `${file} imports ${spec}`).toBe(true);
        }
      }
    });
  }
});
