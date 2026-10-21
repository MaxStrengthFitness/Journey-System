# The routine library round (Oct 20 2026)

**Status: a proposal. Nothing is built, nothing is pushed.** It needs AJ's yes on the direction (given Oct 20), his answers to the three questions in section 8, and his OK on the one Firestore change in section 5 before any code.

AJ walked Programming → Routines on the local build with a client who has 28 Journey sessions, and said, in his words:

> the routine builder is a mess

> the ability to plan a session over time is not very intuitive and its not all on one screen and mostly bulky and its hard to understnad what im looking at

> SO when a client starts they typically may stay with one routine. depending on the studio, trainer or even client the may switch their routine for a multitude of reason, even just variety. I want to be able to create a routine, rotate routines in and out and possibly name the routines. its possible a client may have 1 A routine for 2 years with small adjustments to it. its possible a client has 6 different routine variations in 9 months due to a surgery, variety and experimentation. its possible we may want to re use a routine so we should just switch to the ability name routines and save them to the profile and we pick which routine we want in slot A and Slot B and then you can just preload the studio/company routines to the slot or open session if wanted

He picked **the routines on top** of the one screen, and approved the direction: **a named routine library on the profile, A and B as slots, the floor picker as a sheet, a history strip.**

This round **replaces a decision**: "B is built whole beside A, phased in only if a trainer chooses" (Oct 19, `docs/rounds/2026-10-19-routine-builder.md`). Routine B stops being a second routine with a fixed identity; A and B become two slots that hold whichever routines the trainer picks. CLAUDE.md's routine-builder decision and `docs/DECISIONS.md` change with it, only after AJ's yes.

---

## 1. What is wrong today (seen on the local build)

All of this was read off a real client's Programming tab, not guessed.

