# The studio map (Oct 10 to 12 2026)

The round document is written in full in phase 5 (design §F: AJ's words of Oct 10 and the Oct 11 hand-off, §0's departures, the budget table, the perf numbers, the chunk sizes, the questions, the demoted-leader window, the residual byte risk in Demo Mode, the planned-machine shape inside `floorPlans` documents, the two loose rules beside the cleaning checklist, which record "Report a problem" writes, and the upkeep log's rule). Until then this file holds what each phase must carry to ship time, so nothing is lost between phases.

## For CLAUDE.md (applied at ship time)

CLAUDE.md is rewritten on another branch (`oct9/claude-md`), so this round does not edit it. At ship time these lines go in, worded to fit that version:

**Where things are** (new rows):

- *The studio map (sizes, the room as boxes, the map, Arrange the floor, drafts)* → `src/features/studio-map/` (README first). The room is boxes started from square feet with a palette of places (the AED and the fire extinguisher drawn on every door's map); machines at their true size, placed roughly, only overlaps marked; Arrange the floor is the leaders' editor (Draw the floor while a studio has no map), with remodel plans that may hold machines still to buy; `ui/FloorMapView.tsx` is the map every door but the Catalog reads, with its two modes, Look up and Cleaning.
- *The machine's card (Learn · Clean · Maintain · Set up, one card from every door)* → `src/features/machine-card/` (README first). `parts.ts` is the order and which part each door opens first (Relay: Clean; the Catalog: Learn; My Studio, Operations and Admins: Set up; any door in Cleaning: Clean); `useMachineCardReads.ts` mounts a part's reads only while it is open; the care record is the screen's one live read (`relay/board/machine-care-context.tsx`, `useCareRead`), never a prop. Out of service has one writer, `admin/machines/roster-status.ts`.

**Relay's row** gains: *the floor's Cleaning mode and the wipe chore counting real marks* (`relay/board/cleaning.ts` the checklist's pure half, `markWiped` in `machine-care-store.ts` every wipe's one write; the wipe chore's line is "12 of 19 wiped today", counted by the machines wiped, never by its rows; its box is Mark all; the care sheet is retired for the card).

**My Studio's row** gains: *Machines opens on the map* (once the studio has one with a machine on it; `Map | List`, the list one tap away and always on a phone).

**Decisions already made** (new lines):

- **A machine opens one card from every door; only the part open first changes** (AJ, Oct 11 2026, "1a"). Learn · Clean · Maintain · Set up in that order everywhere; Relay opens Clean, the Catalog Learn, My Studio, Operations and Admins Set up, any door in Cleaning Clean (`machine-card/parts.ts`, held by `parts.test.ts`). Through `relay.openPanel` a card is given ids and callbacks only, never data.
- **Cleaning is the team's light checklist** (AJ, Oct 11 2026: "it doesn't need to be that military"; Q1: "mark done claim for later optional for planning"). A mark says "wiped today" for the team: no name, no minute, no count per person, no claim, no ping. Mark all is one tap and one batch with Undo; marks are live on every iPad; out-of-service machines are never counted. My Studio, Operations and Admins always open the map in Look up; only Relay remembers Cleaning.
- **The floor is rough on purpose: true sizes, no spacing or path check, only overlaps marked.**

**The tests count**: the round's own, recorded in phase 5 (phase 4's suite: see its commit).

## Carried from phase 4's review fixes (for phase 5's document)

- **Undo never erases a later wipe.** `markWiped` returns the time and the author it wrote; its Undo reads the live care read when it is tapped (`useLiveCare`, from the screen's provider, which outlives a card that closed on Wiped) and puts back only the machines whose wipe is still that one, reopening only their rows. With the live read unknown it refuses ("Couldn't undo that.") rather than guess.
- **One row a machine per wipe** (decided in the fix, for AJ to hear at the walk): a wipe completes one open wipe-chore row for each machine, the row of the part of the day it is now (Opening, Between clients, Close: the Board's `partNow`) when there is one, else the earliest still open (`rowsForWipe`). A 7 AM wipe no longer closes the Close shift's row; a studio with one wipe chore still gets it done whenever it is wiped. The Board's own Mark all passes one shift's rows, so the map and the Board agree. Batches are cut by writes (at most 240, B7's measured size), each machine beside its row.
- **A cleaning category the studio made counts everywhere.** The Relay shell publishes today's wipe-chore rows already filtered with the studio's categories (`RelayContext.wipeRows`, was `dayRows`); the Board hands its categories to the floor; a door with no rows reads them with the categories (`useWipeRows`).
- **The card's reads, against the design's targets.** From Relay at Clean the card now adds no listener when Relay's floor is mounted (it publishes its roster and cleaning settings, `RelayContext.floorReads`); My Studio's map in Cleaning and its card share one read of today's rows (`MachinesSection`). Opened while Relay's floor is not mounted (the Board on This week), the card still reads its roster and settings itself (2, as phase 4 reported).
- **Learn's door.** Admins' card opens the catalog editor's page for a machine from the MSF catalog (`StudioEquipmentPanel.onOpenCatalogMachine`, through `go({ page: "machines", machineId })`); a studio's own machine has no catalog page there, so its Learn shows its lines only. Operations' card still has no Open its Catalog page (that host has no way to Learning).
- **Words.** A care read still loading is "Reading the cleaning marks…" on the Board's card, the map's head line and the tiles' line; "Can't read the cleaning marks right now" only when it failed, and the Board's bar is not drawn either way. A wipe time in the future is "Can't tell when it was last wiped". The too-small sentence is "Too small to tap at this width. Use the list below." (the map and the Catalog's map). The wipe chore's panel says the assignee once, then "Anyone can mark a machine.".
- **Looks.** Cleaning draws an empty box on every machine still to wipe (the tick replaces it; the plum dot sits beside it), so Cleaning never looks like Look up. The map's buttons carry Refined Lift (a raised lift, the blue fill's glow, a press). The card's Out of service chip opens Maintain; open notes are a neutral chip, plum kept for Flagged and Out of service.
