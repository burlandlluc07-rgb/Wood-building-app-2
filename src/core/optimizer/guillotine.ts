// 2D guillotine bin-packer for sheet goods.
// Free-rectangle subdivision where every split is a full through-cut
// (kerf-aware), keeping the layout physically cuttable on a panel saw.
// Supports rotation rules, grain constraints, per-material first-cut
// direction forcing, and equal-cost layout style variants (mirrors).

import type {
  FirstCutDirection,
  Objective,
  PackTotals,
  PlacementOut,
  ResolvedPart,
  SheetOut,
  SkippedPart,
  StockCandidate,
} from "../types";

interface FreeRect {
  x: number;
  y: number;
  w: number;
  l: number;
}

interface OpenSheet {
  candidate: StockCandidate;
  tierRank: number;
  rects: FreeRect[];
  placements: PlacementOut[];
  firstCutDone: boolean;
  usedArea: number;
}

export interface GuillotineOptions {
  kerf: number;
  materialId: string;
  firstCutDirection: FirstCutDirection;
  objective: Objective;
  reasons: { oversize: string; inventory: string };
}

interface Item {
  part: ResolvedPart;
}

const EPS = 1e-6;

function orientationAllowed(part: ResolvedPart, rotated: boolean): boolean {
  if (part.grain === "length") return !rotated;
  if (part.grain === "width") return rotated;
  if (!part.canRotate) return !rotated;
  return true;
}

function fits(
  part: ResolvedPart,
  rect: FreeRect,
  rotated: boolean
): { w: number; l: number } | null {
  const w = rotated ? part.length : part.width;
  const l = rotated ? part.width : part.length;
  if (w <= rect.w + EPS && l <= rect.l + EPS) return { w, l };
  return null;
}

/** Split a free rect around a freshly placed part with kerf-compensated
 *  full-length guillotine cuts. "H-first" = first through-cut is horizontal
 *  (produces a full-width strip above); "V-first" = vertical. */
function splitRect(
  rect: FreeRect,
  pw: number,
  pl: number,
  kerf: number,
  horizontalFirst: boolean
): FreeRect[] {
  const out: FreeRect[] = [];
  if (horizontalFirst) {
    // strip remainder to the right of the part (within strip height pl)
    out.push({
      x: rect.x + pw + kerf,
      y: rect.y,
      w: rect.w - pw - kerf,
      l: pl,
    });
    // full-width strip above
    out.push({
      x: rect.x,
      y: rect.y + pl + kerf,
      w: rect.w,
      l: rect.l - pl - kerf,
    });
  } else {
    // column remainder above the part (within column width pw)
    out.push({
      x: rect.x,
      y: rect.y + pl + kerf,
      w: pw,
      l: rect.l - pl - kerf,
    });
    // full-height column to the right
    out.push({
      x: rect.x + pw + kerf,
      y: rect.y,
      w: rect.w - pw - kerf,
      l: rect.l,
    });
  }
  return out.filter((r) => r.w > EPS && r.l > EPS);
}

/** Heuristic quality of a set of free rects: prefers keeping a big,
 *  well-proportioned remainder. */
function rectSetScore(rects: FreeRect[]): number {
  let best = 0;
  for (const r of rects) {
    const s = Math.min(r.w, r.l);
    if (s > best) best = s;
  }
  return best;
}

function orderCandidates(
  candidates: StockCandidate[],
  objective: Objective
): StockCandidate[] {
  const tier = (k: string) =>
    k === "offcut" ? 0 : k === "raw_stock" ? 1 : 2;
  const sorted = [...candidates].sort((a, b) => {
    const t = tier(a.kind) - tier(b.kind);
    if (t !== 0) return t;
    if (objective === "cost") {
      if (a.unitCost !== b.unitCost) return a.unitCost - b.unitCost;
      return b.width * b.length - a.width * a.length;
    }
    if (objective === "count") {
      return b.width * b.length - a.width * a.length;
    }
    // waste: tightest sufficient sheet first
    return a.width * a.length - b.width * b.length;
  });
  return sorted;
}

