import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Unit tests for the ZoikoSuite Assistant widget (jsdom). Browser journeys
// live in tests/e2e (Playwright).
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "jsdom",
    include: ["components/**/*.test.tsx", "lib/**/*.test.ts"],
    restoreMocks: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
