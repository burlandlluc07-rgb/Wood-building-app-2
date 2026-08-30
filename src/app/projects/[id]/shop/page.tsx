import { notFound } from "next/navigation";
import { loadProjectDetail } from "@/lib/detail";
import { ShopMode } from "@/components/shop-mode";
import type { Detail } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function ShopPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await loadProjectDetail(id);
  if (!detail) notFound();
  const serialized = JSON.parse(JSON.stringify(detail)) as Detail;
  return <ShopMode initial={serialized} />;
}
