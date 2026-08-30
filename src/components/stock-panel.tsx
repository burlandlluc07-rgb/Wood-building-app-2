"use client";

import { useMemo, useState } from "react";
import { Link2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { api, fmtD, type Detail } from "@/lib/ui";
import type { WsCtx } from "@/components/workspace";

/** Project-scoped offcuts + a read-out of the library stock feeding the
 *  materials used by this project. Offcuts entered here are consumed first
 *  by the optimizer (when "offcuts first" is on). */
export function StockPanel({ ctx }: { ctx: WsCtx }) {
  const { detail, apply, reoptimize, notify } = ctx;
  const project = detail.project;
  const units = project.units;

  const usedMaterialIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of detail.parts) {
      const mid = ctx.resolveMid(p);
      if (mid) set.add(mid);
    }
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.parts, project.primaryMaterialId, project.secondaryMaterialId]);

  const materials = detail.materials.filter((m) => usedMaterialIds.has(m.id));
  const [form, setForm] = useState({ materialId: "", width: "", length: "", quantity: "1", label: "" });

  const projectOffcuts = detail.stockItems.filter(
    (s) => s.kind === "offcut" && s.projectId === project.id
  );

  // fromDisplay
  const toMm = (v: string) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return units === "in" ? n * 25.4 : n;
  };

  const addOffcut = async () => {
    const w = toMm(form.width);
    const l = toMm(form.length);
    if (!form.materialId || !w || !l) {
      notify("Material, width and length are required");
      return;
    }
    await api("/api/stock", "POST", {
      materialId: form.materialId,
      kind: "offcut",
      width: w,
      length: l,
      quantity: Number(form.quantity) || 1,
      projectId: project.id,
      label: form.label || null,
    });
    const d = await api<Detail>(`/api/projects/${project.id}`);
    apply(d);
    setForm({ ...form, width: "", length: "", label: "" });
    await reoptimize([form.materialId]);
  };

  const removeOffcut = async (id: string, materialId: string) => {
    await api("/api/stock", "DELETE", { id });
    const d = await api<Detail>(`/api/projects/${project.id}`);
    apply(d);
    await reoptimize([materialId]);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-edge bg-panel p-4">
        <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
          Project offcuts
        </h3>
        <p className="mb-3 text-xs text-faint">
          Pieces left from earlier jobs, tagged to this project. The optimizer
          burns these before touching raw sheets or purchasable stock.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_0.8fr_0.8fr_0.5fr_1fr_auto]">
          <select
            value={form.materialId}
            onChange={(e) => setForm({ ...form, materialId: e.target.value })}
            className="rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm"
          >
            <option value="">— material —</option>
            {materials
              .filter((m) => m.type !== "rough_lumber")
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
          <input placeholder={`W (${units})`} type="number" value={form.width} onChange={(e) => setForm({ ...form, width: e.target.value })} className="dim rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm" />
          <input placeholder={`L (${units})`} type="number" value={form.length} onChange={(e) => setForm({ ...form, length: e.target.value })} className="dim rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm" />
          <input placeholder="Qty" type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="dim rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm" />
          <input placeholder="Label (optional)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm" />
          <button onClick={addOffcut} className="flex items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-ink">
            <Plus className="h-4 w-4" strokeWidth={2.6} /> Add
          </button>
        </div>
        {projectOffcuts.length > 0 && (
          <table className="mt-3 w-full text-sm">
            <tbody>
              {projectOffcuts.map((s) => {
                const m = detail.materials.find((x) => x.id === s.materialId);
                return (
                  <tr key={s.id} className="border-t border-edge/50">
                    <td className="py-2 font-medium text-cream">{m?.name ?? "?"}</td>
                    <td className="dim py-2 text-muted">{fmtD(s.width, units)} × {fmtD(s.length, units)}</td>
                    <td className="dim py-2 text-muted">×{s.quantity}</td>
                    <td className="py-2 text-faint">{s.label}</td>
                    <td className="py-2 text-right">
                      <button onClick={() => removeOffcut(s.id, s.materialId)} className="text-faint hover:text-bad">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-xl border border-edge bg-panel p-4">
        <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
          Library stock feeding this project
        </h3>
        {materials.length === 0 ? (
          <p className="text-sm text-faint">No parts with assigned materials yet.</p>
        ) : (
          <div className="space-y-3">
            {materials.map((m) => {
              const stock = detail.stockItems.filter((s) => s.materialId === m.id && s.kind !== "offcut");
              return (
                <div key={m.id} className="rounded-lg border border-edge bg-panel2 p-3">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="h-3 w-3 rounded-sm" style={{ background: m.color }} />
                    <span className="text-sm font-medium text-cream">{m.name}</span>
                    {!m.canBuyMore && (
                      <span className="rounded bg-bad/15 px-1.5 py-0.5 text-[10px] font-bold text-bad">
                        buy-more disabled
                      </span>
                    )}
                    <span className="ml-auto text-[11px] text-faint">{m.type.replace("_", " ")}</span>
                  </div>
                  {stock.length === 0 ? (
                    <p className="text-xs text-bad/80">
                      No stock sizes — parts in this material will be skipped.{" "}
                      <Link href="/materials" className="inline-flex items-center gap-1 text-brand underline-offset-2 hover:underline">
                        <Link2 className="h-3 w-3" /> open library
                      </Link>
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {stock.map((s) => (
                        <span key={s.id} className="dim rounded bg-panel3 px-2 py-1 text-xs text-muted">
                          {s.kind === "raw_stock" ? "on hand" : "buy"} {fmtD(s.width, units)}×{fmtD(s.length, units)}
                          {s.kind === "raw_stock" ? ` ×${s.quantity}` : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
