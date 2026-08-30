import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { hardwareItems, parts, projects, sheets } from "@/db/schema";
import { seedIfEmpty } from "@/db/seed";

export async function GET() {
  await seedIfEmpty();
  const rows = await db.select().from(projects).orderBy(projects.updatedAt);
  // attach sheet counts
  const allSheets = await db.select().from(sheets);
  const byProject = new Map<string, number>();
  for (const s of allSheets) {
    byProject.set(s.projectId, (byProject.get(s.projectId) ?? 0) + 1);
  }
  return NextResponse.json(
    rows
      .map((p) => ({ ...p, layoutCount: byProject.get(p.id) ?? 0 }))
      .reverse()
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = String(body.name ?? "Untitled Project").slice(0, 120);
  const units = body.units === "in" ? "in" : "mm";
  const copyFromId: string | undefined = body.copyFromId ?? undefined;

  let base: Partial<typeof projects.$inferInsert> = {};
  if (copyFromId) {
    const src = (await db.select().from(projects).where(eq(projects.id, copyFromId)))[0];
    if (!src) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    base = {
      kerf: src.kerf,
      objective: src.objective,
      defaultYieldPct: src.defaultYieldPct,
      primaryMaterialId: src.primaryMaterialId,
      secondaryMaterialId: src.secondaryMaterialId,
      roundUpCosts: src.roundUpCosts,
      firstCutDirection: src.firstCutDirection,
      useOffcutsFirst: src.useOffcutsFirst,
      notes: src.notes,
    };
  }

  const [created] = await db
    .insert(projects)
    .values({ name, units, ...base, isTemplate: !!body.isTemplate })
    .returning();

  if (copyFromId) {
    const srcParts = await db.select().from(parts).where(eq(parts.projectId, copyFromId));
    const idMap = new Map<string, string>();
    // parents first pass (non-staves)
    for (const p of srcParts.filter((x) => !x.parentPartId)) {
      const [row] = await db
        .insert(parts)
        .values({ ...p, id: undefined, projectId: created.id })
        .returning();
      idMap.set(p.id, row.id);
    }
    for (const p of srcParts.filter((x) => x.parentPartId)) {
      const [row] = await db
        .insert(parts)
        .values({
          ...p,
          id: undefined,
          projectId: created.id,
          parentPartId: p.parentPartId ? (idMap.get(p.parentPartId) ?? null) : null,
        })
        .returning();
      idMap.set(p.id, row.id);
    }
    const srcHw = await db
      .select()
      .from(hardwareItems)
      .where(eq(hardwareItems.projectId, copyFromId));
    for (const h of srcHw) {
      await db.insert(hardwareItems).values({ ...h, id: undefined, projectId: created.id });
    }
  }

  return NextResponse.json(created);
}
