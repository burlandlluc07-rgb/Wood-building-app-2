// 1D cutting-stock solver for dimensioned lumber / lineal materials
// (moulding, pipe, rebar, extrusions — anything sold by running length).
// Best-Fit-Decreasing seed + a consolidation local-search pass that keeps
// only strict improvements (mirrors the 2D solver's approach).

import type {
  Objective,
  PackTotals,
  PlacementOut,
  ResolvedPart,
  SheetOut,
  SkippedPart,
  StockCandidate,
} from "../types";

export interface LinearOptions {
  kerf: number;
  materialId: string;
  objective: Objective;
  reasons: { oversize: string; inventory: string };
}

interface LinearItem {
  part: ResolvedPart;
  len: number; // long dimension required
}

interface OpenStick {
  candidate: StockCandidate;
  pieceLens: number[]; // cut lengths in order
  used: number; // includes kerf between pieces
  tierRank: number;
}

function orderCandidates(
  candidates: StockCandidate[],
  objective: Objective
): StockCandidate[] {
  const tier = (k: string) => (k === "offcut" ? 0 : k === "raw_stock" ? 1 : 2);
  return [...candidates].sort((a, b) => {
    const t = tier(a.kind) - tier(b.kind);
    if (t !== 0) return t;
    if (objective === "cost") {
      if (a.unitCost !== b.unitCost) return a.unitCost - b.unitCost;
      return b.length - a.length;
    }
    if (objective === "count") return b.length - a.length;
    return a.length - b.length; // waste: tightest fit first
  });
}

