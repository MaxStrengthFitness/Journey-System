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
