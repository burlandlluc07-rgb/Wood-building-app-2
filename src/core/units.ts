// Unit conversion helpers. Engine works in millimetres; projects choose a
// display unit. Board feet are always computed from imperial dimensions.

import type { Units } from "./types";

export const MM_PER_IN = 25.4;
export const MM_PER_FT = 304.8;
export const MM2_PER_SQFT = 92903.04;
export const MM3_PER_CUFT = 28316846.592;
export const MM3_PER_CUM = 1e9;

export function mmToIn(mm: number): number {
  return mm / MM_PER_IN;
}
export function inToMm(inches: number): number {
  return inches * MM_PER_IN;
}
export function fromDisplay(value: number, units: Units): number {
  return units === "in" ? inToMm(value) : value;
}
export function toDisplay(mm: number, units: Units): number {
  return units === "in" ? mmToIn(mm) : mm;
}
export function dimToDisplay(mm: number, units: Units): number {
  const v = toDisplay(mm, units);
  return units === "in" ? Math.round(v * 1000) / 1000 : Math.round(v * 10) / 10;
}

export function areaSqM(wMm: number, lMm: number): number {
  return (wMm * lMm) / 1e6;
}
export function areaSqFt(wMm: number, lMm: number): number {
  return (wMm * lMm) / MM2_PER_SQFT;
}
export function volumeCubicM(wMm: number, lMm: number, tMm: number): number {
  return (wMm * lMm * tMm) / MM3_PER_CUM;
}
export function volumeCubicFt(wMm: number, lMm: number, tMm: number): number {
  return (wMm * lMm * tMm) / MM3_PER_CUFT;
}
export function lengthM(mm: number): number {
  return mm / 1000;
}
export function lengthFt(mm: number): number {
  return mm / MM_PER_FT;
}

/** Board feet from a nominal thickness (in) and finished width/length (mm). */
export function boardFeet(
  nominalThicknessIn: number,
  widthMm: number,
  lengthMm: number
): number {
  return (
    (nominalThicknessIn * mmToIn(widthMm) * mmToIn(lengthMm)) / 144
  );
}

export function fmtDim(mm: number, units: Units): string {
  const v = toDisplay(mm, units);
  if (units === "in") {
    return `${trimNum(v, 3)}″`;
  }
  return `${trimNum(v, 1)}`;
}
export function trimNum(v: number, decimals = 2): string {
  const f = v.toFixed(decimals);
  return f.replace(/\.?0+$/, "");
}
// App-wide default currency. NestForge is single-currency (no per-project
// override in the schema), so this one constant controls every price
// shown in the UI.
export const CURRENCY_SYMBOL = "R";
export function fmtMoney(v: number, currency = CURRENCY_SYMBOL): string {
  return `${currency}${v.toFixed(2)}`;
}
export function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`;
}
