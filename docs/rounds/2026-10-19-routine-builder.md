# The routine builder round (Oct 19 2026)

AJ walked Programming on the live app (Strongsville, Michael's profile) and
said, in his words:

> the A routine builder is very intuitive and easy. I think that is a great
> foundation to build off of. my issue lies with routine B. the entirety of
> the swap feature and start as a whole and swaps is all very very confusing

> If i already know the entire B routine i should be able to just build it
> with no swaps and it starts instantly but also we need to have the ability
> to phase it in IF WE WANT TO, not automatic. we dont even need Routine B to
> have its own tab if you can come up with a design that allows us to choose
> what machines are on A or B routine in one selector, but we still need to
> be able to add context to a routine or do a planned phase out over time

> the reason why i want to be able to plan the phase out if we want is if we
> want to plan it out as an individual or as a team so i can make sure the
> plan is followed

> we just need a solid Routine builder for clients, we need to be able to
> import premade routines made by the studio or the company but then i also
> need an area in programming where i can see all machines and have a quick
> way to edit all the values quickly

His answers to the three questions: **1a** (one builder, no B tab), **2a**
("anyone can make or change the plan too"), **3a** (the quick-edit table
replaces Setup).

This round **replaces a decision**: "B is for variety and recovery, molded in
swap by swap" (Oct 7) and "Plan B can also start B whole" (Oct 13). From this
round B is built whole by default and goes live on Save; phasing in is a
choice. CLAUDE.md's routine-plans decision and `docs/DECISIONS.md` change
with it.

**Status: plan only. Nothing is built until AJ says go.**

---

## 1. What a trainer sees

Programming's segments become **Routines · All Machines · Setup** (three, not
four). `PROFILE_TABS` is not touched: this is inside Programming.

### Routines: one builder

The A builder AJ likes stays exactly as it is on the left: **This studio's
floor**, by family, tap to add.

On the right, one card per routine, side by side on a landscape iPad and
stacked in portrait:

```
 This studio's floor          | Routine A            | Routine B   [B on]
  Upper Body — Pull           |  What it's for       |  What it's for
  [Pulldown] [Compound Row]   |  1 Hip Adduction     |  1 Hip Adduction
  ...                         |  2 Leg Press         |  2 Leg Curl
                              |  ...                 |  ...
                              |  [Save Routine A]    |  [Save Routine B]
```

- **Which routine a tap adds to** is a choice at the top of the floor:
  **A · B · Both**. A machine already in a routine shows a small A, B or AB
  on its floor tile, so the trainer can see at a glance what is where.
- Each routine card: **What it's for** (the box A has now), its machines in
  order (drag or Move up / Move down, Take out), and its own Save.
- **B on** is the switch on B's card. Turning it on with machines in B just
  turns it on. Turning it on with nothing in B offers **Copy A into B** and
  **Build B from the floor**, never Plan B's swaps.
- **Saving B with B on makes it live.** The next session alternates into it.
- The reason for a change is asked, never required (as everywhere).

### Phase it in (only if you choose)

A quiet **Phase it in** button on B's card, shown once A and B differ.
It turns the differences into a list of steps, one per machine that changes:

```
 Phase B in
  1  Leg Curl for Leg Press        week of Oct 26   Anyone      [ ]
  2  Chest/Pec Fly for Overhead…   week of Nov 2    Sarah       [ ]
  + Add a step        Spread one a week
 [Save the plan]
```

- Each step: what changes, a week (one a week by default, any week can be
  changed), and who owns it: **Anyone** or a named trainer.
- **Anyone** can make, change, reorder or delete the plan (AJ's 2a), and
  anyone can tick a step done.
- While a plan is running, B runs as it stands today (A with the steps done
  so far), and B's card says where it is: "Phasing in · 1 of 2 done · next:
  Chest/Pec Fly, week of Nov 2, Sarah".
- **Making sure it is followed:** a step that is due shows on the client's
  profile and on that client's pre-session briefing, with its owner, and says
  "behind" once its week has passed. It never pings anyone, and it never
  makes the change by itself: a person ticks it.
- **Stop phasing** drops the plan and leaves B as it stands; **Finish now**
  makes every remaining step at once.

### Start from a routine

At the top of the builder, **Start from…** lists the studio's routines and
Max Strength's (the same list Start from a routine… already reads in the
session). Picking one fills A, and B when that routine has one, then the
trainer edits and saves. It never saves by itself.

