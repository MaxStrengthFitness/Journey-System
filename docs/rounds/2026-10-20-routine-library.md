# The routine library round (Oct 20 2026)

**Status: BUILT on branch `oct23/routine-library` (Oct 23 2026, §11); not pushed, not deployed.** It began as a proposal: It needs AJ's yes on the direction (given Oct 20), his answers to the three questions in section 8, and his OK on the one Firestore change in section 5 before any code.

**Oct 23 2026:** AJ answered section 8 with a bigger picture, talked it through and said "you've got the picture". **Section 10 is the agreed design and replaces sections 5, 7 and 8 where they differ.** **AJ OK'd its Firestore change (§10.7) and the three defaults in §10.9 on Oct 23 2026**: "Yes, the Firestore change in 10.7 is OK'd. The three defaults in 10.9 stand too." Building starts at §10.8's phase 0.

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

---

## 10. The agreed design (AJ, Oct 23 2026)

AJ answered section 8 with a bigger picture, then talked it through in a discussion session (nothing built). He confirmed the play-back ("Yes, you've got the picture") and answered the three follow-up questions ("1 yes", "2 Adds it on for good", "3 No just allow trainers to make their own routines and save them on their profile so they can load it into a client if they need").

### 10.1 The picture, in AJ's terms: a stash and two equipped slots

AJ's metaphor is Path of Exile's weapon slots.

