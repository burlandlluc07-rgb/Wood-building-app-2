"use client";

import { Fragment, useMemo, useState } from "react";
import {
  Bandage,
  CornerDownRight,
  Layers,
  Plus,
  Repeat,
  SquareStack,
  Trash2,
  X,
} from "lucide-react";
import {
  api,
  classNames,
  fmtD,
  fmtMoney,
  type Detail,
  type MaterialRow,
  type PartRow,
} from "@/lib/ui";
import { dimToDisplay } from "@/core/units";
import type { BandingSpec } from "@/core/types";
import type { WsCtx } from "@/components/workspace";

const PHYSICAL = ["sheet_good", "dimensioned_lumber", "rough_lumber"];

type RoleSel = "" | "primary" | "secondary" | string; // "" none, or materialId

export function PartsPanel({ ctx }: { ctx: WsCtx }) {
  const { detail, apply, reoptimize, notify, resolveMid } = ctx;
  const project = detail.project;
  const units = project.units;
  const materials = detail.materials.filter((m) => PHYSICAL.includes(m.type));

  const [showGlue, setShowGlue] = useState(false);
  const [bandingPart, setBandingPart] = useState<PartRow | null>(null);
  const [groupBySub, setGroupBySub] = useState(false);
  const [showSubCol, setShowSubCol] = useState(true);
  const [form, setForm] = useState({
    name: "",
    length: "",
    width: "",
    thickness: "",
    quantity: "1",
    role: "primary" as RoleSel,
    subAssembly: "",
  });

  const oldMidById = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const p of detail.parts) m.set(p.id, resolveMid(p));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.parts, project.primaryMaterialId, project.secondaryMaterialId]);

  const topLevel = detail.parts.filter((p) => !p.parentPartId);
  const stavesOf = (id: string) => detail.parts.filter((p) => p.parentPartId === id);

  const parentOf = (id: string | null) =>
    detail.parts.find((p) => p.id === id) ?? null;

  const materialOf = (p: PartRow): MaterialRow | undefined => {
    const mid = resolveMid(p);
    return detail.materials.find((m) => m.id === mid);
  };

  // ---- mutations ------------------------------------------------------------
  const addPart = async () => {
    if (!form.length || !form.width) {
      notify("Length and width are required");
      return;
    }
    const body: Record<string, unknown> = {
      name: form.name || "Part",
      length: Number(form.length),
      width: Number(form.width),
      thickness: Number(form.thickness) || (units === "in" ? 0.75 : 18),
      quantity: Number(form.quantity) || 1,
      subAssembly: form.subAssembly || null,
      materialRole: null,
      materialId: null,
    };
    if (form.role === "primary" || form.role === "secondary") body.materialRole = form.role;
    else if (form.role) body.materialId = form.role;
    const d = await api<Detail>(`/api/projects/${project.id}/parts`, "POST", body);
    apply(d);
    setForm({ ...form, name: "", length: "", width: "", quantity: "1" });
    const roleMid =
      form.role === "primary"
        ? project.primaryMaterialId
        : form.role === "secondary"
          ? project.secondaryMaterialId
          : form.role || null;
    if (roleMid) await reoptimize([roleMid]);
  };

  const patchPart = async (p: PartRow, fields: Record<string, unknown>, optimize = true) => {
    const before = resolveMid(p);
    const d = await api<Detail>(`/api/parts/${p.id}`, "PATCH", fields);
    apply(d);
    const after = resolveMid({ ...p, ...fields } as PartRow);
    if (optimize) {
      const scope = [...new Set([before, after].filter(Boolean))] as string[];
      if (scope.length > 0) await reoptimize(scope);
    }
  };

  const deletePart = async (p: PartRow) => {
    const before = resolveMid(p);
    const d = await api<Detail>(`/api/parts/${p.id}`, "DELETE");
    apply(d);
    if (before) await reoptimize([before]);
  };

  const roleValue = (p: PartRow): RoleSel => p.materialRole ?? p.materialId ?? "";

  // ---- grouping --------------------------------------------------------------
  const groups: { key: string; rows: PartRow[] }[] = useMemo(() => {
    if (!groupBySub) return [{ key: "", rows: topLevel }];
    const map = new Map<string, PartRow[]>();
    for (const p of topLevel) {
      const k = p.subAssembly || "— no sub-assembly —";
      const arr = map.get(k) ?? [];
      arr.push(p);
      map.set(k, arr);
    }
    return [...map.entries()].map(([key, rows]) => ({ key, rows }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBySub, detail.parts]);

  return (
    <div className="space-y-4">
      {/* add form */}
      <div className="rounded-xl border border-edge bg-panel p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-[1.4fr_repeat(4,0.55fr)_1.3fr_0.9fr_auto]">
          <input
            placeholder="Part name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm"
          />
          <input
            placeholder={`L (${units})`}
            type="number"
            value={form.length}
            onChange={(e) => setForm({ ...form, length: e.target.value })}
            className="dim rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm"
          />
          <input
            placeholder={`W (${units})`}
            type="number"
            value={form.width}
            onChange={(e) => setForm({ ...form, width: e.target.value })}
            className="dim rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm"
          />
          <input
            placeholder={`T (${units})`}
            type="number"
            value={form.thickness}
            onChange={(e) => setForm({ ...form, thickness: e.target.value })}
            className="dim rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm"
          />
          <input
            placeholder="Qty"
            type="number"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            className="dim rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm"
          />
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="rounded-lg border border-edge bg-panel2 px-2 py-2 text-sm"
          >
            <option value="">— no material —</option>
            <option value="primary">◆ Primary material</option>
            <option value="secondary">◇ Secondary material</option>
            <optgroup label="Explicit material">
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          </select>
          <input
            placeholder="Sub-assembly"
            value={form.subAssembly}
            onChange={(e) => setForm({ ...form, subAssembly: e.target.value })}
            className="rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm"
          />
          <button
            onClick={addPart}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-ink"
          >
            <Plus className="h-4 w-4" strokeWidth={2.6} /> Add
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => setShowGlue(true)}
            className="flex items-center gap-2 rounded-lg border border-dashed border-branddim bg-brand/5 px-3 py-1.5 text-xs font-medium text-brand card-hover"
          >
            <Layers className="h-3.5 w-3.5" />
            Glue-up panel wizard
          </button>
          <span className="text-[11px] text-faint">
            For tops wider than any single board — generates the edge-glued staves automatically.
          </span>
        </div>
      </div>

      {/* toolbar */}
      <div className="flex items-center gap-2 text-xs">
        <button
          onClick={() => setGroupBySub((g) => !g)}
          className={classNames(
            "rounded-lg border px-2.5 py-1.5",
            groupBySub ? "border-brand/50 bg-brand/10 text-brand" : "border-edge bg-panel text-muted"
          )}
        >
          Group by sub-assembly
        </button>
        <button
          onClick={() => setShowSubCol((s) => !s)}
          className={classNames(
            "rounded-lg border px-2.5 py-1.5",
            showSubCol ? "border-edge bg-panel text-muted" : "border-edge bg-panel text-faint line-through"
          )}
        >
          Sub-assembly column
        </button>
        <span className="ml-auto text-faint">
          Editing a dim or material re-optimizes only the touched material group.
        </span>
      </div>

      {/* table */}
      <div className="overflow-x-auto rounded-xl border border-edge bg-panel">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-edge text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
              <th className="px-4 py-3">Part</th>
              <th className="px-3 py-3">L × W × T</th>
              <th className="px-3 py-3">Qty</th>
              <th className="px-3 py-3">Material / role</th>
              {showSubCol && <th className="px-3 py-3">Sub-assembly</th>}
              <th className="px-3 py-3">Grain</th>
              <th className="px-3 py-3">Band / notes</th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <GroupRows
                key={g.key || "all"}
                label={groupBySub ? g.key : null}
                rows={g.rows}
                stavesOf={stavesOf}
                parentOf={parentOf}
                materialOf={materialOf}
                roleValue={roleValue}
                patchPart={patchPart}
                deletePart={deletePart}
                setBandingPart={setBandingPart}
                units={units}
                materials={materials}
                showSubCol={showSubCol}
                detail={detail}
                oldMidById={oldMidById}
              />
            ))}
            {topLevel.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-faint">
                  No parts yet — add rows above, run the glue-up wizard, or import a CSV.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showGlue && (
        <GlueUpWizard
          ctx={ctx}
          materials={materials}
          onClose={() => setShowGlue(false)}
        />
      )}
      {bandingPart && (
        <BandingEditor
          ctx={ctx}
          part={bandingPart}
          onClose={() => setBandingPart(null)}
        />
      )}
    </div>
  );
}

