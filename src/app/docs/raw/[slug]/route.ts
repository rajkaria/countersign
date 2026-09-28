import { findGuide, guides } from "@/lib/content/guides";
import { readGuide } from "@/lib/content/documents";
export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() {
  return guides.map((g) => ({ slug: g.slug }));
}
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const guide = findGuide((await params).slug);
  if (!guide) return new Response("Guide not found", { status: 404 });
  return new Response(await readGuide(guide), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
