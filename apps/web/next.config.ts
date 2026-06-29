import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  transpilePackages: ["@beast/db", "@beast/shared", "@beast/ui"],
};

export default nextConfig;
