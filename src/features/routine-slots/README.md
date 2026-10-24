# Routine slots — a client's stash and two equipped routines

AJ, Oct 20 2026: "the routine builder is a mess … I want to be able to create
a routine, rotate routines in and out and possibly name the routines". Oct 23
2026, the picture he agreed: each client has a **stash** of their own named
routines and **two equipped at once, slot A and slot B**, "both full weapons"
(Path of Exile's weapon slots). The round, his words and the agreed design are
`docs/rounds/2026-10-20-routine-library.md` §10; the Firestore change is §10.7,
OK'd by AJ on Oct 23 2026.

| File | What it answers |
| --- | --- |
| `slots.ts` | Which routine is in each slot (`resolvedSlots`), the routines marked with their slot (`withSlots`, read where the profile and the session read routines), the stash and Retired (`stashOf`, `retiredOf`), equipping one (`equipped`: a routine from the other slot swaps places; slot A is never emptied), what that writes on the client (`slotsPatch`: each slot by its field path, `isRoutineBActive` mirrored), a new routine's name (`nextRoutineName`), a name checked (`nameProblem`), a letter-named routine's name as it leaves for the stash (`stashedName`), and distinct machines (`distinctMachines`, the "13 vs 11" fix) |

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
  in the stash: the move that stashes it renames it (`stashedName`).
- **A retired routine is never in a slot and never deleted.**
- **The client's document is never in someone else's batch:** a slot change is
  its own write (`slotsPatch`), issued and never awaited.
