"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  Download,
  Layers,
  Plus,
  Ruler,
  Trash2,
  Upload,
} from "lucide-react";
import {
  COST_UNITS,
  TYPE_LABELS,
  api,
  classNames,
  type NominalThicknessEntry,
} from "@/lib/ui";
import { COST_UNIT_LABELS } from "@/core/pricing/pricing";

interface MaterialVM {
  id: string;
  name: string;
  type: string;
  cost: number;
  costUnit: string;
  thickness: number | null;
  width: number | null;
  canBuyMore: boolean;
  firstCutDirection: string | null;
  yieldPercent: number | null;
  color: string;
  vendor: string | null;
  notes: string | null;
}

interface StockVM {
  id: string;
  materialId: string;
  kind: string;
  width: number;
  length: number;
  quantity: number;
  projectId: string | null;
  label: string | null;
  createdAt: string;
}

const TYPE_HINTS: Record<string, string> = {
  sheet_good: "2D guillotine layouts onto known panel sizes",
  dimensioned_lumber: "1D cutting-stock plan across stock lengths",
  rough_lumber: "Board-foot totals × yield — no diagram (yard stock is random)",
  hardware: "Cost-only line",
  labor: "Cost-only line",
  banding: "Cost-only line / edging runs",
  other: "Cost-only line",
};

