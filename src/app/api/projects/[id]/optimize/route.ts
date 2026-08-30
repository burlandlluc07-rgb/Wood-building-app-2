import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  materials,
  parts,
  placements,
  projects,
  sheets,
  stockItems,
} from "@/db/schema";
import { getNominalTable, loadProjectDetail } from "@/lib/detail";
import { analyzeProject } from "@/core/optimizer/solver";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Intelligent reoptimization: pass `scope: [materialId, ...]` to re-solve
 * only the material groups touched by an edit. Pinned diagrams are never
 * touched, regardless of scope.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const scope: string[] | null = Array.isArray(body.scope) ? body.scope : null;

  const project = (await db.select().from(projects).where(eq(projects.id, id)))[0];
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [allMaterials, projectParts, allStock, nominalTable] = await Promise.all([
    db.select().from(materials),
    db.select().from(parts).where(eq(parts.projectId, id)),
    db.select().from(stockItems),
    getNominalTable(),
  ]);

  const analysis = analyzeProject({
    project,
    materials: allMaterials,
    parts: projectParts,
    stockItems: allStock,
    nominalTable,
    scopeMaterialIds: scope,
  });

  // delete unpinned layouts in scope
  const existing = await db.select().from(sheets).where(eq(sheets.projectId, id));
  const doomed = existing.filter(
    (s) => !s.pinned && (!scope || scope.includes(s.materialId))
  );
  if (doomed.length > 0) {
    await db.delete(sheets).where(
      and(
        eq(sheets.projectId, id),
        inArray(sheets.id, doomed.map((s) => s.id))
      )
    );
  }

  const materialName = new Map(allMaterials.map((m) => [m.id, m.name]));
  for (const out of analysis.sheets) {
    const [row] = await db
      .insert(sheets)
      .values({
        projectId: id,
        materialId: out.materialId,
        materialName: materialName.get(out.materialId) ?? "",
        axis: out.axis,
        sourceKind: out.sourceKind,
        sourceStockId: out.sourceStockId,
        width: out.width,
        length: out.length,
        cost: out.cost,
        usedPct: out.usedPct,
        styleCount: out.styles.length,
        groupKey: out.groupKey,
      })
      .returning();
    const rows = out.styles.flatMap((stylePlacements, styleIdx) =>
      stylePlacements.map((p) => ({
        sheetId: row.id,
        partId: p.partId || null,
        partName: p.partName,
        x: p.x,
        y: p.y,
        w: p.w,
        l: p.l,
        rotated: p.rotated,
        styleIdx,
      }))
    );
    if (rows.length > 0) await db.insert(placements).values(rows);
  }

  const detail = await loadProjectDetail(id);
  return NextResponse.json({ ...detail, reoptimized: scope });
}
