import type { NextConfig } from "next";

// Doc 06 §03/§11: the console and the assistant widget it hosts must not be
// framed (clickjacking), sniffed or leak full URLs. The CSP restricts framing,
// <base>, plugins and form targets only: Next.js needs inline scripts (and eval
// in dev), so script-src is left to a nonce-based policy later.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // HSTS only where the console is served over HTTPS; on http://localhost it
  // would make the browser insist on HTTPS for every local port.
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  output: "standalone",
  // No framework fingerprint in responses (Doc 06 §11).
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

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
