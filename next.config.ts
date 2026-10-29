import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  // Allow requests from local network IPs during development
  // (fixes "Blocked cross-origin request" warnings)
  allowedDevOrigins: ["127.0.0.1", "192.168.1.3"],

  experimental: {
    // Disable Turbopack's filesystem cache for dev to prevent "Manifest file
    // is empty" errors caused by disk-full SST write failures (os error 112).
    // Re-enable once disk space is freed.
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
