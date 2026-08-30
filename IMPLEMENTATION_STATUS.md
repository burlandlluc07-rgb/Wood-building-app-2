# NestForge — Implementation Status

Legend: **IMPLEMENTED** · **PARTIALLY IMPLEMENTED** · **NOT YET IMPLEMENTED**

Last updated against the actual source in this repository.

## P0 — the load-bearing gaps

| Feature | Status | Notes |
| --- | --- | --- |
| Three-way material behavior (`sheet_good` / `dimensioned_lumber` / `rough_lumber`) | **IMPLEMENTED** | `solver.ts::analyzeProject` dispatches by `materials.type`; the two packers and the yield calc are separate engines. |
| 1D cutting-stock solver | **IMPLEMENTED** | `src/core/optimizer/linear.ts` — BFD seed + strict-improvement consolidation; kerf-aware; offcut→raw→new tiering; 1D strip diagrams. Any material typed `dimensioned_lumber` is eligible (moulding, pipe, extrusion…). |
| Rough-lumber yield calculator | **IMPLEMENTED** | `src/core/optimizer/roughLumber.ts` — board feet ÷ yield %, editable nominal→actual table, per-material yield override, nominal surfaced on cut-list rows. **Zero** `sheets`/`placements` rows are ever created for rough lumber. |
| Can-Buy-More gate | **IMPLEMENTED** | `materials.can_buy_more`; new-stock candidates are excluded when off, and overflow parts land on the skipped list with a specific reason. |
| `board_foot` / `cubic_ft` / `cubic_m` cost units | **IMPLEMENTED** | in `CostUnit`, wired through `pricing.ts` and the rough-lumber path. |
| Primary/Secondary material roles | **IMPLEMENTED** | `parts.material_role` + project mappings; one-click swap re-optimizes the affected groups and re-costs the BOM. Parts can opt out with an explicit material. |
| Glued-Up Panel Wizard | **IMPLEMENTED** | `glueup.ts` + wizard UI; generates stave child parts (`parent_part_id`), routes them to the correct engine, and rolls combined cost back up to the virtual parent row. |
| Skipped parts with specific reasons | **IMPLEMENTED** | surfacing in both Layouts and BOM; reasons include oversize, inventory exhausted, buy-more disabled, missing material, unmapped role, no stock sizes defined, no nominal thickness coverage. |

## P1 — professional polish

| Feature | Status | Notes |
| --- | --- | --- |
| First Cut Direction | **IMPLEMENTED** | per material (or project default); the first guillotine split of every fresh sheet is forced. |
| Intelligent reoptimization | **IMPLEMENTED** | deterministic scope: part edits re-solve only the touched material groups; price/yield edits re-cost with no re-pack; pinned diagrams are never touched. |
| Layout styles (equal-cost alternates) | **IMPLEMENTED** | mirror variants with identical waste/cost, generated per sheet, cycle control greyed out when only one distinct arrangement exists. Note: variants are geometric transforms of the same solution, not re-packs. |
| Solution A/B/C comparison | **IMPLEMENTED** | three objective variants (waste/cost/count) scored per material group; summaries shown on the Layouts tab. |
| Round-up vs pro-rated costing | **IMPLEMENTED** | explicit user toggle; both totals always visible. Rough lumber: buy = BF ÷ yield, pro-rated = net BF. |
| User-defined hardware categories | **IMPLEMENTED** | free-text category per item, grouped subtotals on the BOM. |
| Rotation `[R]` indicator + along-X dimension emphasis | **IMPLEMENTED** | on diagrams and per-diagram take-off lists. |
| Hide duplicate diagrams with ×N badge | **IMPLEMENTED** | via shared layout `groupKey`. |
| Pin/freeze diagrams | **IMPLEMENTED** | pinned sheets survive every reoptimization. |
| Molding — three modeling approaches | **IMPLEMENTED** | (1) hardware cost line with per-ft unit; (2) banding/perimeter runs derived from edge-marked parts (BOM "edging runs"); (3) real cut plans via a `dimensioned_lumber` part through the 1D solver. |
| Solid-wood edging with real thickness | **IMPLEMENTED** | core cut dims shrink on banded sides; finished size preserved and shown on the cut list. Iron-on banding remains negligible-thickness. |
| Project templates | **IMPLEMENTED** | save-as-template (duplicate with flag) + new-project-from-template. |
| Named import presets | **IMPLEMENTED** | data-driven column mappings + transforms (skip zero-qty, merge duplicates, infer thickness from material string, strip comments); four built-ins; user presets creatable via API. |
| Clipboard / CSV / file import | **IMPLEMENTED** | plus optional clipboard-watch capture on window focus. |
| Materials-library backup/restore | **IMPLEMENTED** | JSON export/import of the whole materials + stock database, independent of any project. |
| Shop Mode | **IMPLEMENTED** | `/projects/[id]/shop` — live, large-touch view (diagrams with zoom + cut checks, parts finished checks, purchase checks) writing straight to the same database. No export copy, no staleness. |
| Single-diagram SVG export | **IMPLEMENTED** | download one diagram as SVG (geometry only — not a CNC toolpath, by design). |
| Cut-list print view | **IMPLEMENTED** | print-optimized table with finished-vs-cut sizes, nominal purchase thickness, sub-assembly column that can hide, roles and banding marks. |
| Sub-assembly grouping | **IMPLEMENTED** | group/sort/filter + column hide on the parts list; column hide on the cut list. |

## P2 — stretch

| Feature | Status | Notes |
| --- | --- | --- |
| Drag-and-drop diagram editor (manual placement, snap-to-kerf) | **NOT YET IMPLEMENTED** | diagrams are optimizer-produced; pinning + style cycling cover rearrangement today. Manual blank-sheet placement is future work. |
| DXF export | **NOT YET IMPLEMENTED** | SVG single-diagram export exists; DXF writer is a focused follow-up (geometry only, never toolpaths). |
| QR/thermal part labels + label-sheet presets | **NOT YET IMPLEMENTED** | printable cut list exists; scannable labels are future work. |
| Multi-user LAN sync | **NOT YET IMPLEMENTED** | single shared database covers the common case. |
| Live CAD plugins / AI sketch extraction / 3D import / non-rectangular nesting | **NOT YET IMPLEMENTED** | explicitly out of current scope; the import-preset library is the supported CAD bridge today. |
