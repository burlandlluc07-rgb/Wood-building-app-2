import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { stockItems } from "@/db/schema";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const [row] = await db
    .insert(stockItems)
    .values({
      materialId: String(body.materialId),
      kind: body.kind ?? "raw_stock",
      width: Number(body.width) || 0,
      length: Number(body.length) || 0,
      quantity: Math.max(0, Number(body.quantity) || 0),
      projectId: body.projectId ?? null,
      label: body.label ?? null,
    })
    .returning();
  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  for (const key of ["width", "length", "quantity", "label", "kind"] as const) {
    if (key in body) patch[key] = body[key];
  }
  await db.update(stockItems).set(patch).where(eq(stockItems.id, String(body.id)));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  await db.delete(stockItems).where(eq(stockItems.id, String(body.id)));
  return NextResponse.json({ ok: true });
}
