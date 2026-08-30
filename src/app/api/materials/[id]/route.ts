import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { materials, parts, projects } from "@/db/schema";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const allowed = [
    "name",
    "type",
    "cost",
    "costUnit",
    "thickness",
    "width",
    "canBuyMore",
    "firstCutDirection",
    "yieldPercent",
    "color",
    "vendor",
    "notes",
  ] as const;
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  await db.update(materials).set(patch).where(eq(materials.id, id));
  const rows = await db.select().from(materials).where(eq(materials.id, id));
  return NextResponse.json(rows[0] ?? null);
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  // detach references so projects stay valid (parts become "no material")
  await db.update(parts).set({ materialId: null }).where(eq(parts.materialId, id));
  await db
    .update(projects)
    .set({ primaryMaterialId: null })
    .where(eq(projects.primaryMaterialId, id));
  await db
    .update(projects)
    .set({ secondaryMaterialId: null })
    .where(eq(projects.secondaryMaterialId, id));
  await db.delete(materials).where(eq(materials.id, id));
  return NextResponse.json({ ok: true });
}
