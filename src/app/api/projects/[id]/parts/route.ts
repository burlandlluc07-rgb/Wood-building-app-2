import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { parts, projects } from "@/db/schema";
import { loadProjectDetail } from "@/lib/detail";
import { planGlueUp } from "@/core/optimizer/glueup";
import { fromDisplay } from "@/core/units";

type Ctx = { params: Promise<{ id: string }> };

function mm(v: unknown, units: "mm" | "in"): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid dimension");
  return fromDisplay(n, units);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const project = (await db.select().from(projects).where(eq(projects.id, id)))[0];
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const units = project.units;

  try {
    if (body.mode === "glueup") {
      const name = String(body.name ?? "Glue-up panel");
      const parent = {
        name,
        width: mm(body.width, units),
        length: mm(body.length, units),
        thickness: mm(body.thickness, units),
        quantity: Math.max(1, Number(body.quantity) || 1),
      };
      const plan = planGlueUp(parent, {
        staveWidth: body.staveWidth ? mm(body.staveWidth, units) : null,
        glueLoss: mm(body.glueLoss ?? (units === "in" ? 0.157 : 4), units),
        trimAllowance: mm(body.trimAllowance ?? (units === "in" ? 1 : 25), units),
      });
      const [parentRow] = await db
        .insert(parts)
        .values({
          projectId: id,
          name,
          width: parent.width,
          length: parent.length,
          thickness: parent.thickness,
          quantity: parent.quantity,
          materialId: body.materialId ?? null,
          materialRole: body.materialRole ?? null,
          subAssembly: body.subAssembly ?? null,
          isGlueUpPanel: true,
          glueStaveWidth: plan.staveWidth,
          glueLineLoss: mm(body.glueLoss ?? (units === "in" ? 0.157 : 4), units),
          canRotate: true,
          notes: body.notes ?? null,
        })
        .returning();
      await db.insert(parts).values(
        plan.staves.map((s) => ({
          projectId: id,
          name: s.name,
          width: s.width,
          length: s.length,
          thickness: s.thickness,
          quantity: s.quantity,
          materialId: body.materialId ?? null,
          materialRole: body.materialRole ?? null,
          subAssembly: body.subAssembly ?? null,
          parentPartId: parentRow.id,
          canRotate: true,
          grain: "length" as const,
        }))
      );
    } else {
      await db.insert(parts).values({
        projectId: id,
        name: String(body.name ?? "Part"),
        width: mm(body.width, units),
        length: mm(body.length, units),
        thickness: mm(body.thickness, units),
        quantity: Math.max(1, Number(body.quantity) || 1),
        materialId: body.materialId ?? null,
        materialRole: body.materialRole ?? null,
        subAssembly: body.subAssembly ?? null,
        canRotate: body.canRotate ?? true,
        grain: body.grain ?? "none",
        banding: body.banding ?? null,
        notes: body.notes ?? null,
      });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid part" },
      { status: 400 }
    );
  }

  const detail = await loadProjectDetail(id);
  return NextResponse.json(detail);
}
