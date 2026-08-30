# NestForge — Architecture

NestForge is an original, independent cut-list and layout optimizer for
woodshops. No competitor code, UI, assets or branding are used anywhere in
this repository.

## Stack

- **Next.js App Router** (TypeScript strict) — single responsive web app.
- **Drizzle ORM → SQLite** (`src/db/schema.ts`, `src/db/index.ts`), a single local file at `data/nestforge.db` — no server or connection string required.
- **Tailwind CSS v4** — theme tokens in `src/app/globals.css` (`@theme`).
- **`src/core/*`** — framework-agnostic engine boundary. Everything that
  decides *what to cut, where, and what it costs* lives here as pure
  TypeScript. React and Next.js never contain business logic.

## The one decision that matters most

A cutting-list tool is **three different problems**, not one, and the engine
branches on `materials.type`:

| `materials.type`     | Engine path                                          | Diagram?        |
| -------------------- | ---------------------------------------------------- | --------------- |
| `sheet_good`         | `src/core/optimizer/guillotine.ts` (2D, kerf-aware)  | yes — 2D sheets |
| `dimensioned_lumber` | `src/core/optimizer/linear.ts` (1D cutting stock)    | yes — 1D strips |
| `rough_lumber`       | `src/core/optimizer/roughLumber.ts` (board-ft yield) | **no, never**   |
| cost-only types      | hardware/banding/labor/other — pricing only          | no              |

Rough lumber producing a 2D diagram would be fiction — the yard's boards are
random-width and random-length, so the correct output is a board-foot purchase
requirement inflated by an editable yield %, with a nominal→actual thickness
lookup (user-editable, `app_settings` key `roughNominalThicknessTable`).

## Core modules

- `src/core/types.ts` — domain enums + solver I/O types (mirrors DB enums).
- `src/core/units.ts` — engine works in mm; projects display mm or inches.
  Board feet are computed imperially per the trade standard
  (t″ × w″ × l″ ÷ 144).
- `src/core/optimizer/guillotine.ts` — free-rectangle guillotine packer.
  Every split is a full kerf-compensated through-cut, so layouts stay
  physically cuttable. Grain rules, no-rotate parts, and a per-material
  **First Cut Direction** (the first split on a fresh sheet is forced) are
  honored. Equal-cost **layout styles** are generated as geometric variants
  (mirrors) with provably identical waste/cost.
- `src/core/optimizer/linear.ts` — 1D cutting-stock: best-fit-decreasing
  seed + consolidation local search that keeps only strict improvements.
- `src/core/optimizer/roughLumber.ts` — nominal thickness selection +
  net/gross board-foot and cubic totals. No placements are ever produced.
- `src/core/optimizer/glueup.ts` — glue-up panel stave planner (joint loss
  + trim allowance; staves flow into whichever engine matches their material).
- `src/core/optimizer/solver.ts` — orchestrator (`analyzeProject`):
  resolves Primary/Secondary roles, applies the **Can-Buy-More** gate,
  computes effective cut dims (solid-wood edging shrinks the core), groups by
  resolved material, runs three objective variants (waste/cost/count) and
  keeps the best-weighted solution, and emits skipped parts with specific
  human-readable reasons.
- `src/core/pricing/pricing.ts` — cost-unit math including `board_foot`,
  `cubic_ft`, `cubic_m`; round-up vs pro-rated aggregation.
- `src/core/pricing/bom.ts` — BOM builder: purchase lines (live prices, so a
  price change re-costs without re-packing), rough lines, per-part cost
  shares (glue-up roll-up), banding/molding runs, hardware categories,
  skipped parts, cut list.

## Data flow

- `src/lib/detail.ts::loadProjectDetail` assembles everything for a project
  (rows → `analyzeProject` → saved layouts → `buildBom`) and is shared by
  pages and API routes.
- `POST /api/projects/[id]/optimize` accepts `scope: [materialId]` —
  **intelligent reoptimization**: only the touched material groups are
  re-solved; everything else, and every **pinned** diagram, is left alone.
  The workspace computes scope automatically from before/after edits (part
  changes → that part's old+new material groups; pricing changes → no
  re-pack at all, costs recompute from live prices).
- Layout styles are stored as extra placement rows with `styleIdx`;
  `sheets.styleIndex` selects the active one.
- Identical diagrams share a `groupKey`, which the UI collapses with a ×N
  badge.

## Roles

`parts.materialRole = primary|secondary|null` + `projects.primaryMaterialId /
secondaryMaterialId`. A part may always opt out with an explicit
`materialId`. Re-pointing a role re-fits and re-costs every affected part
across all three material behaviors.

## Heuristics vs guarantees

The packers are heuristics (BSSF guillotine / BFD + consolidation) with a
weighted solution comparison — typical of this product category. They do not
claim mathematical optimality.
