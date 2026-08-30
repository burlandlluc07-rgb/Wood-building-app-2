import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { placements, sheets } from "@/db/schema";

type Ctx = { params: Promise<{ id: string }> };

// Manual position/rotation edits made in the layout view. Moving a part
// pins its sheet automatically — otherwise the next reoptimize would just
// throw the manual arrangement away.
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();

  const rows = await db.select().from(placements).where(eq(placements.id, id));
  const existing = rows[0];
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch: Record<string, unknown> = {};

  if ("x" in body) patch.x = Number(body.x);
  if ("y" in body) patch.y = Number(body.y);

  if ("rotated" in body) {
    const nextRotated = !!body.rotated;
    if (nextRotated !== existing.rotated) {
      // swap the placed footprint's dimensions to match the new orientation
      patch.rotated = nextRotated;
      patch.w = existing.l;
      patch.l = existing.w;
    }
  }

  await db.update(placements).set(patch).where(eq(placements.id, id));
  await db.update(sheets).set({ pinned: true }).where(eq(sheets.id, existing.sheetId));

  return NextResponse.json({ ok: true });
}
