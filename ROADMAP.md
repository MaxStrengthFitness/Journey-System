# Journey — Roadmap

**How to read this page.** It is the short working list and nothing else: what
is being done now, what has to happen before a trainer uses Journey for real,
what is planned but not started, and what is deliberately parked. It is re-cut
at every gate, and refreshed before every weekly 1-on-1 (AJ, Oct 14 2026,
"Q8 = A").

- **History lives in `docs/rounds/CHANGELOG.md`** and each round's own notes in
  `docs/rounds/`. Nothing that is finished stays on this page.
- **The reasoning lives in `docs/ARCHITECTURE.md`** — purpose, the screen map,
  the data dictionary, the stage model. This page says *what next*; that one
  says *why*.
- **New here?** Read `docs/START-HERE.md` first. It explains the whole project
  in about fifteen minutes.
- **AJ's answers in the weekly 1-on-1** are in `docs/rounds/2026-10-14-weekly-1on1.md`
  (the first one, Oct 14 2026) and in the "Decided" section of
  `docs/ops/CONVERSATION-BRIEF.md`. None of them is asked again.

*Last re-cut: Oct 15 2026, after the weekly 1-on-1 of Oct 14 2026, on
`oct15/docs-pass`. The status block was read from GitHub, Render's
`/version.json` and the round documents that morning. What finished between
Oct 10 and Oct 14 (the studio map, the franchise partition, the open session,
the floor, the first session, the pre-launch round and the rest) went to
`docs/rounds/CHANGELOG.md`. The follow-up pile at the bottom is still as each
round left it, with one new entry for Oct 10 to 14: check a round's own
document before trusting a line there.*

---

## Where the project stands (Oct 15 2026)

**The launch** (AJ, Oct 10 2026): the three corporate studios (westlake,
Strongsville, Willoughby) start in **November**; Solon joins **before Jan 1
2027**; the first franchises from **Jan 1 2027**, in small batches (AJ, Sep
22). There are about **forty locations** in total. **The date is head
office's** (AJ, Oct 14 2026, "Q6 = B"): when they set it, the run-up steps are
counted back from it. What is left before the launch, studio by studio, is
**`docs/ops/LAUNCH.md`**.

The scale the app has to survive, stated by AJ on Sep 22: the biggest studio
has **~300 active clients**; a studio runs **100-200 sessions a week**, some
over 200; a busy Monday is **60+ sessions** and a slow Wednesday is 4; and
clients arrive carrying **10 to 200+ sessions each** of FileMaker history.

Journey is **pre-launch**. The test sessions were wiped on Oct 12 2026 (AJ ran
`scripts/reset-test-data.ts`); since then the only long histories in it are
five FileMaker trial clients, imported with `--trial` and kept until the mass
import (AJ, Oct 13 2026). A session written after Oct 12 may be real: check
before treating one as test data. **A push to `master` does not deploy it**
(checked Oct 6 2026: Render has no access to the repo). Every deploy is AJ
pressing Manual Deploy on the web service and Manual Build on both cron jobs
(`journey-cron-renewals`, `journey-cron-leaderboards`);
`docs/ops/DEPLOYS-AND-ROLLBACK.md` is the routine and the way back. The
database side (`firestore.rules`, indexes, Cloud Functions) deploys separately
with the Firebase CLI, through the ship scripts in `scripts/ship/`.

