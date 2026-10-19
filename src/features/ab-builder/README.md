# The routine builder — Routine A and Routine B in one place

AJ, Oct 19 2026, walking Programming on the live app: "the A routine builder
is very intuitive and easy. I think that is a great foundation to build off
of. my issue lies with routine B. the entirety of the swap feature and start
as a whole and swaps is all very very confusing". The round, his words in
full and his "1a 2a 3a" are `docs/rounds/2026-10-19-routine-builder.md`; the
decision is `docs/DECISIONS.md` → The routine builder.

Programming → **Routines** is this studio's floor beside Routine A and
Routine B. **Add to** (Routine A · Routine B · Both) says which routine a tap
goes into, and every tile carries a small A, B or AB mark. Each routine has
its own order, What it's for and its own Save.

| File | What it answers |
| --- | --- |
| `builder.ts` | The draft, pure: a floor tap into A, B or both (`tapFloor`), a tile's mark (`markOf`, `markWords`), a routine's order (`moved`, `takenOut`), Copy A into B, a routine laid from Start from… into the routine being built into (`laidFrom`), whether A and B differ |
| `phase.ts` | Phasing B in, pure: the steps from where B stands to the B on screen (`stepsBetween`: what leaves paired with what joins, as swaps, then additions or machines taken out), a new plan one a week from this week (`phasePlanOf`), what B runs now (`runningB`), a tick (`tickedStep`), Finish now (`finishedNow`), where it stands (`phaseStatus`, `phaseLine`), the briefing's line (`phaseDueWords`) and a stored plan read back safely (`phaseOf`). Days are the studio's, worked in UTC |
| `store.ts` | What a save writes, worked out pure (`routineSaveOf`, `phaseSaveOf`) and sent as ONE batch, never awaited by the tap (`commitRoutineSave`, `commitPhaseSave`) |
| `ui/RoutineBuilder.tsx` | The screen: Add to, Start from…, the floor's tiles, the two routine cards (`RoutineCard`), B's switch, Copy A into B, Phase it in, each routine's Changes |
| `ui/PhasePanel.tsx` | B's phase-in plan on its card (the line, the steps as ticks, Change the plan, Finish now, Stop phasing) and the sheet that makes or changes it (each step's week and owner, One a week) |
| `ui/PhaseDueLine.tsx` | The briefing's one line while a step is due |
| `ui/ab-builder.css` | The layout and the builder's own marks, in the Hub's palette (`--eq-*`); the parts are `routine-plan/ui/routine-plan.css`'s |

## Rules that hold here

- **B is built whole and is its own list.** Save writes Routine B's machines
  and a plan with no swaps (`planFromRoutine`), so `bFollowOf` finds no plan
  of swaps and B never follows A again. A Routine B of swaps from before this
  round still follows A (every writer of A asks `bFollowOf`, this one too)
  until someone saves it here.
- **B on goes with B's machines.** A B saved with machines while B is off is
  turned on; one saved empty while on is turned off (an empty B alternated
  into is a session of nothing, the critic's #22). The client's
  `isRoutineBActive` is its own write once the batch has landed, never in it.
  Turning B on with nothing in B, from the profile's switch or the Edit
  routine drawer, brings the trainer here (`useBSwitch`'s `onEmptyB`) instead
  of Plan B.
- **Phasing in is a choice, and a person makes every step.** Kept on Routine
  B's plan as `plan.phase`; Routine B's `machineIds` stays what the client
  does now. Anyone makes, changes or drops the plan, and anyone ticks a step.
  Each tick writes B's machines and the plan in one update, and a
  `routineAdjustments` record with the step's words. Saving B whole ends the
  plan, and the card says so before it happens. Nothing pings anyone.
- **Routine A keeps its plan.** A save on a Routine A with a plan writes the
  plan's matching changes beside it (`planChangeFromEdit`) and What it's for
  as a `purpose` change; a plan-less Routine A given What it's for gets the
  plan Add a plan makes. A client starting out at the studio keeps Start a
  plan (the starting lineup, day one); Routine A's plan opens under the
  builder (`ProgrammingTab`).
- **Nothing suggests a weight**, the reason for a change is asked and never
  required, and what is tapped and not saved is registered as unsaved work.
- **No rules change, no new query, no new index.** Routines are written as
  the Edit routine drawer writes them; `plan.phase` is a field on a map no
  rule checks the keys of.
