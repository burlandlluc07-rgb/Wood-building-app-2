import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sheets } from "@/db/schema";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  if ("pinned" in body) patch.pinned = !!body.pinned;
  if ("cutDone" in body) patch.cutDone = !!body.cutDone;
  if ("styleIndex" in body) patch.styleIndex = Math.max(0, Number(body.styleIndex) || 0);
  await db.update(sheets).set(patch).where(eq(sheets.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  await db.delete(sheets).where(eq(sheets.id, id));
  return NextResponse.json({ ok: true });
}
