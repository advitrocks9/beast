import type { NextConfig } from "next";

// Security headers applied to every response. The CSP is intentionally limited
// to directives that do not affect Next's inline runtime scripts (frame-ancestors,
// base-uri, form-action), so it hardens clickjacking / base-tag / form-hijack
// without a nonce pipeline. X-Frame-Options is kept as belt-and-suspenders for
// older user agents.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
  },
];

const nextConfig: NextConfig = {
  turbopack: {},
  transpilePackages: ["@beast/db", "@beast/shared", "@beast/ui"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
