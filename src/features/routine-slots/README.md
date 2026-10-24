# Routine slots — a client's stash and two equipped routines

AJ, Oct 20 2026: "the routine builder is a mess … I want to be able to create
a routine, rotate routines in and out and possibly name the routines". Oct 23
2026, the picture he agreed: each client has a **stash** of their own named
routines and **two equipped at once, slot A and slot B**, "both full weapons"
(Path of Exile's weapon slots). The round, his words and the agreed design are
`docs/rounds/2026-10-20-routine-library.md` §10; the Firestore change is §10.7,
OK'd by AJ on Oct 23 2026; the decision is `docs/DECISIONS.md` → The routine
library. The screen is `ab-builder/ui/RoutineBuilder.tsx`.

| File | What it answers |
| --- | --- |
| `slots.ts` | Which routine is in each slot (`resolvedSlots`), the routines marked with their slot and slot A given the client's marks (`withSlots`, read where the profile and the session read routines), the stash and Retired (`stashOf`, `retiredOf`), equipping one (`equipped`: a routine from the other slot swaps places; slot A is never emptied), a whole move worked out (`slotMove`: the client's fields, the renames that keep a letter name honest, each routine moved), what a slot change writes (`slotsPatch`: each slot by its field path; emptying B turns B off, filling it never turns B on), pinning the slots before a rename (`pinPatch`), names (`nextRoutineName`, `uniqueName`, `nameProblem`, `stashedName`), and distinct machines (`distinctMachines`, the "13 vs 11" fix) |
| `store.ts` | The writes: a slot move (renames and a record per routine moved, one batch; then the client's slots as their own write), a rename, Retire and Bring back (never a delete), a new routine copied in with its source (`commitNewRoutine`), and the client's programming document (`addProgrammingToBatch`) |
| `programming.ts` | Can't do and the weak area kept on the client (`clients/{id}/programming/current`): read back safely (`programmingOf`), laid onto slot A's routine (`withProgramming`: the client's list is the answer, a routine's own road fields kept), which plan changes move it (`movesProgramming`), and what is written from a plan (`programmingFromPlan`) |
| `useClientProgramming.ts` | The document, live: `undefined` while reading or failed, `null` with none yet (an empty cache answer is not "none"), else the marks |
| `planned.ts` | Planned, not active: a routine's planned machines (`plannedOf`, the plan's road past what it runs, never one the client can't do) and adding them for good (`addedForGood`: the plan's "add now", one signed change each, never while Routine A is empty and day one runs) |
| `my-routines.ts`, `useMyRoutines.ts` | A trainer's own routines: trainer-tier presets with `ownerUid`, theirs alone (`ownRoutinesOf`), read with one query on (tier, ownerUid), made, changed and removed (`saveMyRoutine`, `updateMyRoutine`, `removeMyRoutine`), and one of a client's routines saved as theirs (`myRoutineFromClientRoutine`) |
| `usePlannedStarts.ts` | How a planned routine starts at the studio (`plannedRoutineStarts`): phased in only (Max Strength's default, and the answer while the setting reads), or phased in or all at once |
| `history.ts` | The history strip: consecutive Journey sessions on a routine as one stretch, A and B alternating as a pair, drawn with at least two routines and `HISTORY_MIN_SESSIONS` (6) |
| `ui/SlotSheets.tsx` | Change (what goes in a slot: the stash, My routines, the starting routines and templates, a new one), a stashed routine's sheet (Put in A or B, Rename, Save as my routine, Retire, Bring back), Rename |
| `ui/MyRoutines.tsx` | My Profile → My routines |

## Rules that hold here

- **The slot answers before the name.** A routine read beside the client's
  `routineSlots` carries `inSlot` ("A", "B" or null for the stash), and
  `lib/routine-utils.ts`'s `matchesRoutineLetter` answers from it first, so
  every place that asks "is this Routine A?" asks the slots. `inSlot` is never
  stored (the rules refuse it on a routine).
- **No slots, or an empty one, is read by name, as before.** A slot not
  written, written null, or naming a routine not in the list holds the routine
  named for it ("Routine A", "A"), so nobody's routines change meaning the day
  this ships, and the older writers that make a "Routine A" or "Routine B" for
  an empty slot still land in it. That is why a letter-named routine never sits
  in the stash: the move that stashes it renames it (`stashedName`), and one
  swapped into the other slot takes that slot's letter name.
- **The first move on a client pins both slots**, and a rename pins them
  first, so renaming "Routine A" never loses slot A.
- **A retired routine is never in a slot and never deleted.**
- **The client's document is never in someone else's batch:** a slot change is
  its own write, issued and never awaited. The programming document is its own
  document so a can't-do can ride in the plan's batch.
- **Can't do and the weak area are the client's** once the document exists;
  before it, Routine A's plan's own. Every reader still reads slot A's plan.
- **A planned B starts phased in** from Routine A; Save never turns B on.
- **Nothing suggests a weight**, the reason for a change is asked and never
  required, and what is typed and not saved is unsaved work.
