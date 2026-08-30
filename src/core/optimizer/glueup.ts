// Glued-Up Panel engine: splits a part that is wider than any available
// board into edge-glued staves. The parent stays a virtual grouping row;
// the generated stave parts flow through whichever optimizer matches their
// material type (rough-lumber yield calc or the 1D linear solver).

export interface GlueUpOptions {
  /** desired stave width in mm; null → choose automatically (~120mm) */
  staveWidth: number | null;
  /** milling loss per glue joint, mm */
  glueLoss: number;
  /** extra length per stave for trimming the panel square, mm */
  trimAllowance: number;
}

export interface StaveSpec {
  name: string;
  width: number; // rough stave width
  length: number; // rough stave length (incl. trim)
  thickness: number; // finished thickness
  quantity: number;
}

export interface GlueUpPlan {
  count: number;
  staveWidth: number;
  staves: StaveSpec[];
}

export function planGlueUp(
  parent: { name: string; width: number; length: number; thickness: number; quantity: number },
  opts: GlueUpOptions
): GlueUpPlan {
  const g = Math.max(0, opts.glueLoss);
  const autoWidth = 120;
  const target = opts.staveWidth && opts.staveWidth > 0 ? opts.staveWidth : autoWidth;
  const n = Math.max(1, Math.ceil(parent.width / target));
  // finished width = Σ stave widths − (n−1) joints × glue-line loss
  const staveWidth = (parent.width + (n - 1) * g) / n;
  const staveLength = parent.length + Math.max(0, opts.trimAllowance);

  const staves: StaveSpec[] = [];
  for (let panel = 0; panel < Math.max(1, parent.quantity); panel++) {
    for (let i = 0; i < n; i++) {
      staves.push({
        name:
          parent.quantity > 1
            ? `${parent.name} #${panel + 1} · stave ${i + 1}/${n}`
            : `${parent.name} · stave ${i + 1}/${n}`,
        width: Math.round(staveWidth * 100) / 100,
        length: Math.round(staveLength * 100) / 100,
        thickness: parent.thickness,
        quantity: 1,
      });
    }
  }
  return {
    count: n * Math.max(1, parent.quantity),
    staveWidth: Math.round(staveWidth * 100) / 100,
    staves,
  };
}
