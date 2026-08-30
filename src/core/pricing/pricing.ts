// Pricing engine — cost-unit-aware math shared by the optimizer (snapshot
// costs) and the BOM builder (live recompute when prices change).

import type { CostUnit, MaterialLike, StockCandidate } from "../types";
import {
  areaSqFt,
  areaSqM,
  boardFeet,
  lengthFt,
  lengthM,
  volumeCubicFt,
  volumeCubicM,
} from "../units";

export const COST_UNIT_LABELS: Record<CostUnit, string> = {
  per_sheet: "per sheet",
  per_sqm: "per m²",
  per_sqft: "per ft²",
  per_linear_m: "per linear m",
  per_linear_ft: "per linear ft",
  per_unit: "per unit",
  per_hour: "per hour",
  board_foot: "per board ft",
  cubic_ft: "per ft³",
  cubic_m: "per m³",
};

/** Unit cost of one stock candidate (one sheet / one stick) of a material. */
export function stockUnitCost(
  material: MaterialLike,
  widthMm: number,
  lengthMm: number
): number {
  const t = material.thickness ?? 0;
  switch (material.costUnit) {
    case "per_sheet":
      return material.cost;
    case "per_sqm":
      return material.cost * areaSqM(widthMm, lengthMm);
    case "per_sqft":
      return material.cost * areaSqFt(widthMm, lengthMm);
    case "per_linear_m":
      return material.cost * lengthM(lengthMm);
    case "per_linear_ft":
      return material.cost * lengthFt(lengthMm);
    case "per_unit":
      return material.cost;
    case "per_hour":
      return material.cost;
    case "board_foot": {
      const nominalIn = t > 0 ? t / 25.4 : 1;
      return material.cost * boardFeet(nominalIn, widthMm, lengthMm);
    }
    case "cubic_ft":
      return material.cost * volumeCubicFt(widthMm, lengthMm, t);
    case "cubic_m":
      return material.cost * volumeCubicM(widthMm, lengthMm, t);
  }
}

/** Price a rough-lumber requirement (board feet or volume based). */
export function priceRough(
  material: MaterialLike,
  ctx: { boardFeet: number; cubicM: number }
): number {
  switch (material.costUnit) {
    case "board_foot":
      return material.cost * ctx.boardFeet;
    case "cubic_m":
      return material.cost * ctx.cubicM;
    case "cubic_ft":
      return material.cost * ctx.cubicM * 35.3147;
    case "per_unit":
      return material.cost;
    default:
      return material.cost * ctx.boardFeet; // sane fallback for rough stock
  }
}

/**
 * Aggregate cost for a set of consumed sheets/sticks of one material.
 * roundUp: every consumed sheet/stick bills at full unit cost.
 * proRate: bill by the fraction of the sheet/stick actually consumed by parts.
 */
export function aggregateSheetCost(
  sheets: { cost: number; usedPct: number }[],
  roundUp: boolean
): number {
  if (roundUp) return sheets.reduce((s, x) => s + x.cost, 0);
  return sheets.reduce((s, x) => s + x.cost * Math.min(1, x.usedPct / 100), 0);
}

export function formatCostUnit(u: CostUnit): string {
  return COST_UNIT_LABELS[u] ?? u;
}

/** candidate factory used by the optimizer bridge */
export function makeCandidate(
  material: MaterialLike,
  s: {
    stockId: string | null;
    kind: "raw_stock" | "offcut" | "new_stock";
    width: number;
    length: number;
    quantityAvailable: number;
  }
): StockCandidate {
  return {
    stockId: s.stockId,
    kind: s.kind,
    width: s.width,
    length: s.length,
    quantityAvailable: s.quantityAvailable,
    // offcuts are already paid for — treat as sunk cost
    unitCost: s.kind === "offcut" ? 0 : stockUnitCost(material, s.width, s.length),
  };
}
