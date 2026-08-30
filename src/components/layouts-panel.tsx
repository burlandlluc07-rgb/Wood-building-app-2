"use client";

import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  AlertTriangle,
  CheckSquare,
  Download,
  FlipHorizontal2,
  Pin,
  PinOff,
  RefreshCw,
  RotateCw,
  Square,
  Tag,
  Trash2,
} from "lucide-react";
import {
  api,
  classNames,
  fmtD,
  type Detail,
  type MaterialRow,
  type SheetRow,
} from "@/lib/ui";
import type { WsCtx } from "@/components/workspace";

const KIND_LABEL: Record<string, string> = {
  offcut: "offcut",
  raw_stock: "raw stock",
  new_stock: "buy new",
};

function activePlacements(s: SheetRow) {
  const idx = Math.min(s.styleIndex, Math.max(0, s.styleCount - 1));
  return s.placements.filter((p) => p.styleIdx === idx);
}

export function LayoutsPanel({ ctx }: { ctx: WsCtx }) {
  const { detail, apply, reoptimize, notify } = ctx;
  const project = detail.project;
  const units = project.units;
  const materialsById = useMemo(
    () => new Map(detail.materials.map((m) => [m.id, m])),
    [detail.materials]
  );

  // collapse geometrically identical sheets
  const groups = useMemo(() => {
    const map = new Map<string, SheetRow[]>();
    for (const s of detail.sheets) {
      const arr = map.get(s.groupKey) ?? [];
      arr.push(s);
      map.set(s.groupKey, arr);
    }
    return [...map.entries()].map(([key, items]) => ({ key, items }));
  }, [detail.sheets]);

  const [selKey, setSelKey] = useState<string | null>(null);
  const [instanceIdx, setInstanceIdx] = useState(0);
  const selGroup = groups.find((g) => g.key === selKey) ?? groups[0];
  const sel = selGroup?.items[Math.min(instanceIdx, selGroup.items.length - 1)];

  const patchSheet = async (s: SheetRow, fields: Record<string, unknown>) => {
    await api(`/api/sheets/${s.id}`, "PATCH", fields);
    const d = await api<Detail>(`/api/projects/${project.id}`);
    apply(d);
  };

  // Manual reposition/rotate from the diagram. Local-only fields (id-less
  // placements can't be dragged — that only happens for legacy data saved
  // before placements had ids).
  const movePlacement = async (placementId: string, fields: Record<string, unknown>) => {
    await api(`/api/placements/${placementId}`, "PATCH", fields);
    const d = await api<Detail>(`/api/projects/${project.id}`);
    apply(d);
  };

  const deleteSheet = async (s: SheetRow) => {
    await api(`/api/sheets/${s.id}`, "DELETE");
    const d = await api<Detail>(`/api/projects/${project.id}`);
    apply(d);
    notify("Diagram removed");
  };

  const exportSvg = (s: SheetRow) => {
    const m = materialsById.get(s.materialId);
    const svg = buildStandaloneSvg(s, activePlacements(s), m, units);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${project.name.replace(/\W+/g, "-")}-${s.axis}-${s.id.slice(0, 6)}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Part labels — CutList Plus generates a printable label per cut part
  // (name, size, material) to stick on the piece at the saw. This exports
  // the same information as a CSV for the currently selected diagram.
  const exportLabels = (s: SheetRow) => {
    const m = materialsById.get(s.materialId);
    const rows = activePlacements(s).map((p) => [
      p.partName,
      fmtD(p.w, units),
      fmtD(p.l, units),
      m?.name ?? s.materialName,
      p.rotated ? "yes" : "no",
    ]);
    const csv = [
      ["Part", "Width", "Length", "Material", "Rotated"],
      ...rows,
    ]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${project.name.replace(/\W+/g, "-")}-${s.axis}-${s.id.slice(0, 6)}-labels.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const skipped = detail.analysis.skipped;
  const options = detail.analysis.optionSummaries;

  return (
    <div className="space-y-4">
      {/* A/B/C option summaries */}
      {options.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-edge bg-panel px-4 py-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">
            Solution options
          </span>
          {(() => {
            const byMat = new Map<string, typeof options>();
            for (const o of options) {
              const arr = byMat.get(o.materialId) ?? [];
              arr.push(o);
              byMat.set(o.materialId, arr);
            }
            return [...byMat.entries()].map(([mid, opts]) => (
              <span key={mid} className="flex items-center gap-1.5 rounded-lg bg-panel2 px-2.5 py-1.5 text-xs text-muted">
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ background: materialsById.get(mid)?.color ?? "#888" }}
                />
                <span className="font-medium text-cream">{opts[0].materialName}:</span>
                {opts.map((o) => (
                  <span key={o.objective} className="dim rounded bg-panel3 px-1.5 py-0.5" title={`objective: ${o.objective}`}>
                    {o.objective === "waste" ? "A" : o.objective === "cost" ? "B" : "C"}·{o.totals.stockUsed}pc·{o.totals.wastePct.toFixed(0)}%w
                  </span>
                ))}
              </span>
            ));
          })()}
          <span className="text-[11px] text-faint">best-weighted option is applied automatically</span>
        </div>
      )}

      {/* skipped parts */}
      {skipped.length > 0 && (
        <div className="rounded-xl border border-bad/40 bg-bad/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-bad">
            <AlertTriangle className="h-4 w-4" /> Skipped parts — these did not make it onto any layout
          </div>
          <ul className="space-y-1">
            {skipped.map((s) => (
              <li key={s.partId} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="font-medium text-cream">{s.name}</span>
                <span className="text-xs text-bad/90">{s.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-edge2 p-12 text-center">
          <p className="mb-3 text-sm text-muted">No layouts yet.</p>
          <button
            onClick={() => reoptimize(null)}
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-ink"
          >
            Run the optimizer
          </button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          {/* thumbnail rail */}
          <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
            {groups.map((g, gi) => {
              const rep = g.items[0];
              const m = materialsById.get(rep.materialId);
              const isSel = selGroup?.key === g.key;
              return (
                <button
                  key={g.key}
                  onClick={() => {
                    setSelKey(g.key);
                    setInstanceIdx(0);
                  }}
                  className={classNames(
                    "w-full rounded-xl border p-2.5 text-left card-hover",
                    isSel ? "border-brand/60 bg-panel2" : "border-edge bg-panel"
                  )}
                >
                  <div className="mb-1.5 flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 text-muted">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: m?.color ?? "#888" }} />
                      <span className="truncate font-medium text-cream">
                        {rep.axis === "1d" ? "Strip" : "Sheet"} {gi + 1}
                      </span>
                      {rep.pinned && <Pin className="h-3 w-3 text-brand" />}
                    </span>
                    <span className="flex items-center gap-1">
                      {rep.styleCount > 1 && (
                        <span title="Alternate equal-cost layouts available" className="rounded bg-brand/15 px-1 text-[9px] font-bold text-brand">
                          ×{rep.styleCount} styles
                        </span>
                      )}
                      {g.items.length > 1 && (
                        <span className="rounded bg-panel3 px-1.5 text-[10px] font-bold text-muted">
                          ×{g.items.length}
                        </span>
                      )}
                    </span>
                  </div>
                  <MiniDiagram sheet={rep} color={m?.color ?? "#b08d57"} />
                  <div className="dim mt-1.5 flex items-center justify-between text-[10px] text-faint">
                    <span>
                      {fmtD(rep.width, units)}×{fmtD(rep.length, units)}
                      {rep.axis === "1d" ? " stick" : ""}
                    </span>
                    <span className={rep.usedPct > 70 ? "text-good" : "text-muted"}>
                      {rep.usedPct.toFixed(0)}% used
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* main diagram */}
          {sel && (
            <div className="rounded-xl border border-edge bg-panel p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-cream">
                  {sel.materialName}{" "}
                  <span className="dim text-xs text-muted">
                    {fmtD(sel.width, units)} × {fmtD(sel.length, units)}
                    {sel.axis === "1d" ? " — 1D cutting stock" : ""}
                  </span>
                </span>
                <span className="rounded bg-panel3 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  {KIND_LABEL[sel.sourceKind]}
                </span>
                {selGroup && selGroup.items.length > 1 && (
                  <select
                    value={Math.min(instanceIdx, selGroup.items.length - 1)}
                    onChange={(e) => setInstanceIdx(Number(e.target.value))}
                    className="rounded border border-edge bg-panel2 px-2 py-1 text-xs text-muted"
                  >
                    {selGroup.items.map((it, i) => (
                      <option key={it.id} value={i}>
                        identical sheet {i + 1}/{selGroup.items.length}
                      </option>
                    ))}
                  </select>
                )}
                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    title={sel.pinned ? "Unpin — allow reoptimization" : "Pin — never touched by reoptimization"}
                    onClick={() => patchSheet(sel, { pinned: !sel.pinned })}
                    className={classNames(
                      "rounded-lg border p-2",
                      sel.pinned ? "border-brand/50 bg-brand/10 text-brand" : "border-edge text-muted hover:text-cream"
                    )}
                  >
                    {sel.pinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
                  </button>
                  <button
                    title={
                      sel.styleCount > 1
                        ? `Cycle layout style (${Math.min(sel.styleIndex, sel.styleCount - 1) + 1}/${sel.styleCount}) — identical cost & waste, different cut arrangement`
                        : "No alternate equal-cost arrangement exists for this sheet"
                    }
                    disabled={sel.styleCount < 2}
                    onClick={() =>
                      patchSheet(sel, { styleIndex: (sel.styleIndex + 1) % sel.styleCount })
                    }
                    className={classNames(
                      "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs",
                      sel.styleCount > 1
                        ? "border-edge text-cream hover:border-brand/50 hover:text-brand"
                        : "cursor-not-allowed border-edge/50 text-faint"
                    )}
                  >
                    <FlipHorizontal2 className="h-4 w-4" />
                    {sel.styleCount > 1
                      ? `style ${Math.min(sel.styleIndex, sel.styleCount - 1) + 1}/${sel.styleCount}`
                      : "1 style"}
                  </button>
                  <button
                    title="Mark this diagram cut at the saw"
                    onClick={() => patchSheet(sel, { cutDone: !sel.cutDone })}
                    className={classNames(
                      "rounded-lg border p-2",
                      sel.cutDone ? "border-good/50 bg-good/10 text-good" : "border-edge text-muted hover:text-cream"
                    )}
                  >
                    {sel.cutDone ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  </button>
                  <button
                    title="Export this single diagram as SVG"
                    onClick={() => exportSvg(sel)}
                    className="rounded-lg border border-edge p-2 text-muted hover:text-cream"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    title="Export part labels for this diagram (CSV) — name, size, material"
                    onClick={() => exportLabels(sel)}
                    className="rounded-lg border border-edge p-2 text-muted hover:text-cream"
                  >
                    <Tag className="h-4 w-4" />
                  </button>
                  <button
                    title="Re-solve only this material group"
                    onClick={() => reoptimize([sel.materialId])}
                    className="rounded-lg border border-edge p-2 text-muted hover:text-brand"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deleteSheet(sel)}
                    className="rounded-lg border border-edge p-2 text-muted hover:text-bad"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {sel.pinned && (
                <div className="mb-2 rounded-lg bg-brand/10 px-3 py-1.5 text-[11px] text-brand">
                  Pinned — this diagram is never touched by reoptimization.
                </div>
              )}

              {sel.axis !== "1d" && (
                <p className="mb-2 text-[11px] text-faint">
                  Drag a part to reposition it — it snaps to nearby edges and the sheet border. Hold{" "}
                  <span className="dim rounded bg-panel3 px-1 py-0.5 text-[10px]">Ctrl</span> while dragging to force a
                  rotation, or click the rotate icon on a part. Moving anything pins the diagram.
                </p>
              )}

              <BigDiagram
                sheet={sel}
                placements={activePlacements(sel)}
                color={materialsById.get(sel.materialId)?.color ?? "#b08d57"}
                units={units}
                onMovePlacement={movePlacement}
              />

              {/* per-diagram take-off list */}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-[0.16em] text-faint">
                      <th className="py-1.5 pr-3">Part on this diagram</th>
                      <th className="py-1.5 pr-3">Cut size (along-X × along-Y)</th>
                      <th className="py-1.5 pr-3">Rotated</th>
                      <th className="py-1.5">Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activePlacements(sel).map((p, i) => (
                      <tr key={i} className="border-t border-edge/40">
                        <td className="py-1.5 pr-3 font-medium text-cream">{p.partName}</td>
                        <td className="dim py-1.5 pr-3 text-muted">
                          <strong className="font-bold text-cream">{fmtD(p.w, units)}</strong> × {fmtD(p.l, units)}
                        </td>
                        <td className="py-1.5 pr-3">
                          {p.rotated ? (
                            <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold text-brand" title="Drawn orientation is rotated from the part's natural orientation">
                              [R]
                            </span>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </td>
                        <td className="dim py-1.5 text-faint">
                          x {fmtD(p.x, units)}, y {fmtD(p.y, units)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diagram renderers (2D sheets + 1D strips)
// ---------------------------------------------------------------------------
function shade(hex: string, alpha: number): string {
  return `${hex}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
}

function MiniDiagram({ sheet, color }: { sheet: SheetRow; color: string }) {
  const pl = activePlacements(sheet);
  const W = 200;
  const ratio = sheet.axis === "1d" ? 12 : sheet.length / sheet.width;
  const H = Math.max(18, Math.min(120, W * ratio));
  return (
    <svg viewBox={`0 0 ${sheet.width} ${sheet.length}`} style={{ width: "100%", height: H, maxHeight: 120 }} className="rounded bg-panel3/60" preserveAspectRatio="none">
      <rect x={0} y={0} width={sheet.width} height={sheet.length} fill="transparent" stroke="#3a312b" strokeWidth={sheet.width / 150} />
      {pl.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={p.w} height={p.l} fill={shade(color, 0.55)} stroke="#0d0b09" strokeWidth={sheet.width / 300} />
      ))}
    </svg>
  );
}

function BigDiagram({
  sheet,
  placements,
  color,
  units,
  onMovePlacement,
}: {
  sheet: SheetRow;
  placements: SheetRow["placements"];
  color: string;
  units: "mm" | "in";
  onMovePlacement: (placementId: string, fields: Record<string, unknown>) => void;
}) {
  if (sheet.axis === "1d") {
    return <StripDiagram sheet={sheet} placements={placements} color={color} units={units} />;
  }

  const W = sheet.width;
  const L = sheet.length;
  const fs = Math.max(10, W / 60);
  const fs2 = fs * 0.85;
  const svgRef = useRef<SVGSVGElement>(null);

  // Optimistic local overrides so dragging/rotating feels instant instead
  // of waiting on the PATCH round-trip + full detail refetch.
  const [overrides, setOverrides] = useState<Record<string, { x: number; y: number; w: number; l: number; rotated: boolean }>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragState = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    baseRotated: boolean;
    w0: number; // dimensions in the part's natural (non-forced) orientation
    l0: number;
    currentRotated: boolean;
  } | null>(null);

  const view = (p: SheetRow["placements"][number]) => {
    const o = p.id ? overrides[p.id] : undefined;
    return o ?? p;
  };

  const clamp = (x: number, y: number, w: number, l: number) => ({
    x: Math.min(Math.max(0, x), Math.max(0, W - w)),
    y: Math.min(Math.max(0, y), Math.max(0, L - l)),
  });

  // Snap distance: same idea as CutList Plus's "snap to nearby saw kerfs"
  // while dragging — align the moving part's edges with the sheet border
  // or any other placed part's edges once you're within a small tolerance.
  const snapTolerance = Math.max(W, L) / 250;
  const snapAxis = (pos: number, size: number, edges: number[]): number => {
    for (const edge of edges) {
      if (Math.abs(pos - edge) <= snapTolerance) return edge;
      if (Math.abs(pos + size - edge) <= snapTolerance) return edge - size;
    }
    return pos;
  };

  const onPointerDown = useCallback(
    (e: ReactPointerEvent, p: SheetRow["placements"][number]) => {
      if (!p.id) return; // legacy placements without an id can't be moved
      (e.target as Element).setPointerCapture(e.pointerId);
      const v = view(p);
      dragState.current = {
        id: p.id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startX: v.x,
        startY: v.y,
        baseRotated: v.rotated,
        w0: v.rotated ? v.l : v.w,
        l0: v.rotated ? v.w : v.l,
        currentRotated: v.rotated,
      };
      setDraggingId(p.id);
    },
    [overrides]
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const ds = dragState.current;
      const svg = svgRef.current;
      if (!ds || !svg) return;

      // Holding Ctrl while dragging forces the part into the opposite
      // orientation, same as CutList Plus's "hold Ctrl to force rotation"
      // — release Ctrl to go back to how it was picked up.
      const wantRotated = e.ctrlKey ? !ds.baseRotated : ds.baseRotated;
      ds.currentRotated = wantRotated;
      const w = wantRotated ? ds.l0 : ds.w0;
      const l = wantRotated ? ds.w0 : ds.l0;

      const rect = svg.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = L / rect.height;
      const dx = (e.clientX - ds.startClientX) * scaleX;
      const dy = (e.clientY - ds.startClientY) * scaleY;
      const clamped = clamp(ds.startX + dx, ds.startY + dy, w, l);

      const otherEdgesX = [0, W];
      const otherEdgesY = [0, L];
      for (const p of placements) {
        if (p.id === ds.id) continue;
        const v = view(p);
        otherEdgesX.push(v.x, v.x + v.w);
        otherEdgesY.push(v.y, v.y + v.l);
      }
      const x = snapAxis(clamped.x, w, otherEdgesX);
      const y = snapAxis(clamped.y, l, otherEdgesY);

      setOverrides((prev) => ({ ...prev, [ds.id]: { x, y, w, l, rotated: wantRotated } }));
    },
    [W, L, placements]
  );

  const onPointerUp = useCallback(() => {
    const ds = dragState.current;
    dragState.current = null;
    setDraggingId(null);
    if (!ds) return;
    const o = overrides[ds.id];
    if (!o) return;
    const fields: Record<string, unknown> = { x: o.x, y: o.y };
    if (ds.currentRotated !== ds.baseRotated) fields.rotated = ds.currentRotated;
    onMovePlacement(ds.id, fields);
  }, [overrides, onMovePlacement]);

  const rotatePlacement = useCallback(
    (p: SheetRow["placements"][number]) => {
      if (!p.id) return;
      const v = view(p);
      const newRotated = !v.rotated;
      const newW = v.l;
      const newL = v.w;
      const { x, y } = clamp(v.x, v.y, newW, newL);
      setOverrides((prev) => ({ ...prev, [p.id!]: { x, y, w: newW, l: newL, rotated: newRotated } }));
      onMovePlacement(p.id, { rotated: newRotated });
    },
    [overrides, onMovePlacement, W, L]
  );

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${L}`}
      className="max-h-[58vh] w-full touch-none rounded-lg bg-panel3/40"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <rect x={0} y={0} width={W} height={L} fill="transparent" stroke="#4a3f36" strokeWidth={W / 250} />
      {placements.map((p, i) => {
        const v = view(p);
        const cx = v.x + v.w / 2;
        const cy = v.y + v.l / 2;
        const showText = v.w > W / 14 && v.l > L / 22;
        const isDragging = draggingId === p.id;
        const movable = !!p.id;
        return (
          <g
            key={p.id ?? i}
            onPointerDown={(e) => onPointerDown(e, p)}
            style={{ cursor: movable ? (isDragging ? "grabbing" : "grab") : "default" }}
          >
            <rect
              x={v.x}
              y={v.y}
              width={v.w}
              height={v.l}
              fill={shade(color, (isDragging ? 0.5 : 0.32) + (i % 4) * 0.07)}
              stroke={isDragging ? "#ece5d8" : "#0d0b09"}
              strokeWidth={isDragging ? W / 220 : W / 500}
            />
            {showText && (
              <>
                <text x={cx} y={cy - fs * 0.15} textAnchor="middle" fontSize={fs} fill="#ece5d8" fontWeight={600} style={{ pointerEvents: "none" }}>
                  {p.partName}
                  {v.rotated ? " [R]" : ""}
                </text>
                <text x={cx} y={cy + fs2 * 1.1} textAnchor="middle" fontSize={fs2} fill="#93887a" fontFamily="ui-monospace, monospace" style={{ pointerEvents: "none" }}>
                  <tspan fontWeight={700} fill="#d9d0c0">{fmtD(v.w, units)}</tspan>
                  <tspan> × {fmtD(v.l, units)}</tspan>
                </text>
              </>
            )}
            {movable && showText && (
              <g
                transform={`translate(${v.x + v.w - fs * 1.6}, ${v.y + fs * 0.3})`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => rotatePlacement(p)}
                style={{ cursor: "pointer" }}
              >
                <rect width={fs * 1.3} height={fs * 1.3} rx={fs * 0.25} fill="#0d0b09" opacity={0.55} />
                <RotateCwIcon size={fs * 1.3} />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// Rotate icon drawn as raw SVG paths (matches lucide's RotateCw glyph) so it
// can live inside the diagram's own <svg> without nesting <svg> elements.
function RotateCwIcon({ size }: { size: number }) {
  return (
    <g transform={`scale(${size / 24})`} stroke="#ece5d8" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-3.2-6.9" />
      <polyline points="21 3 21 9 15 9" />
    </g>
  );
}

function StripDiagram({
  sheet,
  placements,
  color,
  units,
}: {
  sheet: SheetRow;
  placements: SheetRow["placements"];
  color: string;
  units: "mm" | "in";
}) {
  const H = sheet.length / 9; // display width of the strip
  const pad = H * 0.9;
  const total = sheet.length + pad * 2;
  const fs = sheet.length / 70;
  return (
    <svg viewBox={`0 0 ${sheet.length} ${total / 3}`} className="max-h-[30vh] w-full rounded-lg bg-panel3/40">
      <rect x={0} y={H / 2} width={sheet.length} height={H} rx={H / 8} fill="transparent" stroke="#4a3f36" strokeWidth={sheet.length / 300} />
      {placements.map((p, i) => {
        const segX = p.x;
        return (
          <g key={i}>
            <rect
              x={segX}
              y={H / 2}
              width={p.w}
              height={H}
              rx={H / 10}
              fill={shade(color, 0.35 + (i % 4) * 0.08)}
              stroke="#0d0b09"
              strokeWidth={sheet.length / 600}
            />
            <text
              x={segX + p.w / 2}
              y={H / 2 - fs * 0.7}
              textAnchor="middle"
              fontSize={fs}
              fill="#ece5d8"
              fontWeight={600}
            >
              {p.partName} — {fmtD(p.w, units)}
            </text>
            {/* kerf tick */}
            <line x1={segX + p.w} y1={H / 2} x2={segX + p.w} y2={H / 2 + H} stroke="#0d0b09" strokeWidth={sheet.length / 800} />
          </g>
        );
      })}
      {(() => {
        const used = placements.length ? Math.max(...placements.map((p) => p.x + p.w)) : 0;
        const waste = sheet.length - used;
        if (waste <= 0) return null;
        return (
          <g>
            <rect x={used} y={H / 2} width={waste} height={H} rx={H / 10} fill="#241f1b" stroke="#3a312b" strokeDasharray={`${sheet.length / 100} ${sheet.length / 140}`} strokeWidth={sheet.length / 700} />
            <text x={used + waste / 2} y={H / 2 + H / 2 + fs * 0.35} textAnchor="middle" fontSize={fs * 0.9} fill="#6c6357" fontFamily="ui-monospace, monospace">
              offcut {fmtD(waste, units)}
            </text>
          </g>
        );
      })()}
    </svg>
  );
}

// standalone SVG export of one diagram
function buildStandaloneSvg(
  sheet: SheetRow,
  placements: SheetRow["placements"],
  m: MaterialRow | undefined,
  units: "mm" | "in"
): string {
  const color = m?.color ?? "#b08d57";
  const W = sheet.width;
  const L = sheet.length;
  const fs = Math.max(10, W / 60);
  if (sheet.axis === "1d") {
    const H = L / 9;
    const rects = placements
      .map(
        (p, i) =>
          `<rect x="${p.x.toFixed(1)}" y="${(H / 2).toFixed(1)}" width="${p.w.toFixed(1)}" height="${H.toFixed(1)}" fill="${shade(color, 0.4 + (i % 4) * 0.08)}" stroke="#111" stroke-width="${(L / 600).toFixed(2)}"/><text x="${(p.x + p.w / 2).toFixed(1)}" y="${(H / 2 - fs * 0.5).toFixed(1)}" text-anchor="middle" font-size="${fs.toFixed(1)}" fill="#222">${escapeXml(p.partName)} — ${fmtD(p.w, units)}</text>`
      )
      .join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${(L / 3).toFixed(0)}"><rect width="100%" height="100%" fill="white"/>${rects}</svg>`;
  }
  const rects = placements
    .map((p, i) => {
      const cx = p.x + p.w / 2;
      const cy = p.y + p.l / 2;
      return `<rect x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" width="${p.w.toFixed(1)}" height="${p.l.toFixed(1)}" fill="${shade(color, 0.35 + (i % 4) * 0.07)}" stroke="#111" stroke-width="${(W / 500).toFixed(2)}"/><text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" font-size="${fs.toFixed(1)}" fill="#222">${escapeXml(p.partName)}${p.rotated ? " [R]" : ""} ${fmtD(p.w, units)}×${fmtD(p.l, units)}</text>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${L}"><rect width="100%" height="100%" fill="white"/><rect x="0" y="0" width="${W}" height="${L}" fill="none" stroke="#333" stroke-width="${(W / 250).toFixed(2)}"/>${rects}</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
