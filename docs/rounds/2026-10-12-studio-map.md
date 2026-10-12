# The studio map (Oct 10 to 12 2026)

ROADMAP Planned item 3 (the studio map), with the sizes bullet of item 2. Branch `oct10/studio-map` in `.claude/worktrees/studio-map`, on master `5a0bf7ea` (the franchise partition and phase 0's rules trim are on master). Not pushed. Ships with `scripts/ship/ship-studio-map.ps1` (prepare, golive, seed; §10).

What it is, in one line: **a drawing of each studio's floor, every machine at its true size where it stands, tapped to open the machine's one card; trainers find, learn, clean and report on it, and a leader rarely rearranges it or plans a remodel.**

The feature READMEs are the working reference: `src/features/studio-map/README.md` and `src/features/machine-card/README.md`. The design the round was built to (`scratchpad/map/design.md`, §0 to §H, with its three reviews and the Oct 11 revision) is quoted where it matters below.

## 1. AJ's words

**Oct 10 2026**, on the proposal page (`JQRbrwv64Q1o7pxEgoRsgt`, his picks recorded there as 1a 2a 3a): **"take it away i like your ideas"**.

**Oct 11 2026, the hand-off** (pasted from the walk session):

- "yes id love an interactive map because the trainers know where all the machines are they dont remember them alphabetically."
- "this map allows people to interact and click on a machine to learn,clean,maintaince the machines among other posssible things."
- "the rearranging is going to be EXTREMELY rare as these machines are huge but this give studios the ability to plan out remodels and adding additional machines in the event of a remodel"
- "if 3 trainers are at the studio and they have downtown to clean the studio they could all pull up the map and use it as a strategy planner on who should clean what machines and make it an easy and intutive way to have the whole team use 1 ipad to mark the work or everyone can do it on their own ipad or even just mark it all once they are done and go to the office."
- "this allows our "my studios machines" to be unique from the learning catalog that has all the machines to it, where the map will like to the main MSF catalog page and the my studio map will hold the unique to that studio version"
- **Never:** a machine found only by an alphabetical list; rearranging as the main mode; anything that ranks who cleaned most, or pings anyone; a studio's own version overwriting the MSF standard.

**His answers, Oct 11 2026:**

- Q1, cleaning: **"mark done claim for later optional for planning"** (mark done now; claims later).
- Q2, plans holding machines the studio doesn't own yet: **"AJ agrees"** (on a plan only).
- Q3, one card from every door: **"1a"** (one card, the first part matching the door).
- The shared iPad (voice): "It just needs to be like an easy way a very modular way to like have the team just check off what they did just like a a checklist just to say, hey, yep, we did it. ... It doesn't really need to say like, oh, this person cleaned the machine on this day at this time. It, it doesn't need to be that military."
- Which floors are Imagine Strength (by tap): **"Yes, nearly all"** (the Sizes sheet starts ticked).
- The room builder (voice): "you just need to put how many square feet it is. And then from there, you should just have like a modular box tool ... And then it tells you like how much square footage you've used. ... the machines need to have a little room to be a little bit tighter together ... we don't want to make it so that way you have to like spend twenty minutes in the tool to get that precise location. It just needs to be like a r- rough placement editor, but then like actually knowing the sizes is correct. But I don't want it to be like a very picky builder ... I like being able to put like, oh, there's a pillar here. Or a door here, or a desk here. Or a bathroom here. Changing room. Lockers. Fire extinguisher. AED. Office."

## 2. What was built, phase by phase

| Phase | Commit(s) | What |
| --- | --- | --- |
| 0 | `829d469e`, `975e4fde` (on master) | The rules' long comments moved to `docs/ops/RULES-NOTES.md`; the lint holds the file under 240 KiB. |
| 1 | `df1eb3f2`, `8d242539` | A machine's size, on its model (`machineModels/{id}.size`) and on its unit (`roster/{id}.unit.size`); the roster rule in resolve-once form; Its size on the machine's door; the seed script for the twenty Imagine Strength models. |
| 2 | `7d981599`, `866030fe` | The room as boxes from square feet, the palette of places, rough placement at true sizes with only overlaps marked, Arrange the floor (leaders), the Sizes sheet pre-ticked, the `floorPlans` rule. |
| 3 | `004854d5`, `86dafa9e` | Remodel plans with machines still to buy, Make this the map and its Undo, Admins' Arrange the floor, the Catalog's `Map \| List`. |
| 4 | `759aa905`, `5c7c4bdd` | The one machine card (Learn · Clean · Maintain · Set up), map first on My Studio → Machines, the team's cleaning checklist (Look up \| Cleaning, Mark all), Relay's floor on the map, the wipe chore counting real marks, the care record as the screen's one live read. |
| 5 | this commit | The perf lab's map scenarios and their numbers, this document, the two READMEs, the traps, the ship script. |

### Phase 4's review fixes, carried here

- **Undo never erases a later wipe.** `markWiped` returns the time and the author it wrote; its Undo reads the live care read when it is tapped (`useLiveCare`, from the screen's provider, which outlives a card that closed on Wiped) and puts back only the machines whose wipe is still that one, reopening only their rows. With the live read unknown it refuses ("Couldn't undo that.") rather than guess.
- **A cleaning category the studio made counts everywhere.** The Relay shell publishes today's wipe-chore rows already filtered with the studio's categories (`RelayContext.wipeRows`); the Board hands its categories to the floor; a door with no rows reads them with the categories (`useWipeRows`).
- **The card's reads.** From Relay at Clean the card adds no listener when Relay's floor is mounted (it publishes its roster and cleaning settings, `RelayContext.floorReads`); My Studio's map in Cleaning and its card share one read of today's rows.
- **Words.** A care read still loading is "Reading the cleaning marks…" (the Board's card, the map's head line, the tiles' line); "Can't read the cleaning marks right now" only when it failed, and the Board's bar is not drawn either way. A wipe time in the future is "Can't tell when it was last wiped". The wipe chore's panel says the assignee once, then "Anyone can mark a machine.".
- **Looks.** Cleaning draws an empty box on every machine still to wipe (the tick replaces it; the plum dot sits beside it), so Cleaning never looks like Look up. The map's buttons carry Refined Lift. The card's Out of service chip opens Maintain; open notes are a neutral chip, plum kept for Flagged and Out of service.
- **Out of service's Save** releases its unsaved-changes registration before it closes, so a guarded host closes the card without "Leave without saving?".

### The final review's fixes (Oct 12 2026)

- **A wipe chore that runs in two or three shifts.** Each shift has its own rows, and one wipe completes one row a machine (`rowsForWipe`), so the morning's Mark all left Close's rows open while Close's card read "All N wiped today" and done, with no way to close them from the Board (Team could then report the Close wipe missed the next day). A later shift's card (`laterWipeShifts`: its template also runs in an earlier shift today) now counts a machine only when it was wiped today AND its own row in that shift is done (`choreStates`): a done row is required as well as the wipe, never instead, so an instance is still never evidence of a wipe on its own. Its line says "this shift" ("None wiped yet this shift"), and its box and its panel's Mark all wipe the machines again and close that shift's rows. A chore in one shift counts as before.
- **A stand-in machine** (Relay's floor bridged from the catalog while a studio has no floor list) keeps **Report a problem** and **Clear the flag** in its card's Maintain (`ReportProblem`, split out of `MaintainPart`; flagMachine and clearMachineFlag need no roster entry); the floor notes, Out of service and upkeep still need the list.
- **My Studio → Machines' remembered Map** is honoured only where there is a map: with no layout, or none of this floor's machines on it, the section shows the list and offers no Map tab (the pick is per iPad, not per studio). Still being read, or unreadable, is not "no map".
- **The layout's rev** stays a literal number: a store test holds every layout write to a whole-number `rev` and `store.ts` to no `increment(` (the rules' rev check only protects an honest client, §8).

## 3. Where this round departs from the proposal, and why (design §0.5, and as built)

| Proposal | Built | Why |
| --- | --- | --- |
| `updatedAt` checked in a transaction | An integer `rev` the rule requires to be `resource.rev + 1` | Compare-and-swap at write time, no read-then-write, works for a write queued offline; a refusal is told apart by reading the document written. |
| A `kind` field and drafts by a query | Five fixed slots `d-1`..`d-5`, the rule's id pattern; nothing pruned or deleted | No index; at most six documents by construction. |
| The room as an outline with doors on its edges | Boxes from square feet, and a palette of nine places | AJ's room builder. An L, a T or a notch is two or three boxes, never a polygon. |
| `ceilingMm`, `workingArea` | Neither stored | No reader yet ("every number has a reader"); heights are Later. |
| A seeded demo layout in Demo Mode's reset | **Start from the practice layout**, a button in Demo Mode's editor through the ordinary store | Demo Mode's seed writes flags and stamps the `floorPlans` rule refuses. |
| A seed record document | None: the seed is create-only by id | Models are never deleted, so nothing to remember. |
| Spacing and path numbers | **Neither: no spacing check and no path check, so no setting** | §0.3 below. |
| Rules added as needed | Phase 0 trimmed the rules' comments first | Firebase's 256 KiB source limit (the partition reached 255,229 bytes). |
| The roster rule as it stood | Resolve-once (`rosterLeaderOnce`) | The old pair ran Out of service out of the expression budget at 8+ removed lines. |
| One-tap "These are Imagine Strength" | **Sizes**: one row a machine, pre-ticked, a picker and Measure on each | AJ's floors are mixed; "Yes, nearly all". |
| Sizes frozen into the plan | Looked up live (the unit's, then the model's) | A correction reaches every door at once. |
| A new palette for the map | `--eq-*` via `equipment.tokens.css` | Six guard files and the first screen untouched. |
| The care sheet Relay's, the door My Studio's | **One card**, `features/machine-card/` | AJ's "1a"; two cards for one machine would drift. |

**Departures made while building** (each said in its phase's commit):

- **Phase 0** was committed on top of the partition's head before the partition reached master; safe because no rules commit landed on the partition after it.
- **The card's listeners** (phase 4): opened from Relay at Clean with Relay's floor mounted, the card starts no listener of its own (the design allowed 1); opened while Relay's floor is not mounted (the Board on This week) it reads the roster and the studio's own settings (2). The perf lab measured the first case (§6).
- **A map too small to tap** shows that door's own list with its ticks, Relay included, instead of switching Relay to its tiles.
- **The card's header leaves out the model's name** (it would need the models read on every open).
- **Operations' card has no Open its Catalog page** (that host has no way to Learning); Admins' opens the catalog editor's page.
- **One row a machine per wipe** (phase 4's review fixes, for AJ to hear on his walk): a wipe completes one open wipe-chore row for each machine, the part of the day it is now when there is one, else the earliest still open (`rowsForWipe`). A 7 AM wipe no longer closes the Close shift's row.
- **The word on screen for a remodel draft is "plan"** (Delete plan, kept as a plan, all five plans are in use); "draft" is the store's and the comments' word only.
- **The words test** of design §E is not one `words.test.ts`: its assertions live in `LayoutView.render.test.tsx`, `FloorMapView.render.test.tsx` and `MachineCard.render.test.tsx`, beside the screens they read.
- **The perf lab's seed leaves its two unsized units off the map** (design §E asked for two unsized units; they are in the roster and under Not placed yet). Placed, they make the map untappable in portrait: §8, risk 1.

### §0.3's two decisions (the Oct 11 revision)

- **Spacing: dropped, not an opt-in.** A folded "Free floor between machines" panel would still be a standing claim that a floor AJ calls fine is short, and a setting few leaders open is a number with no reader. AJ asked for the opposite: "the machines need to have a little room to be a little bit tighter together." `place.ts` keeps a fixed 1 ft gap only so Place them all doesn't stack machines; it is never checked, drawn or said.
- **The path from the door: dropped.** It needed exact doors, a path-width setting, a 50 mm flood fill on every drop (the heaviest work on an iPad in the round) and a sentence that sounds like an inspection ("can't be reached"). A check that only means something on an exact drawing doesn't belong in a rough one. `grid.ts` and `reach.ts` were deleted (WIP `2530d727` holds them).

What stays is what AJ named: "actually knowing the sizes is correct". True sizes, and a quiet plum edge where two things really occupy the same floor.

## 4. Data: what is stored, and the one thing beyond AJ's three structures

AJ approved three structures: the `floorPlans` documents, `machineModels/{id}.size` and the roster's `unit.size`. Nothing else is new: no field, no document kind, no index, no setting, no Cloud Function, no Mindbody call.

- `machineModels/{id}.size` = `{ lengthMm, widthMm, heightMm, source, note? }`, administrators only (`modelSizeValid`).
- `studios/{s}/roster/{id}.unit.size` (and `modelId`, an existing field), a studio's leaders (`rosterUnitSizeOk`, inside the resolve-once roster rule).
- `studios/{s}/floorPlans/{current | d-1..d-5}` = `{ v: 1, name, room: { areaSqFt?, boxes, places }, placements, retired?, rev, updatedAt, updatedBy }`; read by everyone who works at the studio, written by its leaders and administrators, never deleted.
- **The one thing a reader might ask about: the planned-machine shape inside a `floorPlans` document.** A machine still to buy is a placement `{ kind: "planned", id: "pm-...", label, movementId, modelId, lengthMm?, widthMm?, x, y, rotationDeg }`, on a plan (`d-1`..`d-5`) only. It is covered by AJ's approval of those documents; it is said here anyway. The rules can't look inside a list, so `layout.ts` refuses one on `current` (`planProblems`) and drops one read from it (`readPlan`).

**The cleaning checklist writes only existing fields under existing rules** (rules tests C1 to C5): `machineCare`'s `lastWipedAt`, `lastWipedBy` and `updatedAt` (the old care sheet's fields, so marks made with the new app stay valid for the old one), the wipe chore's `taskInstances` set to done (the payload `setManyTaskStatuses` already wrote), and an `upkeepLog` entry. **Wipes leave the upkeep log only when they complete no chore row:** a completed wipe-chore instance is already a clean event in the upkeep tally (`mergeUpkeepHistory`), so Mark all on a floor whose rows are known writes no log entry.

**The two loose rules the checklist lives beside, by name** (Oct 11 reviews, S7 and S11):

- **`taskInstances` checks no studio** (KNOWN-TRAPS, "Still open, needs AJ's OK"; rules test C4b pins it: a trainer of studio B can set studio A's wipe-chore row to done). That is why the checklist counts `machineCare` (studio-checked) and never an instance's status. Closing it (`writesForStudio` on the instance rule) is **for AJ's OK, not built**; if he says yes, B7 is measured again on the 120-row batch first.
- **`machineCareValid` accepts any id, any time and any named wiper** from anyone who works at the studio (an insider-only risk, accepted). `markWiped` and the card take ids only from the studio's own floor read, and a wipe time more than 10 minutes ahead reads as "Can't tell when it was last wiped". The rule is byte for byte master's (the lint and the ship script check it).

**Which record "Report a problem" writes:** the machine's flag (`machineCare.flag`, through `flagMachine`), the line every floor door already shows until someone clears it (Relay's head line, Open loops, Since you were in, the machine menu's safety strip, the Catalog's Flagged), and it rings the studio leader's bell as Relay's care sheet has since Sep 2026. **It differs from the machine menu's note box**, which writes a "The machine itself" floor note (a dated thread anyone can close, no bell; Oct 4 2026). One fault written two ways is AJ's question 3 (§9).

## 5. The rules' budget

Rule-coverage evaluations the emulator counted for each case (`tests/firestore.rules.test.ts`, `[rules budget]` lines; every case passed, so each write is inside Firestore's limits). Measured on phase 4's head (`5c7c4bdd`); rules tests **449** passing (404 on master).

| Case | Evaluations |
| --- | ---: |
| `machineModels` create, the fullest model | 875 |
| roster update, `unit.size`, leaderA at A, 10 removed safety lines | 1,335 |
| roster update, Out of service, leaderA at A, 10 removed lines | 1,378 |
| roster update, `modelId` / order / order reset, leaderA at A | 1,311 |
| roster update, Out of service, franchiseAB (owner) at B / grantA2 / guestGrantA | 1,383 |
| roster batch, order only, franchiseAB at B | 1,316 |
| `floorPlans` update, grantA2, 12 boxes, 40 places, 120 placements | 880 |
| `floorPlans` read, guestA | 866 |
| `floorPlans` batch, franchiseAB at B, Make this the map with 30 to buy (three writes) | 2,640 |
| `machineCare` + `taskInstances` batch, a guest found last, Mark all at 120 machines + 120 chore rows (240 writes) | 256,320 |
| `upkeepLog` batch, the same guest, 120 clean entries | 107,280 |

So `markWiped` keeps one batch up to 240 writes (B7's measured maximum) and splits beyond it under one Undo.

## 6. The perf lab's numbers (Oct 12 2026)

`harness/perf-lab/`, the map scenarios (`run.mjs` `MAP_SCENARIOS`, opt-in): **map** (My Studio → Machines opens on the map, a tap, the card at Set up, the listeners the map, the card and Cleaning add), **clean** (Relay's floor in Cleaning, a tap, Mark all), **arrange** (Arrange the floor, a machine dragged 30 moves onto another, The room, a box edge dragged 30 moves, Save), **catalog-layout** (Learning → Catalog → the floor → Map, a tap, the card at Learn, Open its Catalog page) and **catalog-layout-relay** (a card from Relay's map, Maintain and Set up unfolded and folded). The seed adds the twenty Imagine Strength models, the practice layout, three plans (one with two machines to buy) and the care record for the twenty, half wiped this morning.

Run `studio-map-final`: `node harness/perf-lab/lab.mjs all --skip-build --profiles ipad10-portrait,ipadmini-portrait --reps 3 --scenarios map,clean,arrange,catalog-layout,catalog-layout-relay`, three timed reps and one profiled on each profile, on AJ's PC (this PC 233 ms on the bench against the reference's 235; the iPad classes reached 2.91x and 2.89x of the 3x asked). Medians, then [min-max]. Chrome's numbers, not Safari's.

**The design's targets (§E), all met:**

| Target | At most | iPad 10th gen, portrait | iPad mini 6, portrait |
| --- | ---: | ---: | ---: |
| Missed frames in a 30-move machine drag | 1 | 0 | 0 |
| Missed frames in a 30-move box-edge drag | 1 | 0 | 0 |
| Drop → overlaps drawn, less the editor's 120 ms settle | 50 | 49 [34-65] | 46 [30-47] |
| Tap → its tick (Cleaning) | 100 | 52 [43-60] | 56 [50-58] |
| DOM nodes, the whole page, on the map | 650 | 529 (the map's own 201) | 527 (199) |
| DOM nodes, the whole page, in the editor | 750 | 621 (the editor's own 282) | 619 (280) |
| Listen targets the map adds (List → Map) | 3 | 1 | 1 |
| Listen targets Cleaning adds on My Studio | 2 | 2 | 2 |
| Listen targets the card adds from Relay at Clean | 1 | 0 | 0 |
| Listen targets Maintain adds (all taken back when folded) | 6 | 5 | 5 |
| Listen targets Set up adds (taken back when folded) | 2 | 1 | 1 |

The drop's line is close to its target on the iPad 10 (median 49, one rep 65): the overlap checks run once, 120 ms after a drop, and the rest is their work and the draw. Worth watching if a studio holds far more than twenty machines.

**The other steps:**

| Step (ms) | iPad 10th gen | iPad mini 6 |
| --- | ---: | ---: |
| My Studio → Machines: the Machines tap → the map drawn | 1,203 [1,169-1,213] | 720 [704-800] |
| … from the bottom bar's My Studio | 2,545 [2,196-2,615] | 2,157 [2,095-2,168] |
| A tap on the map → the card, Set up drawn | 54 [32-107] | 44 [34-101] |
| Cleaning on → its head line | 26 [26-34] | 41 [39-45] |
| Mark all (9 machines) → every tick drawn | 56 [53-65] | 47 [44-60] |
| Mark all → the database's answer (the emulator's, apart) | 305 [265-318] | 191 [191-193] |
| Arrange the floor → the editor drawn | 406 [392-438] | 431 [382-437] |
| A drag's 95th-percentile frame | 6 [6-12] | 12 [6-12] |
| Save → the database's answer | 116 [113-147] | 66 [60-69] |
| Learning → the Catalog's map drawn | 920 [903-978] | 1,255 [1,217-1,283] |
| The Catalog's Map tap → the map drawn | 240 [215-244] | 345 [336-351] |
| A tap on the Catalog's map → the card, Learn drawn | 28 [23-28] | 24 [24-25] |
| Open its Catalog page → the page drawn | 75 [73-82] | 77 [72-121] |
| A name in Relay's map list → the card, Clean drawn | 33 [31-36] | 34 [34-39] |

Long tasks: none in the drags, Save, Cleaning, Mark all or the cards; the map's open had one of about 63 ms on the iPad 10 and three totalling about 180 ms on the mini; the Catalog page's open one of about 60 ms.

**What the lab can't see:** Safari's paint and touch. The drags are pointer events dispatched in the page one an animation frame (the app's work per frame, not iPadOS's touch path), and headless Chrome's frames come faster than 60 a second, so only an interval past 16.7 ms counts as missed. AJ's real-iPad pass (on his walk; it doesn't gate the ship) covers portrait and landscape, light and dark, and specifically: a machine drag and a box-edge drag in portrait move the item and don't scroll the frame; the empty floor still scrolls; at Fit a selected pillar drags (no handles); a zoomed-in room pans with a finger on an unselected box; two machines pushed together end flush; the AED's words read at Fit on an iPad mini; three iPads marking at once see each other's ticks.

**Found by the lab** (the first trial run): with the two unsized units placed on the practice layout, My Studio's map showed "Too small to tap at this width. Use the list below." on the iPad 10 in portrait. §8, risk 1.

## 7. The chunk sizes (a production build of this branch)

The first screen: **464.8 KB gzip of 480** (unchanged by the round; `npm run check:bundle`, no charts, drag and drop or motion on it). No new vendor library.

| Lazy chunk | gzip | Holds |
| --- | ---: | --- |
| `LayoutView` | 15.6 KB | Arrange the floor (the editor, the plan tabs, Sizes, the room tool) |
| `StudioRoom` | 9.0 KB | The drawing |
| `studio-map` (shared) | 6.7 KB | The pure modules the drawing and the editor share, and the models' read |
| `FloorMapView` | 3.0 KB | The map every door but the Catalog reads |
| `studio-map.css` | 3.0 KB | The map's stylesheet |
| **The drawing and the editor together** | **about 34 KB** | target at most 60 KB |
| `lazy` (shared) | 30.7 KB | The card's code (about 5.6 KB gzip of it by its source map), with the floor notes, Relay's care read, the Catalog's floor helpers and the admin floor pieces it shares with Operations and Admins |

The card's own code is about 5.6 KB gzip (target at most 15 KB); the chunk it rides in is shared and is fetched by whichever floor door opens first.

## 8. Residual risks (design §G, as built)

1. **One unsized machine turns the map into its list in portrait.** `roomIsTappable` needs every machine's short side at 24 px or more, and an unsized unit counts as its 2 ft marker. On a 60 x 30 ft room that marker draws at 15 to 23 px at 520 to 760 px wide (every iPad in portrait), so My Studio, Relay and Operations show the list with "Too small to tap at this width"; with all twenty sized the smallest machine (the bicep) draws at 26 to 39 px and the map shows. Until a studio's placed units are all sized (the seed, then Sizes), its trainers get the list in portrait. The leaders' steps after the seed (§10) are the way through. Changing the rule for markers (a marker is tapped by its 44 px hit circle) is AJ's call, not made here.
2. **Sizes are frames at rest from a brochure with known slips.** Each source line ends "frame at rest"; the notes travel with each model; a measured size wins; a wrong axis is a Turn; only an overlap over 6 in is marked.
3. **A unit marked with the wrong model** draws at a confident wrong size. The rows start ticked (AJ's "Yes, nearly all") but nothing is written until Mark {n}, a studio's own machine starts unticked, Undo follows, and another movement's model is refused.
4. **The demoted-leader window.** A leader demoted mid-session keeps writing layouts and Out of service until their token refreshes, the same window the roster has; making the layout alone stricter would be stricter than the roster beside it. The writes that share it (`getRole()` reads the claim first): the roster (`rosterLeaderOnce`, `unit.size` and `modelId` included), the layout (`floorPlanWriter`, every `floorPlans` document) and, for an administrator demoted, `machineModels` (`size` included). The home studio comes from the trainer document, so a stale claim never reaches another studio's layout.
5. **The layout's bytes and its lists' contents are the app's to hold, not the rules'** (design §A.3, P22: "catches a bug, not a person"). The rules can't bound a document's bytes or look inside a list; the app's 64 KB budget and `readPlan`'s drops do. The final review proved the boundary: a leader writing by hand saved a layout of about 960 KB (twelve boxes each carrying an 80,000-character field) and a plan whose placements were strings, and every iPad listening to the studio's layout then downloads about 1 MB on each save. It is a leader's own write, bounded at six documents a studio each under 1 MB, and `readPlan` drops the junk on read. In Demo Mode, where every trainer leads, it is the same bounded nuisance; a Demo-only guard is on the parking list.
6. **The rev check protects an honest client only.** `d.rev == resource.data.rev + 1` is met by `increment(1)` without reading rev, and two sets of one document in one batch are each checked against the state before the batch. Only someone who can already write the layout can do either, so it gives no new access; "Someone changed it" depends on `store.ts` always sending the number it read plus one, which `store.test.ts` holds (a whole-number `rev` on every layout write, no `increment(` in the store).
7. **Concurrent leaders:** `rev`, nothing deletes, the losing save kept as a plan with whose save won.
8. **Tap density.** The read doors fall back to the list when the map isn't tappable; the editor's handles are 44 px and aren't offered on an item under 44 px; the safety markers draw at 28 px and may sit over a small machine's edge on a big room at Fit on an iPad mini (findable beats tidy; never tap targets in the read doors).
9. **A shared iPad marks under one person.** The care record and the chore rows say the signed-in person did it; no screen shows it. A card's Wiped tapped before its own row read has answered marks the machine but leaves an assigned row open (the Board counts the wipe; Team could read the row as missed the next day).
10. **An unmark is only the toast's Undo.** `machineCare` holds the last wipe only; a wrong mark costs a wipe that was due anyway. Cleaning is never remembered on the doors people open to look things up.
11. **The card's reads.** `useStudioUpkeep` stays unbounded (an existing read on My Studio and Admins), now mounted by the card only while Maintain is open; bounding it is on the parking list.
12. **Retiring the care sheet** changes Relay's tap: it opens the card (Clean open). "Today on this machine" with names is gone, as AJ asked.

## 9. AJ's three questions, each built with its default (design §G)

1. **When a trainer opens Relay's floor, Cleaning or Look up?** *Built: Cleaning* (`map-mode-memory.ts` `RELAY_FIRST_MODE`), remembered per iPad until sign-out; "Tap a machine when it's wiped." always shows in Cleaning. My Studio, Operations and Admins always open in Look up. *If Look up:* one constant.
2. **The editor's words: his own or the Oct 10 ones?** *Built: his own* — "The map", "Plan a remodel", "Remodel 1", "Make this the map" (and "plan" for a draft on screen). *If the Oct 10 ones:* "The layout", "Try a change", "Use this layout": strings only.
3. **What Report a problem writes, and whether it rings the leader.** *Built: (a), as today:* the machine's flag, and the leader's bell. *If (b):* the bell line comes out of `flagMachine`. *If (c), a "The machine itself" floor note like the machine menu's:* the card and the menu write one record, and the flag's readers move to open notes, a round of its own.

**For AJ's OK, not built** (each changes the rules; the final review found the last three, Oct 12 2026):

- `writesForStudio(studioId)` on the `taskInstances` create and update rules (§4).
- **Who may read a studio's machine care, upkeep log and task instances.** `studios/{s}/machineCare`, `upkeepLog` and `taskInstances` are read by any signed-in account (`allow read: if isAuthenticated()`, master's rules unchanged), and the studio list is readable too, so an account with no trainer document can list every studio and read each one's flags (free text that can name a client), the wipers' names and the upkeep log. This round adds to what sits there: Mark all writes `lastWipedBy` on up to 120 machines, and Report a problem stores a flag note of up to 500 characters. The fix is `isAuthenticated() && writesForStudio(studioId)` on the three reads, as `floorPlans` and the roster already are; B4 and B7 are measured again first.
- **At most ten removed safety lines, in the rules.** `removedSafetyValid` checks only the first ten lines' reasons, so an eleventh (or a fiftieth) goes in with no reason from a leader's own write (master's the same); only the app stops it. The fix is `&& l.size() <= 10` in `removedSafetyValid`, then R1 and B1 again.
- *(Optional, only beside a rules change for something else)* `v is int` in `sizeMmOk`: the rules take a fraction of a millimetre, a null height and a `unit` that is a list; the app writes whole millimetres (the forms round) and every reader is tolerant.

## 10. Shipping

`scripts/ship/ship-studio-map.ps1`, from `.claude\worktrees\studio-map`:

- **`-Stage prepare`** (changes nothing): the partition live (the live rules are master's or already this branch's, read with the key, or AJ types PARTITION after finding `roleRunsOwnStudios` in the console); the branch and a clean tree, LF, the case check; `functions\`, `render.yaml`, `firestore.indexes.json`, `server\`, `server.ts`, `package.json` and its lock unchanged; the rules hold `function rosterUnitSizeOk(`, `function modelSizeValid(` and `match /floorPlans/{planId}` with `'boxes'` and no `'outline'`; `machineCareValid` byte for byte master's; no `layoutSpacingIn` or `layoutPathIn` in the studio settings; the rules lint; typecheck 2; the suite; the builds with `dist\` cleared first, `npm run check:bundle`, no perf lab marker in `dist\`; the rules tests; the Firebase login. **PREPARE PASSED.** It does not check or edit `CLAUDE.md`.
- **`-Stage golive`** (type GO): the restore tag `restore/2026-10-12-before-studio-map` at master (`5a0bf7ea`); the indexes (no change, the house order); the rules tests again; the rules deployed and checked live for `match /floorPlans/{planId}`; `git push origin oct10/studio-map:master`, fast-forward only; Render's three presses for AJ (Manual Deploy on the web service, `version.json` names the commit, Manual Build on both crons). "Next: -Stage seed once version.json names the commit."
- **`-Stage seed`**: Render serves the commit; the Imagine Strength models' dry run, GO, `--commit`, the dry run again ("Nothing to write"); then the in-app step: Solon and Strongsville, **Draw the floor → Sizes**, check the pre-ticked rows, untick any that aren't Imagine Strength, Mark them, place the machines and the safety markers, Save.

**Undo:** `git push --force origin restore/2026-10-12-before-studio-map:master` and Render's three presses; the rules can stay (they only add access; the old app never touches `floorPlans` or `unit.size`); the seed has `--remove`. Cleaning marks made with the new app stay valid for the old one.

**Deploy day and mixed versions** (the final review, Oct 12 2026): the new Board counts the floor's wipe marks (`machineCare`), never the old app's row ticks, which wrote `taskInstances` only. So a studio that finished its wipe chore on the old version earlier that day reads "None wiped yet today" on every new iPad until it is marked again, and an iPad still on the old version keeps ticking rows the new ones don't count until it reloads on the Hub (rows marked by the new app complete the instances too, so the gap runs one way). **Deploy before the studios open** (golive says so). And an iPad still on the previous version can erase what the seed stage adds: an administrator saving a model there writes it whole without its `size`, and a leader saving a machine in the old editor writes `modelId` (or deletes it). **Before the seed, every administrator and the Solon and Strongsville leaders open the Hub so their iPads load the new version** (the seed stage says so before its dry run).

**What changes for live users:** trainers' My Studio → Machines opens on the map once their studio has one (List one tap away; a phone keeps the List); a tap on a machine anywhere opens one card; Cleaning on Relay's floor and on My Studio's map, Mark all, everyone's marks on every iPad, no names; Relay's "Wipe down every machine" card counts the real marks ("12 of 19 wiped today"; a chore's later shift, such as Close after Opening, needs its own row as well: "None wiped yet this shift"). Leaders and administrators also get Draw the floor / Arrange the floor, remodel plans, Out of service on the card and Sizes. Cost: one listener on `current` while a map is open, the editor's collection read, the models listener where a unit names a model, the existing care listener (one a screen), the task reads on My Studio's map only in Cleaning, the card's extra listeners only while a part is open. No Mindbody call, no timer, no Cloud Function, no ping beyond today's flag bell.

**Measured on this branch (Oct 12 2026):** typecheck **2**; suite **14,174** passing in 855 files with `TZ=America/New_York npx vitest run --dir src --testTimeout=30000` (the ship script's form), and **14,437** passing and 1 skipped in 869 files with `TZ=America/New_York npx vitest run src --testTimeout=30000` (the filter form, which also takes in the test files outside `src/` whose path holds "src"; the phase commits' counts are this form). Phase 5 adds no test, the final review's fixes nine; rules tests **449** (phase 4's head, and again on the final review's fixes, which change no rule); the first screen **464.8 KB** gzip of 480.

## 11. After the release: every MSF machine starts at its Imagine Strength size (Oct 12 2026)

AJ drew the practice floor in Demo Mode the afternoon the release went live and every machine was a "?": "when making the floor in demo mode none of the machines had any of their dimensions up so when i add them to the floor they are all ? marks, we have the info for the machines lets add it". The twenty models were seeded that morning; what was missing was each unit naming its model. Demo Mode's Set up and Reset name them (`seed-core.ts` `DEMO_MODEL_BY_MOVEMENT`, phase 2), but the practice studio had been set up before the release, and the Sizes button under the drawing is easy to miss. Asked whether a studio's MSF machines should start at their Imagine Strength size or wait for a leader to mark them, AJ picked **"Fill them in"** (the recommended option, worded "Every MSF machine draws at its Imagine Strength size from the start, its size line saying 'Imagine Strength size, not confirmed' (the way a Mindbody guess waits for a trainer's confirm). A leader confirms them on Sizes in one tap, or picks another model or measures one that differs. The map works on day one.").

What changed, on `oct12/map-sizes` over master `2fc91005`, front end only:

- **The rule** (`sizes.ts`): measured, else the model the unit names, else, for a catalog copy (the roster's `source` isn't "custom") of an MSF movement, its movement's one Imagine Strength model (`from: "assumed"`), else not known. Two Imagine Strength models for one movement, or one without a size, stay not known. A studio's own machine never takes one. Nothing is written by it. This reverses this round's "Nothing guesses a model from a movement" for catalog copies only, with the guess labelled.
- **Every door reads the same facts** (`unitFactsOfEntry`) and reads the models whenever a unit can use them (`sizeNeedsModels`): My Studio's, Relay's, Operations' and Admins' map (`FloorMapView`, which read them only when a unit named a model, so a copy would have waited forever) and the Catalog's floor lens (`CatalogWikiView` gives `FloorRoomView` its read). One listener on a 20-document collection while a map is open.
- **The words**: "Imagine Strength size, not confirmed · IS2019 Leg Press" on the unit's Its size and the selected machine's panel; the Sizes sheet's rows say "Imagine Strength size, not confirmed" and its head "20 sizes not confirmed yet"; Arrange the floor's line under the drawing says "20 sizes not confirmed yet." beside Sizes. The card's folded Set up line no longer says "Size not known yet" for a copy that may have one.
- **Confirm**: a leader's Its size shows **Confirm** (blue) beside Measure it and Change model; one tap writes the assumed model's `modelId`, never awaited. The Sizes sheet's ticks name the very model each copy was drawn at, so **Mark 20 as Imagine Strength** confirms them all.
- **Risk 1 and 3 above, now**: one unsized machine still turns a map into its list in portrait, but an unsized machine is now a studio's own machine or a movement with no Imagine Strength model. A Hoist or Nautilus copy is drawn at the Imagine Strength size until a leader picks its model or measures it: the guess is said on every line that shows the size, and the floor is rough on purpose.

**The review's fixes** (an Opus reviewer read the commit against every door): a roster entry's movement is made canonical (`movementOfEntry` through `canonicalMachineId`), so a copy filed under a legacy id such as `leg_press` gets the same size on My Studio's map as on the Catalog's, and its Confirm and model picker; and a size read that hasn't answered or failed is never counted as "no size" (the editor's line counts only sizes known to be missing, its rows say "Checking the size…" or "Size couldn't be read", and the Sizes sheet's head says "Checking the sizes…" or "The sizes couldn't be read"). The card's folded Set up line says nothing for a copy whose size it can't tell without the models; Set up says which once opened. The perf lab's two units with no model now take their Imagine Strength size (`harness/perf-lab/seed.ts`'s note says so).

No rules, index, Function, Mindbody or data change. Demo Mode needs nothing: its machines either name their model already or take it now.

## For CLAUDE.md (applied at ship time)

CLAUDE.md is rewritten on another branch (`oct9/claude-md`), so this round does not edit it. At ship time these lines go in, worded to fit that version:

**Where things are** (new rows):

- *The studio map (sizes, the room as boxes, the map, Arrange the floor, drafts)* → `src/features/studio-map/` (README first). The room is boxes started from square feet with a palette of places (the AED and the fire extinguisher drawn on every door's map); machines at their true size, placed roughly, only overlaps marked; Arrange the floor is the leaders' editor (Draw the floor while a studio has no map), with remodel plans that may hold machines still to buy; `ui/FloorMapView.tsx` is the map every door but the Catalog reads, with its two modes, Look up and Cleaning. The layout is `studios/{s}/floorPlans/{current | d-1..d-5}` (whole documents at `rev + 1`, never deleted); a size is the unit's `roster.unit.size`, else its model's `machineModels/{id}.size`. The perf lab's map scenarios are `harness/perf-lab/run.mjs` `MAP_SCENARIOS`. `docs/rounds/2026-10-12-studio-map.md` is the round.
- *The machine's card (Learn · Clean · Maintain · Set up, one card from every door)* → `src/features/machine-card/` (README first). `parts.ts` is the order and which part each door opens first (Relay: Clean; the Catalog: Learn; My Studio, Operations and Admins: Set up; any door in Cleaning: Clean); `useMachineCardReads.ts` mounts a part's reads only while it is open; the care record is the screen's one live read (`relay/board/machine-care-context.tsx`, `useCareRead`), never a prop. Out of service has one writer, `admin/machines/roster-status.ts`. Report a problem writes the machine's flag and rings the leader's bell (as the care sheet did).

**Relay's row** gains: *the floor's Cleaning mode and the wipe chore counting real marks* (`relay/board/cleaning.ts` the checklist's pure half, `markWiped` in `machine-care-store.ts` every wipe's one write; the wipe chore's line is "12 of 19 wiped today", counted by the machines wiped, never by its rows alone (a later shift of a chore that runs in two, such as Close after Opening, needs its own row done as well: "None wiped yet this shift", `laterWipeShifts`); its box is Mark all; the care sheet is retired for the card; Relay's floor opens in Cleaning, remembered per iPad).

**My Studio's row** gains: *Machines opens on the map* (once the studio has one with a machine on it; `Map | List`, the list one tap away and always on a phone).

**Decisions already made** (new lines):

- **A machine opens one card from every door; only the part open first changes** (AJ, Oct 11 2026, "1a"). Learn · Clean · Maintain · Set up in that order everywhere; Relay opens Clean, the Catalog Learn, My Studio, Operations and Admins Set up, any door in Cleaning Clean (`machine-card/parts.ts`, held by `parts.test.ts`). Through `relay.openPanel` a card is given ids and callbacks only, never data.
- **Cleaning is the team's light checklist** (AJ, Oct 11 2026: "it doesn't need to be that military"; Q1: "mark done claim for later optional for planning"). A mark says "wiped today" for the team: no name, no minute, no count per person, no claim, no ping. Mark all is one tap and one batch with Undo; marks are live on every iPad; out-of-service machines are never counted. My Studio, Operations and Admins always open the map in Look up; only Relay remembers Cleaning.
- **The floor is rough on purpose: true sizes, no spacing or path check, only overlaps marked** (AJ, Oct 11 2026: "It just needs to be like a r- rough placement editor, but then like actually knowing the sizes is correct. But I don't want it to be like a very picky builder"). Machines move in 6 in steps and boxes in whole feet; an overlap over 6 in is a quiet plum edge and one line in the selected machine's panel; covering the AED, the extinguisher or a doorway is said past 1 in. Rearranging is rare and a leader's (AJ: "EXTREMELY rare"); remodel plans may hold machines still to buy, the map never does (AJ: "AJ agrees").
- **A machine's size belongs to its unit, and an MSF machine starts at its Imagine Strength size, not confirmed** (AJ, Oct 12 2026, "Fill them in"). A catalog copy that names no model and isn't measured is drawn at its movement's one Imagine Strength model's size and says "Imagine Strength size, not confirmed" until a leader confirms the model (Sizes' Mark, pre-ticked for catalog copies, AJ's "Yes, nearly all"; or Confirm on Its size), picks another or measures it (`studio-map/sizes.ts`). A studio's own machine is never given one, and the assumption writes nothing.

**The Commands table's Tests row:** **14,174** passing in 855 files on `oct10/studio-map` (`TZ=America/New_York npx vitest run --dir src --testTimeout=30000`; 14,437 and 1 skipped in 869 files with `vitest run src`) (Oct 12 2026: the studio map, phases 1 to 5, on master's `5a0bf7ea`; typecheck 2; rules tests **449**; the first screen 464.8 KB gzip; the perf lab's map scenarios all within the design's targets, `docs/rounds/2026-10-12-studio-map.md` §6). The row it replaces moves to `docs/KNOWN-TRAPS.md#baselines` word for word.
