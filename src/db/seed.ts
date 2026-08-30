// Idempotent seed: creates a realistic workshop library + demo project +
// built-in import presets when the database is empty.

import { sql as dsql, eq } from "drizzle-orm";
import { db } from "./index";
import { planGlueUp, type StaveSpec } from "../core/optimizer/glueup";
import {
  hardwareItems,
  importPresets,
  materials,
  parts,
  projects,
  stockItems,
} from "./schema";

export async function seedIfEmpty() {
  const [{ count }] = await db
    .select({ count: dsql<number>`cast(count(*) as integer)` })
    .from(projects);
  if (count > 0) return;

  const [birch] = await db
    .insert(materials)
    .values({
      name: "Baltic Birch Plywood 18mm",
      type: "sheet_good",
      cost: 96,
      costUnit: "per_sheet",
      thickness: 18,
      color: "#d9b78c",
      vendor: "Northwood Supply",
    })
    .returning();
  const [mdf] = await db
    .insert(materials)
    .values({
      name: "MDF 12mm",
      type: "sheet_good",
      cost: 42,
      costUnit: "per_sheet",
      thickness: 12,
      color: "#c9a25e",
      canBuyMore: true,
    })
    .returning();
  const [maple] = await db
    .insert(materials)
    .values({
      name: "Hard Maple S4S 1×4",
      type: "dimensioned_lumber",
      cost: 4.2,
      costUnit: "per_linear_ft",
      thickness: 19,
      width: 89,
      color: "#e3cfab",
    })
    .returning();
  const [oak] = await db
    .insert(materials)
    .values({
      name: "White Oak — rough",
      type: "rough_lumber",
      cost: 8.5,
      costUnit: "board_foot",
      thickness: 26,
      yieldPercent: 75,
      color: "#b08d57",
      vendor: "Kiln-Dried Hardwoods Co.",
    })
    .returning();
  const [walnut] = await db
    .insert(materials)
    .values({
      name: "Black Walnut — rough",
      type: "rough_lumber",
      cost: 14.9,
      costUnit: "board_foot",
      thickness: 26,
      yieldPercent: 70,
      color: "#6b4a35",
    })
    .returning();
  await db.insert(materials).values({
    name: "Maple iron-on edge banding",
    type: "banding",
    cost: 0.4,
    costUnit: "per_linear_ft",
    color: "#e8dcc0",
  });

  await db.insert(stockItems).values([
    { materialId: birch.id, kind: "raw_stock", width: 1220, length: 2440, quantity: 6, label: "shop stack" },
    { materialId: birch.id, kind: "new_stock", width: 1220, length: 2440, quantity: 1, label: "yard sheet" },
    { materialId: mdf.id, kind: "raw_stock", width: 1220, length: 2440, quantity: 2 },
    { materialId: mdf.id, kind: "new_stock", width: 1220, length: 2440, quantity: 1 },
    { materialId: maple.id, kind: "raw_stock", width: 89, length: 2440, quantity: 10 },
    { materialId: maple.id, kind: "new_stock", width: 89, length: 2440, quantity: 1 },
    { materialId: maple.id, kind: "new_stock", width: 89, length: 3050, quantity: 1 },
  ]);

  const [project] = await db
    .insert(projects)
    .values({
      name: "Shaker Wall Cabinet",
      units: "mm",
      primaryMaterialId: birch.id,
      secondaryMaterialId: maple.id,
      notes: "Demo project — parts use Primary/Secondary roles so the whole build can be re-costed in another species in one click.",
    })
    .returning();

  await db.insert(parts).values([
    { projectId: project.id, name: "Cabinet side", width: 300, length: 720, thickness: 18, quantity: 2, materialRole: "primary", subAssembly: "Carcase", grain: "length" },
    { projectId: project.id, name: "Top / bottom", width: 300, length: 568, thickness: 18, quantity: 2, materialRole: "primary", subAssembly: "Carcase" },
    { projectId: project.id, name: "Back panel", width: 556, length: 684, thickness: 12, quantity: 1, materialId: mdf.id, subAssembly: "Carcase" },
    { projectId: project.id, name: "Door stile", width: 57, length: 680, thickness: 19, quantity: 2, materialRole: "secondary", subAssembly: "Door" },
    { projectId: project.id, name: "Door rail", width: 57, length: 464, thickness: 19, quantity: 2, materialRole: "secondary", subAssembly: "Door" },
    { projectId: project.id, name: "Shelf — solid oak", width: 250, length: 540, thickness: 19, quantity: 2, materialId: oak.id, subAssembly: "Interior" },
    {
      projectId: project.id,
      name: "Display tabletop",
      width: 560,
      length: 900,
      thickness: 25,
      quantity: 1,
      materialId: walnut.id,
      subAssembly: "Top",
      isGlueUpPanel: true,
      glueStaveWidth: 120,
      glueLineLoss: 4,
    },
  ]);

  // generate the glue-up staves via the real planner (same as the wizard)
  const [panel] = await db
    .select()
    .from(parts)
    .where(eq(parts.isGlueUpPanel, true));
  if (panel) {
    const plan = planGlueUp(
      { name: panel.name, width: panel.width, length: panel.length, thickness: panel.thickness, quantity: panel.quantity },
      { staveWidth: 120, glueLoss: 4, trimAllowance: 25 }
    );
    await db.insert(parts).values(
      plan.staves.map((s: StaveSpec) => ({
        projectId: project.id,
        name: s.name,
        width: s.width,
        length: s.length,
        thickness: s.thickness,
        quantity: s.quantity,
        materialId: walnut.id,
        subAssembly: "Top",
        parentPartId: panel.id,
        grain: "length" as const,
      }))
    );
  }

  await db.insert(hardwareItems).values([
    { projectId: project.id, name: "Concealed hinge 110°", category: "Hinges", quantity: 2, unitCost: 3.4 },
    { projectId: project.id, name: "Turned knob, brass", category: "Hardware", quantity: 1, unitCost: 2.8 },
    { projectId: project.id, name: "Danish oil 250ml", category: "Finishing", quantity: 1, unitCost: 12.5 },
  ]);

  await db.insert(importPresets).values([
    {
      name: "Generic CSV",
      builtin: true,
      delimiter: ",",
      hasHeader: true,
      mapping: { name: 0, length: 1, width: 2, thickness: 3, qty: 4, material: 5, notes: 6 },
      options: { skipZeroQty: true, mergeDuplicates: true, stripCommentPrefix: "#" },
    },
    {
      name: "Tablet / TSV cutlist export",
      builtin: true,
      delimiter: "\t",
      hasHeader: true,
      mapping: { name: 0, qty: 1, length: 2, width: 3, thickness: 4, material: 5 },
      options: { skipZeroQty: true, mergeDuplicates: true, stripCommentPrefix: "#" },
    },
    {
      name: "Fusion-style cutlist CSV",
      builtin: true,
      delimiter: ",",
      hasHeader: true,
      mapping: { name: 0, qty: 1, length: 2, width: 3, thickness: 4, material: 5 },
      options: {
        inferThicknessFromMaterial: true,
        skipZeroQty: true,
        mergeDuplicates: true,
        stripCommentPrefix: "#",
      },
    },
    {
      name: "SketchUp cutlist extension CSV",
      builtin: true,
      delimiter: ",",
      hasHeader: true,
      mapping: { name: 0, qty: 1, length: 2, width: 3, thickness: 4, material: 5, subassembly: 6 },
      options: { skipZeroQty: true, mergeDuplicates: false, stripCommentPrefix: "#" },
    },
  ]);
}
