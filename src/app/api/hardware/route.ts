import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { hardwareItems } from "@/db/schema";
import { loadProjectDetail } from "@/lib/detail";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const projectId = String(body.projectId);
  await db.insert(hardwareItems).values({
    projectId,
    name: String(body.name ?? "Item"),
    category: String(body.category ?? "Hardware"),
    quantity: Number(body.quantity) || 1,
    unit: body.unit ?? "each",
    unitCost: Number(body.unitCost) || 0,
    notes: body.notes ?? null,
  });
  return NextResponse.json(await loadProjectDetail(projectId));
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const id = String(body.id);
  const existing = (
    await db.select().from(hardwareItems).where(eq(hardwareItems.id, id))
  )[0];
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const patch: Record<string, unknown> = {};
  for (const key of [
    "name",
    "category",
    "quantity",
    "unit",
    "unitCost",
    "purchased",
    "notes",
  ] as const) {
    if (key in body) patch[key] = body[key];
  }
  await db.update(hardwareItems).set(patch).where(eq(hardwareItems.id, id));
  return NextResponse.json(await loadProjectDetail(existing.projectId));
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const id = String(body.id);
  const existing = (
    await db.select().from(hardwareItems).where(eq(hardwareItems.id, id))
  )[0];
  await db.delete(hardwareItems).where(eq(hardwareItems.id, id));
  return NextResponse.json(
    existing ? await loadProjectDetail(existing.projectId) : { ok: true }
  );
}