- **The stash.** Every client has an inventory of their own named routines. Nothing is thrown away: "Post-surgery" or "Variety, winter" waits in the stash until it is pulled out again.
- **Two slots, A and B, both full weapons** ("not a weapon and a shield"). Two routines are equipped at once and sessions alternate between them (`next-routine.ts`'s rule, unchanged). Some clients only ever fill slot A.
- **The slots have different jobs.** AJ's example: A = hip ab/add, leg press, compound row, seated dip, lumbar; B = leg curl, leg extension, pulldown, overhead press, pullover, bicep curl, ab crunch. Both are full body but mixed, or B is upper-focused so the legs recover from a hard leg press. That job is the routine's What it's for, and stays on the routine.
- Routines are **rotated out, turned on, phased in or planned**. A person does each one; Journey never rotates a routine by itself (§9).

### 10.2 Planned, not active (R2's redesign)

AJ: "you build both A and B. After building either one, you can choose to phase any of it in", so phasing in is an option, not the only path.

- **A slot can hold machines planned for it that don't run yet.** This is the routine's plan, the road, already on every routine as `plan` (On deck today). It stops being Routine A's alone: each slot's routine has its own.
- **AJ's example:** at the consult the client does leg press and compound row. The head trainer who ran it decides "this is what I want their full routine to be" and plans it. Whoever takes the second session, maybe a different trainer, sees where it is going without any of it switched on.
- **On the briefing and in the session**, a planned machine says "Planned for the routine" with a quick toggle to add it on. **The toggle adds it for good** (AJ: "2 Adds it on for good"): it joins the routine, not just today. It is one `add` change on the plan, the reason asked and never required, issued and never awaited (a floor tap), the same change On deck's Add to A now makes today.
- *A detail kept from the consult rule:* while Routine A is still empty and a visit runs day one, Add to A now is held back, because one machine would become the whole of A. In that one case the toggle adds the machine to today's list, and the Wrap-up's Next time ticks it into A, as now.
- **A whole B can be planned well ahead.** When a trainer chooses, they go into B, turn it on and phase it in. AJ: "not an instant switch, though the studio may allow that". So **phasing in is the default way a planned slot starts**, and switching it on all at once is a studio setting (`studio-settings/registry.ts`, Max Strength's default beneath). This changes one line of the Oct 19 decision ("Save writes B's machines … and turns B on with it"); the rest stands: B only starts because a trainer chooses, and anyone makes, changes or ticks a phase plan.
- **Phase it in works on either slot**, not only B: `plan.phase` moves from "Routine B's plan" to "the plan of the routine in that slot" (`ab-builder/phase.ts` is already pure and per routine).

### 10.3 Where routines come from: four tiers (R3)

| Tier | Who makes it | Who can load it | Where it lives today |
| --- | --- | --- | --- |
| **Company** | Administrators: baselines, so franchisees get a good start and the company stays consistent | Every trainer at every studio | `routinePresets`, tier `company` (exists; the starting routines are these) |
| **Studio** | The studio's leaders: "what I want my clients trained on here" | That studio's trainers | `routinePresets`, tier `studio` (exists) |
| **Trainer** | Each trainer, their own favourite starting points, saved on their profile (My Profile) | That trainer, "so they can load it into a client if they need" | `routinePresets`, tier `trainer` exists but is **shared with the whole studio** and editable by any trainer. This changes (§10.7) |
| **Client** | Any trainer, on the client's Programming | Lives in that client's stash | `routines/{id}`, one per routine (exists) |

- **Loading one into a client copies it** into the stash, with `templateId` and `templateName` kept (the fields exist), and from there into a slot. A template is advice, and a copy can't be changed under the client by someone else's edit (§3, unchanged).
- **Save as my routine:** a routine in a client's stash can be copied to the trainer's own list (small and new: it writes a trainer-tier preset).
- The open session's **Start from a routine…** keeps laying a routine on today's list without writing one, and gains the trainer's own group.

### 10.4 Can't do and the weak area live on the client (R1)

AJ asked to understand this first. The example that settled it: Mary's slot A is "Strength", with leg press. She has knee surgery, so a trainer marks Can't do: Leg Press, until March 1, then equips "Post-surgery" and "Strength" goes back to the stash. Kept on the routine, the knee mark would go into the stash with "Strength", and a studio routine pulled in next week would bring leg press back without a word. Kept on the client, the mark follows Mary whatever is equipped: every routine, Start from… and the briefing leave leg press out until March 1 and say why.

**AJ: "1 yes".** Can't do (with its reason and until) and the weak area (`focus`) belong to the client, and every routine reads them. A routine's job (What it's for) stays on the routine. This replaces "Can't do lives on Routine A's plan, read by A and B" (Oct 8, "2a") in where it is stored, not in how it works: still a flag, never an automatic change; a surgery or injury still offers the one unticked Health note.

### 10.5 Rules that do not change

- Any trainer changes a plan, mid-session included; the reason is asked, never required.
- A slot starts only because a trainer chooses.
- An injury is a flag, never an automatic change.
- Nothing suggests a weight, anywhere.
- The consult is not Routine A; Routine A still starts only through Next time or a trainer editing it on purpose.
- A tap on the floor never waits on the network; what is typed and not saved is unsaved work.

### 10.6 The screen, in short

Section 2's screen stands, with three additions: each slot card shows its planned machines under the running ones ("Planned for the routine"); the Change sheet's groups are **this client's stash · my routines · the studio's · Max Strength's · New routine**; and My Profile gets **My routines** (make, rename, retire). Nothing here is drawn until it is built and walked.

### 10.7 The full Firestore change (OK'd by AJ, Oct 23 2026)

CLAUDE.md: "Don't change the Mindbody integration, Cloud Functions or the Firestore structure without an explicit OK." AJ's Oct 23 answer to R4 was the OK in principle ("yes it sounds like we may have to add more with the new context"). This is the whole of it, for his yes before any code. No new top-level collection, no Cloud Function, no Mindbody change, no migration job.

1. **`clients/{id}.routineSlots: { a: string | null, b: string | null }`**: the routine ids equipped in slot A and slot B (as §5). Written by field path, on its own, never inside another batch (the client's document is never in someone else's batch). `isRoutineBActive` stays B's on-switch: emptying slot B turns it off, and filling slot B never turns it on, because a whole B is planned ahead while it is off (§10.2) and a trainer turns it on. (Corrected during the build, Oct 23 2026: the first draft said "mirrored from slot B holds a routine", which would have switched on every planned B.) A client with no `routineSlots` is read by the old name match.
2. **`routines/{id}.archived: boolean` and `archivedAt`**: Retire, so the stash doesn't fill up with old routines. Never a delete.
3. **`clients/{id}/programming/current`** (new: one small document per client): `cantDo` (the list as A's plan holds it today: machine, reason, until, who, when; at most 60), `focus` (the weak areas), `updatedAt`, `updatedByUid`. **Why its own document, not a field on the client:** a can't-do mark is written mid-session in the same batch as the routine change it causes, and the client's document is never put in someone else's batch (a refused client field took Start's session down with it, Oct 9 2026). The machine totals are the precedent (`clients/{id}/machineTotals/current`). Read once with the client, one document, no query, so **no index**. Until it exists, readers fall back to Routine A's plan, and the first can't-do or focus written copies A's plan's marks across. A's plan's own copy is left in place, never deleted.
4. **`routinePresets` trainer tier gets `ownerUid`** (the Auth uid). A trainer's own list is `tier == "trainer"` and `ownerUid ==` them: **one new composite index (tier, ownerUid)** in `firestore.indexes.json`. Trainer-tier presets saved before this (no `ownerUid`) stay where they are and keep showing in the Edit routine drawer's studio group, so nothing anyone saved disappears.
5. **Rules** (`firestore.rules`, tested in `tests/firestore.rules.test.ts`):
   - clients: `routineSlots` is a map of exactly `a` and `b`, each an id string or null.
   - routines: `archived` is a boolean, `archivedAt` the server's time.
   - `clients/{id}/programming/current`: read by whoever may read the client; written by any trainer who may write that client's routines; only the four fields; `cantDo` at most 60, `focus` a short list; signed with the Auth uid and the server's time.
   - routinePresets, trainer tier: created only with `ownerUid ==` the signed-in uid; updated and deleted only by that owner or an administrator. **This tightens today's rule**, where any trainer may edit any trainer-tier preset; a preset with no `ownerUid` keeps today's rule.
   - Deploy order as CLAUDE.md: indexes, then **AJ's `npm run test:rules`**, then rules, then the app. The tightening in item 4 is the one part that removes access, so it ships after the app that writes `ownerUid`, not before.

### 10.8 Phases (replaces §7)

0. The count fix and the slot seam (§7's phase 0, unchanged).
1. The fields and the rules (§10.7), after AJ's OK and his `test:rules`.
2. The slot screen with the stash (§2, §10.6).
3. Planned machines on the briefing and in the session, with the toggle that adds for good.
4. Can't do and the weak area moved to the client (`programming/current`), every reader on it.
5. The four tiers: My routines on My Profile, Save as my routine, the Change sheet's groups, Start from…'s trainer group.
6. Phase it in on either slot, and the studio's "switch on all at once" setting.
7. The history strip (§7's phase 3).

### 10.9 Defaults (AJ, Oct 23 2026: "The three defaults in 10.9 stand too")

- **The studio setting's default:** "switch on all at once" off in Max Strength's default, so a studio turns it on. *Default:* off.
- **A B already saved whole in the Oct 19 builder keeps running as it is.** *Default:* yes; nothing already on goes off.
- The day-one detail in §10.2.

---

## 11. What was built (Oct 23 2026, after AJ's "lets get it all finished here")

Branch `oct23/routine-library`, one commit per phase, each typechecked on its own (§10.8's order). **Nothing is pushed and nothing is deployed.**

| Commit | Phase |
| --- | --- |
| `ba4f7259` | 0 · The slot seam and the distinct-machine count. A routine read beside `routineSlots` carries `inSlot`; `matchesRoutineLetter` answers from it first, so the 60-odd "is this Routine A?" readers ask the slots with no change of their own. Programming counts distinct machines (11, not 13). |
| `678442c8` | 1 · The rules and the moves: `routineSlotsOk`, `routineDocOk` (no stored `inSlot`; `archived`), `presetOwnerOk`, `clients/{id}/programming/current`; index (tier, ownerUid); `routine-slots/slots.ts` and `store.ts`. |
| `ede83bbe` | 2 · The screen: slot A and slot B first, Rename, Change (stash, templates, new), the stash row with Retired, the floor as an Add machine sheet; each move recorded for the Changes list. |
| `ba7b2c01` | 3 · Planned for the routine: on the slot cards (Add now, Not planned, Plan for later), on the Now Bar ("Planned for the routine · Add", for good) and on the briefing (Add marks it; Start writes it). |
| `6e54013a` | 4 · Can't do and the weak area on the client, laid onto slot A's routine as it is read; written with the plan change that moves them, and when slot A changes. |
| `b81974a3` | 5 · My Profile → My routines; Save as my routine; My routines in Change and in Start from a routine…; the drawer's save is now the trainer's own. |
| `864862c9` | 6 · A planned B phases in from A (Phase B in); either slot phases in; the studio setting `plannedRoutineStarts`. |
| `ae3340f7` | 7 · The history strip. |

**Found while building, and how it went:**

- **Filling slot B can't mean "B on".** The §10.7 draft said `isRoutineBActive` would mirror "slot B holds a routine"; that would have switched on every planned B. B's switch stays the switch: emptying B turns it off, filling B never turns it on (§10.7 corrected).
- **An empty slot falls back to the routine named for it**, so the older writers that make a "Routine A" or "Routine B" (Start, the Wrap-up's Next time, the Edit routine drawer, a planned B) keep landing in the slot. A letter-named routine leaving for the stash is therefore renamed ("Routine A · until Oct 23 2026"), and one swapped into the other slot takes that slot's letter name.
- **The planned toggle goes through the session's own plan writer** (`session-scope.test.ts`'s writer 2, restated), Routine A's alone; while Routine A is empty and day one runs it stays today's only (§10.2's detail, kept).
- **A can't-do mark carries road fields** (where its stand-in stands). On another routine in slot A the client's mark is laid on without them; the routine's own entry keeps them.

**Checked:** typecheck 0; the whole suite with `TZ=America/New_York`, 16,508 passing in 1,003 files (the one failure, CLAUDE.md's length, fixed); the rules tests, 632 passing on this PC (AJ's `npm run test:rules` is the one that counts); `NODE_ENV=production npx vite build` and `npm run check:bundle`, 483.5 KB gzip of 490; no case-only filename clashes.

**Not checked:** the screens on an iPad, portrait and landscape; a real client's data.

**To ship** (CLAUDE.md's deploy order): `firebase deploy --only firestore:indexes` (the new (tier, ownerUid) index) → AJ's `npm run test:rules` → `firebase deploy --only firestore:rules` → merge the branch to `master` and push → Render: Manual Deploy on the web service. No cron changes; no Cloud Function; no Mindbody change; no migration job. The rules only add checks that today's app already meets (it never writes `inSlot`, `routineSlots`, `ownerUid` or the programming document), so they can go first.