### Setup: every machine, quick to edit

Setup becomes one table for the whole floor: a row per machine, a column per
setting (seat, pad, dials) and a **weight** column. Tap a cell, type, and
**Next** moves to the next cell; one **Save** at the bottom writes every
change in one batch. Machines in A or B come first, marked A / B; the rest
of the floor under them. What Setup does today (the FileMaker chart copy,
"clients built like her", Check) stays, one tap away from the table.

## 2. What stays the same

- The A builder's look and taps.
- A new client's starting lineup (day one, the consult is not Routine A).
- Can't do, the weak area, the order effects, the Changes list.
- A and B alternate once B is on.
- Nothing suggests a next weight.

## 3. What goes

- The Routine B segment, Plan B's sheet, "Start B" and "Start B whole", and
  "B · 2 of 2 swaps in". A client whose B was made with swaps keeps their B
  exactly as it is; it simply shows in the new card as its machines.
- B following A automatically. Today, a change to A's machines moves B's
  unswapped places too (`bFollowsA`). With B built whole, B is its own list:
  a change to A changes A only. **This is the one behaviour change a trainer
  could notice on an existing client**, so it is called out here.

## 4. Data (no new collection; rules: see below)

- Routines stay at `routines/{id}`, `machineIds` as now. B is Routine B as now.
- The phase-in plan lives on Routine B's existing `plan` map (no rules check
  its keys): `plan.phase = { steps: [{ from, to, week, owner, doneAt, doneBy }],
  madeBy, madeAt }`. A step done is the plan's existing `swap` change, so the
  Changes list says who did it and when.
- Setup's table writes settings through the existing settings writer and
  weights through `machine-totals/store.ts`, in one batch, only what changed
  (`changedPatch`).
- **Rules:** expected to need no change (the plan map and the `swap` kind
  already pass). If the rules tests say otherwise, the phase that needs it
  stops and says so, and AJ deploys rules first.
- **Firestore structure:** `plan.phase` is a new field on an existing map.
  CLAUDE.md asks for an explicit OK for structure changes; AJ's go on this
  plan is that OK.

## 5. The build, one commit per phase

Each phase typechecked and tested on its own so it can be reverted alone.
One branch: `oct19/routine-builder`.

1. **The pure half of the one builder.** Which routine a tap adds to, the
   floor tile's A / B / AB mark, B built whole, B no longer following A,
   Copy A into B. Tests beside it.
2. **The Routines segment.** The floor plus two routine cards, Save per
   routine, B on, portrait and landscape; the Routine B segment removed;
   a client with an old swap-built B shown as its machines. Render test.
3. **Phase it in, the pure half.** Steps from the differences, one a week,
   owner, done, behind, Stop, Finish now. Tests.
4. **Phase it in, the screens.** The sheet, B's line, the due step on the
   profile and the briefing. Render tests.
5. **Start from… in the builder.** The studio's and Max Strength's routines.
6. **Setup's table.** Settings and weight per machine, Next, one Save.
   Render test.
7. **Words and docs.** CLAUDE.md's decision, `docs/DECISIONS.md`, the
   routine-plan README, the testing checklist.

Then the whole suite, the typecheck and the build, and a walk on the PC
build before anything is pushed. Nothing goes to `master` or Render without
AJ's say.

## 6. Open (answer when convenient; none blocks phase 1)

- **Weight in Setup:** the working weight column is the client's current
  weight on that machine. Should it also show the last session's reps beside
  it, or only the weight?
- **"Behind":** a step past its week shows "behind" to everyone on the
  profile and briefing. Should leaders also see the behind steps on
  Operations → Today? (Default: no, until asked.)
