import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { importPresets } from "@/db/schema";

export async function GET() {
  const rows = await db.select().from(importPresets).orderBy(asc(importPresets.name));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const [row] = await db
    .insert(importPresets)
    .values({
      name: String(body.name ?? "Custom preset"),
      delimiter: body.delimiter ?? ",",
      hasHeader: body.hasHeader ?? true,
      mapping: body.mapping ?? {},
      options: body.options ?? {},
      builtin: false,
    })
    .returning();
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  await db.delete(importPresets).where(eq(importPresets.id, String(body.id)));
  return NextResponse.json({ ok: true });
}
