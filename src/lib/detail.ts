// Server-side loader: assembles the full project detail payload
// (project + library + saved layouts + fresh analysis + BOM).

import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  appSettings,
  hardwareItems,
  importPresets,
  materials,
  parts,
  placements,
  projects,
  sheets,
  stockItems,
} from "@/db/schema";
import { analyzeProject } from "@/core/optimizer/solver";
import { buildBom, type SavedSheet } from "@/core/pricing/bom";
import {
  DEFAULT_NOMINAL_TABLE,
  NOMINAL_TABLE_SETTING_KEY,
} from "@/core/optimizer/roughLumber";
import type { NominalThicknessEntry } from "@/core/types";

export async function getNominalTable(): Promise<NominalThicknessEntry[]> {
  const rows = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, NOMINAL_TABLE_SETTING_KEY));
  const v = rows[0]?.value;
  if (Array.isArray(v) && v.length > 0) return v as NominalThicknessEntry[];
  return DEFAULT_NOMINAL_TABLE;
}

export async function setNominalTable(table: NominalThicknessEntry[]) {
  await db
    .insert(appSettings)
    .values({ key: NOMINAL_TABLE_SETTING_KEY, value: table })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: table },
    });
}

export async function loadProjectDetail(projectId: string) {
  const projectRows = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));
  const project = projectRows[0];
  if (!project) return null;

  const [allMaterials, projectParts, allStock, hw, sheetRows, presets, nominalTable] =
    await Promise.all([
      db.select().from(materials).orderBy(asc(materials.name)),
      db
        .select()
        .from(parts)
        .where(eq(parts.projectId, projectId))
        .orderBy(asc(parts.sortOrder), asc(parts.createdAt)),
      db.select().from(stockItems).orderBy(asc(stockItems.kind), asc(stockItems.length)),
      db
        .select()
        .from(hardwareItems)
        .where(eq(hardwareItems.projectId, projectId))
        .orderBy(asc(hardwareItems.category), asc(hardwareItems.name)),
      db.select().from(sheets).where(eq(sheets.projectId, projectId)),
      db.select().from(importPresets).orderBy(asc(importPresets.name)),
      getNominalTable(),
    ]);

  const sheetIds = sheetRows.map((s) => s.id);
  const placementRows =
    sheetIds.length > 0
      ? await db
          .select()
          .from(placements)
          .where(inArray(placements.sheetId, sheetIds))
      : [];

  const analysis = analyzeProject({
    project,
    materials: allMaterials,
    parts: projectParts,
    stockItems: allStock,
    nominalTable,
  });

  const savedSheets: SavedSheet[] = sheetRows.map((s) => ({
    id: s.id,
    materialId: s.materialId,
    materialName: s.materialName,
    axis: s.axis,
    sourceKind: s.sourceKind,
    width: s.width,
    length: s.length,
    usedPct: s.usedPct,
    pinned: s.pinned,
    cutDone: s.cutDone,
    styleIndex: s.styleIndex,
    styleCount: s.styleCount,
    groupKey: s.groupKey,
    placements: placementRows
      .filter((p) => p.sheetId === s.id)
      .map((p) => ({
        id: p.id,
        partId: p.partId,
        partName: p.partName,
        x: p.x,
        y: p.y,
        w: p.w,
        l: p.l,
        rotated: p.rotated,
        styleIdx: p.styleIdx,
      })),
  }));

  const bom = buildBom({
    project,
    materials: allMaterials,
    parts: projectParts,
    hardware: hw,
    savedSheets,
    analysis,
  });

  return {
    project,
    materials: allMaterials,
    parts: projectParts,
    stockItems: allStock,
    hardware: hw,
    sheets: savedSheets,
    presets,
    nominalTable,
    analysis: {
      skipped: analysis.skipped,
      rough: analysis.rough,
      optionSummaries: analysis.optionSummaries,
    },
    bom,
  };
}

export type ProjectDetail = NonNullable<Awaited<ReturnType<typeof loadProjectDetail>>>;
