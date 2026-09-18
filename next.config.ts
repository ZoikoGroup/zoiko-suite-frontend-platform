import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

// Next 16 compiles the config to ESM, where __dirname does not exist.
const rootDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: rootDir,
  },
};

export default nextConfig;