export function packLinearGroup(
  groupParts: ResolvedPart[],
  rawCandidates: StockCandidate[],
  opts: LinearOptions
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

  const items: LinearItem[] = [];
  const skipped = new Map<string, SkippedPart>();
  for (const part of groupParts) {
    const len = Math.max(part.width, part.length);
    const cross = Math.min(part.width, part.length);
    // cross-section must fit the stock width of at least one candidate
    const anyCrossFit = candidates.some((c) => cross <= c.width + 1e-6);
    if (!anyCrossFit) {
      skipped.set(part.partId, {
        partId: part.partId,
        name: part.name,
        reason: opts.reasons.oversize,
      });
      continue;
    }
    for (let q = 0; q < part.quantity; q++) items.push({ part, len });
  }
  items.sort((a, b) => b.len - a.len);

  const sticks: OpenStick[] = [];

  const openNextStick = (minLen: number): OpenStick | null => {
    for (let i = 0; i < candidates.length; i++) {
      if ((remaining.get(i) ?? 0) <= 0) continue;
      if (candidates[i].length + 1e-6 < minLen) continue;
      remaining.set(i, (remaining.get(i) ?? 0) - 1);
      const stick: OpenStick = {
        candidate: candidates[i],
        pieceLens: [],
        used: 0,
        tierRank: tierRank.get(i) ?? 2,
      };
      sticks.push(stick);
      return stick;
    }
    return null;
  };

  const fitsIn = (stick: OpenStick, len: number): boolean => {
    const needed = stick.used === 0 ? len : stick.used + opts.kerf + len;
    return needed <= stick.candidate.length + 1e-6;
  };
  const addTo = (stick: OpenStick, len: number): void => {
    stick.used = stick.used === 0 ? len : stick.used + opts.kerf + len;
    stick.pieceLens.push(len);
  };

  // --- Best-Fit-Decreasing seed -------------------------------------------
  for (const item of items) {
    let best: OpenStick | null = null;
    let bestLeft = Infinity;
    for (const stick of sticks) {
      if (!fitsIn(stick, item.len)) continue;
      const left = stick.candidate.length - (stick.used + opts.kerf + item.len);
      if (left < bestLeft) {
        bestLeft = left;
        best = stick;
      }
    }
    if (best) {
      addTo(best, item.len);
      continue;
    }
    const stick = openNextStick(item.len);
    if (!stick) {
      skipped.set(item.part.partId, {
        partId: item.part.partId,
        name: item.part.name,
        reason:
          candidates.length === 0 || !candidates.some((c) => c.length + 1e-6 >= item.len)
            ? opts.reasons.oversize
            : opts.reasons.inventory,
      });
      continue;
    }
    addTo(stick, item.len);
  }

  // --- consolidation: strict-improvement local search ----------------------
  // Try to empty the lightest stick by redistributing its pieces into other
  // sticks; keep the change only when every piece lands elsewhere.
  let improved = true;
  while (improved && sticks.length > 1) {
    improved = false;
    const ordered = [...sticks].sort(
      (a, b) => a.pieceLens.length - b.pieceLens.length || b.used - a.used
    );
    const victim = ordered[0];
    const others = sticks.filter((s) => s !== victim);
    const savedUsed = others.map((s) => s.used);
    const savedPieces = others.map((s) => [...s.pieceLens]);
    const pieces = [...victim.pieceLens].sort((a, b) => b - a);
    let ok = true;
    for (const len of pieces) {
      let best: OpenStick | null = null;
      let bestLeft = Infinity;
      for (const s of others) {
        if (!fitsIn(s, len)) continue;
        const left = s.candidate.length - (s.used + opts.kerf + len);
        if (left < bestLeft) {
          bestLeft = left;
          best = s;
        }
      }
      if (best) addTo(best, len);
      else {
        ok = false;
        break;
      }
    }
    if (ok) {
      sticks.splice(sticks.indexOf(victim), 1);
      improved = true;
    } else {
      others.forEach((s, i) => {
        s.used = savedUsed[i];
        s.pieceLens = savedPieces[i];
      });
    }
  }

  // --- emit ----------------------------------------------------------------
  const sheets: SheetOut[] = [];
  let totalCost = 0;
  let totalLenAll = 0;
  let totalUsedAll = 0;
  for (const stick of sticks) {
    if (stick.pieceLens.length === 0) continue;
    const c = stick.candidate;
    totalCost += c.unitCost;
    totalLenAll += c.length;
    totalUsedAll += stick.used;

    // build 1D placements: x = offset along the stick
    const placements: PlacementOut[] = [];
    let cursor = 0;
    // pieces were added in BFD order; re-associate to part names by length
    const byLen = new Map<number, ResolvedPart[]>();
    for (const p of groupParts) {
      const len = Math.max(p.width, p.length);
      const arr = byLen.get(len) ?? [];
      arr.push(p);
      byLen.set(len, arr);
    }
    const usedIdx = new Map<number, number>();
    for (const len of stick.pieceLens) {
      const arr = byLen.get(len) ?? [];
      const idx = usedIdx.get(len) ?? 0;
      const part = arr[Math.min(idx, Math.max(0, arr.length - 1))];
      usedIdx.set(len, idx + 1);
      placements.push({
        partId: part?.partId ?? "",
        partName: part?.name ?? "piece",
        x: cursor,
        y: 0,
        w: len,
        l: c.width,
        rotated: part ? part.length < part.width : false,
        styleIdx: 0,
      });
      cursor += len + opts.kerf;
    }

    // layout style variant: reverse cut order (identical waste/cost)
    const styles: PlacementOut[][] = [placements];
    if (placements.length > 1) {
      const rev: PlacementOut[] = [];
      let cur = 0;
      for (const p of [...placements].reverse()) {
        rev.push({ ...p, x: cur, styleIdx: 1 });
        cur += p.w + opts.kerf;
      }
      styles.push(rev);
    }

    sheets.push({
      materialId: opts.materialId,
      axis: "1d",
      sourceKind: c.kind,
      sourceStockId: c.stockId,
      width: c.width,
      length: c.length,
      cost: c.unitCost,
      usedPct: (stick.used / c.length) * 100,
      placements,
      styles,
      groupKey:
        stick.pieceLens
          .map((l) => l.toFixed(1))
          .sort()
          .join("|") + `@${c.length}`,
    });
  }

  return {
    sheets,
    skipped: [...skipped.values()],
    totals: {
      stockUsed: sheets.length,
      wastePct: totalLenAll > 0 ? (1 - totalUsedAll / totalLenAll) * 100 : 0,
      cost: totalCost,
    },
  };
}