function mirrorX(p: PlacementOut, sheetW: number): PlacementOut {
  return { ...p, x: sheetW - p.x - p.w, styleIdx: 1 };
}
function mirrorY(p: PlacementOut, sheetL: number): PlacementOut {
  return { ...p, y: sheetL - p.y - p.l, styleIdx: 2 };
}

function signature(placements: PlacementOut[]): string {
  return placements
    .map(
      (p) =>
        `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.w.toFixed(1)},${p.l.toFixed(1)},${p.rotated ? 1 : 0}`
    )
    .sort()
    .join("|");
}

function sameGeometry(a: PlacementOut[], b: PlacementOut[]): boolean {
  return signature(a) === signature(b);
}

export function packSheetGroup(
  groupParts: ResolvedPart[],
  rawCandidates: StockCandidate[],
  opts: GuillotineOptions
): { sheets: SheetOut[]; skipped: SkippedPart[]; totals: PackTotals } {
  const candidates = orderCandidates(rawCandidates, opts.objective);
  const remaining = new Map<number, number>();
  candidates.forEach((c, i) =>
    remaining.set(
      i,
      Number.isFinite(c.quantityAvailable) ? c.quantityAvailable : 1e9
    )
  );
  const tierRank = new Map<number, number>();
  candidates.forEach((c, i) =>
    tierRank.set(i, c.kind === "offcut" ? 0 : c.kind === "raw_stock" ? 1 : 2)
  );

  // expand quantities
  const items: Item[] = [];
  for (const part of groupParts) {
    for (let q = 0; q < part.quantity; q++) items.push({ part });
  }
  items.sort((a, b) => {
    const am = Math.max(a.part.width, a.part.length);
    const bm = Math.max(b.part.width, b.part.length);
    if (bm !== am) return bm - am;
    return b.part.width * b.part.length - a.part.width * a.part.length;
  });

  const openSheets: OpenSheet[] = [];
  const skipped = new Map<string, SkippedPart>();
  let exhaustedAll = false;

  const openNextSheet = (): OpenSheet | null => {
    for (let i = 0; i < candidates.length; i++) {
      if ((remaining.get(i) ?? 0) > 0) {
        remaining.set(i, (remaining.get(i) ?? 0) - 1);
        const sheet: OpenSheet = {
          candidate: candidates[i],
          tierRank: tierRank.get(i) ?? 2,
          rects: [
            { x: 0, y: 0, w: candidates[i].width, l: candidates[i].length },
          ],
          placements: [],
          firstCutDone: false,
          usedArea: 0,
        };
        openSheets.push(sheet);
        return sheet;
      }
    }
    return null;
  };

  interface Hit {
    sheetIdx: number;
    rectIdx: number;
    rotated: boolean;
    w: number;
    l: number;
    score: number;
    tierRank: number;
  }

  for (const item of items) {
    const { part } = item;
    let best: Hit | null = null;
    for (let si = 0; si < openSheets.length; si++) {
      const sheet = openSheets[si];
      for (let ri = 0; ri < sheet.rects.length; ri++) {
        const rect = sheet.rects[ri];
        for (const rotated of [false, true]) {
          if (!orientationAllowed(part, rotated)) continue;
          const dims = fits(part, rect, rotated);
          if (!dims) continue;
          const leftover = Math.min(rect.w - dims.w, rect.l - dims.l);
          if (
            !best ||
            leftover < best.score - EPS ||
            (Math.abs(leftover - best.score) < EPS &&
              sheet.tierRank < best.tierRank)
          ) {
            best = {
              sheetIdx: si,
              rectIdx: ri,
              rotated,
              w: dims.w,
              l: dims.l,
              score: leftover,
              tierRank: sheet.tierRank,
            };
          }
        }
      }
    }

    if (!best) {
      const sheet = openNextSheet();
      if (!sheet) {
        exhaustedAll = true;
        skipped.set(part.partId, {
          partId: part.partId,
          name: part.name,
          reason: opts.reasons.inventory,
        });
        continue;
      }
      const rect = sheet.rects[0];
      let placed = false;
      for (const rotated of [false, true]) {
        if (!orientationAllowed(part, rotated)) continue;
        const dims = fits(part, rect, rotated);
        if (!dims) continue;
        best = {
          sheetIdx: openSheets.length - 1,
          rectIdx: 0,
          rotated,
          w: dims.w,
          l: dims.l,
          score: 0,
          tierRank: sheet.tierRank,
        };
        placed = true;
        break;
      }
      if (!placed) {
        // doesn't even fit a fresh sheet of any candidate size
        skipped.set(part.partId, {
          partId: part.partId,
          name: part.name,
          reason: opts.reasons.oversize,
        });
        // return the sheet we optimistically opened
        openSheets.pop();
        continue;
      }
    }

    if (!best) continue; // unreachable in practice (skip paths handled above)
    const sheet = openSheets[best.sheetIdx];
    const rect = sheet.rects[best.rectIdx];
    const placement: PlacementOut = {
      partId: part.partId,
      partName: part.name,
      x: rect.x,
      y: rect.y,
      w: best.w,
      l: best.l,
      rotated: best.rotated,
      styleIdx: 0,
    };
    sheet.placements.push(placement);
    sheet.usedArea += best.w * best.l;

    // choose split orientation
    let horizontalFirst: boolean;
    if (!sheet.firstCutDone && opts.firstCutDirection !== "either") {
      horizontalFirst = opts.firstCutDirection === "horizontal";
    } else {
      const hScore = rectSetScore(
        splitRect(rect, best.w, best.l, opts.kerf, true)
      );
      const vScore = rectSetScore(
        splitRect(rect, best.w, best.l, opts.kerf, false)
      );
      horizontalFirst = hScore >= vScore;
    }
    sheet.firstCutDone = true;
    sheet.rects.splice(best.rectIdx, 1);
    sheet.rects.push(
      ...splitRect(rect, best.w, best.l, opts.kerf, horizontalFirst)
    );
  }

  const sheets: SheetOut[] = [];
  let totalCost = 0;
  let totalArea = 0;
  let totalUsed = 0;
  for (const sheet of openSheets) {
    if (sheet.placements.length === 0) continue;
    const c = sheet.candidate;
    const area = c.width * c.length;
    const usedPct = (sheet.usedArea / area) * 100;
    totalCost += c.unitCost;
    totalArea += area;
    totalUsed += sheet.usedArea;

    const styles: PlacementOut[][] = [sheet.placements];
    if (sheet.placements.length > 0) {
      const mx = sheet.placements.map((p) => mirrorX(p, c.width));
      const my = sheet.placements.map((p) => mirrorY(p, c.length));
      if (!sameGeometry(mx, sheet.placements)) styles.push(mx);
      if (
        !sameGeometry(my, sheet.placements) &&
        !sameGeometry(my, mx)
      )
        styles.push(my);
    }

    sheets.push({
      materialId: opts.materialId,
      axis: "2d",
      sourceKind: c.kind,
      sourceStockId: c.stockId,
      width: c.width,
      length: c.length,
      cost: c.unitCost,
      usedPct,
      placements: sheet.placements,
      styles,
      groupKey: signature(sheet.placements) + `@${c.width}x${c.length}`,
    });
  }

  void exhaustedAll;
  return {
    sheets,
    skipped: [...skipped.values()],
    totals: {
      stockUsed: sheets.length,
      wastePct: totalArea > 0 ? (1 - totalUsed / totalArea) * 100 : 0,
      cost: totalCost,
    },
  };
}
