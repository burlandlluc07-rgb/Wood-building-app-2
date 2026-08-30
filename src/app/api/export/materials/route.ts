import { NextResponse } from "next/server";
import { db } from "@/db";
import { materials, stockItems } from "@/db/schema";

/** Materials-library backup, independent of any project archive. */
export async function GET() {
  const [mats, stock] = await Promise.all([
    db.select().from(materials),
    db.select().from(stockItems),
  ]);
  return new NextResponse(
    JSON.stringify({ format: "nestforge-materials@1", materials: mats, stockItems: stock }, null, 2),
    {
      headers: {
        "content-type": "application/json",
        "content-disposition": 'attachment; filename="nestforge-materials.json"',
      },
    }
  );
}