// Pulls a thickness mention out of a material name, e.g. "Baltic Birch
// Plywood 18mm" -> 18, or "3/4in MDF" -> 19.05 (converted to mm). Returns
// null when the name doesn't mention a thickness at all, so materials that
// simply don't name their thickness never trigger the mismatch warning.
function parseNamedThicknessMm(name: string): number | null {
  const mm = name.match(/(\d+(?:\.\d+)?)\s*mm\b/i);
  if (mm) return Number(mm[1]);

  const fractionIn = name.match(/(\d+)\s*\/\s*(\d+)\s*(?:"|in\b|inch(?:es)?\b)/i);
  if (fractionIn) {
    const [, num, den] = fractionIn;
    return (Number(num) / Number(den)) * 25.4;
  }

  const decimalIn = name.match(/(\d+(?:\.\d+)?)\s*(?:"|in\b|inch(?:es)?\b)/i);
  if (decimalIn) return Number(decimalIn[1]) * 25.4;

  return null;
}

export function MaterialsLibrary({
  initialMaterials,
  initialStock,
  initialNominalTable,
}: {
  initialMaterials: MaterialVM[];
  initialStock: StockVM[];
  initialNominalTable: NominalThicknessEntry[];
}) {
  const [mats, setMats] = useState(initialMaterials);
  const [stock, setStock] = useState(initialStock);
  const [table, setTable] = useState(initialNominalTable);
  const [sel, setSel] = useState<string | null>(initialMaterials[0]?.id ?? null);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => mats.find((m) => m.id === sel) ?? null, [mats, sel]);
  const selStock = useMemo(
    () => stock.filter((s) => s.materialId === sel),
    [stock, sel]
  );

  const refresh = async () => {
    const data = await api<{ materials: MaterialVM[]; stockItems: StockVM[] }>(
      "/api/materials"
    );
    setMats(data.materials as MaterialVM[]);
    setStock(data.stockItems as StockVM[]);
  };

  const addMaterial = async () => {
    const m = await api<MaterialVM>("/api/materials", "POST", {
      name: "New material",
      type: "sheet_good",
    });
    await refresh();
    setSel(m.id);
  };

  const patch = async (id: string, fields: Record<string, unknown>) => {
    await api(`/api/materials/${id}`, "PATCH", fields);
    await refresh();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete material? Parts using it become unassigned.")) return;
    await api(`/api/materials/${id}`, "DELETE");
    if (sel === id) setSel(null);
    await refresh();
  };

  const addStock = async (kind: string) => {
    if (!selected) return;
    const isLinear = selected.type === "dimensioned_lumber";
    await api("/api/stock", "POST", {
      materialId: selected.id,
      kind,
      width: isLinear ? selected.width ?? 89 : 1220,
      length: 2440,
      quantity: 1,
    });
    await refresh();
  };

  const patchStock = async (id: string, fields: Record<string, unknown>) => {
    await api("/api/stock", "PATCH", { id, ...fields });
    await refresh();
  };

  const deleteStock = async (id: string) => {
    await api("/api/stock", "DELETE", { id });
    await refresh();
  };

  const saveTable = async (t: NominalThicknessEntry[]) => {
    setTable(t);
    await api("/api/settings", "PATCH", { nominalTable: t });
  };

  const exportLibrary = () => {
    window.open("/api/export/materials", "_blank");
  };

  const importLibrary = async (file: File) => {
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      const res = await api<{ imported: number; stockImported: number }>(
        "/api/materials",
        "POST",
        {
          action: "import",
          materials: parsed.materials ?? [],
          stockItems: parsed.stockItems ?? [],
        }
      );
      setMsg(`Imported ${res.imported} materials and ${res.stockImported} stock sizes.`);
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Import failed");
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg border border-edge bg-panel px-3 py-2 text-sm text-muted card-hover hover:text-cream"
          >
            <ArrowLeft className="h-4 w-4" /> Projects
          </Link>
          <div>
            <h1 className="wordmark text-2xl font-bold">Materials library</h1>
            <p className="text-xs text-muted">
              Shop-wide species, sheet goods, stock sizes, pricing and yields.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportLibrary}
            className="flex items-center gap-2 rounded-lg border border-edge bg-panel px-3 py-2 text-sm text-muted card-hover hover:text-cream"
          >
            <Download className="h-4 w-4" /> Backup
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 rounded-lg border border-edge bg-panel px-3 py-2 text-sm text-muted card-hover hover:text-cream"
          >
            <Upload className="h-4 w-4" /> Restore
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importLibrary(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={addMaterial}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-ink card-hover"
          >
            <Plus className="h-4 w-4" strokeWidth={2.6} /> Add material
          </button>
        </div>
      </header>

      {msg && (
        <div className="mb-4 rounded-lg border border-branddim bg-brand/10 px-4 py-2 text-sm text-brand">
          {msg}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        {/* list */}
        <div className="space-y-2">
          {mats.map((m) => (
            <button
              key={m.id}
              onClick={() => setSel(m.id)}
              className={classNames(
                "w-full rounded-xl border p-3.5 text-left card-hover",
                sel === m.id
                  ? "border-brand/60 bg-panel2"
                  : "border-edge bg-panel"
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className="h-8 w-8 shrink-0 rounded-md border border-black/40"
                  style={{ background: m.color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-cream">
                    {m.name}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                    <span>{TYPE_LABELS[m.type]}</span>
                    <span className="dim">
                      ${m.cost} {COST_UNIT_LABELS[m.costUnit as keyof typeof COST_UNIT_LABELS] ?? m.costUnit}
                    </span>
                  </div>
                </div>
                {!m.canBuyMore && (
                  <span className="rounded bg-panel3 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-bad">
                    no buy-more
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* editor */}
        <div>
          {selected ? (
            <div className="space-y-6">
              {(() => {
                const namedThicknessMm = parseNamedThicknessMm(selected.name);
                const thicknessMismatch =
                  namedThicknessMm !== null &&
                  selected.thickness !== null &&
                  Math.abs(namedThicknessMm - selected.thickness) > 0.5;
                return thicknessMismatch ? (
                  <div className="flex items-start gap-2 rounded-lg border border-bad/50 bg-bad/10 px-3 py-2 text-xs text-bad">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Name says <strong>{namedThicknessMm}mm</strong> but the thickness field is set
                      to <strong>{selected.thickness}mm</strong>. Double-check which one is right.
                    </span>
                  </div>
                ) : null;
              })()}
              <div className="rounded-xl border border-edge bg-panel p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-base font-semibold">{selected.name}</h2>
                  <button
                    onClick={() => remove(selected.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-edge px-2.5 py-1.5 text-xs text-muted hover:text-bad"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Name">
                    <input
                      className="w-full rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm"
                      defaultValue={selected.name}
                      onBlur={(e) => patch(selected.id, { name: e.target.value })}
                    />
                  </Field>
                  <Field label="Material type">
                    <select
                      className="w-full rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm"
                      value={selected.type}
                      onChange={(e) => patch(selected.id, { type: e.target.value })}
                    >
                      {Object.entries(TYPE_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Cost">
                    <input
                      type="number"
                      step="0.01"
                      className="dim w-full rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm"
                      defaultValue={selected.cost}
                      onBlur={(e) => patch(selected.id, { cost: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Cost unit">
                    <select
                      className="w-full rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm"
                      value={selected.costUnit}
                      onChange={(e) => patch(selected.id, { costUnit: e.target.value })}
                    >
                      {COST_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {COST_UNIT_LABELS[u]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Thickness (mm)">
                    <input
                      type="number"
                      step="0.1"
                      className="dim w-full rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm"
                      defaultValue={selected.thickness ?? ""}
                      onBlur={(e) =>
                        patch(selected.id, {
                          thickness: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </Field>
                  {selected.type === "dimensioned_lumber" && (
                    <Field label="Cross-section width (mm)">
                      <input
                        type="number"
                        step="0.1"
                        className="dim w-full rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm"
                        defaultValue={selected.width ?? ""}
                        onBlur={(e) =>
                          patch(selected.id, {
                            width: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                      />
                    </Field>
                  )}
                  <Field label="Swatch">
                    <input
                      type="color"
                      className="h-9 w-full rounded-lg border border-edge bg-panel2 p-1"
                      defaultValue={selected.color}
                      onBlur={(e) => patch(selected.id, { color: e.target.value })}
                    />
                  </Field>
                  {(selected.type === "sheet_good" || selected.type === "dimensioned_lumber") && (
                    <Field label="First cut direction">
                      <select
                        className="w-full rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm"
                        value={selected.firstCutDirection ?? ""}
                        onChange={(e) =>
                          patch(selected.id, {
                            firstCutDirection: e.target.value || null,
                          })
                        }
                      >
                        <option value="">Project default</option>
                        <option value="horizontal">Horizontal first</option>
                        <option value="vertical">Vertical first</option>
                        <option value="either">Either</option>
                      </select>
                    </Field>
                  )}
                  {selected.type === "rough_lumber" && (
                    <Field label="Yield % override">
                      <input
                        type="number"
                        step="1"
                        className="dim w-full rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm"
                        defaultValue={selected.yieldPercent ?? ""}
                        placeholder="project default"
                        onBlur={(e) =>
                          patch(selected.id, {
                            yieldPercent: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                      />
                    </Field>
                  )}
                  <Field label="Vendor">
                    <input
                      className="w-full rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm"
                      defaultValue={selected.vendor ?? ""}
                      onBlur={(e) => patch(selected.id, { vendor: e.target.value || null })}
                    />
                  </Field>
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-[11px] text-faint">
                  <Ruler className="h-3 w-3" /> {TYPE_HINTS[selected.type]}
                </p>
                {/* can buy more gate */}
                <button
                  onClick={() => patch(selected.id, { canBuyMore: !selected.canBuyMore })}
                  className={classNames(
                    "mt-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                    selected.canBuyMore
                      ? "border-edge bg-panel2 text-cream"
                      : "border-bad/50 bg-bad/10 text-bad"
                  )}
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  {selected.canBuyMore
                    ? "Can buy more: ON — optimizer may assume infinite purchasable stock"
                    : "Can buy more: OFF — on-hand inventory only; overflow goes to skipped parts"}
                </button>
              </div>

              {/* stock sizes */}
              <div className="rounded-xl border border-edge bg-panel p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-widest text-muted">
                    Stock sizes
                  </h3>
                  <div className="flex gap-2">
                    {(
                      [
                        ["raw_stock", "Raw on hand"],
                        ["new_stock", "Purchasable size"],
                        ["offcut", "Offcut"],
                      ] as const
                    ).map(([kind, label]) => (
                      <button
                        key={kind}
                        onClick={() => addStock(kind)}
                        className="flex items-center gap-1 rounded-lg border border-edge bg-panel2 px-2.5 py-1.5 text-xs text-muted hover:text-brand"
                      >
                        <Plus className="h-3 w-3" /> {label}
                      </button>
                    ))}
                  </div>
                </div>
                {selStock.length === 0 ? (
                  <p className="text-sm text-faint">
                    No sizes yet — add at least one purchasable size or on-hand
                    stock, or parts in this material will be skipped.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wider text-faint">
                        <th className="pb-2">Kind</th>
                        <th className="pb-2">Width (mm)</th>
                        <th className="pb-2">Length (mm)</th>
                        <th className="pb-2">Qty</th>
                        <th className="pb-2">Label</th>
                        <th className="pb-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {selStock.map((s) => (
                        <tr key={s.id} className="border-t border-edge/60">
                          <td className="py-2">
                            <span
                              className={classNames(
                                "rounded px-1.5 py-0.5 text-[11px] font-medium",
                                s.kind === "offcut"
                                  ? "bg-good/15 text-good"
                                  : s.kind === "raw_stock"
                                    ? "bg-brand/15 text-brand"
                                    : "bg-panel3 text-muted"
                              )}
                            >
                              {s.kind.replace("_", " ")}
                            </span>
                          </td>
                          {(["width", "length", "quantity"] as const).map((k) => (
                            <td key={k} className="py-2 pr-3">
                              <input
                                type="number"
                                className="dim w-24 rounded border border-edge bg-panel2 px-2 py-1 text-sm"
                                defaultValue={s[k]}
                                onBlur={(e) =>
                                  patchStock(s.id, { [k]: Number(e.target.value) })
                                }
                              />
                            </td>
                          ))}
                          <td className="py-2 pr-3">
                            <input
                              className="w-28 rounded border border-edge bg-panel2 px-2 py-1 text-sm"
                              defaultValue={s.label ?? ""}
                              onBlur={(e) => patchStock(s.id, { label: e.target.value || null })}
                            />
                          </td>
                          <td className="py-2 text-right">
                            <button
                              onClick={() => deleteStock(s.id)}
                              className="text-faint hover:text-bad"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-edge2 text-sm text-faint">
              Select a material to edit it
            </div>
          )}

          {/* nominal thickness table */}
          <div className="mt-6 rounded-xl border border-edge bg-panel p-5">
            <div className="mb-2 flex items-center gap-2">
              <Layers className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-semibold uppercase tracking-widest text-muted">
                Rough lumber — nominal thickness lookup
              </h3>
            </div>
            <p className="mb-4 text-xs text-faint">
              Rough stock is priced by nominal “quarter” thickness (4/4, 5/4…)
              but a milled part is always thinner. The optimizer picks the
              smallest nominal size whose typical actual thickness covers each
              part. Mills vary — edit freely.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {table.map((e, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-edge bg-panel2 p-2">
                  <input
                    className="dim w-16 rounded border border-edge bg-panel px-2 py-1.5 text-sm text-center"
                    defaultValue={e.label}
                    onBlur={(ev) => {
                      const t = [...table];
                      t[i] = { ...t[i], label: ev.target.value };
                      void saveTable(t);
                    }}
                  />
                  <span className="text-xs text-faint">→</span>
                  <input
                    type="number"
                    step="0.0625"
                    className="dim w-24 rounded border border-edge bg-panel px-2 py-1.5 text-sm"
                    defaultValue={e.actualIn}
                    onBlur={(ev) => {
                      const t = [...table];
                      t[i] = { ...t[i], actualIn: Number(ev.target.value) };
                      void saveTable(t);
                    }}
                  />
                  <span className="text-xs text-faint">in actual</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-faint">
        {label}
      </span>
      {children}
    </label>
  );
}
