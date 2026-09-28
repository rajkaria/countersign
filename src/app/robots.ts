import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/content/guides";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/docs/", "/llms.txt", "/llms-full.txt"],
      disallow: ["/api/", "/console", "/vendor", "/login", "/workspace"],
    },
    sitemap: `${siteOrigin}/sitemap.xml`,
  };
}
