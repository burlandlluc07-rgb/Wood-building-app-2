"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Minus,
  Plus,
  ShoppingCart,
  Slice,
  SquareCheck,
} from "lucide-react";
import { api, classNames, fmtD, fmtMoney, type Detail, type SheetRow } from "@/lib/ui";

/**
 * Shop Mode — a tablet-at-the-saw view over the SAME live database.
 * Every checkbox writes straight back; no export, no staleness.
 */
export function ShopMode({ initial }: { initial: Detail }) {
  const [detail, setDetail] = useState(initial);
  const [tab, setTab] = useState<"parts" | "diagrams" | "shop">("diagrams");
  const [openSheet, setOpenSheet] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const project = detail.project;
  const units = project.units;

  const refresh = (d: Detail) => setDetail(d);
  const refetch = async () => refresh(await api<Detail>(`/api/projects/${project.id}`));

  const togglePart = async (id: string, finished: boolean) => {
    const d = await api<Detail>(`/api/parts/${id}`, "PATCH", { finished });
    refresh(d);
  };
  const toggleSheet = async (s: SheetRow) => {
    await api(`/api/sheets/${s.id}`, "PATCH", { cutDone: !s.cutDone });
    await refetch();
  };
  const toggleHardware = async (id: string, purchased: boolean) => {
    const d = await api<Detail>("/api/hardware", "PATCH", { id, purchased });
    refresh(d);
  };
  const toggleMaterial = async (id: string) => {
    const cur = new Set(project.purchasedMaterialIds ?? []);
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    const d = await api<Detail>(`/api/projects/${project.id}`, "PATCH", {
      purchasedMaterialIds: [...cur],
    });
    refresh(d);
  };

  const partsLeft = detail.parts.filter((p) => !p.finished && !p.isGlueUpPanel).length;
  const sheetsLeft = detail.sheets.filter((s) => !s.cutDone).length;

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <header className="mb-5 flex items-center gap-3">
        <Link
          href={`/projects/${project.id}`}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-edge bg-panel text-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="wordmark text-xl font-bold leading-tight">{project.name}</h1>
          <p className="text-[11px] text-muted">Shop mode · live data — checks save instantly</p>
        </div>
        <span className="dim rounded-lg bg-panel px-2 py-1 text-xs text-brand">
          {sheetsLeft} to cut
        </span>
      </header>

      <nav className="mb-4 grid grid-cols-3 gap-1 rounded-2xl border border-edge bg-panel p-1">
        {(
          [
            ["diagrams", Slice, `Cut${sheetsLeft ? ` (${sheetsLeft})` : ""}`],
            ["parts", SquareCheck, `Parts${partsLeft ? ` (${partsLeft})` : ""}`],
            ["shop", ShoppingCart, "Buy"],
          ] as const
        ).map(([k, Icon, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={classNames(
              "flex flex-col items-center gap-1 rounded-xl py-2.5 text-[11px] font-semibold",
              tab === k ? "bg-panel3 text-brand" : "text-muted"
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </button>
        ))}
      </nav>

      {tab === "parts" && (
        <div className="space-y-2">
          {detail.parts
            .filter((p) => !p.parentPartId)
            .map((p) => {
              const staves = detail.parts.filter((x) => x.parentPartId === p.id);
              return (
                <div key={p.id}>
                  <BigCheck
                    checked={p.finished}
                    onToggle={() => togglePart(p.id, !p.finished)}
                    title={`${p.name} ×${p.quantity}`}
                    sub={`${fmtD(p.length, units)}×${fmtD(p.width, units)}×${fmtD(p.thickness, units)}${p.subAssembly ? ` · ${p.subAssembly}` : ""}`}
                  />
                  {staves.map((s) => (
                    <div key={s.id} className="ml-6 mt-1">
                      <BigCheck
                        checked={s.finished}
                        onToggle={() => togglePart(s.id, !s.finished)}
                        title={s.name}
                        sub={`${fmtD(s.length, units)}×${fmtD(s.width, units)}`}
                        small
                      />
                    </div>
                  ))}
                </div>
              );
            })}
          {detail.parts.length === 0 && <EmptyShop text="No parts in this project." />}
        </div>
      )}

      {tab === "diagrams" && (
        <div className="space-y-2">
          {detail.sheets.map((s, i) => {
            const open = openSheet === s.id;
            const m = detail.materials.find((x) => x.id === s.materialId);
            const styleIdx = Math.min(s.styleIndex, Math.max(0, s.styleCount - 1));
            const pl = s.placements.filter((p) => p.styleIdx === styleIdx);
            return (
              <div key={s.id} className="overflow-hidden rounded-2xl border border-edge bg-panel">
                <button
                  onClick={() => {
                    setOpenSheet(open ? null : s.id);
                    setZoom(1);
                  }}
                  className="flex w-full items-center gap-3 p-4 text-left"
                >
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-xs font-bold text-ink"
                    style={{ background: m?.color ?? "#b08d57" }}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-cream">
                      {s.materialName}
                    </div>
                    <div className="dim text-[11px] text-muted">
                      {fmtD(s.width, units)}×{fmtD(s.length, units)} · {s.usedPct.toFixed(0)}% used
                      {s.axis === "1d" ? " · strip" : ""}
                    </div>
                  </div>
                  {s.cutDone && <Check className="h-5 w-5 text-good" />}
                  <ChevronDown className={classNames("h-4 w-4 text-faint transition-transform", open && "rotate-180")} />
                </button>
                {open && (
                  <div className="border-t border-edge p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} className="rounded-lg border border-edge p-2 text-muted">
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="dim px-2 text-xs text-muted">{Math.round(zoom * 100)}%</span>
                        <button onClick={() => setZoom((z) => Math.min(3, z + 0.25))} className="rounded-lg border border-edge p-2 text-muted">
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      <span className="dim text-[10px] text-faint">{pl.length} pieces</span>
                    </div>
                    <div className="overflow-auto rounded-xl bg-panel3/40" style={{ touchAction: "pinch-zoom" }}>
                      <svg
                        viewBox={`0 0 ${s.width} ${s.length}`}
                        style={{ width: `${zoom * 100}%`, minWidth: "100%", display: "block" }}
                      >
                        <rect x={0} y={0} width={s.width} height={s.length} fill="transparent" stroke="#4a3f36" strokeWidth={s.width / 250} />
                        {pl.map((p, pi) => (
                          <g key={pi}>
                            <rect x={p.x} y={p.y} width={p.w} height={p.l} fill={`${m?.color ?? "#b08d57"}66`} stroke="#0d0b09" strokeWidth={s.width / 400} />
                            {p.w > s.width / 8 && p.l > s.length / 16 && (
                              <text
                                x={p.x + p.w / 2}
                                y={p.y + p.l / 2}
                                textAnchor="middle"
                                fontSize={s.width / 45}
                                fill="#ece5d8"
                                fontWeight={600}
                              >
                                {p.partName}
                                {p.rotated ? " [R]" : ""}
                              </text>
                            )}
                          </g>
                        ))}
                      </svg>
                    </div>
                    <button
                      onClick={() => toggleSheet(s)}
                      className={classNames(
                        "mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-xl text-base font-bold",
                        s.cutDone ? "border border-good/50 bg-good/10 text-good" : "bg-brand text-ink"
                      )}
                    >
                      <Check className="h-5 w-5" strokeWidth={3} />
                      {s.cutDone ? "Cut — tap to undo" : "Mark diagram cut"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {detail.sheets.length === 0 && <EmptyShop text="No diagrams yet — run the optimizer on the desktop view." />}
        </div>
      )}

      {tab === "shop" && (
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-faint">
              Materials to purchase
            </h3>
            <div className="space-y-2">
              {[...detail.bom.sheetLines, ...detail.bom.linearLines]
                .filter((l) => l.sourceKind === "new_stock")
                .map((l, i) => (
                  <BigCheck
                    key={i}
                    checked={(project.purchasedMaterialIds ?? []).includes(l.materialId)}
                    onToggle={() => toggleMaterial(l.materialId)}
                    title={`${l.count}× ${l.materialName}`}
                    sub={`${fmtD(l.width, units)}×${fmtD(l.length, units)} · ${fmtMoney(l.costRoundUp)}`}
                  />
                ))}
              {detail.bom.roughLines.map((l, i) => (
                <BigCheck
                  key={`r${i}`}
                  checked={(project.purchasedMaterialIds ?? []).includes(l.materialId)}
                  onToggle={() => toggleMaterial(l.materialId)}
                  title={`${l.materialName} — ${l.nominalLabel}`}
                  sub={`${l.grossBoardFeet.toFixed(1)} bf to buy (${l.yieldPct}% yield) · ${fmtMoney(l.costBuy)}`}
                />
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-faint">
              Hardware
            </h3>
            <div className="space-y-2">
              {detail.hardware.map((h) => (
                <BigCheck
                  key={h.id}
                  checked={h.purchased}
                  onToggle={() => toggleHardware(h.id, !h.purchased)}
                  title={`${h.name} ×${h.quantity}`}
                  sub={`${h.category} · ${fmtMoney(h.quantity * h.unitCost)}`}
                />
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-branddim bg-brand/10 p-4 text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand">
              Remaining to buy
            </div>
            <div className="dim mt-1 text-2xl font-bold text-brand">
              $
              {detail.bom.totals.grandRoundUp.toFixed(2)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BigCheck({
  checked,
  onToggle,
  title,
  sub,
  small,
}: {
  checked: boolean;
  onToggle: () => void;
  title: string;
  sub?: string;
  small?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      className={classNames(
        "flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors",
        checked ? "border-good/40 bg-good/5" : "border-edge bg-panel",
        small && "p-3"
      )}
    >
      <span
        className={classNames(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2",
          checked ? "border-good bg-good text-ink" : "border-edge2"
        )}
      >
        {checked && <Check className="h-5 w-5" strokeWidth={3.2} />}
      </span>
      <span className="flex-1">
        <span className={classNames("block font-semibold", checked ? "text-muted line-through" : "text-cream", small ? "text-xs" : "text-sm")}>
          {title}
        </span>
        {sub && <span className="dim block text-[11px] text-muted">{sub}</span>}
      </span>
    </button>
  );
}

function EmptyShop({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-edge2 p-8 text-center text-sm text-faint">
      {text}
    </div>
  );
}
