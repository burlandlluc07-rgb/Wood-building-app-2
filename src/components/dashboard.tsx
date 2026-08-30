"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Hammer,
  LayoutTemplate,
  Library,
  Plus,
  Ruler,
  Scissors,
  Trash2,
  X,
} from "lucide-react";
import { api, classNames } from "@/lib/ui";

export interface ProjectCard {
  id: string;
  name: string;
  units: "mm" | "in";
  isTemplate: boolean;
  updatedAt: string;
  layoutCount: number;
}

export function Dashboard({
  projects,
  templates,
  materialsCount,
}: {
  projects: ProjectCard[];
  templates: ProjectCard[];
  materialsCount: number;
}) {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [units, setUnits] = useState<"mm" | "in">("mm");
  const [templateId, setTemplateId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const p = await api<{ id: string }>("/api/projects", "POST", {
        name: name || "Untitled Project",
        units,
        copyFromId: templateId || undefined,
      });
      router.push(`/projects/${p.id}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this project and its layouts?")) return;
    await api(`/api/projects/${id}`, "DELETE");
    router.refresh();
  };

  const duplicate = async (id: string) => {
    await api(`/api/projects/${id}`, "PATCH", { action: "duplicate" });
    router.refresh();
  };

  const saveAsTemplate = async (id: string, currentName: string) => {
    await api(`/api/projects/${id}`, "PATCH", {
      action: "duplicate",
      name: `${currentName} — template`,
      isTemplate: true,
    });
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      {/* brand */}
      <header className="mb-12 flex items-end justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-branddim text-ink">
              <Scissors className="h-5 w-5" strokeWidth={2.4} />
            </div>
            <h1 className="wordmark text-4xl font-bold text-cream">
              Nest<span className="text-brand">Forge</span>
            </h1>
          </div>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            Cut lists, guillotine layouts, 1D cutting stock and board-foot
            yield for the modern shop — sheet goods, dimensioned lumber and
            rough-milled stock, each optimized the way the material actually
            behaves.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/materials"
            className="flex items-center gap-2 rounded-lg border border-edge bg-panel px-4 py-2.5 text-sm text-cream card-hover"
          >
            <Library className="h-4 w-4 text-brand" />
            Materials library
            <span className="dim rounded bg-panel3 px-1.5 py-0.5 text-xs text-muted">
              {materialsCount}
            </span>
          </Link>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-ink card-hover"
          >
            <Plus className="h-4 w-4" strokeWidth={2.6} />
            New project
          </button>
        </div>
      </header>

      {/* projects */}
      <section>
        <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-faint">
          <Hammer className="h-3.5 w-3.5" /> Projects
        </div>
        {projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-edge2 p-10 text-center text-sm text-muted">
            No projects yet — create one to start nesting.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <div
                key={p.id}
                className="group relative rounded-xl border border-edge bg-panel p-5 card-hover"
              >
                <Link href={`/projects/${p.id}`} className="block">
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-panel3 text-brand">
                    <Boxes className="h-4.5 w-4.5" />
                  </div>
                  <div className="truncate text-base font-semibold text-cream">
                    {p.name}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted">
                    <span className="flex items-center gap-1">
                      <Ruler className="h-3 w-3" /> {p.units === "in" ? "inches" : "millimetres"}
                    </span>
                    <span className="dim">{p.layoutCount} layouts</span>
                  </div>
                  <div className="mt-1 text-[11px] text-faint">
                    edited {new Date(p.updatedAt).toLocaleDateString()}
                  </div>
                </Link>
                <div className="absolute right-3 top-3 hidden gap-1 group-hover:flex">
                  <button
                    title="Save as template"
                    onClick={() => saveAsTemplate(p.id, p.name)}
                    className="rounded-md border border-edge bg-panel2 p-1.5 text-muted hover:text-brand"
                  >
                    <LayoutTemplate className="h-3.5 w-3.5" />
                  </button>
                  <button
                    title="Duplicate"
                    onClick={() => duplicate(p.id)}
                    className="rounded-md border border-edge bg-panel2 p-1.5 text-muted hover:text-brand"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    title="Delete"
                    onClick={() => remove(p.id)}
                    className="rounded-md border border-edge bg-panel2 p-1.5 text-muted hover:text-bad"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* templates */}
      <section className="mt-12">
        <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-faint">
          <LayoutTemplate className="h-3.5 w-3.5" /> Project templates
        </div>
        {templates.length === 0 ? (
          <p className="text-sm text-faint">
            Hover a project and hit the template icon to make a repeatable
            starting point (perfect for standard cabinet carcases).
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTemplateId(t.id);
                  setName("");
                  setShowNew(true);
                }}
                className="flex items-center gap-2 rounded-lg border border-dashed border-edge2 bg-panel px-4 py-2.5 text-sm text-muted card-hover hover:text-cream"
              >
                <LayoutTemplate className="h-4 w-4 text-brand" />
                {t.name.replace(/ — template$/, "")}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* new project modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-edge bg-panel2 p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold">New project</h2>
              <button onClick={() => setShowNew(false)} className="text-muted hover:text-cream">
                <X className="h-5 w-5" />
              </button>
            </div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-faint">
              Name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kitchen carcases, unit 4"
              className="mb-4 w-full rounded-lg border border-edge bg-panel px-3 py-2.5 text-sm text-cream"
            />
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-faint">
              Units
            </label>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {(["mm", "in"] as const).map((u) => (
                <button
                  key={u}
                  onClick={() => setUnits(u)}
                  className={classNames(
                    "rounded-lg border px-3 py-2 text-sm",
                    units === u
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-edge bg-panel text-muted"
                  )}
                >
                  {u === "mm" ? "Millimetres" : "Inches"}
                </button>
              ))}
            </div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-faint">
              Start from template
            </label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="mb-6 w-full rounded-lg border border-edge bg-panel px-3 py-2.5 text-sm text-cream"
            >
              <option value="">Blank project</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name.replace(/ — template$/, "")}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNew(false)}
                className="rounded-lg border border-edge px-4 py-2 text-sm text-muted"
              >
                Cancel
              </button>
              <button
                disabled={busy}
                onClick={create}
                className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-ink disabled:opacity-50"
              >
                {busy ? "Creating…" : "Create project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
