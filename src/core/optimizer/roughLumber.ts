// Rough-milled lumber: NO cutting diagram is ever produced (the software
// can't know what odd widths/lengths the yard actually has). Instead this
// computes board-footage requirements inflated by a yield (waste) allowance,
// with a nominal→actual thickness lookup that is user-editable.

import type {
  MaterialLike,
  NominalThicknessEntry,
  ProjectLike,
  ResolvedPart,
  RoughRequirement,
  SkippedPart,
} from "../types";
import { boardFeet, mmToIn, volumeCubicM } from "../units";

export const NOMINAL_TABLE_SETTING_KEY = "roughNominalThicknessTable";

/** Sensible defaults; mills vary, so this table is editable in the UI. */
export const DEFAULT_NOMINAL_TABLE: NominalThicknessEntry[] = [
  { quarters: 4, label: "4/4", actualIn: 0.8125 },
  { quarters: 5, label: "5/4", actualIn: 1.0625 },
  { quarters: 6, label: "6/4", actualIn: 1.3125 },
  { quarters: 8, label: "8/4", actualIn: 1.75 },
  { quarters: 10, label: "10/4", actualIn: 2.25 },
  { quarters: 12, label: "12/4", actualIn: 2.75 },
  { quarters: 16, label: "16/4", actualIn: 3.75 },
];

/** Smallest nominal thickness whose typical actual thickness covers the
 *  part's required (finished) thickness. Returns null if nothing covers it. */
export function selectNominal(
  actualThicknessIn: number,
  table: NominalThicknessEntry[]
): NominalThicknessEntry | null {
  const sorted = [...table].sort((a, b) => a.actualIn - b.actualIn);
  for (const entry of sorted) {
    if (entry.actualIn >= actualThicknessIn - 1e-9) return entry;
  }
  return null;
}

export interface RoughComputation {
  rough: RoughRequirement[];
  skipped: SkippedPart[];
  /** per-part nominal purchase thickness, keyed by partId (for BOM display) */
  nominalByPart: Map<string, NominalThicknessEntry>;
}

export function computeRoughRequirements(
  groupParts: ResolvedPart[],
  material: MaterialLike,
  project: ProjectLike,
  table: NominalThicknessEntry[],
  priceFn: (m: MaterialLike, ctx: { boardFeet: number; cubicM: number }) => number
): RoughComputation {
  const skipped: SkippedPart[] = [];
  const nominalByPart = new Map<string, NominalThicknessEntry>();
  const byNominal = new Map<
    string,
    { entry: NominalThicknessEntry; netBF: number; netM3: number; names: Set<string> }
  >();

  for (const part of groupParts) {
    const actualIn = mmToIn(part.thickness);
    const nominal = selectNominal(actualIn, table);
    if (!nominal) {
      skipped.push({
        partId: part.partId,
        name: part.name,
        reason: `Required thickness ${actualIn.toFixed(2)}″ exceeds the thickest nominal size in the rough-lumber table — add a thicker entry in Materials → Nominal thickness.`,
      });
      continue;
    }
    nominalByPart.set(part.partId, nominal);
    const bf = boardFeet(nominal.actualIn, part.width, part.length) * part.quantity;
    const m3 =
      volumeCubicM(part.width, part.length, nominal.actualIn * 25.4) *
      part.quantity;
    const bucket = byNominal.get(nominal.label) ?? {
      entry: nominal,
      netBF: 0,
      netM3: 0,
      names: new Set<string>(),
    };
    bucket.netBF += bf;
    bucket.netM3 += m3;
    bucket.names.add(part.name);
    byNominal.set(nominal.label, bucket);
  }

  const yieldPct = material.yieldPercent ?? project.defaultYieldPct;
  const rough: RoughRequirement[] = [];
  for (const bucket of byNominal.values()) {
    const grossBF = bucket.netBF / Math.max(0.05, yieldPct / 100);
    const grossM3 = bucket.netM3 / Math.max(0.05, yieldPct / 100);
    rough.push({
      materialId: material.id,
      materialName: material.name,
      nominalLabel: bucket.entry.label,
      nominalThicknessIn: bucket.entry.actualIn,
      netBoardFeet: bucket.netBF,
      grossBoardFeet: grossBF,
      yieldPct,
      netCubicM: bucket.netM3,
      grossCubicM: grossM3,
      cost: priceFn(material, { boardFeet: grossBF, cubicM: grossM3 }),
      partNames: [...bucket.names],
    });
  }
  return { rough, skipped, nominalByPart };
}
