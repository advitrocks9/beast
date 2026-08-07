import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

// Next only reads apps/web/.env.local; the canonical env file lives at the repo
// root. Loading it here (never overriding already-set vars) makes a fresh clone
// work without the apps/web/.env.local symlink.
const rootEnvFile = resolve(process.cwd(), "../../.env.local");
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

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
