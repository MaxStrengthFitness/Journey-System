# The machine's card

One card for a studio's machine, from every door: **Learn · Clean · Maintain · Set up**, in that order everywhere. Built in the studio map round (phase 4, Oct 12 2026; `docs/rounds/2026-10-12-studio-map.md`).

AJ, Oct 11 2026: "this map allows people to interact and click on a machine to learn,clean,maintaince the machines among other posssible things". Shown the same Leg Press card from three doors (Relay with Clean open, My Studio's map with Set up open, the Catalog with Learn open), he answered **"1a"**: one card, the first part matching the door. And on the two layers: "the map will like to the main MSF catalog page and the my studio map will hold the unique to that studio version".

This is not the machine menu (`src/features/machine-menu/`), which is a CLIENT on a machine (her settings, her Staircase, her notes). This card is the MACHINE on this studio's floor: the method's door, its cleaning, its faults and upkeep, and the studio's own set-up.

## The rules

- **One card, many doors; only the part open first changes** (`parts.ts`, its table pinned by `parts.test.ts`). Relay opens Clean; the Catalog opens Learn; My Studio, Operations and Admins open Set up; any door in Cleaning opens Clean. Any part can be opened or folded, and none remembers. All four parts show for everyone who can open the card: what changes with the person is inside a part (a trainer's Set up is read only, Out of service is a leader's button), never which parts exist.
- **Learn** is the movement and the way to its Catalog page ("Open its Catalog page"). Max Strength owns the method, so nothing of it is copied here: the page is the method. A studio's own machine with no MSF movement shows its own line and its own page. Operations' card has no way to Learning, so no button there; Admins' opens the catalog editor's page.
- **Clean is only the cleaning**, in days, never who or what minute (AJ: "it doesn't need to be that military"): **Wiped** (blue) and **Deep cleaned**, the weekly maintenance line on its day, and a deep clean that is due (said here, never on the daily checklist). Wiped goes through `markWiped` (`relay/board/machine-care-store.ts`, the checklist's one write), closes the card and offers Undo on the toast; its Undo never erases another iPad's later wipe.
- **Maintain opens with Report a problem** ("What's wrong? A torn pad, a squeak, a loose cable...", **Report it**), then the floor's notes (`features/floor-notes`), Out of service with its reason (a leader's signed decision, 1 to 140 characters, through `admin/machines/roster-status.ts`, the roster's one write, never awaited), and upkeep.
- **Which record Report a problem writes:** the machine's flag (`studios/{s}/machineCare/{id}.flag`, through `flagMachine`), the one line every floor door already shows until someone clears it (Relay's head line, Open loops, Since you were in, the machine menu's safety strip, the Catalog's Flagged), and it rings the studio leader's bell, as Relay's care sheet did since Sep 2026 (design §G question 3, built with its default). The machine menu's note box writes something else: a "The machine itself" floor note, a dated thread anyone can close, with no bell (Oct 4 2026). One fault written two ways is AJ's question; until he answers, both stand.
- **Set up** is this studio's unit: the standard settings trainers preset as they walk up, its size (`studio-map/ui/UnitSizeCard.tsx`), and for a leader the local set-up of a Max Strength machine or the offer of the studio's own to the MSF catalog (`offer.tsx`). Trainers read it; leaders change it.
- **What the card never shows:** who wiped, cleaned or flagged it and at what minute, a count of anyone's cleaning, a rank, a next weight, a client. The floor's notes keep their signed authors and dates (a note is a person's words), and Out of service keeps its leader's name.
- **A machine not on the floor list yet** (a catalog stand-in on a studio with no roster) gets Learn and Clean as usual; Set up and Maintain say "Not on the floor list yet.", with Go to the floor list for a leader.

## Reads

The card reads only what its host doesn't hand it, and a part's reads mount only while that part is open (`useMachineCardReads.ts`): the floor (the roster and the catalog entry), Clean's settings, Maintain's notes and upkeep, Set up's settings. A host that already holds a read passes it in `reads`, and the hook underneath is given null (off).

**The care record is never a prop.** It is the screen's one live read, `relay/board/machine-care-context.tsx` (`MachineCareProvider`, `useCareRead`), mounted by My Studio's shell around its sections and its panel, and by Operations' floor, Admins' floor and the Catalog's map. A card opened through `relay.openPanel` is an element held in state, so a prop would freeze at the moment it opened: through `openPanel` a host gives a card ids and callbacks only.

Measured on the perf lab (Oct 12 2026; the round document has the numbers): opened from Relay's map at Clean the card starts no new listener (Relay's floor publishes its roster and cleaning settings, `RelayContext.floorReads`); unfolding Maintain starts 5 and folding it stops them; unfolding Set up starts 1.

## Files

| File | What it is |
| --- | --- |
| `MachineCard.tsx` | The card: the header (the name on this floor, the movement, the door's origin line, Out of service, Flagged and open notes as chips that open Maintain) and the four parts. |
| `parts.ts` | The order, the titles and which part each door opens first. Pure. |
| `LearnPart.tsx`, `CleanPart.tsx`, `MaintainPart.tsx`, `SetupPart.tsx` | The four parts. |
| `useMachineCardReads.ts` | The reads, each mounted only while its part is open. |
| `CardFrame.tsx` | A map beside its card for a host with no Relay shell (the Catalog's map, Admins' floor): the same Context Panel, a column in landscape and a sheet in portrait. |
| `offer.tsx` | The offer to the MSF catalog, its withdrawal, and what corporate said (moved here from My Studio's machine door). |
| `machine-card.css` | The card's look over the `--eq-*` tokens, held by `look.test.ts` (no orange or crimson; 40 px controls; names never cut short). |

Tests: `parts.test.ts`; `MachineCard.render.test.tsx` (each door's first part, the reads counted per part, Deep cleaned while the card is open seen live, the words that must never show, Out of service's Save closing a guarded host without the leave question); `look.test.ts`.
