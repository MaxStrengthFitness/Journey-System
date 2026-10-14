# Studio-built machines, and B straight away (Oct 13 2026)

Branch `oct13/studio-machines` over master `d3ba6996` (what Render served that day). Three phases and the review's fixes, one commit each, then this document. Ships with `scripts/ship/ship-studio-machines.ps1`: a push and the web service's Manual Deploy. No rules, index, Cloud Function, cron or Mindbody change, and nothing is stored differently.

## The brief

AJ, Oct 13 2026: *"i wasnt able to add settings for a client onto our hoist leg press at strongsville, in the machine catalog it has a seat setting to it and also we cant add it to a routine within the routine builder. it seems we have major issues with studio built machines."* And: *"i want to additionally be able to just turn on a B routine and swap instantly to it without having to go through a transition phase."*

His answers to the three questions:

1. Where a machine's setting names are kept: *"ill have to audit all the machine settings before mass import, they are such a mess in filemaker, we will need to make a plan for that later."* Taken as: fix the card now by reading both places, store nothing differently, and leave "one place for setting names" to the settings audit before the FileMaker import.
2. B straight away: *"a"* (Start B whole on Plan B, and Swap in all beside One · Two · Three).
3. Count the Hoist as a leg press in the routine builder's checks: *"there is the imagine strength legpress which is MSF standard and then they have the hoist leg press."* Not built; see "Asked, not built".

## What was wrong

Strongsville's Hoist leg press is a machine the studio built itself (`studios/BVDDRe5AqQZFihRLW0vK/roster/sm-BVDDRe5AqQZFihRLW0vK-hoist-leg-press`, `source: "custom"`). It lives only on Strongsville's own floor list. Every fault came from a screen reading something else.

