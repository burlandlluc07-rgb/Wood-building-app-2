import { randomUUID } from "node:crypto";
import {
  sqliteTable,
  text,
  real,
  integer,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Domain enums (mirrored in src/core/types.ts — keep in sync)
// ---------------------------------------------------------------------------
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
  thickness: number; // mm of solid-wood edging (shrinks core cut size)
}

export interface NominalThicknessEntry {
  quarters: number;
  label: string; // e.g. "4/4"
  actualIn: number; // typical surfaced thickness in inches
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  name: text("name").notNull(),
  units: text("units").$type<Units>().notNull().default("mm"),
  kerf: real("kerf").notNull().default(3.2), // mm
  objective: text("objective").$type<Objective>().notNull().default("waste"),
  defaultYieldPct: real("default_yield_pct").notNull().default(75),
  primaryMaterialId: text("primary_material_id").$type<string | null>(),
  secondaryMaterialId: text("secondary_material_id").$type<string | null>(),
  roundUpCosts: integer("round_up_costs", { mode: "boolean" }).notNull().default(true),
  firstCutDirection: text("first_cut_direction")
    .$type<FirstCutDirection>()
    .notNull()
    .default("either"),
  useOffcutsFirst: integer("use_offcuts_first", { mode: "boolean" }).notNull().default(true),
  isTemplate: integer("is_template", { mode: "boolean" }).notNull().default(false),
  notes: text("notes"),
  // Shop-mode purchase tracking: ids of materials marked purchased
  purchasedMaterialIds: text("purchased_material_ids", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// Materials (shop-wide library)
// ---------------------------------------------------------------------------
export const materials = sqliteTable("materials", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  name: text("name").notNull(),
  type: text("type").$type<MaterialType>().notNull().default("sheet_good"),
  cost: real("cost").notNull().default(0),
  costUnit: text("cost_unit").$type<CostUnit>().notNull().default("per_sheet"),
  thickness: real("thickness"), // mm (sheet/dimensioned nominal cross-section)
  width: real("width"), // mm cross-section width for dimensioned lumber
  canBuyMore: integer("can_buy_more", { mode: "boolean" }).notNull().default(true),
  firstCutDirection: text("first_cut_direction")
    .$type<FirstCutDirection | null>()
    .default(null), // null → inherit project setting
  yieldPercent: real("yield_percent"), // null → inherit project default
  color: text("color").notNull().default("#b08d57"),
  vendor: text("vendor"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// Stock items: raw stock on hand, offcuts, purchasable new-stock sizes
// ---------------------------------------------------------------------------
export const stockItems = sqliteTable("stock_items", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  materialId: text("material_id")
    .notNull()
    .references(() => materials.id, { onDelete: "cascade" }),
  kind: text("kind").$type<StockKind>().notNull().default("raw_stock"),
  width: real("width").notNull(), // mm (cross-section width for linear stock)
  length: real("length").notNull(), // mm
  quantity: integer("quantity").notNull().default(1),
  projectId: text("project_id").$type<string | null>(), // offcuts may belong to a project
  label: text("label"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------
export const parts = sqliteTable("parts", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  width: real("width").notNull(), // finished width, project units→stored mm
  length: real("length").notNull(),
  thickness: real("thickness").notNull(),
  quantity: integer("quantity").notNull().default(1),
  materialId: text("material_id").$type<string | null>(), // explicit material opt-out
  materialRole: text("material_role").$type<MaterialRole | null>().default(null),
  subAssembly: text("sub_assembly"),
  canRotate: integer("can_rotate", { mode: "boolean" }).notNull().default(true),
  grain: text("grain").$type<Grain>().notNull().default("none"),
  isGlueUpPanel: integer("is_glue_up_panel", { mode: "boolean" }).notNull().default(false),
  parentPartId: text("parent_part_id").references((): AnySQLiteColumn => parts.id, {
    onDelete: "cascade",
  }),
  glueStaveWidth: real("glue_stave_width"),
  glueLineLoss: real("glue_line_loss"),
  banding: text("banding", { mode: "json" }).$type<BandingSpec | null>().default(null),
  finished: integer("finished", { mode: "boolean" }).notNull().default(false), // shop mode check-off
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// Hardware / other items
// ---------------------------------------------------------------------------
export const hardwareItems = sqliteTable("hardware_items", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category").notNull().default("Hardware"),
  quantity: real("quantity").notNull().default(1),
  unit: text("unit").notNull().default("each"),
  unitCost: real("unit_cost").notNull().default(0),
  purchased: integer("purchased", { mode: "boolean" }).notNull().default(false),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// Optimizer output: sheets (2D) and strips (1D) share one table
// ---------------------------------------------------------------------------
export const sheets = sqliteTable("sheets", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  materialId: text("material_id").notNull(),
  materialName: text("material_name").notNull().default(""),
  axis: text("axis").$type<"2d" | "1d">().notNull().default("2d"),
  sourceKind: text("source_kind").$type<StockKind>().notNull().default("new_stock"),
  sourceStockId: text("source_stock_id").$type<string | null>(),
  width: real("width").notNull(), // mm (cross-section for 1d)
  length: real("length").notNull(), // mm
  cost: real("cost").notNull().default(0),
  usedPct: real("used_pct").notNull().default(0),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  cutDone: integer("cut_done", { mode: "boolean" }).notNull().default(false), // shop mode
  styleIndex: integer("style_index").notNull().default(0),
  styleCount: integer("style_count").notNull().default(1),
  groupKey: text("group_key").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const placements = sqliteTable("placements", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  sheetId: text("sheet_id")
    .notNull()
    .references(() => sheets.id, { onDelete: "cascade" }),
  partId: text("part_id").$type<string | null>(),
  partName: text("part_name").notNull().default(""),
  x: real("x").notNull().default(0),
  y: real("y").notNull().default(0),
  w: real("w").notNull(),
  l: real("l").notNull(),
  rotated: integer("rotated", { mode: "boolean" }).notNull().default(false),
  styleIdx: integer("style_idx").notNull().default(0),
});

// ---------------------------------------------------------------------------
// Settings (key/value) — e.g. the editable nominal-thickness lookup table
// ---------------------------------------------------------------------------
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
});

// ---------------------------------------------------------------------------
// Named import presets (data-driven column mappings, not hardcoded parsers)
// ---------------------------------------------------------------------------
export const importPresets = sqliteTable("import_presets", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  name: text("name").notNull(),
  delimiter: text("delimiter").notNull().default(","), // "," | "\t" | ";"
  hasHeader: integer("has_header", { mode: "boolean" }).notNull().default(true),
  mapping: text("mapping", { mode: "json" }).$type<Record<string, number>>().notNull(), // field → column index
  options: text("options", { mode: "json" })
    .$type<{
      inferThicknessFromMaterial?: boolean;
      skipZeroQty?: boolean;
      mergeDuplicates?: boolean;
      stripCommentPrefix?: string | null;
      thicknessDefault?: number;
      unitHint?: "mm" | "in" | null;
    }>()
    .notNull()
    .default({}),
  builtin: integer("builtin", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
