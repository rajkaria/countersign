import type { MetadataRoute } from "next";
import { guides, siteOrigin } from "@/lib/content/guides";
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteOrigin },
    { url: `${siteOrigin}/docs` },
    { url: `${siteOrigin}/review` },
    ...guides.map((g) => ({ url: `${siteOrigin}/docs/${g.slug}` })),
  ];
}