- **Settings.** A machine's setting names are kept in two places: the machine's own dials (`definition.settingFields`, the machine editor's The dials) and the **Studio setup** card (`studioMachineSettings/{studio}_{machine}`, on Learning → Catalog and My Studio → Machines). The Catalog's Preset line shows Studio setup first (`catalog/floor-index.ts` `presetOf`). The client's machine card, the Now Bar's Set up and Programming → Setup read only the machine's own dials and the company catalog (`equipment/adapters.ts` `fieldsForMachine`). A standard machine always gets the catalog's dials, so nobody noticed. A studio-built machine has no catalog entry, so one whose Seat was added on Studio setup reached the card with no dial at all: "This machine has no adjustable settings on its catalog entry", and no Set up.
- **The studio's standards never reached the card either, on any machine.** The card's "Studio standard" hint came from `studios/{s}.machineSettings`, a field nothing writes.
- **Routines.** The client profile handed the Edit routine drawer, and Programming's Routine A / B rows, the app-wide machine list (the catalog and its defaults), which never holds a studio-built machine. So the drawer never offered the Hoist, and a routine that already held it said "Unknown machine" and its row couldn't be opened. Every other door that adds a machine already read the floor: the session, its plan sheet, the briefing, the Wrap-up's Next time, Start a plan, Can't do, Re-plan.
- **B.** Start B makes Routine B as A with one machine swapped (the Academy's way, AJ, Oct 7 2026), and the rest come in one, two or three at a time. That was the transition phase.

The production read of the Hoist's own record was refused by the permission check on Oct 13, so which of its two places holds Seat is inferred from the code and AJ's words, not read. The fix covers both.

## What was built

| # | Phase | What it does |
| --- | --- | --- |
| 1 | **The floor reads Studio setup** (`lib/floor-machines.ts`; `dc96d511`) | The session and the profile each open ONE listener on the studio's Studio setup cards (`useStudioMachineSettings`, its index already in place) and hand it to the floor (`toFloorMachines`, `studioFloorOf`). A **studio-built** machine takes Studio setup's names first, in their order, then any of its own dials Studio setup didn't name; a name both hold keeps the machine's own spelling, because a dial's name is the key a client's value is saved under. **Every** machine takes Studio setup's standards over its own defaults, for the settings Studio setup still lists and never a fixed dial's (the gap keeps the machine's own): only ever the hint on an empty dial, and what "Use studio standard for all" fills in. A standard machine keeps the catalog's names. Not read yet, or a failed read: the floor says what it said before. Everything that reads the floor follows: the machine card, the Now Bar's Set up and its count, the session grid, Programming → All Machines and Setup, the codex. |
| 2 | **Routines on the profile read this floor** (`EditRoutineDrawer`, `ProgrammingTab`, `ClientProfileView`; `41deaa2c`) | The drawer takes the floor (`floorMachines`): the builder offers it, a preset keeps only what it holds, and a routine machine the floor no longer has keeps its full name beside "Not at this studio" (RoutineBuilder's optional `nameOf`, from routine-plan's `machineNamer`). Programming's rows are named from the floor first, then every machine the app knows. The profile's machine card also opens every machine the client has sets on, as the grid lists them. |
| 3 | **Start B whole, and All N** (`b-routine.ts`, `PlanBSheet`, `BColumn`; `75266be2`) | Plan B: beside **Start B** (still the blue default), **Start B whole** when B has two swaps or more: the same plan with every swap made, in the same one batch (Routine B, its plan, its start change, `isRoutineBActive`). The change is "start" with "B whole" (`B_START_WHOLE`), and the Changes list says "Started B whole, all N swaps in". Programming's Routine B: **All N** beside Two and Three once more than three swaps are ready, through the same `bSwappedIn` and its one write. With B on, A and B alternate as before: the next session after an A session is B, and the briefing can still pick B for today. |

### Why nothing is lost

- **Nothing is stored differently.** Studio setup and the machine's own dials stay where they were; the floor reads both.
- **No saved value is hidden.** A studio-built machine keeps every dial of its own; a standard machine's dials are unchanged. A name Studio setup shares with the machine keeps the machine's spelling.
- **A standard machine's card doesn't change its dials.** Mixing the two lists there would put "Seat" beside "Seat Position" on one card. That is the settings audit's to settle.
- **The standards are hints.** They show on an empty dial and are filled in only by "Use studio standard for all"; the studio typed them for exactly that. A fixed dial (the gap) pre-fills and is written by any Save, so it never takes a Studio setup value; it keeps the machine's own.
- **Start B stays the default.** Start B whole is beside it, never instead of it, and it writes the same one batch.

### Tests

- `lib/floor-machines.test.ts`: the Studio setup rule, and the Hoist's Seat reaching `fieldsForMachine`.
- `components/WorkoutTrackerView.render.test.tsx`: the real session with a studio-built machine whose Seat is on Studio setup alone: Set up offers it and Save writes `{ Seat }` to the client. It fails without phase 1.
- `features/routine-builder/studio-machines.render.test.tsx`: the real drawer adds and saves the Hoist; Programming's rows name it and open it; the before-this-round wiring beside each.
- `routine-plan/b-routine.test.ts`, `ui/BSwitch.render.test.tsx`, `ui/BLineup.render.test.tsx`: Start B whole (one batch, every swap in, B on) and All N.

## The independent review, and what it changed

A reviewer (a separate Opus agent, read-only) went through phases 1 to 3 and found four defects. All four are fixed in `a1569033`, each with a test that fails without it:

1. **A Studio setup gap would have reached client records nobody chose.** The gap is a fixed dial: the card opens it already filled with its standard and any Save writes it. A leader's gap on Studio setup (the leg press has none on purpose: the Academy sets it per client) would have been written for every client with none on file, the bug the open session round removed in its finding 5. A fixed dial now keeps the machine's own value (`isAbsoluteDial`, moved to `equipment/absolute-dials.ts` so the floor can ask it without the machine database).
2. **A setting taken off Studio setup kept its standard.** The card saves with a merge, which never deletes a key, so a removed setting's value stayed behind. Only a standard for a setting Studio setup still lists counts.
3. **One studio's cards could stand in for another's.** The listener kept the old studio's map until the new one answered, and for good after a failed read; the standard machines share ids across studios. It is emptied on a studio change and on an error (`hooks/useStudioMachineSettings.ts`, with its own render test).
4. **A preset dropped a movement the floor has only as its own unit.** The drawer now maps each of a preset's catalog machines to the unit that stands for it (`floorIndex`, as Start a plan does).

Checked and sound: no saved value moves to a different key; Start's prefill, the set writes, the open session's held settings and machine fit write no standards; the drawer with no roster or a roster still loading gives the app-wide list as before; Start B whole's B reads the same in every B rule (`swapsMade`, `bStatus`, `bFollowOf`, `bIntendedOf`), and the rules accept its change (a value of 500 characters or fewer, 30 machine ids or fewer).

## Asked, not built

- **The Hoist as a leg press in the routine builder's checks** (question 3). Today a routine whose only lower-body machine is the Hoist says Lower body is missing, the picker lists the Hoist under "Studio machines", and the order rules never mention it. Counting it as the machine a leader recorded it as "based on" reaches into the builder's whole engine (coverage, the A/B comparison, which names the leg press in its own checks, the body figure, the order rules and their fixes), and only helps if "based on" is set. AJ's answer gave the floor (the Imagine Strength leg press is the MSF standard; the Hoist is beside it) without choosing, so it waits for his yes.

## Parking list (outside this area)

- **One place for setting names** (AJ: the settings audit before the FileMaker import). Until then the Catalog's Preset can list a standard machine's dials differently from its card (Studio setup's names there, the catalog's on the card).
- `studios/{s}.machineSettings` is still read as the first source of a machine's standards (nothing writes it; left in place so a studio document that still holds one keeps its hint).
- Operations → Floor → Machine fit (`useFitFloor`) and Admins tools still build dials from the app-wide list.
- Studio templates and starting routines list only the company's machines, not a studio's own.
- The briefing's builder names a routine machine the floor no longer has by its abbreviation (it could take `nameOf` too).
- Plan screens (lineup, session plan sheet, B's cell) never offer the Hoist as a swap FOR the Leg Press (same movement); the drawer's builder and the session's swap sheet do.

## For the walk

On Strongsville's iPad, a client with a session:

1. The Hoist leg press on the grid: Set up offers Seat (with the studio's standard as its hint if Studio setup has one); type it, Save, and the grid shows it.
2. Programming → Routine A → Edit → Add: the Hoist is in the list; add it, Apply; Routine A names it and its row opens the card.
3. A client with Routine A and B off: turn B on, Plan B opens, **Start B whole**: Routine B is built at once, B is on, and the Changes list says "Started B whole, all N swaps in".
4. A B already started with four or more swaps waiting: **All N** swaps them in with one save.

If the Hoist still shows no Seat after the deploy: its Seat is in neither place. Add it on Studio setup (Learning → Catalog → Hoist leg press) or in the machine's editor under The dials.

## Numbers

Measured on Oct 13 2026 in the worktree on AJ's PC, over master `d3ba6996`, after the review's fixes: the suite **14,466** passing in 872 files (`TZ=America/New_York npx vitest run --dir src --testTimeout=30000`); typecheck **2**, the baseline; a production build clean, the first screen **469.7 KB** gzip of 480.
