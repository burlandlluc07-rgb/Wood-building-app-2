// Optimization orchestrator. Resolves Primary/Secondary material roles,
// applies the per-material "can buy more" inventory gate, computes effective
// cut dimensions (solid-wood edging shrinks the core), then dispatches each
// material group to the correct engine by material type:
//   sheet_good        → 2D guillotine packer (guillotine.ts)
//   dimensioned_lumber→ 1D cutting-stock solver (linear.ts)
//   rough_lumber      → yield-based board-foot totals only, NO diagram

import { packSheetGroup } from "./guillotine";
import { packLinearGroup } from "./linear";
import {
  computeRoughRequirements,
  type RoughComputation,
} from "./roughLumber";
import { makeCandidate, priceRough } from "../pricing/pricing";
import type {
  MaterialLike,
  NominalThicknessEntry,
  Objective,
  PartLike,
  ProjectLike,
  ResolvedPart,
  SheetOut,
  SkippedPart,
  StockCandidate,
  StockItemLike,
} from "../types";

export function resolvePartMaterialId(
  part: Pick<PartLike, "materialId" | "materialRole">,
  project: Pick<ProjectLike, "primaryMaterialId" | "secondaryMaterialId">
): string | null {
  if (part.materialRole === "primary") return project.primaryMaterialId;
  if (part.materialRole === "secondary") return project.secondaryMaterialId;
  return part.materialId;
}

/** Solid-wood edging (real thickness) shrinks the core cut size on banded
 *  edges so the finished part comes out to its specified dimensions. */
export function effectiveDims(part: PartLike): {
  width: number;
  length: number;
  note: string | null;
} {
  const b = part.banding;
  if (b && b.solidWood && b.thickness > 0) {
    const t = b.thickness;
    const wCut = Math.max(
      1,
      part.width - (b.edges.left ? t : 0) - (b.edges.right ? t : 0)
    );
    const lCut = Math.max(
      1,
      part.length - (b.edges.top ? t : 0) - (b.edges.bottom ? t : 0)
    );
    if (wCut !== part.width || lCut !== part.length) {
      return {
        width: wCut,
        length: lCut,
        note: `core cut −${t}mm solid edging`,
      };
    }
  }
  return { width: part.width, length: part.length, note: null };
}

/**
 * Build stock candidates with the Can-Buy-More gate:
 *  - offcuts first (if enabled), then on-hand raw stock, then purchasable
 *    new-stock sizes — excluded entirely when the material's canBuyMore is
 *    false, in which case un-placeable parts land on the skipped list.
 */
export function buildCandidates(
  material: MaterialLike,
  stockItems: StockItemLike[],
  projectId: string,
  useOffcutsFirst: boolean
): { candidates: StockCandidate[]; hasNewSizeDefined: boolean } {
  const candidates: StockCandidate[] = [];
  let hasNewSizeDefined = false;
  for (const s of stockItems) {
    if (s.materialId !== material.id) continue;
    if (s.kind === "offcut") {
      if (!useOffcutsFirst) continue;
      if (s.projectId && s.projectId !== projectId) continue;
      candidates.push(
        makeCandidate(material, {
          stockId: s.id,
          kind: "offcut",
          width: s.width,
          length: s.length,
          quantityAvailable: s.quantity,
        })
      );
    } else if (s.kind === "raw_stock") {
      candidates.push(
        makeCandidate(material, {
          stockId: s.id,
          kind: "raw_stock",
          width: s.width,
          length: s.length,
          quantityAvailable: s.quantity,
        })
      );
    } else {
      hasNewSizeDefined = true;
      if (!material.canBuyMore) continue; // the gate
      candidates.push(
        makeCandidate(material, {
          stockId: s.id,
          kind: "new_stock",
          width: s.width,
          length: s.length,
          quantityAvailable: Number.POSITIVE_INFINITY,
        })
      );
    }
  }
  return { candidates, hasNewSizeDefined };
}

export interface AnalysisInput {
  project: ProjectLike;
  materials: MaterialLike[];
  parts: PartLike[];
  stockItems: StockItemLike[];
  nominalTable: NominalThicknessEntry[];
  scopeMaterialIds?: string[] | null;
}

export interface AnalysisResult {
  sheets: SheetOut[];
  skipped: SkippedPart[];
  rough: RoughComputation["rough"];
  optionSummaries: {
    materialId: string;
    materialName: string;
    objective: Objective;
    totals: { stockUsed: number; wastePct: number; cost: number };
  }[];
  reoptimizedMaterialIds: string[] | null;
  nominalByPart: Map<string, NominalThicknessEntry>;
}

const OBJECTIVES: Objective[] = ["waste", "cost", "count"];

