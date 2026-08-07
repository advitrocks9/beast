import type { MetadataRoute } from "next";
import { env } from "@beast/shared/env";

function siteUrl(): string {
  return env.NEXT_PUBLIC_APP_URL ?? "https://beast.team";
}

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl().replace(/\/$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/sign-in", "/sign-up"],
        disallow: [
          "/api/",
          "/auth/",
          "/onboarding",
          "/dashboard",
          "/employees",
          "/goals",
          "/checkins",
          "/settings",
          "/reviews",
          "/review/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
