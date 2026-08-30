// Bill of Materials builder. Combines saved layouts (sheets/strips) with
// live material prices, rough-lumber requirements, edge-banding runs and
// hardware lines. Supports round-up vs pro-rate costing for sheet/linear
// stock, and net vs gross (yield-inflated) board feet for rough lumber.

import type { AnalysisResult } from "../optimizer/solver";
import { effectiveDims, resolvePartMaterialId } from "../optimizer/solver";
import { stockUnitCost, priceRough } from "./pricing";
import type {
  MaterialLike,
  MaterialRole,
  PartLike,
  ProjectLike,
  SkippedPart,
} from "../types";
import { boardFeet } from "../units";

export interface SavedPlacement {
  id?: string;
  partId: string | null;
  partName: string;
  x: number;
  y: number;
  w: number;
  l: number;
  rotated: boolean;
  styleIdx: number;
}

export interface SavedSheet {
  id: string;
  materialId: string;
  materialName: string;
  axis: "2d" | "1d";
  sourceKind: "raw_stock" | "offcut" | "new_stock";
  width: number;
  length: number;
  usedPct: number;
  pinned: boolean;
  cutDone: boolean;
  styleIndex: number;
  styleCount: number;
  groupKey: string;
  placements: SavedPlacement[];
}

export interface HardwareLike {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  unitCost: number;
  purchased: boolean;
  notes: string | null;
}

export interface BomSheetLine {
  materialId: string;
  materialName: string;
  color: string;
  axis: "2d" | "1d";
  sourceKind: string;
  width: number;
  length: number;
  count: number;
  unitCost: number;
  costRoundUp: number;
  costProRated: number;
  usedPctAvg: number;
}

export interface BomRoughLine {
  materialId: string;
  materialName: string;
  nominalLabel: string;
  yieldPct: number;
  netBoardFeet: number;
  grossBoardFeet: number;
  netCubicM: number;
  grossCubicM: number;
  costBuy: number; // cost of what you must purchase (gross)
  costConsumed: number; // pro-rated: value in finished parts (net)
  partNames: string[];
}

export interface CutListRow {
  partId: string;
  name: string;
  qty: number;
  width: number; // cut size (core-adjusted)
  length: number;
  finishedWidth: number;
  finishedLength: number;
  thickness: number;
  materialId: string | null;
  materialName: string | null;
  role: MaterialRole | null;
  subAssembly: string | null;
  bandingSummary: string | null;
  bandedNote: string | null;
  nominalLabel: string | null;
  isStave: boolean;
  parentName: string | null;
  shareCost: number;
  finished: boolean;
  notes: string | null;
}

export interface GlueUpRow {
  partId: string;
  name: string;
  width: number;
  length: number;
  thickness: number;
  qty: number;
  staveCount: number;
  rolledCost: number;
  subAssembly: string | null;
}

export interface BomData {
  sheetLines: BomSheetLine[];
  linearLines: BomSheetLine[];
  roughLines: BomRoughLine[];
  bandingRuns: {
    partId: string;
    partName: string;
    edges: string[];
    lengthMm: number;
    solidWood: boolean;
    thickness: number;
  }[];
  hardwareLines: (HardwareLike & { total: number })[];
  hardwareByCategory: { category: string; total: number }[];
  totals: {
    materialsRoundUp: number;
    materialsProRated: number;
    hardwareTotal: number;
    grandRoundUp: number;
    grandProRated: number;
  };
  stats: {
    sheetsCount: number;
    stripsCount: number;
    patternedSheets: number;
    avgUsedPct: number;
    partsPlaced: number;
    partsTotal: number;
  };
  cutList: CutListRow[];
  glueUps: GlueUpRow[];
  skipped: SkippedPart[];
  roundUp: boolean;
}