export function analyzeProject(input: AnalysisInput): AnalysisResult {
  const { project, materials, parts, stockItems, nominalTable } = input;
  const scope = input.scopeMaterialIds ?? null;
  const materialsById = new Map(materials.map((m) => [m.id, m]));
  const skipped: SkippedPart[] = [];
  const groups = new Map<string, ResolvedPart[]>();

  for (const part of parts) {
    // Glue-up panel parents are virtual — only their generated staves pack.
    if (part.isGlueUpPanel && !part.parentPartId) continue;
    const mid = resolvePartMaterialId(part, project);
    if (!mid) {
      skipped.push({
        partId: part.id,
        name: part.name,
        reason: part.materialRole
          ? `Role "${part.materialRole}" is not mapped — assign the project's ${part.materialRole} material in the project bar.`
          : "No material assigned — set a material or a Primary/Secondary role.",
      });
      continue;
    }
    if (scope && !scope.includes(mid)) continue;
    const m = materialsById.get(mid);
    if (!m) {
      skipped.push({
        partId: part.id,
        name: part.name,
        reason: "Assigned material no longer exists in the library.",
      });
      continue;
    }
    if (
      m.type === "hardware" ||
      m.type === "labor" ||
      m.type === "banding" ||
      m.type === "other"
    ) {
      continue; // cost-only lines are not optimized
    }
    const dims = effectiveDims(part);
    const rp: ResolvedPart = {
      partId: part.id,
      name: part.name,
      width: dims.width,
      length: dims.length,
      finishedWidth: part.width,
      finishedLength: part.length,
      thickness: part.thickness,
      quantity: part.quantity,
      materialId: mid,
      canRotate: part.canRotate,
      grain: part.grain,
      subAssembly: part.subAssembly,
      bandedNote: dims.note,
    };
    const arr = groups.get(mid) ?? [];
    arr.push(rp);
    groups.set(mid, arr);
  }

  const sheets: SheetOut[] = [];
  const rough: AnalysisResult["rough"] = [];
  const optionSummaries: AnalysisResult["optionSummaries"] = [];
  const nominalByPart = new Map<string, NominalThicknessEntry>();

  for (const [mid, groupParts] of groups) {
    const m = materialsById.get(mid)!;

    if (m.type === "rough_lumber") {
      const comp = computeRoughRequirements(
        groupParts,
        m,
        project,
        nominalTable,
        priceRough
      );
      rough.push(...comp.rough);
      skipped.push(...comp.skipped);
      comp.nominalByPart.forEach((v, k) => nominalByPart.set(k, v));
      continue;
    }

    const { candidates, hasNewSizeDefined } = buildCandidates(
      m,
      stockItems,
      project.id,
      project.useOffcutsFirst
    );
    if (candidates.length === 0) {
      const reason = hasNewSizeDefined
        ? `No ${m.name} on hand and "Can Buy More" is disabled for this material.`
        : `No stock sizes defined for "${m.name}" — add raw stock, offcuts, or a purchasable size in the Materials library.`;
      for (const p of groupParts) {
        skipped.push({ partId: p.partId, name: p.name, reason });
      }
      continue;
    }

    const reasons = {
      oversize:
        m.type === "sheet_good"
          ? `Exceeds every available ${m.name} sheet size.`
          : `Exceeds every available ${m.name} stock length/cross-section.`,
      inventory: m.canBuyMore
        ? hasNewSizeDefined
          ? `Insufficient ${m.name} inventory.`
          : `Ran out of on-hand ${m.name} — no purchasable size is defined for this material.`
        : `Insufficient ${m.name} inventory — buying more is disabled for this material.`,
    };

    const runs = OBJECTIVES.map((objective) =>
      m.type === "sheet_good"
        ? packSheetGroup(groupParts, candidates, {
            kerf: project.kerf,
            materialId: mid,
            firstCutDirection:
              m.firstCutDirection ?? project.firstCutDirection,
            objective,
            reasons,
          })
        : packLinearGroup(groupParts, candidates, {
            kerf: project.kerf,
            materialId: mid,
            objective,
            reasons,
          })
    );

    // pick the winner: fewest skipped parts first, then weighted score
    const minSkip = Math.min(...runs.map((r) => r.skipped.length));
    const eligible = runs
      .map((r, i) => ({ run: r, objective: OBJECTIVES[i] }))
      .filter((x) => x.run.skipped.length === minSkip);
    const wasteVals = eligible.map((x) => x.run.totals.wastePct);
    const costVals = eligible.map((x) => x.run.totals.cost);
    const countVals = eligible.map((x) => x.run.totals.stockUsed);
    const norm = (v: number, vals: number[]) => {
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      return max - min < 1e-9 ? 0 : (v - min) / (max - min);
    };
    let bestIdx = 0;
    let bestScore = Infinity;
    eligible.forEach((x, i) => {
      const score =
        0.5 * norm(x.run.totals.wastePct, wasteVals) +
        0.35 * norm(x.run.totals.cost, costVals) +
        0.15 * norm(x.run.totals.stockUsed, countVals);
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    });
    for (const x of eligible) {
      optionSummaries.push({
        materialId: mid,
        materialName: m.name,
        objective: x.objective,
        totals: x.run.totals,
      });
    }
    const winner = eligible[bestIdx].run;
    sheets.push(...winner.sheets);
    skipped.push(...winner.skipped);
  }

  return {
    sheets,
    skipped,
    rough,
    optionSummaries,
    reoptimizedMaterialIds: scope,
    nominalByPart,
  };
}
