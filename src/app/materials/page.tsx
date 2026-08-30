import { db } from "@/db";
import { materials, stockItems } from "@/db/schema";
import { asc } from "drizzle-orm";
import { getNominalTable } from "@/lib/detail";
import { seedIfEmpty } from "@/db/seed";
import { MaterialsLibrary } from "@/components/materials-library";

export const dynamic = "force-dynamic";

export default async function MaterialsPage() {
  await seedIfEmpty();
  const [mats, stock, nominalTable] = await Promise.all([
    db.select().from(materials).orderBy(asc(materials.name)),
    db.select().from(stockItems).orderBy(asc(stockItems.length)),
    getNominalTable(),
  ]);
  return (
    <MaterialsLibrary
      initialMaterials={mats}
      initialStock={stock.map((s) => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
      }))}
      initialNominalTable={nominalTable}
    />
  );
}