export function buildBom(input: {
  project: ProjectLike;
  materials: MaterialLike[];
  parts: PartLike[];
  hardware: HardwareLike[];
  savedSheets: SavedSheet[];
  analysis: AnalysisResult;
}): BomData {
  const { project, materials, parts, hardware, savedSheets, analysis } = input;
  const materialsById = new Map(materials.map((m) => [m.id, m]));
  const partsById = new Map(parts.map((p) => [p.id, p]));

  // live unit cost per saved sheet (price changes propagate with no re-pack)
  const liveCost = (s: SavedSheet): number => {
    if (s.sourceKind === "offcut") return 0;
    const m = materialsById.get(s.materialId);
    if (!m) return 0;
    return stockUnitCost(m, s.width, s.length);
  };

  // ---- purchase lines (group identical sheets / sticks) -------------------
  const lineKey = (s: SavedSheet) =>
    `${s.materialId}|${s.axis}|${s.sourceKind}|${s.width}|${s.length}`;
  const grouped = new Map<string, SavedSheet[]>();
  for (const s of savedSheets) {
    const arr = grouped.get(lineKey(s)) ?? [];
    arr.push(s);
    grouped.set(lineKey(s), arr);
  }
  const sheetLines: BomSheetLine[] = [];
  const linearLines: BomSheetLine[] = [];
  for (const group of grouped.values()) {
    const s0 = group[0];
    const m = materialsById.get(s0.materialId);
    const unit = liveCost(s0);
    const count = group.length;
    const usedAvg =
      group.reduce((a, s) => a + s.usedPct, 0) / Math.max(1, group.length);
    const line: BomSheetLine = {
      materialId: s0.materialId,
      materialName: m?.name ?? s0.materialName,
      color: m?.color ?? "#b08d57",
      axis: s0.axis,
      sourceKind: s0.sourceKind,
      width: s0.width,
      length: s0.length,
      count,
      unitCost: unit,
      costRoundUp: unit * count,
      costProRated: group.reduce(
        (a, s) => a + unit * Math.min(1, s.usedPct / 100),
        0
      ),
      usedPctAvg: usedAvg,
    };
    (s0.axis === "1d" ? linearLines : sheetLines).push(line);
  }

  // ---- rough lumber (buy gross, consume net) -------------------------------
  const roughLines: BomRoughLine[] = analysis.rough.map((r) => {
    const m = materialsById.get(r.materialId);
    const costConsumed = m
      ? priceRough(m, { boardFeet: r.netBoardFeet, cubicM: r.netCubicM })
      : 0;
    return {
      materialId: r.materialId,
      materialName: r.materialName,
      nominalLabel: r.nominalLabel,
      yieldPct: r.yieldPct,
      netBoardFeet: r.netBoardFeet,
      grossBoardFeet: r.grossBoardFeet,
      netCubicM: r.netCubicM,
      grossCubicM: r.grossCubicM,
      costBuy: r.cost,
      costConsumed,
      partNames: r.partNames,
    };
  });

  // ---- cost share per part (for glue-up roll-up) ---------------------------
  const shareByPart = new Map<string, number>();
  for (const s of savedSheets) {
    const unit = liveCost(s);
    const active = s.placements.filter(
      (p) => p.styleIdx === Math.min(s.styleIndex, Math.max(0, s.styleCount - 1))
    );
    const totalPlacedLen = active.reduce((a, p) => a + (s.axis === "1d" ? p.w : 0), 0);
    for (const p of active) {
      if (!p.partId) continue;
      let share = 0;
      if (s.axis === "1d") {
        share =
          totalPlacedLen > 0 ? (p.w / totalPlacedLen) * unit : 0;
      } else {
        const area = s.width * s.length;
        share = area > 0 ? ((p.w * p.l) / area) * unit : 0;
      }
      shareByPart.set(p.partId, (shareByPart.get(p.partId) ?? 0) + share);
    }
  }
  // rough shares: distribute each rough line's buy cost by net BF
  for (const line of analysis.rough) {
    const factor =
      line.netBoardFeet > 0 ? line.cost / line.netBoardFeet : 0;
    for (const part of parts) {
      if (part.isGlueUpPanel && !part.parentPartId) continue;
      const mid = resolvePartMaterialId(part, project);
      if (mid !== line.materialId) continue;
      const nominal = analysis.nominalByPart.get(part.id);
      if (!nominal || nominal.label !== line.nominalLabel) continue;
      const dims = effectiveDims(part);
      const bf =
        boardFeet(line.nominalThicknessIn, dims.width, dims.length) *
        part.quantity;
      shareByPart.set(part.id, (shareByPart.get(part.id) ?? 0) + bf * factor);
    }
  }

  // ---- cut list -------------------------------------------------------------
  const cutList: CutListRow[] = [];
  for (const part of parts) {
    if (part.isGlueUpPanel && !part.parentPartId) continue;
    const mid = resolvePartMaterialId(part, project);
    const m = mid ? materialsById.get(mid) : undefined;
    const dims = effectiveDims(part);
    const parent = part.parentPartId ? partsById.get(part.parentPartId) : null;
    let bandingSummary: string | null = null;
    if (part.banding) {
      const e = part.banding.edges;
      const edges = [
        e.top ? "T" : "",
        e.bottom ? "B" : "",
        e.left ? "L" : "",
        e.right ? "R" : "",
      ]
        .filter(Boolean)
        .join("");
      if (edges) {
        bandingSummary = part.banding.solidWood
          ? `${edges} · solid ${part.banding.thickness}mm`
          : `${edges} · iron-on`;
      }
    }
    const nominal = analysis.nominalByPart.get(part.id);
    cutList.push({
      partId: part.id,
      name: part.name,
      qty: part.quantity,
      width: dims.width,
      length: dims.length,
      finishedWidth: part.width,
      finishedLength: part.length,
      thickness: part.thickness,
      materialId: mid,
      materialName: m?.name ?? null,
      role: part.materialRole,
      subAssembly: part.subAssembly,
      bandingSummary,
      bandedNote: dims.note,
      nominalLabel: nominal ? nominal.label : null,
      isStave: !!part.parentPartId,
      parentName: parent?.name ?? null,
      shareCost: shareByPart.get(part.id) ?? 0,
      finished: part.finished,
      notes: part.notes,
    });
  }

  const glueUps: GlueUpRow[] = parts
    .filter((p) => p.isGlueUpPanel && !p.parentPartId)
    .map((p) => {
      const children = parts.filter((c) => c.parentPartId === p.id);
      return {
        partId: p.id,
        name: p.name,
        width: p.width,
        length: p.length,
        thickness: p.thickness,
        qty: p.quantity,
        staveCount: children.reduce((a, c) => a + c.quantity, 0),
        rolledCost: children.reduce(
          (a, c) => a + (shareByPart.get(c.id) ?? 0),
          0
        ),
        subAssembly: p.subAssembly,
      };
    });

  // ---- banding / molding runs ----------------------------------------------
  const bandingRuns: BomData["bandingRuns"] = [];
  for (const part of parts) {
    if (!part.banding) continue;
    const e = part.banding.edges;
    const edges: string[] = [];
    let run = 0;
    if (e.top) {
      edges.push("top");
      run += part.length;
    }
    if (e.bottom) {
      edges.push("bottom");
      run += part.length;
    }
    if (e.left) {
      edges.push("left");
      run += part.width;
    }
    if (e.right) {
      edges.push("right");
      run += part.width;
    }
    if (edges.length === 0) continue;
    bandingRuns.push({
      partId: part.id,
      partName: part.name,
      edges,
      lengthMm: run * part.quantity,
      solidWood: part.banding.solidWood,
      thickness: part.banding.thickness,
    });
  }

  // ---- hardware --------------------------------------------------------------
  const hardwareLines = hardware.map((h) => ({
    ...h,
    total: h.quantity * h.unitCost,
  }));
  const catMap = new Map<string, number>();
  for (const h of hardwareLines) {
    catMap.set(h.category, (catMap.get(h.category) ?? 0) + h.total);
  }
  const hardwareByCategory = [...catMap.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  // ---- totals -----------------------------------------------------------------
  const sheets2dCostRU = sheetLines.reduce((a, l) => a + l.costRoundUp, 0);
  const sheets2dCostPR = sheetLines.reduce((a, l) => a + l.costProRated, 0);
  const linCostRU = linearLines.reduce((a, l) => a + l.costRoundUp, 0);
  const linCostPR = linearLines.reduce((a, l) => a + l.costProRated, 0);
  const roughBuy = roughLines.reduce((a, l) => a + l.costBuy, 0);
  const roughNet = roughLines.reduce((a, l) => a + l.costConsumed, 0);
  const hardwareTotal = hardwareLines.reduce((a, h) => a + h.total, 0);

  const materialsRoundUp = sheets2dCostRU + linCostRU + roughBuy;
  const materialsProRated = sheets2dCostPR + linCostPR + roughNet;

  const sheetsOnly = savedSheets.filter((s) => s.axis === "2d");
  const stripsOnly = savedSheets.filter((s) => s.axis === "1d");
  const partsPlaced = new Set(
    savedSheets.flatMap((s) =>
      s.placements.filter((p) => p.styleIdx === 0 && p.partId).map((p) => p.partId as string)
    )
  ).size;
  const optimizable = parts.filter((p) => !(p.isGlueUpPanel && !p.parentPartId));

  return {
    sheetLines,
    linearLines,
    roughLines,
    bandingRuns,
    hardwareLines,
    hardwareByCategory,
    totals: {
      materialsRoundUp,
      materialsProRated,
      hardwareTotal,
      grandRoundUp: materialsRoundUp + hardwareTotal,
      grandProRated: materialsProRated + hardwareTotal,
    },
    stats: {
      sheetsCount: sheetsOnly.length,
      stripsCount: stripsOnly.length,
      patternedSheets: new Set(savedSheets.map((s) => s.groupKey)).size,
      avgUsedPct:
        savedSheets.length > 0
          ? savedSheets.reduce((a, s) => a + s.usedPct, 0) / savedSheets.length
          : 0,
      partsPlaced,
      partsTotal: optimizable.reduce((a, p) => a + p.quantity, 0),
    },
    cutList,
    glueUps,
    skipped: analysis.skipped,
    roundUp: project.roundUpCosts,
  };
}
