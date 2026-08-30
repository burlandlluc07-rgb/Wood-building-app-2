"use client";

import { useEffect, useRef, useState } from "react";
import { ClipboardPaste, FileUp, Import, ScanEye } from "lucide-react";
import { api, classNames, type Detail, type PresetRow } from "@/lib/ui";
import type { WsCtx } from "@/components/workspace";

const CLIP_KEY = "nestforge.clipboardWatch";

export function ImportPanel({ ctx }: { ctx: WsCtx }) {
  const { detail, apply, notify } = ctx;
  const project = detail.project;
  const presets = detail.presets as PresetRow[];
  const [presetId, setPresetId] = useState(presets[0]?.id ?? "");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [watch, setWatch] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // "no-click" clipboard capture: when enabled, check the clipboard whenever
  // the window gains focus and offer to import parts-list-shaped data.
  useEffect(() => {
    setWatch(typeof window !== "undefined" && localStorage.getItem(CLIP_KEY) === "1");
  }, []);
  useEffect(() => {
    if (!watch) return;
    const onFocus = async () => {
      try {
        const t = await navigator.clipboard.readText();
        if (!t || t === text || t.length < 5) return;
        const rows = t.trim().split(/\r?\n/);
        const looksTabular =
          rows.length >= 1 && rows.every((r) => (r.match(/[\t,;]/g) ?? []).length >= 2);
        if (looksTabular && /[\d]/.test(t)) {
          setText(t);
          setReport(`Clipboard captured (${rows.length} rows) — review, then Import.`);
        }
      } catch {
        // clipboard denied — ignore
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [watch, text]);

  const toggleWatch = () => {
    const next = !watch;
    setWatch(next);
    localStorage.setItem(CLIP_KEY, next ? "1" : "0");
  };

  const doImport = async () => {
    if (!text.trim() || !presetId) return;
    setBusy(true);
    try {
      const res = await api<Detail & { importReport?: { imported: number; skipped: number } }>(
        "/api/import",
        "POST",
        { projectId: project.id, presetId, text }
      );
      apply(res);
      const r = res.importReport;
      setReport(
        r ? `Imported ${r.imported} parts (${r.skipped} rows skipped). Parts are appended — check the Parts tab.` : "Imported."
      );
      setText("");
      notify("Import complete");
    } catch (e) {
      setReport(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const previewRows = text.trim() ? text.trim().split(/\r?\n/).length : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <div className="space-y-4">
        <div className="rounded-xl border border-edge bg-panel p-4">
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
            Import preset
          </h3>
          <select
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
            className="w-full rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm text-cream"
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {(() => {
            const p = presets.find((x) => x.id === presetId);
            if (!p) return null;
            const cols = Object.entries(p.mapping)
              .sort((a, b) => a[1] - b[1])
              .map(([k, v]) => `${k}←col${v + 1}`)
              .join(" · ");
            return (
              <p className="mt-2 text-[11px] leading-relaxed text-faint">
                delimiter “{p.delimiter === "\t" ? "tab" : p.delimiter}”
                {p.hasHeader ? " · header row" : ""} · {cols}
                {p.options?.skipZeroQty ? " · skips zero-qty" : ""}
                {p.options?.mergeDuplicates ? " · merges duplicates" : ""}
                {p.options?.inferThicknessFromMaterial ? " · infers thickness from material text" : ""}
              </p>
            );
          })()}
          <button
            onClick={toggleWatch}
            className={classNames(
              "mt-3 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs",
              watch ? "border-brand/50 bg-brand/10 text-brand" : "border-edge bg-panel2 text-muted"
            )}
          >
            <ScanEye className="h-4 w-4" />
            {watch
              ? "Clipboard watch: ON — tabular data is captured on focus"
              : "Clipboard watch: OFF — enable to capture copied cutlists automatically"}
          </button>
        </div>
        <div className="rounded-xl border border-edge bg-panel p-4 text-[11px] leading-relaxed text-faint">
          <p className="mb-2 font-semibold text-muted">How presets work</p>
          Presets are data, not code: a named column-mapping plus transforms
          (skip zero-qty, merge duplicates, infer thickness from a material
          string like “ply 18mm”). Match your CAD exporter’s column order once
          and reuse it forever. Rough handling of rows that don’t parse: they
          are counted and skipped, never guessed.
        </div>
      </div>

      <div className="rounded-xl border border-edge bg-panel p-4">
        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 rounded-lg border border-edge bg-panel2 px-3 py-2 text-xs text-muted hover:text-cream"
          >
            <FileUp className="h-3.5 w-3.5" /> Load file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setText(await f.text());
              e.target.value = "";
            }}
          />
          <button
            onClick={async () => {
              try {
                setText(await navigator.clipboard.readText());
              } catch {
                setReport("Clipboard unavailable — paste manually.");
              }
            }}
            className="flex items-center gap-2 rounded-lg border border-edge bg-panel2 px-3 py-2 text-xs text-muted hover:text-cream"
          >
            <ClipboardPaste className="h-3.5 w-3.5" /> From clipboard
          </button>
          <span className="ml-auto text-xs text-faint">
            {previewRows > 0 ? `${previewRows} rows ready. Dims are read in ${project.units === "in" ? "inches" : "mm"} unless the preset overrides.` : "paste or load a cutlist"}
          </span>
          <button
            disabled={busy || !text.trim()}
            onClick={doImport}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40"
          >
            <Import className="h-4 w-4" /> {busy ? "Importing…" : "Import"}
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"name,length,width,thickness,qty,material\nSide,720,300,18,2,Birch Plywood 18mm\nShelf,540,250,18,2,"}
          className="dim h-72 w-full rounded-lg border border-edge bg-panel2 p-3 text-xs text-cream placeholder:text-faint"
        />
        {report && (
          <div className="mt-3 rounded-lg border border-branddim bg-brand/10 px-4 py-2 text-sm text-brand">
            {report}
          </div>
        )}
      </div>
    </div>
  );
}
