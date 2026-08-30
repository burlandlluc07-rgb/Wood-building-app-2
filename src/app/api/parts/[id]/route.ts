import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { parts, projects } from "@/db/schema";
import { loadProjectDetail } from "@/lib/detail";
import { fromDisplay } from "@/core/units";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const existing = (await db.select().from(parts).where(eq(parts.id, id)))[0];
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const project = (
    await db.select().from(projects).where(eq(projects.id, existing.projectId))
  )[0];
  const units = project?.units ?? "mm";

  const patch: Record<string, unknown> = {};
  for (const dim of ["width", "length", "thickness"] as const) {
    if (dim in body) {
      const n = Number(body[dim]);
      if (Number.isFinite(n) && n > 0) patch[dim] = fromDisplay(n, units);
    }
  }
  for (const key of [
    "name",
    "materialId",
    "materialRole",
    "subAssembly",
    "canRotate",
    "grain",
    "banding",
    "finished",
    "notes",
  ] as const) {
    if (key in body) patch[key] = body[key];
  }
  if ("quantity" in body) {
    patch.quantity = Math.max(1, Number(body.quantity) || 1);
  }
  await db.update(parts).set(patch).where(eq(parts.id, id));
  const detail = await loadProjectDetail(existing.projectId);
  return NextResponse.json(detail);
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const existing = (await db.select().from(parts).where(eq(parts.id, id)))[0];
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.delete(parts).where(eq(parts.id, id));
  const detail = await loadProjectDetail(existing.projectId);
  return NextResponse.json(detail);
}
