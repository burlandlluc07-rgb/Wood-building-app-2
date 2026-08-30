// Framework-agnostic domain types for the NestForge engine.
// Mirrors the DB enums in src/db/schema.ts.

export type Units = "mm" | "in";
export type MaterialType =
  | "sheet_good"
  | "dimensioned_lumber"
  | "rough_lumber"
  | "hardware"
  | "labor"
  | "banding"
  | "other";
export type CostUnit =
  | "per_sheet"
  | "per_sqm"
  | "per_sqft"
  | "per_linear_m"
  | "per_linear_ft"
  | "per_unit"
  | "per_hour"
  | "board_foot"
  | "cubic_ft"
  | "cubic_m";
export type MaterialRole = "primary" | "secondary";
export type Grain = "none" | "length" | "width";
export type StockKind = "raw_stock" | "offcut" | "new_stock";
export type Objective = "waste" | "cost" | "count";
export type FirstCutDirection = "horizontal" | "vertical" | "either";

export interface BandingSpec {
  edges: { top: boolean; bottom: boolean; left: boolean; right: boolean };
  solidWood: boolean;
  thickness: number; // mm
}

export interface MaterialLike {
  id: string;
  name: string;
  type: MaterialType;
  cost: number;
  costUnit: CostUnit;
  thickness: number | null; // mm
  width: number | null; // mm
  canBuyMore: boolean;
  firstCutDirection: FirstCutDirection | null;
  yieldPercent: number | null;
  color: string;
  vendor: string | null;
}

export interface PartLike {
  id: string;
  projectId: string;
  name: string;
  width: number; // mm
  length: number; // mm
  thickness: number; // mm
  quantity: number;
  materialId: string | null;
  materialRole: MaterialRole | null;
  subAssembly: string | null;
  canRotate: boolean;
  grain: Grain;
  isGlueUpPanel: boolean;
  parentPartId: string | null;
  glueStaveWidth: number | null;
  glueLineLoss: number | null;
  banding: BandingSpec | null;
  finished: boolean;
  notes: string | null;
}

export interface ProjectLike {
  id: string;
  name: string;
  units: Units;
  kerf: number; // mm
  objective: Objective;
  defaultYieldPct: number;
  primaryMaterialId: string | null;
  secondaryMaterialId: string | null;
  roundUpCosts: boolean;
  firstCutDirection: FirstCutDirection;
  useOffcutsFirst: boolean;
  notes: string | null;
}

export interface StockItemLike {
  id: string;
  materialId: string;
  kind: StockKind;
  width: number; // mm
  length: number; // mm
  quantity: number;
  projectId: string | null;
  label: string | null;
}

export interface NominalThicknessEntry {
  quarters: number;
  label: string;
  actualIn: number;
}

// ---------------------------------------------------------------------------
// Solver I/O
// ---------------------------------------------------------------------------

/** A part resolved to a concrete material, expanded to effective cut dims. */
export interface ResolvedPart {
  partId: string;
  name: string;
  /** effective cut size (solid-wood banding already subtracted) */
  width: number;
  length: number;
  finishedWidth: number;
  finishedLength: number;
  thickness: number; // mm, actual/finished
  quantity: number;
  materialId: string;
  canRotate: boolean;
  grain: Grain;
  subAssembly: string | null;
  bandedNote: string | null;
}

export interface StockCandidate {
  stockId: string | null;
  kind: StockKind;
  width: number; // mm
  length: number; // mm
  quantityAvailable: number;
  unitCost: number;
}

export interface PlacementOut {
  partId: string;
  partName: string;
  x: number;
  y: number;
  w: number;
  l: number;
  rotated: boolean;
  styleIdx: number;
}

export interface SheetOut {
  materialId: string;
  axis: "2d" | "1d";
  sourceKind: StockKind;
  sourceStockId: string | null;
  width: number;
  length: number;
  cost: number;
  usedPct: number;
  placements: PlacementOut[]; // styleIdx 0
  styles: PlacementOut[][]; // index 0..n-1 alternate, all equal-cost
  groupKey: string;
}

export interface SkippedPart {
  partId: string;
  name: string;
  reason: string;
}

export interface RoughRequirement {
  materialId: string;
  materialName: string;
  nominalLabel: string;
  nominalThicknessIn: number;
  netBoardFeet: number;
  grossBoardFeet: number;
  yieldPct: number;
  netCubicM: number;
  grossCubicM: number;
  cost: number;
  partNames: string[];
}

export interface PackTotals {
  stockUsed: number;
  wastePct: number;
  cost: number;
}

export interface OptimizeResult {
  sheets: SheetOut[];
  skipped: SkippedPart[];
  rough: RoughRequirement[];
  optionSummaries: {
    materialId: string;
    materialName: string;
    objective: Objective;
    totals: PackTotals;
  }[];
  reoptimizedMaterialIds: string[] | null;
}
