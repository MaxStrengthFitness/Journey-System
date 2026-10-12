# The studio map

The floor as the way in to a studio's machines: a drawing of the room, every machine at its true size where it really stands, tapped to open the machine's one card. Built Oct 10 to 12 2026 on `oct10/studio-map` (the round is `docs/rounds/2026-10-12-studio-map.md`; the design it was built to, with its three reviews, is quoted there).

AJ, Oct 11 2026: **"yes id love an interactive map because the trainers know where all the machines are they dont remember them alphabetically."** And: "this map allows people to interact and click on a machine to learn,clean,maintaince the machines among other posssible things"; "the rearranging is going to be EXTREMELY rare as these machines are huge but this give studios the ability to plan out remodels and adding additional machines in the event of a remodel".

The card a tap opens is its own feature, `src/features/machine-card/` (read its README too). The cleaning checklist's pure half is Relay's, `src/features/relay/board/cleaning.ts`.

## The rules this folder keeps

- **A machine's size belongs to its unit, and an MSF machine starts at its Imagine Strength size, not confirmed.** The tape-measured `unit.size` on the studio's roster entry, else the size on the model the unit names (`machineModels/{id}.size`), else, for a catalog copy of an MSF movement, its movement's one Imagine Strength model's size, said **"Imagine Strength size, not confirmed"** (`from: "assumed"`), else "Size not known", drawn as a 2 ft round marker that no check counts (`sizes.ts`). AJ, Oct 12 2026, after every machine on his practice floor came up as a "?": "we have the info for the machines lets add it", then **"Fill them in"**. A studio's own machine (`source: "custom"`) is never given one; a model of another movement is never used for a size; the assumption writes nothing. A leader confirms the model (Mark on the Sizes sheet, or Confirm on the unit's own Its size, both writing `modelId`), picks another, or measures it. `unitFactsOfEntry` is every door's facts and `sizeNeedsModels` whether a door reads the models.
- **The room is boxes, started from square feet** (AJ, Oct 11: "you just need to put how many square feet it is. And then from there, you should just have like a modular box tool"). One to twelve axis-aligned boxes on whole feet; the floor is their union and its walls are worked out every time (`room.ts` `roomShape`). A leader never draws a wall or closes a polygon.
- **A palette of places** in AJ's order: Pillar · Door · Desk · Bathroom · Changing room · Lockers · Office · Fire extinguisher · AED. Areas are labelled boxes, the pillar and the two safety markers are markers, a door sits on a wall. **The AED and the fire extinguisher are drawn on every door's map, above the machines, with their words, never dimmed and never a tap target.**
- **Rough on purpose: true sizes, no spacing or path check, only overlaps marked** (AJ: "It just needs to be like a r- rough placement editor, but then like actually knowing the sizes is correct. But I don't want it to be like a very picky builder"). Machines move in 6 in steps and boxes in whole feet; a machine dropped within 6 in of flush against a neighbour or a wall slides flush (`place.ts` `magnet`). An overlap a person can see (more than 6 in) is a quiet plum edge and one line in the selected machine's panel; covering the AED, the extinguisher or a doorway's swing is said past 1 in. Never a list of problems, never "All clear", never a word about spacing, a path or reach (`checks.ts`; the render tests hold the words).
- **One layout, five plan slots, nothing deleted.** `studios/{s}/floorPlans/current` and `d-1` to `d-5`; every write is the whole document at `rev + 1`, which the rules require, so a save made from an old copy is refused and kept as a plan instead of overwriting (`store.ts`). A plan given back is retired, never deleted.
- **Plans may hold machines still to buy; the map never does** (AJ, Oct 11, Q2: "AJ agrees"). A planned machine (`kind: "planned"`, a `pm-` id) is drawn dashed at its model's size with "To buy" until "Bought it? Swap in the real one". `planProblems` refuses one on `current` and `readPlan` drops one read from it, because a rule can't look inside a list.
- **Arranging is rare and a leader's** (AJ: "EXTREMELY rare"): one button, **Draw the floor** while a studio has no map and **Arrange the floor** once it has one, in the panel's actions of My Studio → Machines, Operations → Setup → Floor and Admins → a studio → Floor. Never on Relay.
- **Unknown is never empty.** A layout read has four states (`states.ts`): loading, unreadable, empty (only the server's answer that there is none) and ready. A missing document only the iPad's cache answered for stays loading (`hooks.ts` listens with metadata changes).
- **The words are AJ's** (design §G question 2, built with its default): the map, Plan a remodel, Remodel 1, Make this the map; a remodel draft is a **plan** on screen. The stored `name` of `current` stays "The layout" (data, never shown). Lengths on screen are feet and inches only; stored in whole millimetres (`units.ts` is the one module that speaks feet).
- **A phone gets lists and tiles, never the drawing.** And a door whose map is too small to tap (any machine's short side under 24 px) shows its list with one line, "Too small to tap at this width. Use the list below." (`tap.ts` `roomIsTappable`, the one rule every read door applies).

## The pure modules (each with its `.test.ts`)

| Module | What it answers |
| --- | --- |
| `units.ts` | Lengths as a person says them: feet and inches in and out, the 6 in and 1 ft steps, square feet. |
| `geometry.ts` | Footprints (a frame at rest, turned about its centre), overlaps with their tolerances, a box's polygon, distances. |
| `room.ts` | The room: `roomShape` (walls and inner corners from the boxes), the first box from square feet, moving and resizing boxes and places, doors snapped to walls, the square-footage line (`areaWords`). |
| `checks.ts` | Overlaps, quietly: `overlapChecks` once after a change settles, `pairChecks` for the machine being dragged. |
| `layout.ts` | The stored document (`FloorPlanDoc`), its limits (`PLAN_LIMITS`, the rules' numbers), `readPlan`, `planProblems`, `planDocument`, the roster against the layout (`reconcile`), the slots, Make this the map's ops and their Undo. |
| `placement.ts` | The editor's working copy and the move: a reducer with the tools (Machines, The room), a press that becomes a drag after 8 px, one move a frame, the magnet on release, Undo. |
| `place.ts` | A spot for a machine not placed yet (`freeSpot`), Place them all along the walls in walking order, the soft magnet. |
| `sizes.ts` | Which size a unit has (`sizeOfUnit`: measured, the model it names, its Imagine Strength size not confirmed, not known and why, loading), a roster entry's facts (`unitFactsOfEntry`), and whether a door must read the models (`sizeNeedsModels`). |
| `states.ts` | The four states of a layout read. |
| `tap.ts` | A tap on the map (the footprint that holds it, else the nearest within 22 px), whether a room is tappable, the room tool's handles. |
| `links.ts` | The Sizes sheet's rows: walking order, which rows start ticked (AJ's "Yes, nearly all": a catalog copy whose movement has an Imagine Strength model), what a tick or a pick would write. |
| `planned.ts` | Machines still to buy: a new one, its size looked up live, its name, swap candidates, "Still to buy: ...". |
| `imagine-strength.ts` | The twenty Imagine Strength models with their brochure sizes (the seed's data; `scripts/seed-imagine-strength-models.ts` writes them). |
| `demo-layout.ts` | The practice layout: 1,800 sq ft, one 60 x 30 ft box with its places and the twenty along the walls (Demo Mode's Start from the practice layout, and the perf lab's seed). |
| `map-mode-memory.ts` | Which mode Relay's map opens in (Cleaning the first time, design §G question 1's default), remembered until sign-out. Every other door opens in Look up. |

`store.ts` is the only writer of the layout and of a unit's size and model (whole documents at `rev + 1`; a refused save told apart from a lost race by reading the document it wrote; the 64 KB budget). `hooks.ts` is the reads (`useFloorPlan` by id for every door, `useFloorPlans` the whole collection, at most six documents, for the editor only). `lazy.tsx` holds the lazy screens inside a `LoadBoundary`.

## The screens (`ui/`)

- **`StudioRoom.tsx`**: the one drawing, presentational, in every door: boxes with no stroke, one wall path, door gaps and swings, labelled areas (a name too wide is left out, never clipped), machines on the firm control edge (a round marker for an unknown size, dashed for one to buy), the safety layer last, every machine an `aria-label` with its name and size. Walls are ink, never the frame's navy. No colour in an attribute: every colour is a class in `studio-map.css` over the `--eq-*` tokens.
- **`FloorMapView.tsx`**: the map every door but the Catalog reads. `Look up | Cleaning` and the head line in one row, **Mark all {n} wiped** at its end in Cleaning; a tick for Wiped today and a quiet plum dot for Used since its wipe; the floor in walking order under it (44 px ticks in Cleaning); the AED and extinguisher named at its foot.
- **`LayoutView.tsx`**: Arrange the floor. The empty state is only "How big is the studio?" and Draw the room. Then the plan tabs (`DraftTabs.tsx`), one bar (Machines | The room, Undo, Save, Done), the square-footage line and the zoom, the drawing, the selected thing's panel (`ItemPanel.tsx`, `MovePad.tsx`: Turn left, Turn right, Back to the wall, Take it off the map; the arrows under Fine moves), Not placed yet with its Sizes line, and the floor in walking order. Save is never awaited.
- **`SizesSheet.tsx`**: one row per machine, ticks (catalog copies start ticked, each naming the model its not-confirmed size was drawn at), **Mark {n} as Imagine Strength** (blue) with Undo, a model picker and Measure on every row (`UnitModelField.tsx`, `SizeForm.tsx`). Nothing is written until the leader taps Mark. Its head counts what is left: "20 sizes not confirmed yet", "1 with no size · 20 not confirmed", "Every machine has a size".
- **`PlanMachineSheet.tsx`**: Add a machine to buy, on a plan.
- **`UnitSizeCard.tsx`**: a unit's size on its card's Set up.

The doors that mount the map: My Studio → Machines (`my-studio/MachinesSection.tsx`, map first once the studio has a map with a machine on it, `Map | List`, the list while it loads and always on a phone; a pick on this iPad wins), Relay's floor (`relay/board/FloorMap.tsx`, `Map | Tiles`), the Catalog's floor lens (`catalog/FloorRoomView.tsx`, the bare drawing; a tap opens the card at Learn) and Operations' and Admins' floor (`admin/equipment/StudioEquipmentPanel.tsx`).

## Data and rules

- `machineModels/{id}.size` `{ lengthMm, widthMm, heightMm, source, note? }`, administrators only (`modelSizeValid`).
- `studios/{s}/roster/{id}.unit.size` and `.modelId`, a studio's leaders, through the roster rule in resolve-once form (`rosterUnitSizeOk`). The store never combines a size, a model, Out of service and the walking order in one write (the expression budget).
- `studios/{s}/floorPlans/{current | d-1..d-5}` `{ v: 1, name, room: { areaSqFt?, boxes, places }, placements, retired?, rev, updatedAt, updatedBy }`: read by everyone who works at the studio, written by its leaders, never deleted (`match /floorPlans/{planId}`). The rules check the shape, the caps and the rev; each box, place and placement is checked by `layout.ts`. A planned machine's shape lives inside a plan document.
- No index (the doors read `current` by id; the editor reads the whole collection, which needs none). No setting (the spacing and path settings of the first design were dropped). Cleaning writes only `machineCare` and the wipe chore's `taskInstances`, under their existing rules.

## Tests

Every pure module has its `.test.ts`. Every component that works during render has a render test: `StudioRoom`, `FloorMapView`, `LayoutView` (each state, the drags under `touch-action: none` before any pointer event, Save and the conflict path, a count test that `roomShape` and `overlapChecks` run 0 times in 30 moves), `SizesSheet`, `DraftTabs`, `PlanMachineSheet`, `UnitSizeCard`. The words the round forbids (spacing, apart, free floor, path, reach, inspection, All clear, a metric unit; a person's name or a minute in Cleaning) are asserted in `LayoutView.render.test.tsx`, `FloorMapView.render.test.tsx` and `machine-card/MachineCard.render.test.tsx`. `look.test.ts` holds `studio-map.css` to the tokens (no orange or crimson, `.smap-m--used` and `.smap-m--over` on `--eq-warn` only, the safety markers' 28 px and halo, `.smap-floor` with no stroke).

The perf lab measures the map on the iPad classes: `harness/perf-lab/run.mjs` `MAP_SCENARIOS` (map, clean, arrange, catalog-layout, catalog-layout-relay), with its seed's practice layout. The numbers are in the round document.

## Traps

- **A 2 ft marker decides whether a whole room is tappable.** `roomIsTappable` counts an unsized unit's marker (610 mm) like a machine's short side, so on a 60 ft room one unsized machine turns the map into its list on every iPad in portrait (measured Oct 12 2026: the marker draws at 15 to 23 px at 520 to 760 px wide, under the 24 px line; all twenty sized, the smallest, the bicep, draws at 26 to 39 px). Since Oct 12 2026 a catalog copy takes its Imagine Strength size, so this is down to a studio's own machines with no size and a movement with no Imagine Strength model; until those are measured, its leaders and trainers see the list. The round document says so; a change to the rule is AJ's.
- **`touch-action: none` is set up front, never in pointerdown**: iPadOS has decided to pan before a pointerdown handler runs. Machines in the Machines tool, and the selected box or place with its handles in The room; an unselected box pans the zoomed room.
- **Never write `current` with a planned machine.** `planProblems` refuses it and the rules can't (a list).
- **A save at the wrong rev is refused, not merged.** Read `store.ts`'s header before adding a write: every write is a whole document at `rev + 1`, and the store reads the document it wrote to tell "someone else saved" from "refused".
