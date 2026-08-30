import { notFound } from "next/navigation";
import { loadProjectDetail } from "@/lib/detail";
import { Workspace } from "@/components/workspace";
import type { Detail } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await loadProjectDetail(id);
  if (!detail) notFound();
  const serialized = JSON.parse(JSON.stringify(detail)) as Detail;
  return <Workspace initial={serialized} />;
}
