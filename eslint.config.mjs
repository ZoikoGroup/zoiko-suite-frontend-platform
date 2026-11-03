import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "scratch/**",
    "**/scratch/**",
    "zoiko-suite-frontend-platform/**",
  ]),
  {
    files: [
      "scratch/**/*.js",
      "**/scratch/**/*.js",
      "mock-backend/**/*.js",
      "*.js",
    ],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    // Public chatbot boundary (Docs 01 FR-16, 03 §27, 04 INV-01): the
    // chatbot never reads dashboard, health, auth or session code. The
    // authenticated admin copilot is deferred to R2 (docs/open-decisions.md).
    // components/assistant/import-boundary.test.tsx enforces the same rule.
    files: ["components/assistant/**", "app/public-ai/**", "app/assistant/**", "lib/api/public-ai.ts", "lib/api/public-ai-proxy.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/lib/api/*", "!@/lib/api/public-ai", "!@/lib/api/public-ai-proxy", "@/lib/auth", "@/lib/servicectl", "@/components/admin", "@/components/admin/*", "next/headers"],
          message: "The public chatbot must not import dashboard, health, auth or session code (FR-16 deferred).",
        }],
      }],
    },
  },
]);

export default eslintConfig;
