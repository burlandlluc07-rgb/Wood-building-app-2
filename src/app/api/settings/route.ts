import { NextRequest, NextResponse } from "next/server";
import { getNominalTable, setNominalTable } from "@/lib/detail";
import { DEFAULT_NOMINAL_TABLE } from "@/core/optimizer/roughLumber";

export async function GET() {
  return NextResponse.json({
    nominalTable: await getNominalTable(),
    defaults: DEFAULT_NOMINAL_TABLE,
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const table = Array.isArray(body.nominalTable) ? body.nominalTable : null;
  if (!table || table.length === 0) {
    return NextResponse.json({ error: "nominalTable required" }, { status: 400 });
  }
  const cleaned = table
    .map((e: { quarters: number; label: string; actualIn: number }) => ({
      quarters: Number(e.quarters) || 0,
      label: String(e.label ?? ""),
      actualIn: Number(e.actualIn) || 0,
    }))
    .filter(
      (e: { quarters: number; label: string; actualIn: number }) =>
        e.quarters > 0 && e.actualIn > 0 && e.label
    );
  await setNominalTable(cleaned);
  return NextResponse.json({ nominalTable: await getNominalTable() });
}
