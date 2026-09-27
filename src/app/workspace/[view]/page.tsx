import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace";
const views = [
  "obligations",
  "cases",
  "plan",
  "activity",
  "authority",
  "recovery",
  "evidence",
];
export function generateStaticParams() {
  return views.map((view) => ({ view }));
}
export const metadata = {
  title: "Workspace demo",
  robots: { index: false, follow: false },
};
export default async function WorkspaceView({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  if (!views.includes(view)) notFound();
  return <Workspace view={view} />;
}