| | |
| --- | --- |
| Live on the iPads | Render's web service serves **`7ddd393`** (`/version.json` `2026-10-15T14:17:18Z-7ddd393`, read Oct 15 2026): everything through the Deep Dive, live since `aa84626` on Oct 14 2026 at 23:59 UTC (strangers out changed no app code). AJ was asked to press Manual Build on both crons after the Oct 14 deploy; that can't be seen from here, so check each cron's page names `aa84626` or later |
| GitHub `master` | **`7ddd3935`** (strangers out, pushed by its golive on Oct 15 2026 at 10:09 ET) |
| Live rules | **strangers out's** (`privacy/0-strangers-out`), deployed and checked live by its golive on Oct 15 2026 at 10:09 ET; restore tag `restore/2026-10-14-before-privacy-0` |
| Typecheck (`npx tsc --noEmit`) | **0** errors since Oct 18 2026 (the baseline was 2, `charts.tsx` and `EditTrainerModal.tsx`, until the Gemini review round). CI compares the count to `.github/typecheck-baseline.txt` |
| Tests (`TZ=America/New_York npx vitest run --dir src --testTimeout=30000`) | **14,647** in 888 files on master `7ddd3935`, strangers out (rules tests **587**; 14,629 in 886 on `aa846261` before it); **14,653** in 889 on `oct15/docs-pass`, which adds the trim's test; `CLAUDE.md` keeps the running count |
| First screen | 469.2 KB gzip of a 480 KB budget |
| Branches waiting | `oct15/docs-pass` (this pass, with the CLAUDE.md trim and the 1-on-1's brief merged in; documents and one test only, so a push and no Render step: `git push origin oct15/docs-pass:master`, a fast-forward of `7ddd3935`). Nothing else is waiting |

**Strangers out is live** (checked Oct 15 2026): its ship log,
`logs\ship-privacy-0.log` in `.claude\worktrees\privacy-0`, ends "DONE. The
rules are live and master on GitHub is 7ddd3935" (10:09 ET), and GitHub
master is `7ddd3935`. Still to do: the check the log prints (Now 1).

---

## Confirm before anything else

These are not tasks so much as unknowns, each cheap to check and expensive to
be wrong about. Check again before each ship.

1. **Are the live Firestore rules current?** Last compared on Oct 15 2026 by
   strangers out's golive: master's before it deployed, and the branch's
   (now master's, `7ddd3935`) after.
   *Check:* `npx tsx scripts/check-live-rules.ts --key <service-account.json>
   --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-…`
   (read only; it compares the live text with `firestore.rules` and says
   where they part), or `scripts/fetch-live-rules.ts` with the Firebase CLI's
   login.
2. **Are the composite indexes deployed?** The file holds 98. All 95 of Oct 10
   were live and READY, the partition and the Oct 12 release added three, and
   nothing since adds one. One live index the file no longer has,
   `taskInstances (status, localDate)`, is unused and costs on every write:
   delete it in the console (a launch blocker below). The release's
   `trainers (mindbodyStaffId, accessibleStudioIds)` is an array-contains
   index that only the console shows as Enabled. On the Enterprise edition a
   missing index does not fail: the query answers by scanning the whole
   collection, billed by the byte.
   *Check:* `npx tsx scripts/fetch-live-indexes.ts` against
   `firestore.indexes.json`.
3. **Do the rules tests pass on the rules you are about to deploy?**
   `npm run test:rules` needs JDK 21 or newer; **587** passed on AJ's PC in
   strangers out's prepare (Oct 14 2026; 490 on master). AJ's run is the one
   that counts, and nothing else verifies the rules.

The deploy order, when they do need deploying, is in `CLAUDE.md`: indexes →
rules tests → rules → push → Manual Deploy on Render.

---

## Now

### 1. Strangers out: the check after it went live (AJ)

Privacy Round 0 (AJ, Oct 14 2026, "Q1 = A": *"Let's make sure that
everything's strict and safe right now"*): an account that signs in but was
never let in reads nothing about a client or a studio's work; nothing changes
for anyone with a trainer record, or between studios. Rules only
(`docs/rounds/2026-10-14-strangers-out.md`). Its prepare passed on Oct 14 2026
at 21:06 (typecheck 2, the round's tests, rules tests 587, the audit's item 0
and item 12 both 0, AJ's YES on Microsoft sign-in) and its golive on Oct 15
2026 at 10:09 ET. Left: the check the log prints, because every rule lets an
administrator through first, so AJ's own walk can't see it. Signed in as a
Life Transformer at a live studio: a client's Notes, Pulse and sets, and
Relay's Board; as a studio leader, Operations → Today; everything as before,
with no red "Firestore Action Failed" toast. Signed in with a Google account
never let in: the access screen, with no red toast. Then push
`oct15/docs-pass` (fast-forward).

### 2. The launch blockers: people and setup, not code

Each is in `docs/ops/LAUNCH.md` with its steps. As of Oct 15 2026:

- **westlake's and Willoughby's floors aren't written.**
  `scripts/build-floors-from-filemaker.ts` (on master since Oct 13 2026) builds
  both from FileMaker's machine list; the write is AJ's (a dry run, then
  `--commit`). Until then a session there shows the whole MSF catalog.
- **Renewals at westlake and Willoughby** (My Studio → Studio → Renewals:
  auto-renewal off, the package table, the Mindbody names).
- **Willoughby's schedule** was last pulled from Mindbody on Sep 10.
- **The webhook's two missing events** (`register-webhook.js --update-events`).
- **16 Limbo items** (Admins → Machinery → Limbo).
- **The unused index** `taskInstances (status, localDate)` to delete.
- **Cutover dates**, from head office's launch date.
- **The full FileMaker export** (a client id and a trainer on every line) and
  **the settings audit**, per studio, before the night-before import (AJ, Oct
  14 2026, Q4).
- **Outlook (Microsoft) sign-in** waits on Max Strength's IT admin approving
  logins. Google sign-in works today.
- **The GitHub repo is still public.** It can go private only together with
  installing Render's GitHub app on it, or every deploy stops; both are the
  repo owner's (`MaxStrengthFitness`).

Not a blocker any more: **studio leaders**. AJ lets each studio's trainers in
at its launch (Oct 14 2026, "Q3 = B": *"We honestly don't have an insane
amount of trainers, so I don't mind just doing it myself"*); until a studio
has a leader, only administrators see its Operations.

### 3. The iPad walk, this week

AJ, Oct 14 2026, "Q5 = A": *"yes we will 100% do a walk later this week"*. The
last recorded walk was Oct 3 2026, and about 23 rounds have gone live since.
Three things on purpose: the Wi-Fi switched off in the middle of a set, the
Wrap-up, and a trial client with a long FileMaker history. Claude names what
to look at when AJ is ready; no numbered checklist.

---

## Next — before a trainer uses Journey for real

This is **Gate B** (`docs/ARCHITECTURE.md` §5.3): the list that separates
"AJ's app" from "an app other people use".

- ~~**The franchise partition in the rules.**~~ Built Oct 10 2026 and live
  (the app on Oct 11, the rules by the Oct 12 release at the latest).
- ~~**Strangers out**, privacy Round 0.~~ Live Oct 15 2026; its check is Now 1.
- **A studio's own time zone** (Planned 9). The first studio outside Eastern
  is expected **January to March 2027** (AJ, Oct 16 2026: "January-March"),
  so it is built, shipped and walked by the end of December 2026.
- **The rest of the privacy lock, Rounds 1 to 4.** Before the first
  franchise, Jan 1 2027 (AJ, Oct 2 2026). The design was written on Oct 12
  2026; Round 0 re-derived its rules from the current file, and each later
  round will too. **Each round is checked against AJ's "I just don't want to
  be restrictive"** (Oct 14 2026, of the corporate studios: *"I don't really
  want Strongsville, Willoughby, and Westlake to share everything"*): no
  "share everything" rule between them, and today's ways between studios
  (also works at, cross-train approvals) stay. Already answered:
  - **A client from another studio nobody approved here** (Q11 = A): train
    and save; the session and its sets are readable here and at the client's
    home studio; the notes stay with the home studio until someone approves
    the client.
  - **Bookings lock to their studio** (Q12 = A, refined by AJ: *"if a trainer
    has access to that studio, they should obviously be able to read that
    schedule. And head trainers, studio leaders, and admins should be able to
    see every studio as well"*; follow-up A: every studio **in their own
    group**: the corporate studios' leaders all corporate studios, a
    franchise's leaders that franchise's, administrators all).
  - **Each franchise has its own Mindbody account** (Q17, the partition's
    default #4, kept): ask head office before the first franchise signs, and
    build the location check before any franchise on a shared account goes
    live. Defaults 1, 2, 3 and 5 are kept too.
  - **Parked, first on the next 1-on-1:** lock the trainer records. Each holds
    its Kaizen Roster (a client's name, a reason and a note), and until Round
    4a any signed-in account can list every trainer record, because the
    sign-in's own lookup reads `trainers` by email before anyone is let in
    (strangers out §3). Recommended as the next small round after strangers
    out.
- **A Wi-Fi drop in the middle of a set, on an iPad**: this week's walk (Now 3).
- **CI as a required check on `master`**: needs the repo's owner. Its
  typecheck gate is 2, and the tests run on the studios' clock
  (`TZ=America/New_York`) since Oct 12 2026.

**Settled on Oct 10 2026** (`docs/rounds/2026-10-10-prelaunch.md`): Mindbody
down or a walk-in not in Mindbody (the open session and New client's
temporary profile, in `docs/ops/TRAINER-QUICK-START.md`); the PC build's mark
on screen; the written rollback plan (`docs/ops/DEPLOYS-AND-ROLLBACK.md`); the
trainer-identity report (0 stranded); credential rotation (nothing live is
exposed).

**Known and held open by decision:** the cross-studio task writes are the one
write hole still open while every user is verified by hand (strangers out
closed the write-open collections nothing uses). Revisited at Gate C.

---

## Planned — wanted, not started

AJ's list of what is coming to the app but is not being worked on yet (Oct 9
2026: "those are all planned and stuff that is not going to be added yet"). When
an item's turn comes it gets a round of its own, and the round starts with a
plan AJ confirms, not with code. **The order (AJ, Oct 14 2026, "Q9 = A"): after
the launch blockers, the machine editor is next.**

### 1. Tutorial mode — on hold

AJ: "above all else", but it waits until the screens it teaches stop moving
(AJ, Oct 10 2026: the tutorial waits until the app is finished). A tutorial
that plays like the opening of a 4X strategy game: the screen dims, the one
thing to tap next lights up with a short line saying what it is and why, the
trainer makes the real tap, and the next step lights up. It walks a first
session both ways trainers work, because "we need to be able to do both":
**plan first, then run** (the routine on Programming, the settings on
Programming → Setup, then the session), and **build it as you go** (the open
session's +, Start from a routine and Set up, live since Oct 10 2026).

It runs in Demo Mode's practice studio (`src/features/demo-mode/`), so no real
client is ever written. **The spotlight, kept from the Gemini review** (Oct 14
2026, Q10): the screen dimmed by one drawing with a hole cut where the next
tap is (a single SVG mask), so the real control shows through and takes the
real tap. Open: whether it starts by itself on a trainer's first sign-in or
only from a button, and what it covers after the session.

### 2. A machine editor that isn't intimidating — NEXT, after the launch blockers

AJ, Oct 9 2026: the editor is "so lengthy", "it's so intimidating to fill
out"; Oct 14 2026: next, **"settings first"**, with a plan first under the
step-by-step protocol. **It starts with a conversation about how we catalog
machines** (AJ, Oct 16 2026: "we need to figure out how to catalog our
machines in the best way possible, plan a conversation out for this one too";
on the next 1-on-1's list in `docs/ops/CONVERSATION-BRIEF.md`), because the
pieces below are AJ's ideas so far, not yet the whole picture. What AJ wants
from it:

- **The settings first.** The one change a trainer actually needs to make is
  saying which settings a machine has. FileMaker made it easy, one box of
  letters (S seat, B back, C chest, G gap) each with a number or a letter, but
  "really unorganized and not very good". Journey should be as quick and stay
  organised. (Journey already reads that shorthand once a machine has its
  dials, `parseShorthand` in `src/features/machine-fit/shorthand.ts`; what is
  slow is giving a machine its dials.) A machine's setting names live in two
  places today, its own dials and the Studio setup card, and the floor reads
  both (`docs/rounds/2026-10-13-studio-machines.md`); **one place for them is
  the settings audit's to settle** (AJ, Oct 13 2026: "ill have to audit all
  the machine settings before mass import").
- **Short sections, not one long list**: "very sectioned out" and "as least as
  intimidating as possible".
- **Start from what the machine is.** "There's only so many body parts. There's
  only so many push pulls." A new machine starts by choosing what it is and
  inherits what follows from that. The pieces exist: the ten movement patterns
  (`MOVEMENT_PATTERN_ORDER`, `src/types/machines.ts`), the Academy's five
  families, the anatomy model, and the "based on" comparison
  (`src/features/admin/catalog/review.ts`). The Gemini review's outline (pick
  what the machine is, then its settings, then the method folded away) is a
  starting sketch; it matches AJ's Oct 9 words.
- **Strongsville's Hoist leg press** (Q15 = A: it counts as a leg press in the
  routine builder's checks). It has no "most like" (`basedOn`) and is filed
  under Horizontal Push, and `basedOn` can be chosen only when a machine is
  made: this round makes it editable and corrects the Hoist.
- **The maker's machines, with their sizes.** Most studios use Imagine Strength
  machines; the twenty models are seeded with their footprints
  (`machineModels/{id}.size`, Oct 12 2026), and a unit can carry its own size
  (`roster.unit.size`). A studio adding one would pick the model and get its
  dials and footprint.
- **One movement, many models, the standard on top.** AJ, Oct 15 2026: "rather
  than cataloging a whole different machine just for the same exact seated dip
  that just have a different seat size ... under the seated dip you can change
  the variation to be Seated dip - Imagine Strength 2018 or Seated Dip -
  Imagine Strength 2022 or Seated Dip - Hoist Model # XXXXXXX ... so we have a
  more organized list of machines that isn't as intimidating and then Admins
  just set what is the default or standard machines that would sit at the top
  of the variation list". And on averages: "a large amount of clients could be
  on the wrong settings", so studios may stray from the norm. The data for it
  exists: the model record (`machineModels/{id}`: maker, model, the MSF
  movement it is, its dials and size; twenty Imagine Strength models seeded
  Oct 12 2026) and a unit naming its `modelId`. The round makes "a model of a
  movement we already have" the easy way to add hardware (Strongsville's Hoist
  would have been the Leg Press · Hoist, not a custom machine), lets
  administrators mark each movement's standard model (top of the list), and
  lets machine fit compare clients on the same model rather than blending a
  Hoist seat 4 with an Imagine Strength seat 4 (the follow-up pile's "settings
  numbers blended across models"). On screen, a different piece of hardware is
  a **model**; a different way to use one unit is a **variation** (item 5).
  On a machine's Catalog page the models come in AJ's order (Oct 15 2026:
  "it should show their studio as the favorited and then next the company
  standard (unless it is their studios) and then all the other variants to
  pick from just in case a trainer wanted to learn about other machines"):
  this studio's own first, then Max Strength's standard model unless it is
  the same one, then every other model to read about.
- **Head office adopts a studio's best work easily.** AJ, Oct 15 2026: "i
  just dont want studios willy nilly posting information to the company wide
  catalog ... but in the event that a studio had been a studio to be a first
  with that machine or studios that have gone above and beyond to make a
  awesome source of information i just want the ability to be able to adopt
  the information into the main catalog easily". Today a studio edits its own
  copy freely and nothing reaches the catalog until an administrator publishes
  it, but adoption starts only when the studio offers it (Offer to all MSF
  studios, then Admins → Standard → Waiting for review). Compare (Admins →
  Standard → Machines → a machine → Compare) already shows every studio's
  differences; the round adds a way for head office to bring a studio's
  machine or a field of it into the standard from there, opened in the catalog
  editor to read and correct before it publishes, with no offer needed. And
  the other way (AJ, Oct 16 2026: "Admins should be able to adopt information
  if they choose to but studios should also be able to offer to help ... if a
  studio disagrees with information in the catalog and wants to try to change
  it they should be able to"): a studio that changed a standard machine's
  words on its own copy can offer that change, with its reason, as a
  suggestion for the standard; it lands in Admins → Standard → Waiting for
  review beside the other offers, and an administrator adopts it, edits it,
  or answers why not.

AJ's Sep 21 asks are still open too (`src/features/admin/machines/README.md` →
"The editor round that has not happened yet"): duplicating a machine, drafts
to finish later, and a step-by-step path through the form. Open: the main
categories; whether a trainer may give a machine its dials or only propose
them.

### 3. The studio map: a mock studio

The map was built Oct 10 to 12 2026 and is live
(`docs/rounds/2026-10-12-studio-map.md`). AJ's change, Oct 14 2026 (Q13):
*"I still want to be able to put it as a map also, not just randomly. And then
we need to be able to kind of make a, a mock studio because people might not
know their exact square footage. So it's almost like, hey, let me make boxes
and then the machine sizes, I can kind of fill in the blanks there. And if
it's off, it's off. But if you want to put in your exact size, you can."* A
small round, plan first:

- **Always draw the map.** Today a floor shows its list, not its map, until
  every placed machine has a size; that fallback goes.
- **Rough the room out** with boxes, without its exact square feet.
- **A guessed size for an unsized or studio-built machine**, labelled "size
  guessed": its "most like" movement's Imagine Strength size, else a typical
  box. Exact sizes stay optional. This reverses the Oct 12 map-sizes rule that
  a studio's own machine is never given a size.

Kept as built (Q13): a tap on Relay's floor marks a machine wiped, and Report a
problem flags the machine and rings the leader's bell.

### 4. A client's progress as a document, then a client sign-in

**The one page is built** (Oct 13 2026,
`docs/rounds/2026-10-13-progress-report-page.md`): the progress report prints
on one US Letter page, its modules chosen by why the client trains, and the
client's view reads on screen in the app's look. Left: an export, a file a
trainer can save and hand over (what goes in it, its format and who may make
one are open), and later the client sign-in, which would change a line of
**Not building** ("No client app or portal"). History before Journey is said
as such, never left out (`docs/business/migration-and-prior-history.md`), and
Journey sends nothing itself; a person hands the document over.

### 5. Variations of one machine

AJ, Oct 12 2026: "some machines have different variations or different ways to
perform them, for instance the 4 way neck machine has 4 different ways to use
it, torso rotation has 2 different directions, heck even torso pulldown has 6
different ways to angle the handle which all change which muscles are
activating, like on compound row, horizontal handles vs vertical handles. file
maker didnt but we need to add to the road map different variations to one
single machine".

- **Not a model.** A different maker, year or part on the same movement (a
  Seated Dip with another seat size) is a model of the movement, in item 2's
  machine editor round (AJ, Oct 15 2026), not a variation.
- **What a variation is.** One unit, several ways to use it: the neck
  machine's four directions, Torso Rotation's left and right, the Pulldown's
  handle angles, the Compound Row's handles. Each works different muscles, so
  each has its own weights and its own story.
- **What exists today.** A set can carry a side (`side`, `repsLeft` /
  `repsRight`, read by the Staircase). Nothing names a variation. Solon writes
  Torso Rotation as "7.6" (7 left, 6 right) in one box, and the FileMaker
  import holds that as it is.
- **What it would touch.** The catalog (head office names a movement's
  variations and their muscles), a studio's unit, the session (pick the
  variation at the machine), a routine and its plan, and everything that
  counts per machine: the Staircase and the green %, machine fit, machine
  trends, the starting weights.

Open: a line of its own on the grid or a picker on one line; whether its
settings are kept apart; who names the variations. It is a Firestore structure
change and needs AJ's OK.

### 6. Reference settings in an open session, from the body

AJ, Oct 15 2026 (a comment on the CLAUDE.md trim's review page, on the open
session): "when you run a open session you can put the gender age and height
and it will help you select settings to reference from, they wont be perfect
but it will be the closest we can guess and then trainers can use their
trainer knowledge to fine tune it." It needs "the filemaker data and also
client height", refined into averages "once we start having a large amount of
data".

- **What exists today.** Machine fit (`src/features/machine-fit/`, Sep 17
  2026) already suggests settings from clients built alike (height, then
  gender, wingspan, weight, age, on a tolerance ladder with a named minimum
  sample, and a k-anonymous company tier on height and gender), on Programming
  → Setup for a client on record. `client.height` exists.
- **What this adds.** The same suggestion in an open session's Set up card,
  before the client is chosen: the trainer types height, age and gender, and
  each empty dial shows where people built alike usually sit, as a reference
  beside the dial, never typed in for the trainer and never a weight.
- **What it waits on.** Enough settings history with heights: the FileMaker
  import (settings and, if the export has it, height) and Journey's own
  sessions. Below the minimum the card says there are not enough similar
  clients yet.

Open: where the typed body facts live until Who's this? (beside `heldSetup` on
the session, a structure change that needs AJ's OK, or nowhere once the
suggestion is shown); gender here sits beside the starting-routine rule that
gender is used nowhere in choosing a start (Oct 8–9 2026), so it is asked when
the round is planned.

### 7. A client's attendance in one place, on the profile

AJ, Oct 15 2026 (a comment on the trim's review page, on Sessions left):
"MindBody is a beast nobody likes dealing with because it is an extremely
confusing. Studios need to be able to quickly understand when looking at a
client How many sessions theyve Completed How many sessions they have left in
their contract and if they have any extra and also how many times theyve
rescheduled or cancelled this list needs to be auditable because sometimes
scheduling can mess up so we dont want to mark people to hard or to loud just
for reschedules and late cancels. but itd be nice to be able to see on the
clients profile their attendance and how to plan for it and understand how
they attend".

- **What exists, in three places.** The total on the header ("#N", from
  `lib/session-total.ts`); "36 left in contract · +12 extra" on Notes &
  Profile → Account (`sessionsSplit`); and Activity Archive → Calendar, which
  lays the bookings over the sessions: Booked, Cancelled (only those Journey
  saw happen, from Sep 2026), Moved, Didn't come and Late cancel, a reschedule
  only for a real rebook (`client-history/bookings.ts`, `isRealRebook`). The
  client's usual rhythm is worked out already (`computeCadence`).
- **What this adds.** One quiet Attendance card on the profile: completed,
  left in the contract and extra, then late cancels, cancellations and
  reschedules over a window, each count opening its dated list (what
  happened, when, and where the record came from), and the usual rhythm in a
  sentence ("Usually twice a week, Tue and Thu"). Counts are sentences, never
  a score or a colour; nothing on the Hub or the briefing gets louder because
  of them, and a count says "since Journey started recording" where the
  record is short.

Open: the card's place (Account beside the contract numbers is the
recommendation; the Journey tab is the other choice).

### 8. Trainers' time in the app, and clients who could be regulars

AJ, Oct 15 2026 (a comment on the trim's review page, on the standing week):
"i just want trainers to have the ability to put their availbility directly
on the app and be able to block off time for certain reason so the schedule
can be clearly understood and then we can work on a way to identify how to
optimize the schedule and work out recurring visits for clients possibly. not
every client CAN do the same time everytime but some may be able to and just
dont know its an option".

- **What exists.** A trainer proposes their usual week on My Profile (up to
  three blocks of client time a day) and a leader agrees it on My Studio →
  Team; days away block out whole days with a note (`standing-week/`, at most
  six ranges); the Hub hatches the time outside it; My Studio → Openings
  shows the usual week, the next 7 days and **A new regular time**, which
  offers a client a standing slot (`openings/offer.ts`). It never books:
  "Check it in Mindbody before you promise it."
- **What this adds.** (1) A block of part of a day with a reason ("Thursday
  2-3, team meeting"), one-off or every week, drawn on the Hub and kept out of
  Openings' room. (2) Clients who could be regulars: from the visits Journey
  already holds, the clients who keep coming at about the same day and time
  without a standing booking, each said as a sentence ("Comes most Tuesdays
  around 9") on Openings, for the front desk to offer in Mindbody. It never
  books (booking a Mindbody visit is never, Oct 15 2026) and never contacts
  the client.

Open: whether a block with a reason needs a leader's agreement like the
usual week, or stands on the trainer's word like days away.

### 9. A studio's own time zone

AJ, Oct 15 2026 (a comment on the trim's review page, on "Dates are the
studio's Eastern day"): "the corporate locations are in Ohio but we have some
all over the country so we will need to be able to change timezones for a
studio eventually".

- **What exists.** Every date goes through `src/lib/studio-time.ts` (about
  250 files), which already takes a zone and checks it is a real one, with
  Eastern (`America/New_York`) as the default; the Sunday job's Openings
  summary already carries a `tz` that nothing reads yet.
- **What this adds.** A studio's zone as one of its settings (head office
  sets it when it opens a studio), handed to every date the screens, the
  nightly and weekly jobs, the Mindbody schedule and the reports work out for
  that studio, and the Calendar's parked day shift for iPads east of Eastern
  settled with it. Tested across zones, the way the suite is held to Eastern
  today.
- **When.** The first studio outside Eastern is expected January to March
  2027 (AJ, Oct 16 2026: "January-March"), so this is built, shipped and
  walked by the end of December 2026. It is on Gate B's list (Next).

### 10. Achievements on a client's profile (an idea, parked)

AJ, Oct 16 2026 (a comment on the trim's review page, on the Hub's Critical
mark): "there is an idea in my head where profiles not only get badges for
critical things that show on the hub but also as the client trains they earn
accolades and achievements that can be displayed on their profile ... some
could be automatic like a badge for every 100 sessions that keeps upgrading or
a consistency badge for getting 2 times a week so many times in a row ... the
awarded badges could be like "Master one of the 4 P's Path" "Good spirited"
"MVP of the month" ... i dont really want to build this idea out too far yet".

- **Two kinds.** Automatic (every 100 sessions, upgrading; a run of weeks at
  the client's twice a week) and awarded by a trainer (a 4 P's path mastered,
  "Good spirited", "MVP of the month"), each kept with who and when.
- **The rules it meets.** An automatic one counts only what Journey can
  stand behind: a session total that is confirmed or wholly Journey's
  (`canClaimMilestone`), a run of weeks only inside the part of the client's
  history Journey holds. The progress report's accolades
  (`progress-report/accolades.ts`) and the Hub's milestones already follow
  these rules. On the profile only, never on the Hub card.

Parked by AJ's word; a round of its own, plan first, when it is picked.

### 11. Journey that still works without Mindbody

AJ, Oct 16 2026 (a comment on the trim's review page): "our goal is to take
over the recording portion of the workouts. the data tracking ... The main
thing is i dont want the app to be useless WITHOUT mindbody ... if we ever did
part ways i dont want this app to be completely useless and who knows maybe i
would demo this app to someone who doesnt use mindbody for their clients and i
want them to be able to use this app." Mindbody stays the owner of people,
bookings and contracts for Max Strength; nothing here moves that.

- **What already works with no Mindbody.** Demo Mode is a whole studio with no
  Mindbody link; a client can be added in Journey (Add Client's walk-in, the
  open session's Who's this?); sessions, sets, routines, settings, notes, the
  machine card, the Staircase, the progress report and the Deep Dive are all
  Journey's own.
- **What goes blank.** The Hub's schedule (bookings come from Mindbody),
  sessions left and renewals, packages, Openings, the before-Journey totals,
  staff photos.
- **First step: a read-only check** of a studio with no Mindbody link, screen
  by screen: what works, what goes blank, and what says something wrong
  instead of "not connected". Then AJ picks what a Mindbody-less studio needs
  (most likely a simple schedule of its own and clients added in Journey).

### 12. Consistency: the Consistency Club and a client's streaks

AJ, Oct 16 2026: "I just want to be able to track clients consistency on a
studio leader level, so being able to see all my clients at a studio and
knowing who has had 2 times a week currently the most amount? who has the
longest 2 times a week streak? This is something a studio leader may want to
reward so being able to read it in a easy way(like on somewhere in operations
and also somewhere on that clients profile) Allstars could use a better
name". His picks the same day, "2c" and "3a": the name is **Consistency
Club**, "i want to also add the ability to see who has consistently gotten 1
once a week also because some client do just come once a week", and a streak
can be paused: "we do want to allow clients to go on vacations or if they have
a surgery studios should be able to pause the streak ... so clients still live
their life and dont lose out on their consistency when its outside of their
control ... we would never advise skipping a surgery just to keep a streak
going so thats why we can pause it".

- **What exists.** All stars (`hub-opportunities/all-stars.ts`): the nightly
  renewals job finds the clients with a visit in at least 24 of the last 26
  weeks at about twice a week, only where Journey holds every visit in that
  window, and writes them to `studios/{s}/watch/hubMarks`; the Hub shows them
  as a Sessions sort section and a line in the peek.
- **What this adds.** For each client, two streaks at each of two paces,
  **twice a week** and **once a week**: the current one (weeks in a row at that
  pace, still running) and the longest on record. All stars is renamed
  **Consistency Club**. Leaders read the studio's list on Operations → Clients
  → Moments (where they already go to do something for a client), sorted by
  the current streak with the longest beside it, twice a week and once a week
  each its own list. The profile says it in one line on the attendance card
  (Planned 7), e.g. "Twice a week for 14 weeks in a row · longest 22".
- **Pauses, never breaks** (3a). A week under the pace breaks a streak,
  except a week the studio was closed or the client was away for a reason
  outside their control (a vacation, a surgery): those weeks pause it. The
  reason and the dates come from a person (the Away record the renewals
  already keep, or a leader's pause with a reason), never guessed from an
  empty week.
- **The rules it meets.** A streak counts only weeks Journey holds and says
  where it starts counting ("since Journey started at Strongsville") until the
  FileMaker import reaches further back; late cancels are never visits; a
  count, never a score or a colour; recognition, the client's own, and the
  leaders' list is a list to act on, never shown to clients. A new summary
  document per studio, written by the nightly job beside `hubMarks` (a small
  Firestore structure addition, AJ's OK asked at plan time); no Mindbody
  call, no new timer. Achievements (Planned 10) would read these streaks
  rather than count again.

Open, at plan time: how long a pause may run, and who may pause (the
recommendation: anyone at the studio records it, a leader may undo it, like
late cancels).

### 13. Icons: one audit, one set

AJ, Oct 16 2026: "i would love a round where we gather all our icons together
and do a overhaul audit to make them all consistent". The app draws from
lucide-react everywhere, with no single list of which icon means what: a heart
is kudos on Relay and the client's Why on Goals, a heart with a pulse line is
Pulse and also the studio map's AED, and the Hub's marks have their own map
(`hub-schedule/HubCard.tsx` `GLYPH`, shared with the Next 30 minutes strip).
The round gathers every icon on one page (where it is used and what it means
there), finds the ones that mean two things or two icons for one thing, and
proposes one set: one icon per meaning, one size and stroke per place, held by
a test the way colours are. Its first decided change: Get to know's mark
becomes a **filled heart in the logo blue** (AJ, Oct 16 2026, "1a"; blue keeps
it Get to know's own family, orange would read as Celebrate beside the
birthday cake, and three colours run together at 13px). The heart can ship
alone before the round if wanted.


### Small items, each plan first

- **Adding a B routine: build it directly; molding it in is an option** (AJ,
  Oct 16 2026, on the trim's review page: "Right now this is causing the B
  routine to be extremly cluttered if im just trying to add the B routine for
  an existing client. yes i want to work in B routines with new clients but i
  want that to be an option you can go through not an automatic 'you have to
  do this' it just causes so much stuff all over the screen and i dont know
  where to act"). Today, turning B on with nothing in it always opens Plan B,
  the swap-by-swap sheet (Oct 8 2026: "never an empty B";
  `routine-plan/ui/useBSwitch.ts`). The fix offers a plain way to build B
  like A, with molding as the option, and shows B's swap chrome only for a B
  being molded in. This reverses part of the Oct 8 rule, so the decision
  record changes with it. Planned with AJ's answer in the review page's
  thread; it is AJ's pain today, so it comes early.

- **Anniversaries on the Hub card** (AJ, Oct 16 2026: the Hub's marks are
  "very important things that day like Renewal talks Birthdays Anniversaries
  New clients Long Breaks"). Four are there (Renew; Celebrate's birthdays;
  Welcome's consult and first sessions; Welcome's back after a break); an
  anniversary shows only on Operations → Month today. It joins Celebrate on
  the day, from a confirmed first day only (`canClaimAnniversary`), so the
  card never says a guessed date.

- **The next design check (a UI visual check).** AJ, Oct 15 2026, on the
  trim's review page, named three decisions to look at again:
  - the design-tokens rule (every colour from the tokens, the copied feature
    palettes and the tests that hold them): "id like to evaluate this rule
    again in another design check eventually";
  - the Navy Frame (the frame's navy, blue for yours and every Save, orange
    only for now and go, light and dark): "I want to also include this in our
    UI visual check eventually";
  - Type and depth, "Refined Lift" (the display face, the type scale, buttons'
    lift and press, panels and wells): "Another one to add to the visual
    check".

  Each is brought to AJ with what it costs and what it protects before
  anything changes; until then all three stand.
- **What a studio has to ask head office for** (AJ, Oct 16 2026: "it
  shouldnt have to be something where the studios are needing to reach out
  to admins to change basic things that they should have control over"): a
  read-only list of every control only administrators hold today (for
  example a studio's Mindbody link and how often its schedule is pulled, the
  standard machines, head office's starting routines and defaults), each
  marked "company-wide, keep with head office" or "the studio's own, hand it
  over", for AJ to pick from. No code.
- **Indexes no query uses** (Claude's review of the index rule, which AJ
  handed over on Oct 16 2026: "this was your call so feel free to review
  this idea"). The rule stays: on the Enterprise edition a query without its
  index silently scans the whole collection, billed by the byte. The other
  half is missing: `firestore-indexes.test.ts` fails on a query with no index,
  but not on an index no query uses any more (98 composites today), and each
  one costs a little on every write. The test learns to name them, so they
  are deleted with the next index deploy; the first known one is
  `taskInstances (status, localDate)`, still live in the console.
- **What Journey collects that nothing reads yet** (AJ, Oct 15 2026: "anything
  we collect we want to use"): a read-only sweep of the fields Journey writes
  against the screens, reports and jobs that read them, with each unread field
  named and a suggested reader, for AJ to pick from. No code.
- **Mark the 24 role-less trainer records "waiting to sign in"** (Q14 = A):
  `pendingClaim`, by a script that runs dry first; nobody is deleted. They
  leave "works here" until they sign in (`docs/rounds/2026-10-10-prelaunch.md`
  §7).
- **Admins warns when a studio is linked to a Mindbody account another owner's
  studios already use** (Q17).
- **Three keepers from the Gemini design review** (Oct 14 2026, Q10 = A; the
  fourth, the spotlight, is tutorial mode's):
  1. **A shorthand box on the machine card**: type "S4 B2 C3" and the setting
     tiles fill in. Settings only, never a weight; after the settings audit.
  2. **One search from the header** for trainers: a client, a machine, or a
     question about a client's notes.
  3. **Drag along the Staircase** to step its fixed readout through the
     sessions.

  Dropped, each against a decision: number dials dragged with no keyboard
  (typed numbers, Oct 10 2026); click sounds (the clicker is the cue, never
  the app); collapsing Wrap-up cards (every card stays, Oct 9 2026); a
  floating chart magnifier and extra note dots (the accepted Staircase).

---

## Later — Gate C and beyond

- **A final round on how a client's profile is organised.** AJ, Oct 16 2026,
  on the trim's review page, of the four tabs ordered by depth (Journey ·
  Programming · Notes & Profile · Activity Archive): "I want to revisit how we
  have everything organized but save that for a final round". The order stands
  until then (`PROFILE_TABS`, held by `profile-nav.test.ts`).
- Lock the remaining write holes right before the first franchisee goes live.
- The new-studio runbook; the tracker and routine builder reading the studio's
  own floor only.
- **Demo Mode and the tutorials.** Demo Mode was rebuilt on Sep 20 2026 as a
  real practice studio (`src/features/demo-mode/`); the tutorial is item 1 of
  **Planned**.
- **The FileMaker history.** The importer exists (`scripts/import-filemaker.ts`,
  `docs/rounds/2026-10-12-filemaker-import.md`); production writes are switched
  off except `--trial` (at most five clients a run), and five trial clients are
  in. **The mass import is per studio, the night before its cutover** (AJ, Oct
  14 2026, Q4 follow-up A: *"if we need to, a trainer can go ahead and enter in
  the information into Journey and then FileMaker after if it absolutely is
  necessary"*), because the importer refuses a client who already has Journey
  sessions of their own. It needs the full export and the settings audit first
  (both in `docs/ops/LAUNCH.md`). **FileMaker stays open as the backup** until
  every client is on Journey (Q4: *"we want to have our FileMaker there as a
  backup until we are fully transitioned over and have all clients on
  there"*); what is typed into FileMaker after a cutover is never imported.
  **Imported notes come in quiet** (Q16 = A): on the profile, marked from
  FileMaker, never on the briefing or the Hub, and a trainer raises one with a
  tap. Not built yet: today the importer reports the profile's standing note
  and doesn't import it. **One client, several FileMaker records** (AJ, Oct
  16 2026: "each studio has its own database of clients on filemaker ... Some
  clients orginally trained at westlake but eventually may be at a different
  studio now as a different saved user in Filemaker saved under that
  studio"): before the mass import, the clients who appear in more than one
  studio's export are found and brought onto ONE Journey client (Mindbody's
  id is the key), their histories in date order; a discussion first, on the
  next 1-on-1's list.
- The Monday-morning questions 2–4 as automatic in-app flags.
- Mindbody's webhook already handles `staff.*`, contract, membership and sale
  events in code (`functions/src/mindbody/index.ts`); whether Mindbody sends
  them all is not checked here.
- **Teams in Journey (proposed Oct 3 2026, waiting on Jeff and AJ).** Teams
  carries the conversation, Journey keeps anything about a client. It would
  change one line of **Not building** below (Teams may notify; Journey still
  sends nothing). `docs/rounds/2026-10-03-teams-proposal.md`. AJ, Oct 16
  2026, on the trim's review page (on recognition and kudos): "we are going to
  plan to use our app with Teams so we will be moving away from this rule and
  how comments are made on things like this, not to be confused with notes":
  kudos and comments move to Teams; a client's notes stay in Journey.
- Accessibility pass. (Cold-load timing on a studio iPad is measured by the
  perf lab, `harness/perf-lab/`, and each cold open's boot report.)
- Architected for, not built: automated retention beyond flags (in-app only),
  the InBody Web API per studio, badges and awards, `strict` TypeScript,
  Cloud Functions tests in CI. (A studio's own time zone is Planned item 9.)

---

## Not building

No client app or portal (a client sign-in is planned for later, item 4 of
**Planned**, and would change this line). No outreach yet — no email, SMS or
push, to clients or to trainers — but it is "not a NEVER do its a we arent
doing yet" (AJ, Oct 15 2026), so it may come later as its own round. **Never a
Mindbody booking** through the API: "Never do is Book a mindbody visit because
2.50 fee is crazy for that" (AJ, Oct 15 2026). No billing or payment features. No nutrition tracking beyond the check-in's self-reported fields. No
wearables. No AI coaching. Nothing for a company other than Max Strength
Fitness. (`docs/ARCHITECTURE.md` §1.7.)

---

## The follow-up pile

Small things left behind by a round, grouped by where they live. None is
urgent; all are written down so they are not rediscovered.

**The rounds of Oct 10 to 14 2026** — each round document's own open list is
the source; the short version:
- *The Oct 12 release* (`2026-10-12-release.md` §6, each needing AJ's OK): the
  wipe chore's rows check no studio; at most ten removed safety lines in the
  rules; record a staff number's site when a trainer is linked, and protect
  `mindbodyStaffId` like the other access fields; tighten who may clear an
  unfinished session to its host studio. Its iPad checks (§5) were never
  recorded, and each studio still draws its floor and its Sizes.
- *The Oct 12 morning page's six questions* and the Everyone's Journey walk's
  questions have no answers yet; each was built with its default or waits.
- *Switching studio* (Oct 12 2026): whether the header's name opening the
  picker and its logo going to the Hub is right; a switch from inside a
  running session leaves the session running but off the new studio's bar.
- *The Calendar on a clock east of Eastern* (parked, Oct 12 2026): Week and
  Month key a day from local midnight, so an iPad set to a European clock
  shifts them back a day; keying from noon, as the visible range already does,
  fixes it.
- *The FileMaker import's questions for AJ*: a single count on a per-side
  machine (Torso Rotation "8") imported as 8 each side; the machines a studio
  replaced in Oct 2024; Solon's alternating Leg Curl; Willoughby's Lumbar
  setting "Ft". The trial import's Strongsville clients charted before late
  2024 had machine names rotated in the export: one fixed with `--relabel`,
  another waiting on a read of the chart.
- *The Deep Dive* (`2026-10-14-deep-dive.md`, parked): the paper chart
  importer leaves no mark on a session it matched to a real trainer.

**Machines and the catalog** — try the catalog gate by hand once (no studio
has ever offered a machine): a custom machine on a studio floor → offer it →
Admins → Standard → Waiting for review → correct a cue, publish → the studio's
floor says corporate adjusted it (`docs/rounds/2026-09-20-catalog-gate.md`).
**The company-wide settings numbers are blended across models** (a Hoist seat
4 averaged with a Nautilus seat 4) until a model is recorded on a roster entry
— see `src/features/machine-fit/README.md`; weight pooling is unaffected. The
twenty catalog machines still use the floor abbreviations (`CX (4 WAY NECK)`,
`BICEP`) rather than the Academy's names; the rules do not enforce the machine
template boundary (the app does, at the write and at the publish). A second
unit of one movement (`source: "custom"`) can't follow the standard's later
corrections.

**The floor and the client profile** — `machineStats` first/last dates are not
recomputed when a past session is edited; `sessionNumber` on a backfill (Log
past session) comes from the newest session (the FileMaker importer numbers its
visits from the history itself); the Journey grid's machine names wrap and the row grows
(checked Oct 18 2026, the Gemini review round: `.jg-machine__label`, now under
the names-wrap guard; this line had said "truncates" since Sep 29), and the
grid's column widths are tokens (`--jg-col-machine`, `--jg-col-session`), about
8 history columns in portrait.

**Renewals and Operations** — Operations → Renewals settings matched to the
Mindbody package names; the collision-checker batching fix; the
`hub_announcements` delete rule; the Render cron service is still named
`journey-cron-leaderboards` although it runs the machine-trends job.

**Mindbody and sync** — restore the bookings the old sweep cancelled
(Operations → Mindbody → Sync with a past start date, per studio).

**Housekeeping** — the repo root collects archives, logs and dumps, and merged
branches pile up; the inventory and the commands are in
`docs/ops/REPO-HYGIENE.md` (`scripts/ship/tidy-root.ps1`,
`scripts/ship/cleanup-branches.ps1`). `docs/ARCHITECTURE.md` §2–§4 are still
marked "review pending" and worth bringing true (§2.5 now says it is
superseded, and points at what is built).

**The polish pass, not re-checked** — the Floor's landscape two-column layout
(`.sh__split`, AJ's call), the clinical strip's small title, the chosen
profile tab's colour, and AJ's screen audit. The colour and type-and-depth
rounds (Oct 4–5 2026) settled the rest.

**The voice review follow-up (Sep 27 2026)** — decisions for AJ, all in the
round document's "Open, for AJ": the Hub outline for an agreed slot with no
booking; regulars on rotation days; a trainer Mindbody marks inactive;
"Suggest my regulars" from the bookings Journey already holds; who may change
a role on Operations; a grant-holder's reach; franchise owners and Assign;
whether "This quarter" lapses; a stored mark for the Note for the next
trainer; one maintenance log for machine reports. Technical leftovers:
`useNetworks` has no loaded / failed state; Operations → Machine fit writes its
profile hand-off before the leave question.

**Openings (Sep 27 2026)** — the usual week fills only from days an iPad's pull
read in full, so it waits for Journey to be open at a studio most days.
Decisions for AJ, in the round document's "Open, for AJ (from the build)":
taken slots; today's openings on the Overview; the webhook writing Mindbody's
`lastVisited` into `lastSessionDate` (a Cloud Functions change); the Wrap-up's
"next 30 days" across the studios of one Mindbody; Your week for leaders; the
cancellation line's reading; a door from a time to the standing week; the words
for the screen audit. Technical leftovers: the summary's `tz` has no reader;
the next 7 days' people are put together in three places; Team's door
remembers the part before the leave question; `offers()` could refuse unread
marks itself; `WorkoutTrackerView.render.test.tsx`'s `onSnapshot` fake.

**The Client Directory and the Hub's Opportunities (Sep 28 2026)** — decisions
for AJ, in the round document's "What AJ still has to decide": the default
sort, how a nickname shows, Mine's window, the note marks (a Firestore change
that needs AJ's OK), the Hub card's milestones, the tenure words and "ending
soon". Technical leftover: `src/lib/directory-row.ts` and its test have no
reader since the old directory went.

**The calm Hub (Sep 28 2026)** — decisions for AJ, in the round document's
"Open, for AJ": the tap opening a peek (two taps to the profile); All stars'
rule; the hatching waiting on agreed standing weeks; grey staff time waiting on
Mindbody's "Unavailable" blocks, which the sync doesn't bring; moving the
briefing's markers onto the one engine; the top in portrait. Technical
leftovers: "Couldn't load, retrying" when the schedule read fails; a column
header, "+N" and "Show on schedule" as doors; `mayReadWeeks` in a small file of
its own.

**The Hub's cherry on top and wave 2 (Sep 28 2026)** — decisions for AJ, in the
round documents: Focus opening on Me or Everyone (a phone only since Oct 3
2026); words for a Watch or Renew mark in your own column; the Next 30 minutes'
words; All stars' reading and where it shows; the Get to know chip on the top
line; the All stars row's words. All stars names nobody until a studio has
about 26 weeks on Journey. Technical leftovers: Zoom (Day | Close); a fallback
of three plain queries if `or()` is ever refused; a tighter read for a studio
that reaches the 1,000 guard rail.

**The studio settings (wave 2, Sep 28 2026)** — an administrator sets Max
Strength's defaults on Admins → Standard → Studio defaults (until then every
studio runs on the app's). A setting added to `registry.ts` appears on both
editors by itself, but its reader has to ask `useStudioSettings` — a registry
row with no reader is a bug.

**The rooms' third wave (Sep 29 2026)** — still open, each in its round
document: **Admins:** Ask the leader (a `taskRequests` field: needs AJ's OK)
and See as (`docs/rounds/2026-09-29-admins-3.md`). **Operations:** 1:1 notes on
Team → This week; My Profile's Your week reads no bookings
(`2026-09-29-operations-3.md`). **Codex / Catalog:** head office's view (R6)
and pointing Admins → Standard at the Catalog (R7); the trainer page behind a
flag; the Sunday job pooling settings per model (`2026-09-29-catalog-3.md`).
**Relay:** whether a notice that asks "I've read it" stays new past Mark all
read; whether posters see who has read it; "I've read it" in the bell; a time
on a leader's naming; whether a trainer may close their own case
(`2026-09-29-relay-3.md`). **Month and the first day:** the five defaults in
`2026-09-29-month-and-first-day.md`; a FileMaker backfill of first days is an
importer's job.

**The Admins room's parked parts (Sep 28 2026)** — See as and the MSF Standard
room's dated changes, each needing AJ's OK or a talk (q4). Settings still names
a report's status in the old words (Open / Looking at it / Fixed / Closed);
Home shows a sync problem only after 2 failed pulls in a row; the Machines line
reads every studio's floor on each visit.

**The Machine Catalog (Sep 28 2026)** — decisions for AJ: the nineteen rulings
in `docs/rounds/2026-09-28-codex-source-check.md` (the Leg Press's knee
replacement first; "follow the Academy" answers all of them), then
administrators make the corrections in the catalog editor (AJ, Sep 28 2026: not
in code); the machine window's "Studio standard" starting weight where a
studio set none; the four body-figure markings that need no redrawing.
Technical leftovers: `MachineUpkeepCard` has no host; the older coaching text
in `machine-database.ts` is unchecked; a floor never loaded on this iPad,
opened offline, reads as empty (the roster listener needs
`includeMetadataChanges`).

**The Operations room (Sep 28 2026)** — AJ's questions are the round document's
"Open, for AJ" (the client page inside Operations, "This week so far", the
chance check's floors, kudos on Team, the huddle on one iPad); case fields on
the attendance watchlist and a nightly summary per studio were not re-checked.
Technical leftover: `.adm-ins-bad` has no reader.

**The Relay room (Sep 28 2026)** — mostly built by the second and third waves
and the Board's rebuild (Oct 3 2026). Still open: the open question's three
weeks on the briefing, closing it on the client's Notes page, trainers naming one
person; a load status from `useLiveSchedule` for Right now; folding Capture's
"The Board" into the Ask sheet.

**The first session and routine plans (Oct 9 2026)** — shipped and live since
Oct 10 2026; the seed ran the same day. When AJ chooses: an administrator may
mark head office's default starting routine (none is marked, AJ's "2a"); each
studio picks its starting routines and "A new client starts with". Not built,
each a round of its own: free-form and practice sessions (AJ's §2c answer is
the rule for them), the injury layer (head office's answers to
`docs/rounds/2026-10-07-injury-map-questions.md`), the middle delt and the body
figure's side view. For AJ: the plan's door in the session's corner, or on the
bar (§4.6 of `2026-10-08-first-session-screens.md`); the neck's start (§4.8);
the two versions of the Academy's selection template that disagree on three
rows (head office's call, in the template editor).

**Decisions still waiting on AJ** — the three unwired Academy safety rules;
who runs the payroll export and how often; the bootstrap e-mail hard-coded in
`useAuthInitialization`; whether to raise the app's tap-target floor from 40px
to Apple's 44px; what to do with the unused server and Mindbody routes.
