"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  FileInput,
  Layers3,
  ListChecks,
  LucideBoxes,
  Play,
  Settings2,
  Smartphone,
} from "lucide-react";
import { api, classNames, fmtMoney, type Detail, type MaterialRow } from "@/lib/ui";
import { PartsPanel } from "@/components/parts-panel";
import { LayoutsPanel } from "@/components/layouts-panel";
import { BomPanel } from "@/components/bom-panel";
import { ImportPanel } from "@/components/import-panel";
import { StockPanel } from "@/components/stock-panel";

export type Tab = "parts" | "layouts" | "bom" | "stock" | "import";

export interface WsCtx {
  detail: Detail;
  apply: (d: Detail) => void;
  reoptimize: (scope?: string[] | null) => Promise<void>;
  notify: (msg: string) => void;
  busy: boolean;
  resolveMid: (p: { materialId: string | null; materialRole: "primary" | "secondary" | null }) => string | null;
}

const PHYSICAL = ["sheet_good", "dimensioned_lumber", "rough_lumber"];

export function Workspace({ initial }: { initial: Detail }) {
  const [detail, setDetail] = useState<Detail>(initial);
  const [tab, setTab] = useState<Tab>("parts");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const project = detail.project;
  const physicalMaterials = useMemo(
    () => detail.materials.filter((m) => PHYSICAL.includes(m.type)),
    [detail.materials]
  );

  const apply = (d: Detail) => setDetail(d);
  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const reoptimize = async (scope?: string[] | null) => {
    setBusy(true);
    try {
      const res = await api<Detail>(`/api/projects/${project.id}/optimize`, "POST", {
        scope: scope ?? null,
      });
      apply(res);
      notify(
        scope && scope.length > 0
          ? `Reoptimized ${scope.length} material group${scope.length > 1 ? "s" : ""} — everything else left exactly as it was`
          : "Full optimization complete — every material re-solved (pinned diagrams preserved)"
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : "Optimize failed");
    } finally {
      setBusy(false);
    }
  };

  const resolveMid = (p: {
    materialId: string | null;
    materialRole: "primary" | "secondary" | null;
  }): string | null => {
    if (p.materialRole === "primary") return project.primaryMaterialId;
    if (p.materialRole === "secondary") return project.secondaryMaterialId;
    return p.materialId;
  };

  const patchProject = async (
    fields: Record<string, unknown>,
    opts?: { resync?: boolean }
  ) => {
    const res = await api<Detail>(`/api/projects/${project.id}`, "PATCH", fields);
    apply(res);
    if (opts?.resync) await reoptimize(null);
  };

  const setRole = async (role: "primary" | "secondary", materialId: string | null) => {
    const before = [
      project.primaryMaterialId,
      project.secondaryMaterialId,
    ].filter(Boolean) as string[];
    const res = await api<Detail>(`/api/projects/${project.id}`, "PATCH", {
      [role === "primary" ? "primaryMaterialId" : "secondaryMaterialId"]: materialId,
    });
    apply(res);
    const after = [materialId].filter(Boolean) as string[];
    const scope = [...new Set([...before, ...after])];
    if (scope.length > 0) await reoptimize(scope);
    notify(
      materialId
        ? `${role === "primary" ? "Primary" : "Secondary"} material swapped — every affected part re-fit and re-costed`
        : `${role} role cleared`
    );
  };

  const ctx: WsCtx = { detail, apply, reoptimize, notify, busy, resolveMid };

  const roleMaterial = (id: string | null): MaterialRow | undefined =>
    detail.materials.find((m) => m.id === id);

  const stats = detail.bom.stats;

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-6">
      {/* header */}
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg border border-edge bg-panel px-3 py-2 text-sm text-muted card-hover hover:text-cream"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <input
          defaultValue={project.name}
          onBlur={(e) => e.target.value && patchProject({ name: e.target.value })}
          className="wordmark w-64 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-xl font-bold text-cream hover:border-edge focus:border-brand"
        />
        <span className="dim rounded bg-panel px-2 py-1 text-xs text-muted">
          {project.units === "in" ? "inches" : "mm"} · kerf {project.kerf}mm
        </span>

        {/* primary / secondary role mapping */}
        <div className="ml-2 flex items-center gap-2 rounded-xl border border-branddim/60 bg-brand/5 px-3 py-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand">
            Roles
          </span>
          {(["primary", "secondary"] as const).map((role) => (
            <select
              key={role}
              value={(role === "primary" ? project.primaryMaterialId : project.secondaryMaterialId) ?? ""}
              onChange={(e) => setRole(role, e.target.value || null)}
              className={classNames(
                "rounded-lg border bg-panel px-2 py-1.5 text-xs",
                role === "primary"
                  ? "border-brand/50 text-brand"
                  : "border-edge2 text-cream"
              )}
              title={`${role} material — every part with this role instantly re-fits and re-costs when changed`}
            >
              <option value="">{role} — unmapped</option>
              {physicalMaterials.map((m) => (
                <option key={m.id} value={m.id}>
                  {role === "primary" ? "◆" : "◇"} {m.name}
                </option>
              ))}
            </select>
          ))}
          {roleMaterial(project.primaryMaterialId) && (
            <span
              className="h-3 w-3 rounded-full"
              style={{ background: roleMaterial(project.primaryMaterialId)?.color }}
            />
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowSettings((s) => !s)}
            className="flex items-center gap-2 rounded-lg border border-edge bg-panel px-3 py-2 text-sm text-muted card-hover hover:text-cream"
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <Link
            href={`/projects/${project.id}/shop`}
            className="flex items-center gap-2 rounded-lg border border-edge bg-panel px-3 py-2 text-sm text-muted card-hover hover:text-cream"
          >
            <Smartphone className="h-4 w-4" /> Shop mode
          </Link>
          <button
            disabled={busy}
            onClick={() => reoptimize(null)}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-ink card-hover disabled:opacity-50"
          >
            <Play className="h-4 w-4" strokeWidth={2.6} />
            {busy ? "Optimizing…" : "Optimize"}
          </button>
        </div>
      </header>

      {/* settings drawer */}
      {showSettings && (
        <div className="mb-5 grid gap-3 rounded-xl border border-edge bg-panel p-4 sm:grid-cols-3 lg:grid-cols-6">
          <SetField label="Kerf (mm)">
            <input
              type="number"
              step="0.1"
              defaultValue={project.kerf}
              onBlur={(e) =>
                patchProject({ kerf: Number(e.target.value) }, { resync: true })
              }
              className="dim w-full rounded-lg border border-edge bg-panel2 px-2 py-1.5 text-sm"
            />
          </SetField>
          <SetField label="Objective">
            <select
              value={project.objective}
              onChange={(e) => patchProject({ objective: e.target.value }, { resync: true })}
              className="w-full rounded-lg border border-edge bg-panel2 px-2 py-1.5 text-sm"
            >
              <option value="waste">Min waste</option>
              <option value="cost">Min cost</option>
              <option value="count">Min sheet count</option>
            </select>
          </SetField>
          <SetField label="First cut (default)">
            <select
              value={project.firstCutDirection}
              onChange={(e) =>
                patchProject({ firstCutDirection: e.target.value }, { resync: true })
              }
              className="w-full rounded-lg border border-edge bg-panel2 px-2 py-1.5 text-sm"
            >
              <option value="either">Either</option>
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
            </select>
          </SetField>
          <SetField label="Rough yield %">
            <input
              type="number"
              defaultValue={project.defaultYieldPct}
              onBlur={(e) => patchProject({ defaultYieldPct: Number(e.target.value) })}
              className="dim w-full rounded-lg border border-edge bg-panel2 px-2 py-1.5 text-sm"
            />
          </SetField>
          <SetField label="Offcuts first">
            <button
              onClick={() =>
                patchProject({ useOffcutsFirst: !project.useOffcutsFirst }, { resync: true })
              }
              className={classNames(
                "flex w-full items-center justify-center gap-1 rounded-lg border py-1.5 text-sm",
                project.useOffcutsFirst
                  ? "border-good/50 bg-good/10 text-good"
                  : "border-edge bg-panel2 text-muted"
              )}
            >
              {project.useOffcutsFirst && <Check className="h-3.5 w-3.5" />}
              {project.useOffcutsFirst ? "On" : "Off"}
            </button>
          </SetField>
          <SetField label="Costing mode">
            <button
              onClick={() => patchProject({ roundUpCosts: !project.roundUpCosts })}
              className="w-full rounded-lg border border-edge bg-panel2 py-1.5 text-sm text-cream"
            >
              {project.roundUpCosts ? "Round up (buy)" : "Pro-rated (consumed)"}
            </button>
          </SetField>
        </div>
      )}

      {/* KPI strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Kpi label="Cut parts" value={`${detail.bom.stats.partsTotal}`} />
        <Kpi label="2D sheets" value={`${stats.sheetsCount}`} />
        <Kpi label="1D sticks" value={`${stats.stripsCount}`} />
        <Kpi label="Avg stock use" value={`${stats.avgUsedPct.toFixed(1)}%`} />
        <Kpi
          label={project.roundUpCosts ? "Materials (buy)" : "Materials (consumed)"}
          value={fmtMoney(project.roundUpCosts ? detail.bom.totals.materialsRoundUp : detail.bom.totals.materialsProRated)}
          accent
        />
        <Kpi
          label="Project total"
          value={fmtMoney(project.roundUpCosts ? detail.bom.totals.grandRoundUp : detail.bom.totals.grandProRated)}
          accent
        />
      </div>

      {/* tabs */}
      <nav className="mb-5 flex items-center gap-1 rounded-xl border border-edge bg-panel p-1">
        {(
          [
            ["parts", LucideBoxes, "Parts"],
            ["layouts", Layers3, "Layouts"],
            ["bom", ListChecks, "BOM & costs"],
            ["stock", Layers3, "Offcuts"],
            ["import", FileInput, "Import"],
          ] as const
        ).map(([key, Icon, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={classNames(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              tab === key
                ? "bg-panel3 text-brand"
                : "text-muted hover:text-cream"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            {key === "layouts" && detail.analysis.skipped.length > 0 && (
              <span className="rounded-full bg-bad/20 px-1.5 text-[10px] font-bold text-bad">
                {detail.analysis.skipped.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      {tab === "parts" && <PartsPanel ctx={ctx} />}
      {tab === "layouts" && <LayoutsPanel ctx={ctx} />}
      {tab === "bom" && <BomPanel ctx={ctx} />}
      {tab === "stock" && <StockPanel ctx={ctx} />}
      {tab === "import" && <ImportPanel ctx={ctx} />}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-branddim bg-panel2 px-5 py-3 text-sm text-brand shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-edge bg-panel px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
        {label}
      </div>
      <div className={classNames("dim mt-1 text-lg font-semibold", accent ? "text-brand" : "text-cream")}>
        {value}
      </div>
    </div>
  );
}

function SetField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
        {label}
      </span>
      {children}
    </label>
  );
}
