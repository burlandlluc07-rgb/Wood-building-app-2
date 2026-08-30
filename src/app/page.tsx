import { db } from "@/db";
import { projects, sheets, materials as materialsTable } from "@/db/schema";
import { seedIfEmpty } from "@/db/seed";
import { Dashboard, type ProjectCard } from "@/components/dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  await seedIfEmpty();
  const [rows, sheetRows, materialRows] = await Promise.all([
    db.select().from(projects).orderBy(projects.updatedAt),
    db.select().from(sheets),
    db.select().from(materialsTable),
  ]);
  const counts = new Map<string, number>();
  for (const s of sheetRows) counts.set(s.projectId, (counts.get(s.projectId) ?? 0) + 1);

  const cards: ProjectCard[] = rows
    .map((p) => ({
      id: p.id,
      name: p.name,
      units: p.units,
      isTemplate: p.isTemplate,
      updatedAt: p.updatedAt.toISOString(),
      layoutCount: counts.get(p.id) ?? 0,
    }))
    .reverse();

  return (
    <Dashboard
      projects={cards.filter((c) => !c.isTemplate)}
      templates={cards.filter((c) => c.isTemplate)}
      materialsCount={materialRows.length}
    />
  );
}
