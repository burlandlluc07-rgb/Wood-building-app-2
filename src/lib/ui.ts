// Client-side helpers shared by UI components.
import type { ProjectDetail } from "@/lib/detail";
import type { NominalThicknessEntry } from "@/core/types";
import { CURRENCY_SYMBOL, dimToDisplay, fmtMoney, fromDisplay, toDisplay } from "@/core/units";

export type Detail = ProjectDetail;
export type ProjectRow = Detail["project"];
export type MaterialRow = Detail["materials"][number];
export type PartRow = Detail["parts"][number];
export type SheetRow = Detail["sheets"][number];
export type HardwareRow = Detail["hardware"][number];
export type StockRow = Detail["stockItems"][number];
export type PresetRow = Detail["presets"][number];
export type { NominalThicknessEntry };

export { CURRENCY_SYMBOL, dimToDisplay, fmtMoney, fromDisplay, toDisplay };

export function fmtD(mm: number, units: "mm" | "in"): string {
  const v = dimToDisplay(mm, units);
  return units === "in" ? `${v}″` : `${v}`;
}

export async function api<T = unknown>(
  url: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: unknown
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export function classNames(...xs: (string | false | null | undefined)[]): string {
  return xs.filter(Boolean).join(" ");
}

export const TYPE_LABELS: Record<string, string> = {
  sheet_good: "Sheet good",
  dimensioned_lumber: "Dimensioned lumber",
  rough_lumber: "Rough lumber",
  hardware: "Hardware",
  labor: "Labor",
  banding: "Banding",
  other: "Other",
};

export const COST_UNITS = [
  "per_sheet",
  "per_sqm",
  "per_sqft",
  "per_linear_m",
  "per_linear_ft",
  "per_unit",
  "per_hour",
  "board_foot",
  "cubic_ft",
  "cubic_m",
] as const;
