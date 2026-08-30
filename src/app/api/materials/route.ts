import { NextRequest, NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { materials, stockItems } from "@/db/schema";

export async function GET() {
  const [mats, stock] = await Promise.all([
    db.select().from(materials).orderBy(asc(materials.name)),
    db.select().from(stockItems),
  ]);
  return NextResponse.json({ materials: mats, stockItems: stock });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  // materials-library restore (independent of any project archive)
  if (body.action === "import" && Array.isArray(body.materials)) {
    const idMap = new Map<string, string>();
    let imported = 0;
    for (const m of body.materials) {
      const [row] = await db
        .insert(materials)
        .values({
          name: m.name ?? "Material",
          type: m.type ?? "sheet_good",
          cost: Number(m.cost) || 0,
          costUnit: m.costUnit ?? "per_sheet",
          thickness: m.thickness ?? null,
          width: m.width ?? null,
          canBuyMore: m.canBuyMore ?? true,
          firstCutDirection: m.firstCutDirection ?? null,
          yieldPercent: m.yieldPercent ?? null,
          color: m.color ?? "#b08d57",
          vendor: m.vendor ?? null,
          notes: m.notes ?? null,
        })
        .returning();
      if (m.id) idMap.set(m.id, row.id);
      imported++;
    }
    let stockImported = 0;
    for (const s of body.stockItems ?? []) {
      const mid = idMap.get(s.materialId);
      if (!mid) continue;
      await db.insert(stockItems).values({
        materialId: mid,
        kind: s.kind ?? "new_stock",
        width: Number(s.width) || 0,
        length: Number(s.length) || 0,
        quantity: Number(s.quantity) || 1,
        label: s.label ?? null,
      });
      stockImported++;
    }
    return NextResponse.json({ ok: true, imported, stockImported });
  }

  const [row] = await db
    .insert(materials)
    .values({
      name: String(body.name ?? "New material"),
      type: body.type ?? "sheet_good",
      cost: Number(body.cost) || 0,
      costUnit: body.costUnit ?? "per_sheet",
      thickness: body.thickness ?? null,
      width: body.width ?? null,
      canBuyMore: body.canBuyMore ?? true,
      firstCutDirection: body.firstCutDirection ?? null,
      yieldPercent: body.yieldPercent ?? null,
      color: body.color ?? "#b08d57",
      vendor: body.vendor ?? null,
      notes: body.notes ?? null,
    })
    .returning();
  return NextResponse.json(row);
}
