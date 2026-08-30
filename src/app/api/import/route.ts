import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { importPresets, materials, parts, projects } from "@/db/schema";
import { loadProjectDetail } from "@/lib/detail";
import { fromDisplay } from "@/core/units";

const THICKNESS_RE = /(\d+(?:\.\d+)?)\s*(mm|millimeters?|in(?:ch(?:es)?)?|")/i;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const projectId = String(body.projectId);
  const text = String(body.text ?? "");
  const project = (
    await db.select().from(projects).where(eq(projects.id, projectId))
  )[0];
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const preset = (
    await db.select().from(importPresets).where(eq(importPresets.id, String(body.presetId)))
  )[0];
  if (!preset) return NextResponse.json({ error: "Preset not found" }, { status: 404 });

  const opts = preset.options ?? {};
  const delimiter = preset.delimiter;
  const commentPrefix = opts.stripCommentPrefix ?? null;

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !commentPrefix || !l.startsWith(commentPrefix));
  if (lines.length === 0) {
    return NextResponse.json({ error: "No data rows found" }, { status: 400 });
  }
  const rows = lines.map((l) => l.split(delimiter).map((c) => c.trim()));
  const data = preset.hasHeader ? rows.slice(1) : rows;

  const mats = await db.select().from(materials).orderBy(asc(materials.name));
  const unitHint = opts.unitHint ?? project.units;

  interface Draft {
    name: string;
    width: number;
    length: number;
    thickness: number;
    quantity: number;
    materialId: string | null;
    subAssembly: string | null;
    notes: string | null;
  }

  const col = (r: string[], key: string): string => {
    const idx = preset.mapping[key];
    return idx === undefined || idx === null || idx < 0 ? "" : r[idx] ?? "";
  };

  const drafts: Draft[] = [];
  let skipped = 0;
  for (const r of data) {
    const name = col(r, "name") || "Imported part";
    const qtyRaw = parseFloat(col(r, "qty"));
    const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.round(qtyRaw) : 1;
    if (opts.skipZeroQty && Number.isFinite(qtyRaw) && qtyRaw <= 0) {
      skipped++;
      continue;
    }
    const lengthRaw = parseFloat(col(r, "length"));
    const widthRaw = parseFloat(col(r, "width"));
    if (!Number.isFinite(lengthRaw) || !Number.isFinite(widthRaw) || lengthRaw <= 0 || widthRaw <= 0) {
      skipped++;
      continue;
    }
    const materialCell = col(r, "material");
    let thickness = parseFloat(col(r, "thickness"));
    if ((!Number.isFinite(thickness) || thickness <= 0) && opts.inferThicknessFromMaterial && materialCell) {
      const m = materialCell.match(THICKNESS_RE);
      if (m) {
        const v = parseFloat(m[1]);
        const unit = m[2].toLowerCase();
        thickness = unit === "mm" || unit.startsWith("milli") ? (unitHint === "in" ? v / 25.4 : v) : v;
      }
    }
    if (!Number.isFinite(thickness) || thickness <= 0) {
      thickness = opts.thicknessDefault ?? (project.units === "in" ? 0.75 : 18);
    }
    let materialId: string | null = null;
    if (materialCell) {
      const needle = materialCell.toLowerCase();
      const found = mats.find(
        (m) =>
          m.name.toLowerCase() === needle ||
          needle.includes(m.name.toLowerCase()) ||
          m.name.toLowerCase().includes(needle)
      );
      materialId = found?.id ?? null;
    }
    drafts.push({
      name,
      width: fromDisplay(widthRaw, unitHint === "in" ? "in" : "mm"),
      length: fromDisplay(lengthRaw, unitHint === "in" ? "in" : "mm"),
      thickness: fromDisplay(thickness, unitHint === "in" ? "in" : "mm"),
      quantity,
      materialId,
      subAssembly: col(r, "subassembly") || null,
      notes: col(r, "notes") || (materialCell && !materialId ? `source material: ${materialCell}` : null),
    });
  }

  if (opts.mergeDuplicates) {
    const seen = new Map<string, Draft>();
    for (const d of drafts) {
      const key = `${d.name}|${d.width.toFixed(2)}|${d.length.toFixed(2)}|${d.thickness.toFixed(2)}|${d.materialId}`;
      const prev = seen.get(key);
      if (prev) prev.quantity += d.quantity;
      else seen.set(key, { ...d });
    }
    drafts.length = 0;
    drafts.push(...seen.values());
  }

  for (const d of drafts) {
    await db.insert(parts).values({
      projectId,
      name: d.name.slice(0, 140),
      width: d.width,
      length: d.length,
      thickness: d.thickness,
      quantity: d.quantity,
      materialId: d.materialId,
      subAssembly: d.subAssembly,
      notes: d.notes,
    });
  }

  const detail = await loadProjectDetail(projectId);
  return NextResponse.json({ ...detail, importReport: { imported: drafts.length, skipped } });
}