- **The picker comes first.** "This studio's floor" (18 machines) takes about the top 40% of the screen. The routines, the thing being edited, are below the fold.
- **A wrong number.** The summary line said "13 machines prescribed". Routine A has 6 machines, B has 7, and two are in both, so the client has 11. `useRoutinesModel.ts` adds `rowsA.length + rowsB.length` with no de-duplication.
- **The same facts twice.** The line above the tabs ("13 prescribed · Routine A today · 2 never attempted · last change yesterday by AA") and the Routines tab's subtitle ("A 6 · B 4 of 4 swaps · A today") overlap.
- **Two ideas on one control.** A tile's A / B / AB mark and the Add to: Routine A · Routine B · Both buttons look like the A and B tabs but work as targets.
- **Uneven cards.** A (6 machines) and B (7) sit side by side at different heights, each with its own What it's for, Save and Changes.
- **The plan is buried.** "Routine A's plan" (on deck, can't do, weak area) is a collapsed bar at the very bottom.
- **There is no "over time".** The screen shows the routines as they are now. Nothing says which routine ran when, and a routine that is replaced is overwritten, not kept.

## 2. What a trainer sees

One screen, routines first. Portrait stacks the two slots; landscape puts them side by side.

```
 Programming · Routines            [ Start from… ]

 SLOT A                                  SLOT B
 Post-surgery rebuild      [Change]      Variety, winter          [Change]
 What it's for: protect the knee         What it's for: same regions, new machines
  1 Hip Adduction                         1 Hip Adduction
  2 Hip Abduction                         2 Leg Curl
  3 Compound Row     ...                  3 Overhead Press   ...
 [+ Add machine]   [Save]  [Changes]     [+ Add machine]  [Save]  [Changes]

 History   ▇▇▇ Routine A · Jan–Jun (31) ▇▇ Post-surgery · Jun–Aug (14) ▇▇▇ Variety, winter · Aug– (9)
 Library (6)   Routine A · Post-surgery · Variety, winter · …                  [Retired (2)]
 Plan: on deck, can't do, weak area   >
```

- **Two slot cards, A and B.** Each shows its routine's name (tap to rename), its What it's for, its machines in order, and its own Save. B can be empty: that is B off. An empty B says "Nothing in B: every session runs A" and offers Change.
- **Change** opens a sheet with four groups: **this client's routines** (name, machine count, last used, and "in A" / "in B" where it is), **the studio's routines**, **Max Strength's routines**, and **New routine** (blank, or copy of what is in the slot). Picking a routine that is in the other slot swaps the two. A routine can't sit in both slots.
- **Add machine** opens the floor picker as a sheet over the screen, family by family, the same tiles the Oct 19 builder has. It always adds to the slot it was opened from, so Add to: A · B · Both goes away. The A / B / AB mark on a tile stays inside the sheet, because it still tells which machines are where.
- **The history strip** is one line under the slots: which routine ran in the slots over time, from the sessions Journey recorded (a session already carries `routineId`). It says only what Journey saw: "Journey sessions only", never "no routine" for the time before Journey (`docs/business/migration-and-prior-history.md`). Fewer than two routines, or fewer than a named handful of sessions, and the strip is not drawn.
- **The library** is one row of names, collapsed. A routine is never deleted (`firestore.rules` lets nobody but an administrator delete one); **Retire** hides it under Retired, and a routine in a slot can't be retired.
- **The plan** (on deck, can't do, weak area, phase it in) stays one row at the bottom, as today, until questions 1 and 2 are answered.
- Nothing on the screen suggests a weight, a reason for a change is asked and never required, and what is typed and not saved is registered as unsaved work (`useUnsavedChanges`), exactly as now.

The summary lines above the tabs go. "13 prescribed", "A today" and the swap counts are not needed once the slots show what is in them; "Routine A today" becomes a small mark on whichever slot runs next (`next-routine.ts`, unchanged in its rule).

## 3. What a client can then be

- **One routine for two years:** slot A, name "Routine A" or anything, edited with its Changes history. Nothing else is drawn.
- **Six variations in nine months:** six routines in the library, one or two in the slots at a time, the history strip showing the order. A surgery is "Post-surgery" going into slot A and the old routine moving to the library, not an overwrite.
- **Reuse:** "Variety, winter" comes back in a year by choosing it in Change.
- **Studio or company routines:** chosen in Change and **copied** into the client's library with `templateId` and `templateName` set (the fields exist on `Routine`), because a template is advice and a copy cannot be changed under the client by someone else's edit. The open session keeps its own **Start from a routine…** (`routine-plan/start-from.ts`), which lays a routine on today's list and writes no routine.

## 4. What stays the same

- The A builder's rows: the order, drag or Move up / Move down, Take out, What it's for, the reason asked and never required.
- `next-routine.ts`: A and B alternate while B is on, the Active Session and the briefing read it. Only where it finds A and B changes (section 6).
- Programming's other two segments, All Machines and Setup, and `PROFILE_TABS` (Journey · Programming · Notes & Profile · Activity Archive). This is inside Programming.
- Routines are the documents they are: `routines/{id}`, one per routine, with their `planChanges`. No new collection and no new query shape.
- No suggestion of a next weight, anywhere.

## 5. The one Firestore change (needs AJ's OK)

CLAUDE.md: "Don't change the Mindbody integration, Cloud Functions or the Firestore structure without an explicit OK." This is that ask.

Today A and B are found **by name** ("Routine A", "Routine B", matched by `matchesRoutineLetter` in `src/lib/routine-utils.ts`). A routine can't be renamed without losing its slot. The change:

- **`clients/{id}.routineSlots: { a: string | null, b: string | null }`**, the routine ids in slot A and slot B. One field on a client document that trainers already update (`isRoutineBActive` lives there), written by field path (`routineSlots.a`), never a whole-object write (`changedPatch`).
- **`routines/{id}.archived?: boolean`** (and `archivedAt`) for Retire. Trainers already may update a routine; no delete is added.
- **`isRoutineBActive` keeps being written**, mirrored from "slot B has a routine", so the 53 places that read it keep working until each is moved over. Retire it in a later round, not this one.
- **No migration job.** A client with no `routineSlots` is read through the old name match (`slotOf` falls back to `matchesRoutineLetter`). The first save from the new builder writes `routineSlots` from what the names say today. Nobody's routines change meaning the day this ships.

Rules: the client and routine updates already allow these fields for a trainer, but `firestore.rules` and `tests/firestore.rules.test.ts` get a check that `routineSlots` holds only ids of routines of that client and that `archived` is a boolean. Per the deploy order, **AJ's `npm run test:rules` run is the one that counts**, rules deploy before the app, and they only add access. **No index**: the library is the client's routines read the way the profile reads them now.

## 6. What the code touches

`matchesRoutineLetter` is used in 11 files (`ClientProfileView.tsx`, `EditRoutineDrawer.tsx`, `briefing/briefing-facts.ts`, `briefing/BriefingScreen.tsx`, `routine-plan/b-routine.ts`, `routine-plan/briefing-plan.ts`, `routine-plan/next-time.ts`, `routine-plan/ui/host.ts`, `routines/next-routine.ts`, `routines/routine-rows.ts`, `lib/routine-utils.ts`), and `isRoutineBActive` / `selectedRoutineTodayId` appear about 53 times. The plan is one seam:

- **`src/features/routine-slots/slots.ts`** (new, pure, tested): `slotOf(client, routines, "a" | "b")` returns the routine in that slot, from `routineSlots`, else the name match; `assignSlot`, `swapSlots`, `emptySlot`, and the library (`libraryOf`, retired last). It is the only place that may call `matchesRoutineLetter`; a test fails if another file does.
- The 11 files read the seam instead of the letters. Behaviour for a client with no `routineSlots` does not change, and a golden test per reader holds it.
- `ab-builder/` keeps its pure half (`builder.ts`, `store.ts`, `phase.ts`) and gets slot-aware callers; `ui/RoutineBuilder.tsx` is the screen that changes. `useRoutinesModel.ts` gets the distinct-machine count (the "13 vs 11" fix), whatever else happens.
- **The history strip** is `routine-slots/history.ts` (pure): consecutive sessions grouped by `routineId`, read from the sessions the profile already holds. No read of its own.

## 7. Phases (one branch, one commit each, each typechecked alone so it can be reverted alone)

0. **The count fix and the seam.** `total` and `setUp` count distinct machines; `slots.ts` with the name fallback; the 11 files read it; no screen changes. Typecheck 0, the suite green, a golden test per reader.
1. **The field and the rules.** `routineSlots`, `archived`, the mirror of `isRoutineBActive`, the rules and their tests. AJ's OK, then AJ's `test:rules`, then the deploy order in CLAUDE.md.
2. **The screen.** Slot cards, Change, rename, Retire, the floor picker as a sheet, the summary lines gone. A render test for each (`*.render.test.tsx` mounts it), `names-wrap` held, nothing under 40px.
3. **The history strip.**
4. **Studio and company routines into a slot** (copy with provenance), per question 3, and **can't do** moved per question 1.
5. **Phase it in** moved to a menu on a slot, per question 2.

What ships goes to `master` and reaches trainers at the next deploy (AJ presses Manual Deploy on the web service; no cron changes in this round).

## 8. The three questions

**1. Where do "Can't do" and the weak area live?** Today they sit on Routine A's plan, and B reads them (AJ, Oct 7: "2a"). With a routine that can leave slot A, an injury would leave with it. *My default:* they belong to the client, not to a routine. The first save from the new builder copies them from Routine A's plan to the client, every routine reads them, and a surgery stays on the record whichever routine is in the slot. This is a second small field on the client; the alternative is to keep them on whichever routine is in slot A, which loses them when that routine is retired.

**2. What happens to Phase it in?** It is a plan for turning B from A's machines into a different list, one step a week (Oct 19). With a library, "phase in" is one way of changing a slot, not the only one. *My default:* leave it exactly as it is and move its button to a menu on a slot, "Phase this slot in…", in phase 5, and change nothing about how it works in this round.

**3. How do studio and company routines come in?** *My default:* in two doors that already exist, with one new: **Change → the studio's / Max Strength's routines** copies one into the client's library and into the slot (new), and the open session's **Start from a routine…** lays one on today's list without writing a routine (unchanged). The alternative is one door only: the open session's, or Change's.

Smaller defaults, said so they can be overruled: a new routine is named "Routine 1", "Routine 2"… until renamed; a name is unique per client; two slots can't hold the same routine; Retire, never delete; the history strip counts Journey's sessions only.

## 9. What this does not do, and what I have not verified

- No weights, no progression suggestions, no automatic rotation. A person changes a slot; Journey never rotates routines for a client.
- Nothing about the Active Session's own screens changes, only which routine the next session finds.
- Not checked: how the builder lays out in landscape, and for a client with no routines yet (the starting door, `routine-plan/ui/StartPlanPanel`, stays as it is). Not checked: whether the briefing, the Wrap-up and the open session read A and B anywhere beyond the 11 files and the references counted above; phase 0's golden tests are where that is found out.
- The history strip needs a client's sessions to carry `routineId`; the type has it, but how many real sessions actually do is not measured. If most do not, the strip shows less than it promises and phase 3 is cut back to the routines' "last used" dates.
- Sessions wiped Oct 12 (`sessions-are-test-data`): a young client's strip will be short until real sessions accumulate. That is correct, not a bug.
