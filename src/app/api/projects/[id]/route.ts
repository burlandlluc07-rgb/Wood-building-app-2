import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { loadProjectDetail } from "@/lib/detail";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const detail = await loadProjectDetail(id);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(detail);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();

  if (body.action === "duplicate") {
    const src = (await db.select().from(projects).where(eq(projects.id, id)))[0];
    if (!src) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const res = await fetch(new URL("/api/projects", req.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: body.name ?? `${src.name} (copy)`,
        units: src.units,
        copyFromId: id,
        isTemplate: !!body.isTemplate,
      }),
    });
    return NextResponse.json(await res.json());
  }

  const allowed = [
    "name",
    "units",
    "kerf",
    "objective",
    "defaultYieldPct",
    "primaryMaterialId",
    "secondaryMaterialId",
    "roundUpCosts",
    "firstCutDirection",
    "useOffcutsFirst",
    "isTemplate",
    "notes",
    "purchasedMaterialIds",
  ] as const;
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  patch.updatedAt = new Date();
  await db.update(projects).set(patch).where(eq(projects.id, id));
  const detail = await loadProjectDetail(id);
  return NextResponse.json(detail);
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  await db.delete(projects).where(eq(projects.id, id));
  return NextResponse.json({ ok: true });
}
