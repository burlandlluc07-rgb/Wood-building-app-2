"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  PackageOpen,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import {
  api,
  classNames,
  fmtD,
  fmtMoney,
  type Detail,
} from "@/lib/ui";
import type { WsCtx } from "@/components/workspace";

const KIND_LABEL: Record<string, string> = {
  offcut: "offcut",
  raw_stock: "raw stock",
  new_stock: "buy new",
};

export function BomPanel({ ctx }: { ctx: WsCtx }) {
  const { detail, apply, notify } = ctx;
  const project = detail.project;
  const bom = detail.bom;
  const units = project.units;
  const roundUp = project.roundUpCosts;
  const [showCutList, setShowCutList] = useState(false);
  const [hideSub, setHideSub] = useState(false);
  const [hwForm, setHwForm] = useState({ name: "", category: "Hardware", quantity: "1", unit: "each", unitCost: "" });

  const setMode = async (ru: boolean) => {
    const d = await api<Detail>(`/api/projects/${project.id}`, "PATCH", { roundUpCosts: ru });
    apply(d);
  };

  const addHardware = async () => {
    if (!hwForm.name) return;
    const d = await api<Detail>("/api/hardware", "POST", {
      projectId: project.id,
      name: hwForm.name,
      category: hwForm.category || "Hardware",
      quantity: Number(hwForm.quantity) || 1,
      unit: hwForm.unit,
      unitCost: Number(hwForm.unitCost) || 0,
    });
    apply(d);
    setHwForm({ ...hwForm, name: "", unitCost: "" });
  };

  const categories = useMemo(
    () => [...new Set([...detail.hardware.map((h) => h.category), "Hardware", "Finishing", "Fasteners"])],
    [detail.hardware]
  );

  const totals = roundUp
    ? { materials: bom.totals.materialsRoundUp, grand: bom.totals.grandRoundUp }
    : { materials: bom.totals.materialsProRated, grand: bom.totals.grandProRated };

  return (
    <div className="space-y-4">
      {/* mode toggle */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-edge bg-panel px-4 py-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">
          Costing basis
        </span>
        <div className="flex rounded-lg border border-edge bg-panel2 p-0.5">
          <button
            onClick={() => setMode(true)}
            className={classNames(
              "rounded-md px-3 py-1.5 text-xs font-medium",
              roundUp ? "bg-brand text-ink" : "text-muted"
            )}
          >
            Round up — what you must buy
          </button>
          <button
            onClick={() => setMode(false)}
            className={classNames(
              "rounded-md px-3 py-1.5 text-xs font-medium",
              !roundUp ? "bg-brand text-ink" : "text-muted"
            )}
          >
            Pro-rated — value in the project
          </button>
        </div>
        <span className="text-[11px] text-faint">
          {roundUp
            ? "Every consumed sheet/stick bills at full price; rough lumber bills at the yield-inflated board-footage."
            : "Sheets/sticks bill by the fraction actually consumed; rough lumber bills at net board-feet."}
        </span>
        <button
          onClick={() => setShowCutList((s) => !s)}
          className="ml-auto flex items-center gap-2 rounded-lg border border-edge bg-panel2 px-3 py-1.5 text-xs text-muted hover:text-cream"
        >
          <Printer className="h-3.5 w-3.5" /> Cut list & print
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* sheet goods */}
        <Section title={`Sheet goods to buy (${bom.sheetLines.length})`}>
          {bom.sheetLines.length === 0 && <Empty text="No sheet-good layouts yet." />}
          {bom.sheetLines.map((l, i) => (
            <Line key={i} color={l.color} name={l.materialName}
              meta={`${l.count}× ${KIND_LABEL[l.sourceKind]} ${fmtD(l.width, units)}×${fmtD(l.length, units)} · avg ${l.usedPctAvg.toFixed(0)}% used`}
              cost={roundUp ? l.costRoundUp : l.costProRated}
              alt={roundUp ? undefined : `(buy price ${fmtMoney(l.costRoundUp)})`} />
          ))}
        </Section>

        {/* linear stock */}
        <Section title={`Cutting stock to buy (${bom.linearLines.length})`}>
          {bom.linearLines.length === 0 && <Empty text="No dimensioned-lumber layouts yet." />}
          {bom.linearLines.map((l, i) => (
            <Line key={i} color={l.color} name={l.materialName}
              meta={`${l.count}× ${KIND_LABEL[l.sourceKind]} sticks ${fmtD(l.length, units)} long (${fmtD(l.width, units)} section)`}
              cost={roundUp ? l.costRoundUp : l.costProRated}
              alt={roundUp ? undefined : `(buy price ${fmtMoney(l.costRoundUp)})`} />
          ))}
        </Section>

        {/* rough lumber */}
        <Section title={`Rough lumber — board feet (${bom.roughLines.length})`}>
          {bom.roughLines.length === 0 && <Empty text="No rough-lumber parts in this project." />}
          {bom.roughLines.map((l, i) => (
            <div key={i} className="rounded-lg border border-edge bg-panel2 p-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-medium text-cream">
                  <span className="h-3 w-3 rounded-sm" style={{ background: "#b08d57" }} />
                  {l.materialName} · <span className="dim font-bold text-brand">{l.nominalLabel}</span> nominal
                </span>
                <span className="dim text-sm font-semibold text-brand">
                  {fmtMoney(roundUp ? l.costBuy : l.costConsumed)}
                </span>
              </div>
              <div className="dim mt-1.5 text-xs text-muted">
                {l.grossBoardFeet.toFixed(1)} bf to buy = {l.netBoardFeet.toFixed(1)} bf net ÷ {l.yieldPct}% yield
                <span className="text-faint"> · {l.grossCubicM.toFixed(3)} m³</span>
              </div>
              <div className="mt-1 text-[11px] text-faint">
                covers: {l.partNames.join(", ")} — no cutting diagram exists for rough stock (yard boards are random-width/length)
              </div>
            </div>
          ))}
        </Section>

        {/* glue-up rollups + banding runs */}
        <Section title="Glue-up panels & edging runs">
          {bom.glueUps.map((g) => (
            <Line key={g.partId} color="#f0a53f" name={g.name}
              meta={`${g.staveCount} staves roll up · finished ${fmtD(g.width, units)}×${fmtD(g.length, units)}×${fmtD(g.thickness, units)}`}
              cost={g.rolledCost} />
          ))}
          {bom.bandingRuns.map((b) => (
            <div key={b.partId} className="flex items-center justify-between rounded-lg border border-edge bg-panel2 px-3 py-2">
              <span className="text-sm text-cream">{b.partName}</span>
              <span className="dim text-xs text-muted">
                {b.edges.join("+")} · {(b.lengthMm / 1000).toFixed(2)} m {b.solidWood ? `solid ${b.thickness}mm edging` : "iron-on banding"}
              </span>
            </div>
          ))}
          {bom.glueUps.length === 0 && bom.bandingRuns.length === 0 && (
            <Empty text="No glue-up panels or banded edges." />
          )}
        </Section>
      </div>

      {/* hardware */}
      <div className="rounded-xl border border-edge bg-panel p-4">
        <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
          Hardware & other costs
        </h3>
        <div className="mb-3 flex flex-wrap gap-3">
          {bom.hardwareByCategory.map((c) => (
            <span key={c.category} className="rounded-lg bg-panel2 px-3 py-1.5 text-xs text-muted">
              {c.category}: <span className="dim font-semibold text-cream">{fmtMoney(c.total)}</span>
            </span>
          ))}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.16em] text-faint">
              <th className="py-1.5">Item</th>
              <th className="py-1.5">Category</th>
              <th className="py-1.5">Qty</th>
              <th className="py-1.5">Unit</th>
              <th className="py-1.5">Unit cost</th>
              <th className="py-1.5 text-right">Total</th>
              <th className="py-1.5" />
            </tr>
          </thead>
          <tbody>
            {bom.hardwareLines.map((h) => (
              <tr key={h.id} className="border-t border-edge/50">
                <td className="py-1.5 font-medium text-cream">{h.name}</td>
                <td className="py-1.5 text-muted">{h.category}</td>
                <td className="dim py-1.5">{h.quantity}</td>
                <td className="py-1.5 text-muted">{h.unit}</td>
                <td className="dim py-1.5">{fmtMoney(h.unitCost)}</td>
                <td className="dim py-1.5 text-right font-medium text-cream">{fmtMoney(h.total)}</td>
                <td className="py-1.5 text-right">
                  <button
                    onClick={async () => {
                      const d = await api<Detail>("/api/hardware", "DELETE", { id: h.id });
                      apply(d);
                    }}
                    className="text-faint hover:text-bad"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {/* add row */}
            <tr className="border-t border-edge">
              <td className="py-2 pr-2">
                <input value={hwForm.name} onChange={(e) => setHwForm({ ...hwForm, name: e.target.value })} placeholder="Add item…" className="w-full rounded border border-edge bg-panel2 px-2 py-1.5 text-sm" />
              </td>
              <td className="py-2 pr-2">
                <select value={hwForm.category} onChange={(e) => setHwForm({ ...hwForm, category: e.target.value })} className="rounded border border-edge bg-panel2 px-2 py-1.5 text-sm">
                  {[...new Set(categories)].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </td>
              <td className="py-2 pr-2">
                <input type="number" value={hwForm.quantity} onChange={(e) => setHwForm({ ...hwForm, quantity: e.target.value })} className="dim w-16 rounded border border-edge bg-panel2 px-2 py-1.5 text-sm" />
              </td>
              <td className="py-2 pr-2">
                <select value={hwForm.unit} onChange={(e) => setHwForm({ ...hwForm, unit: e.target.value })} className="rounded border border-edge bg-panel2 px-2 py-1.5 text-sm">
                  {["each", "ft", "m", "box", "pair", "hour"].map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </td>
              <td className="py-2 pr-2">
                <input type="number" step="0.01" value={hwForm.unitCost} onChange={(e) => setHwForm({ ...hwForm, unitCost: e.target.value })} placeholder="0.00" className="dim w-20 rounded border border-edge bg-panel2 px-2 py-1.5 text-sm" />
              </td>
              <td className="py-2 text-right" colSpan={2}>
                <button onClick={addHardware} className="flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-ink">
                  <Plus className="h-3.5 w-3.5" strokeWidth={3} /> Add
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* totals */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-edge bg-panel p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">Materials</div>
          <div className="dim mt-1 text-2xl font-bold text-cream">{fmtMoney(totals.materials)}</div>
          <div className="mt-1 text-[11px] text-faint">{roundUp ? "round-up (purchase)" : "pro-rated (consumed)"}</div>
        </div>
        <div className="rounded-xl border border-edge bg-panel p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">Hardware & other</div>
          <div className="dim mt-1 text-2xl font-bold text-cream">{fmtMoney(bom.totals.hardwareTotal)}</div>
        </div>
        <div className="rounded-xl border border-branddim bg-brand/10 p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand">Project total</div>
          <div className="dim mt-1 text-2xl font-bold text-brand">{fmtMoney(totals.grand)}</div>
          <div className="mt-1 text-[11px] text-branddim">
            other basis: {fmtMoney(roundUp ? bom.totals.grandProRated : bom.totals.grandRoundUp)} {roundUp ? "pro-rated" : "round-up"}
          </div>
        </div>
      </div>

      {/* skipped */}
      {bom.skipped.length > 0 && (
        <div className="rounded-xl border border-bad/40 bg-bad/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-bad">
            <AlertTriangle className="h-4 w-4" /> Skipped parts (also shown on Layouts)
          </div>
          <ul className="space-y-1">
            {bom.skipped.map((s) => (
              <li key={s.partId} className="text-sm">
                <span className="font-medium text-cream">{s.name}</span>{" "}
                <span className="text-xs text-bad/90">— {s.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* cut list */}
      {showCutList && (
        <div className="rounded-xl border border-edge bg-panel p-4 print-area">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-cream">
              Cut list — {project.name} ({bom.cutList.length} lines)
            </h3>
            <div className="flex items-center gap-2 no-print">
              <button
                onClick={() => setHideSub((s) => !s)}
                className="rounded-lg border border-edge bg-panel2 px-2.5 py-1.5 text-xs text-muted"
              >
                {hideSub ? "Show" : "Hide"} sub-assembly column
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-ink"
              >
                <Printer className="h-3.5 w-3.5" /> Print
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-xs">
              <thead>
                <tr className="border-b border-edge text-left text-[10px] uppercase tracking-[0.14em] text-faint">
                  <th className="py-1.5 pr-2"><PackageOpen className="inline h-3 w-3" /> Part</th>
                  <th className="py-1.5 pr-2">Qty</th>
                  <th className="py-1.5 pr-2">Cut size L×W×T</th>
                  <th className="py-1.5 pr-2">Finished</th>
                  <th className="py-1.5 pr-2">Material</th>
                  <th className="py-1.5 pr-2">Buy thickness</th>
                  <th className="py-1.5 pr-2">Edge</th>
                  {!hideSub && <th className="py-1.5 pr-2">Sub-assembly</th>}
                  <th className="py-1.5 text-right">Cost share</th>
                </tr>
              </thead>
              <tbody>
                {bom.cutList.map((r) => (
                  <tr key={r.partId} className={classNames("border-b border-edge/40", r.isStave && "text-muted")}>
                    <td className="py-1.5 pr-2 font-medium text-cream">
                      {r.isStave ? "  ↳ " : ""}{r.name}
                      {r.role && <span className="ml-1 rounded bg-brand/15 px-1 text-[9px] font-bold text-brand">{r.role === "primary" ? "P" : "S"}</span>}
                    </td>
                    <td className="dim py-1.5 pr-2">{r.qty}</td>
                    <td className="dim py-1.5 pr-2">
                      {fmtD(r.length, units)}×{fmtD(r.width, units)}×{fmtD(r.thickness, units)}
                    </td>
                    <td className="dim py-1.5 pr-2 text-faint">
                      {r.bandedNote ? `${fmtD(r.finishedLength, units)}×${fmtD(r.finishedWidth, units)}` : "—"}
                    </td>
                    <td className="py-1.5 pr-2 text-muted">{r.materialName ?? <span className="text-bad">unassigned</span>}</td>
                    <td className="dim py-1.5 pr-2 text-brand">{r.nominalLabel ?? "—"}</td>
                    <td className="py-1.5 pr-2 text-muted">{r.bandingSummary ?? "—"}</td>
                    {!hideSub && <td className="py-1.5 pr-2 text-muted">{r.subAssembly ?? "—"}</td>}
                    <td className="dim py-1.5 text-right">{fmtMoney(r.shareCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-edge bg-panel p-4">
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Line({ color, name, meta, cost, alt }: { color: string; name: string; meta: string; cost: number; alt?: string }) {
  return (
    <div className="rounded-lg border border-edge bg-panel2 p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-cream">
          <span className="h-3 w-3 rounded-sm" style={{ background: color }} />
          {name}
        </span>
        <span className="dim text-sm font-semibold text-brand">{fmtMoney(cost)}</span>
      </div>
      <div className="mt-1 text-xs text-muted">
        {meta} {alt && <span className="text-faint">{alt}</span>}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs text-faint">{text}</p>;
}
