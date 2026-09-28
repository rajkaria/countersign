import { readAllGuides } from "@/lib/content/documents";
export const dynamic = "force-static";
export async function GET() {
  return Response.json(
    (await readAllGuides()).map(({ slug, title, description, content }) => ({
      slug,
      title,
      description,
      content,
    })),
  );
}