function GroupRows(props: {
  label: string | null;
  rows: PartRow[];
  stavesOf: (id: string) => PartRow[];
  parentOf: (id: string | null) => PartRow | null;
  materialOf: (p: PartRow) => MaterialRow | undefined;
  roleValue: (p: PartRow) => RoleSel;
  patchPart: (p: PartRow, f: Record<string, unknown>, optimize?: boolean) => Promise<void>;
  deletePart: (p: PartRow) => Promise<void>;
  setBandingPart: (p: PartRow) => void;
  units: "mm" | "in";
  materials: MaterialRow[];
  showSubCol: boolean;
  detail: Detail;
  oldMidById: Map<string, string | null>;
}) {
  const { label, rows, stavesOf, materialOf, roleValue, patchPart, deletePart, setBandingPart, units, materials, showSubCol, detail } = props;
  const rubber = "rounded border border-edge bg-panel2 px-2 py-1 text-sm";
  return (
    <>
      {label && (
        <tr className="bg-panel2/60">
          <td colSpan={8} className="px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-brand">
            {label}
          </td>
        </tr>
      )}
      {rows.map((p) => {
        const m = materialOf(p);
        const staves = stavesOf(p.id);
        const glue = detail.bom.glueUps.find((g) => g.partId === p.id);
        return (
          <Fragment key={p.id}>
            <tr className="border-b border-edge/50 align-middle">
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <input
                    defaultValue={p.name}
                    onBlur={(e) => e.target.value && patchPart(p, { name: e.target.value }, false)}
                    className="w-44 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm font-medium text-cream hover:border-edge"
                  />
                  {p.isGlueUpPanel && (
                    <span className="flex items-center gap-1 rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                      <SquareStack className="h-3 w-3" /> panel · {glue?.staveCount ?? staves.length} staves
                      {glue ? ` · ${fmtMoney(glue.rolledCost)}` : ""}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                  {(["length", "width", "thickness"] as const).map((dim, i) => (
                    <span key={dim} className="flex items-center gap-1">
                      {i > 0 && <span className="text-faint">×</span>}
                      <input
                        type="number"
                        step={units === "in" ? "0.125" : "1"}
                        defaultValue={dimToDisplay(p[dim], units)}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v > 0 && v !== dimToDisplay(p[dim], units)) void patchPart(p, { [dim]: v });
                        }}
                        className={`dim w-16 ${rubber}`}
                      />
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-3 py-2">
                <input
                  type="number"
                  defaultValue={p.quantity}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v > 0 && v !== p.quantity) void patchPart(p, { quantity: v });
                  }}
                  className={`dim w-14 ${rubber}`}
                />
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  {m && <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: m.color }} />}
                  <select
                    value={roleValue(p)}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "primary" || v === "secondary") {
                        void patchPart(p, { materialRole: v, materialId: null });
                      } else {
                        void patchPart(p, { materialRole: null, materialId: v || null });
                      }
                    }}
                    className={`max-w-[190px] ${rubber} ${p.materialRole ? "border-brand/40 text-brand" : ""}`}
                  >
                    <option value="">— none —</option>
                    <option value="primary">◆ Primary</option>
                    <option value="secondary">◇ Secondary</option>
                    <optgroup label="Explicit">
                      {materials.map((mm) => (
                        <option key={mm.id} value={mm.id}>
                          {mm.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  {p.grain !== "none" && (
                    <span title="Grain direction locked" className="text-faint">
                      <Repeat className="h-3 w-3" />
                    </span>
                  )}
                </div>
              </td>
              {showSubCol && (
                <td className="px-3 py-2">
                  <input
                    defaultValue={p.subAssembly ?? ""}
                    placeholder="—"
                    onBlur={(e) => patchPart(p, { subAssembly: e.target.value || null }, false)}
                    className={`w-28 ${rubber}`}
                  />
                </td>
              )}
              <td className="px-3 py-2">
                <select
                  value={p.grain}
                  onChange={(e) => void patchPart(p, { grain: e.target.value })}
                  className={rubber}
                >
                  <option value="none">any</option>
                  <option value="length">⟂ length</option>
                  <option value="width">∥ width</option>
                </select>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setBandingPart(p)}
                    title="Edge banding / solid edging"
                    className={classNames(
                      "flex items-center gap-1 rounded border px-1.5 py-1 text-[11px]",
                      p.banding
                        ? "border-brand/50 bg-brand/10 text-brand"
                        : "border-edge text-faint hover:text-muted"
                    )}
                  >
                    <Bandage className="h-3 w-3" />
                    {p.banding
                      ? p.banding.solidWood
                        ? `solid ${p.banding.thickness}mm`
                        : "iron-on"
                      : "edge"}
                  </button>
                </div>
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  onClick={() => void deletePart(p)}
                  className="rounded p-1.5 text-faint hover:bg-bad/10 hover:text-bad"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
            {staves.map((s) => (
              <tr key={s.id} className="border-b border-edge/30 bg-panel2/40 text-muted">
                <td className="px-4 py-1.5">
                  <div className="flex items-center gap-2 pl-6">
                    <CornerDownRight className="h-3.5 w-3.5 text-branddim" />
                    <span className="text-xs">{s.name}</span>
                  </div>
                </td>
                <td className="dim px-3 py-1.5 text-xs">
                  {fmtD(s.length, units)} × {fmtD(s.width, units)} × {fmtD(s.thickness, units)}
                </td>
                <td className="dim px-3 py-1.5 text-xs">{s.quantity}</td>
                <td className="px-3 py-1.5 text-xs" colSpan={showSubCol ? 4 : 3}>
                  stave — flows to the {materialOf(s)?.type === "rough_lumber" ? "rough-lumber yield calc" : materialOf(s)?.type === "dimensioned_lumber" ? "1D linear solver" : "2D packer"}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <button
                    onClick={() => void deletePart(s)}
                    className="rounded p-1 text-faint hover:text-bad"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </Fragment>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Glue-Up Panel Wizard
// ---------------------------------------------------------------------------
function GlueUpWizard({
  ctx,
  materials,
  onClose,
}: {
  ctx: WsCtx;
  materials: MaterialRow[];
  onClose: () => void;
}) {
  const { detail, apply, reoptimize, notify } = ctx;
  const project = detail.project;
  const units = project.units;
  const [f, setF] = useState({
    name: "",
    length: "",
    width: "",
    thickness: units === "in" ? "1" : "25",
    quantity: "1",
    role: "" as RoleSel,
    staveWidth: "",
    glueLoss: units === "in" ? "0.157" : "4",
    trimAllowance: units === "in" ? "1" : "25",
    subAssembly: "",
  });
  const [busy, setBusy] = useState(false);

  const est = useMemo(() => {
    const w = Number(f.width);
    if (!w) return null;
    const sw = Number(f.staveWidth) || (units === "in" ? 4.75 : 120);
    const g = Number(f.glueLoss) || 0;
    const n = Math.max(1, Math.ceil(fromDisplaySafe(w, units) / fromDisplaySafe(sw, units)));
    const stave = (fromDisplaySafe(w, units) + (n - 1) * fromDisplaySafe(g, units)) / n;
    return { n, stave: dimToDisplay(stave, units) };
  }, [f.width, f.staveWidth, f.glueLoss, units]);

  const submit = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        mode: "glueup",
        name: f.name || "Glue-up panel",
        length: Number(f.length),
        width: Number(f.width),
        thickness: Number(f.thickness),
        quantity: Number(f.quantity) || 1,
        staveWidth: f.staveWidth ? Number(f.staveWidth) : null,
        glueLoss: Number(f.glueLoss) || 0,
        trimAllowance: Number(f.trimAllowance) || 0,
        subAssembly: f.subAssembly || null,
        materialRole:
          f.role === "primary" || f.role === "secondary" ? f.role : null,
        materialId: f.role && f.role !== "primary" && f.role !== "secondary" ? f.role : null,
      };
      const d = await api<Detail>(`/api/projects/${project.id}/parts`, "POST", body);
      apply(d);
      onClose();
      const mid =
        f.role === "primary"
          ? project.primaryMaterialId
          : f.role === "secondary"
            ? project.secondaryMaterialId
            : f.role || null;
      if (mid) await reoptimize([mid]);
      notify(`Glue-up panel created — ${est?.n ?? "?"} staves generated and sent to the optimizer`);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-edge bg-panel2 p-6 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Glue-up panel wizard</h2>
          <button onClick={onClose} className="text-muted hover:text-cream">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-5 text-xs leading-relaxed text-muted">
          For a finished panel wider than any single board: staves are ripped,
          edge-jointed and glued. The wizard generates the individual stave
          parts (accounting for joint loss) and feeds them into the matching
          optimizer — rough lumber gets board-feet, S4S stock gets the 1D
          solver. The panel itself is a virtual grouping row that rolls their
          cost back up.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <WField label="Panel name" span>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Tabletop" className={wi} />
          </WField>
          <WField label={`Finished width (${units})`}>
            <input type="number" value={f.width} onChange={(e) => setF({ ...f, width: e.target.value })} className={`dim ${wi}`} />
          </WField>
          <WField label={`Finished length (${units})`}>
            <input type="number" value={f.length} onChange={(e) => setF({ ...f, length: e.target.value })} className={`dim ${wi}`} />
          </WField>
          <WField label={`Finished thickness (${units})`}>
            <input type="number" value={f.thickness} onChange={(e) => setF({ ...f, thickness: e.target.value })} className={`dim ${wi}`} />
          </WField>
          <WField label="Panels needed">
            <input type="number" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} className={`dim ${wi}`} />
          </WField>
          <WField label="Stave material" span>
            <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className={wi}>
              <option value="">— choose material —</option>
              <option value="primary">◆ Primary material</option>
              <option value="secondary">◇ Secondary material</option>
              <optgroup label="Explicit">
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </WField>
          <WField label={`Desired stave width (${units}) — blank = auto`}>
            <input type="number" value={f.staveWidth} onChange={(e) => setF({ ...f, staveWidth: e.target.value })} className={`dim ${wi}`} />
          </WField>
          <WField label={`Glue-line loss / joint (${units})`}>
            <input type="number" step={units === "in" ? "0.01" : "0.5"} value={f.glueLoss} onChange={(e) => setF({ ...f, glueLoss: e.target.value })} className={`dim ${wi}`} />
          </WField>
          <WField label={`Trim allowance on length (${units})`}>
            <input type="number" value={f.trimAllowance} onChange={(e) => setF({ ...f, trimAllowance: e.target.value })} className={`dim ${wi}`} />
          </WField>
          <WField label="Sub-assembly">
            <input value={f.subAssembly} onChange={(e) => setF({ ...f, subAssembly: e.target.value })} className={wi} />
          </WField>
        </div>
        {est && (
          <div className="mt-4 rounded-lg border border-branddim bg-brand/10 px-4 py-3 text-sm text-brand">
            Plan: <span className="dim font-semibold">{est.n}</span> staves at{" "}
            <span className="dim font-semibold">
              ≈{est.stave}{units === "in" ? "″" : "mm"}
            </span>{" "}
            rough width each (joint loss included).
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-edge px-4 py-2 text-sm text-muted">
            Cancel
          </button>
          <button
            disabled={busy || !f.width || !f.length}
            onClick={submit}
            className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-ink disabled:opacity-40"
          >
            {busy ? "Generating…" : "Generate staves"}
          </button>
        </div>
      </div>
    </div>
  );
}

function fromDisplaySafe(v: number, units: "mm" | "in"): number {
  return units === "in" ? v * 25.4 : v;
}

const wi = "w-full rounded-lg border border-edge bg-panel px-3 py-2 text-sm text-cream";

function WField({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <label className={`block ${span ? "col-span-2" : ""}`}>
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
        {label}
      </span>
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Banding editor
// ---------------------------------------------------------------------------
function BandingEditor({
  ctx,
  part,
  onClose,
}: {
  ctx: WsCtx;
  part: PartRow;
  onClose: () => void;
}) {
  const [b, setB] = useState<BandingSpec>(
    part.banding ?? {
      edges: { top: false, bottom: false, left: false, right: false },
      solidWood: false,
      thickness: 12,
    }
  );
  const { apply } = ctx;

  const save = async () => {
    const any = b.edges.top || b.edges.bottom || b.edges.left || b.edges.right;
    const d = await api<Detail>(`/api/parts/${part.id}`, "PATCH", {
      banding: any ? b : null,
    });
    apply(d);
    onClose();
  };

  const Edge = ({ k, label }: { k: keyof BandingSpec["edges"]; label: string }) => (
    <button
      onClick={() => setB({ ...b, edges: { ...b.edges, [k]: !b.edges[k] } })}
      className={classNames(
        "rounded-lg border px-3 py-2 text-sm",
        b.edges[k] ? "border-brand bg-brand/10 text-brand" : "border-edge bg-panel text-muted"
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-edge bg-panel2 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Edge treatment — {part.name}</h2>
          <button onClick={onClose} className="text-muted hover:text-cream">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-2">
          <Edge k="top" label="Top edge (length)" />
          <Edge k="bottom" label="Bottom edge (length)" />
          <Edge k="left" label="Left edge (width)" />
          <Edge k="right" label="Right edge (width)" />
        </div>
        <button
          onClick={() => setB({ ...b, solidWood: !b.solidWood })}
          className={classNames(
            "mb-3 w-full rounded-lg border px-3 py-2.5 text-sm",
            b.solidWood ? "border-brand bg-brand/10 text-brand" : "border-edge bg-panel text-muted"
          )}
        >
          {b.solidWood
            ? "Solid-wood edging (real thickness) — core cut size shrinks on banded sides"
            : "Thin iron-on banding (negligible thickness)"}
        </button>
        {b.solidWood && (
          <label className="mb-4 block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
              Edging thickness (mm)
            </span>
            <input
              type="number"
              value={b.thickness}
              onChange={(e) => setB({ ...b, thickness: Number(e.target.value) })}
              className="dim w-full rounded-lg border border-edge bg-panel px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-[11px] text-faint">
              A 400mm part with 12mm edging on both length edges is cut at 376mm — the
              finished, edged part comes out to exactly 400mm.
            </span>
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={async () => {
              const d = await api<Detail>(`/api/parts/${part.id}`, "PATCH", { banding: null });
              apply(d);
              onClose();
            }}
            className="rounded-lg border border-edge px-4 py-2 text-sm text-muted"
          >
            Clear
          </button>
          <button onClick={save} className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-ink">
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
