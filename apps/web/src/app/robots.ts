import type { MetadataRoute } from "next";

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://beast.team";
}

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl().replace(/\/$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/vs/", "/sign-in", "/sign-up"],
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
          "/share/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
