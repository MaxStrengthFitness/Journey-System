# Pre-Session Briefing

The last screen before a trainer puts hands on a client. Reached from the
client profile via `WorkoutTrackerView`, and the only screen in the app whose
job is to answer **"is there anything here that could hurt them"**.

```
briefing.tokens.css            colour, two layers: brand pigment -> semantic names
briefing.css                   layout, one file, class names in the markup
BriefingScreen.tsx             the screen
BriefingScreen.render.test.tsx mounts it (jsdom, fake Firestore)
briefing-facts.ts              the pure parts: carried-over regions, "last run"
TodayList.tsx                  today's machines, one list: Swap, ×, + Add, Reorder, Rebuild
today-list.ts                  its pure half (today-list.test.ts beside it)
heads-up.test.ts               pins `isHeadsUpLive` (hooks/useClientJournal.ts)
index.ts                       barrel — import from "../features/briefing"
```

## The Stack (Oct 3 2026) — read this first

AJ's walk, Oct 3 2026: "I feel like we can have a better pre-session briefing
screen just not the information that's on it but how it's displayed." The
interview settled what the screen is for: it is opened **just before she
arrives and held while you walk her to the first machine**, "double checking
you have everything you need to know and filling anything in". He picked the
"Stack" mockup, with one change: "we do have a muscular model that we use in
the catalog in routine editor. So let's go ahead and use that model."

Top to bottom (`stack.ts` is the pure half, `stack.test.ts` beside it):

1. **Who** — name, last session, the session number while it is Mindbody's
   guess, the goal line.
2. **Before you start** — SAFETY ONLY, readable in two seconds (AJ: "Safety:
   what could hurt her" first). The Catalog's figure (`components/anatomy`
   BodyModel, the one model) with her limits lit in the caution tone — her
   clinical flags placed by the codex's own table (`client-codex/body/
   figure-map.ts` `flagRegions`) and the regions carried over from the last
   session — and only the sides with something lit. Each flag is said in
   display type with its instructions as sentences (two, then "N more"): the
   instruction used to sit behind an 11px chip nobody opened. Critical notes
   and carried regions are here too; the count is these three only. "Nothing
   flagged — clear to go." in the OK green when there is nothing. The hushed
   line and the standing health context stay under it.
3. **Since last time** — how the last session went (`lastTimeLines`: a
   skip and its reason, a blood-flow set, a machine short of HER usual —
   the median of her last five performed sets, said only with at least
   three), the markers (a break, a milestone), heads ups, coaching focuses.
4. **Something to ask about** — the FORD cue; since Oct 17 2026 inside Since
   last time's card, by the Hub's rule (see "What's different" below).
5. **On the way in** — Dials (folded until tapped since the floor round, Oct
   9 2026, AJ's "2a": they're optional and Start is the job; they were open
   by default until then, and the chip counts what was tapped while folded) · Sore spot · Note · Update
   Pulse · Hand her the iPad. AJ: "sometimes is everything, sometimes its one
   thing, sometimes its nothing". Sore spot is the same figure, tappable: a
   tap opens BodyStateTracker's rating step for that region (its `request`
   prop) and NOTHING is written until it is rated. Hand her the iPad opens
   Pulse's client mode (ClientCheckInPanel `startInClientMode`, as the
   codex's PulseCard does). Every write at Start is unchanged.
   **Since the briefing round (Oct 17 2026, phase 2b):** no heading over the
   chips, and four of them, Dials · Sore spot · Note · Pulse, Pulse holding
   both its doors (You ask, Hand over the iPad: one more tap for the rarer
   job, two fewer chips every day). A sore spot is saved by its Dial tap
   (Sore spot → the body → how it is: three taps), a "Matters until" day
   picked after is kept on it, and Done closes. **Head** is a spot (AJ's F20
   note: a headache), tapped on the figure or picked from the list, lit on
   the Sore spot figure (`soreAreaOfTag`), recorded like any other and read
   by nothing that changes a machine; the codex's Body figure doesn't pin it
   yet. "Under the weather" stays on the "How are you feeling?" dial.
6. **Today's routine** — A, B or Other routine, then today's machines as
   one list a trainer acts on (the briefing round, Oct 17 2026: see "Today's
   list" below; it replaced the Oct 3 one line and Edit). A client with no
   routine sees how they start instead (the first-session design round, Oct
   8 2026: see "How the client starts" below).
7. **Also today** — the InBody line and the renewal line, quiet, never in the
   safety band; since Oct 17 2026 the foot of Since last time's card.
8. **Start session** — a solid bar pinned to the bottom of the page; nothing
   scrolls under a see-through gradient any more.

She may see the screen (AJ: "Everything — it's about her"), so nothing on it
is hidden for privacy. The sections below are the history that led here.

## Today's list (Oct 17 2026)

The briefing round (`docs/rounds/2026-10-17-briefing.md`; AJ's handoff,
question 2, "What are we doing today?"). AJ, Oct 16: adding one machine took
"five or six clicks ... maybe two at max, three. But definitely not more than
four." `TodayList.tsx` draws it, `today-list.ts` is the pure half.

- **Today's machines are one list**: the position, the name (whole), last
  time ("154 lb · 8 reps", under ONE "Last time" so the numbers never read as
  a target), Swap and ×. + Add a machine opens the floor in its walking order
  and one tap adds and closes (2 taps); Swap offers the Academy's substitutes
  ("The same work"), then the floor, and keeps the place (2 taps); × takes it
  out with Undo (1 tap). Reorder is a mode (drag, then Done), so nothing drags
  by accident; Rebuild opens the Routine Builder for a bigger change.
- **Show it, don't label it** (AJ, Oct 16): no count, no "suggested", no codes,
  no Road and no meter here. The plan speaks only where a trainer acts on it:
  Routine A's plan's next machine is first in + Add ("Next in the plan"), and
  Routine B's next swap is first in Swap for the machine it replaces ("Next in
  B's plan"). The weak area is one quiet line under the list ("Focus: Delts").
  B's Road (what is on deck in B, a swap the client can't do) is on
  Programming and the session's plan sheet, no longer here.
- **The Academy's order rules show without a tap** (they hid behind Edit as
  "⚠ 1"), each with its first fix, in this floor's ids; a fix that would bring
  in a machine this floor lacks is not offered.
- **Never offered**: a machine already on today's list, or one the client
  can't do (Routine A's plan's marks, `activeCantDo`).
- **Other routine** opens Start from a routine (`routine-plan/ui/
  StartFromRoutineSheet`); the client's own A or B there is the same as its
  button, anything else becomes today's list.
- **Ids.** Today's ids are kept as they came; what the list adds is the
  floor's own id, the one the session uses. Only the Academy's tables are
  asked in canonical ids, and answered back in this floor's.
- **Nothing written.** Every change goes up through `handleSequenceChange`,
  exactly as the builder's did, and Start hands the list up as before.
- **The preview**: `harness/briefing` (`node harness/briefing/shots.mjs`
  photographs it at 820 x 1180, light and dark, and at 390 wide).

## What's different about this person (Oct 17 2026)

The briefing round, phase 2 (AJ's handoff, question 1; his answers "2a" and
"3a", F4 "a" and F13 "2a").

- **One card for what's new.** Since last time, the Heads ups, the team's
  focuses, then the one thing to ask (FORD) and the InBody and renewal lines,
  quiet, at its foot: it was four cards (Since last time, Something to ask,
  Also today, and the routine's labels). No count beside its label. Gone when
  nothing in it has anything to say (`.br-since:empty`).
- **Quieter once seen** (`seenSince`, `briefing-notes.ts`): a Heads up is a
  full card for a trainer who hasn't trained the client since its newest
  word, and one quiet line ("Heads up · …") for one who has, still inside its
  four sessions. Only a finished session this trainer ran counts (a session
  stores the trainer record's id); a note or a session with no readable date
  is never "seen". Critical notes are never quieter.
- **The FORD line, the Hub's way** (`FordBriefingCue`, `askAboutFor` from
  `hub-opportunities/get-to-know.ts`): what the Hub card's Get to know mark
  is about, in the same words: a day coming up this week, then a Follow up
  next time question, then one that just happened, then news; else the
  soonest dated detail, a pinned fact, or a stock question. A follow-up is
  cleared when its answer is saved here, or by "Nothing new, clear the
  question" (`clearFollowUp`, never waited on). No "tap to note" lines.
- **No "Mind the limits on …"** under the routine or the plan card (AJ's
  "3a": no warning linking a note to today's routine). The flag's own
  instructions in Before you start still name the machines.
- **Back where Start was tapped** (`close-target.ts`; AppContent's
  `sessionFrom`): "Back to the Hub", "Back to Calendar", "Back to Clients",
  "Back to Robbin's profile"; an unknown screen goes to the profile, as the
  close always did. Without words (a test, a host that doesn't say), the X.
- **The last session names its routine** ("Last session · Oct 9, 2026 ·
  Routine A"), never the session type ("Standard").

## How the client starts (Oct 8 2026)

The first-session design round (`docs/rounds/2026-10-08-first-session-screens.md`,
§4.1 and §4.5; AJ's "1d": "the Road's one-line route wherever a glance is
all there is"). Which card "Today's routine" draws is
`routine-plan/briefing-plan.ts` `briefingPlanView`; the card is
`routine-plan/ui/BriefingPlanCard.tsx`, worked out by `useBriefingPlan`.

- **A routine** draws as above. **A plan in progress** (Routine A has
  machines and a plan) adds the Road under the routine line: today under
  its bracket, the next stop, "3 of 6 · next: …".
- **Starting out at the studio** (Journey holds the whole story and it is
  empty, or Add Client's walk-in): the plan card replaces the A and B
  buttons. The starting routine that fits (the same rule as Programming's
  Start a plan), its Road with today (its day one) under the Today bracket
  and the rest hollow, the Source tag and its why, **Change today** (a sheet:
  take a machine out of today, add the plan's next one or any floor machine),
  **Another start** by machines, one order-effect line when today trips one,
  and "Mind the limits on …" under the Road when one of the client's flags
  names a machine in today (the routine line's safety line, which a plan
  card doesn't draw). Start hands the plan UP (`onStart`'s sixth argument,
  `StartPlanAtStart`); the tracker writes it in the Start batch with an
  EMPTY Routine A, because the consult is not Routine A. The plan is a draft
  until Start, so the plan Start keeps takes today as its day one (AJ's
  "3a": "the first visit's machines"; the road's machines only, in its
  order), and a machine taken out at the consult doesn't come back at the
  next visit. Once today is changed the suggestion holds, so the open Health
  notes landing a moment later never swap the start under the trainer.
  While the starting routines are read, or a start is still to pick (AJ's
  "2a" leaves no head office default), the card says "Start without a pick
  keeps no plan", and Start opens an empty session with no plan.
- **A plan kept with Routine A still empty** (kept on Programming, or by
  Start at the consult): the same card, today being the plan's day one
  (`todayFor`), its (i) saying who kept it and when ("Kept by Sam Lee, Oct
  8."), and no plan handed up (it is kept already). Change today here is
  today only.
- **Trained here before Journey**: one line ("Dana has a routine from before
  Journey."), a quiet **Enter the routine on Programming** (the profile's
  handoff, stored only once the leave gate says go), and "Or start and add
  machines as you go". Start opens an empty session, never the whole floor.
- **Journey can't tell** (coverage unknown, or the routines or the session
  count not read: the tracker's `routinesKnown`, and `client.sessionCount`):
  both doors, claiming neither. A door picked stays picked; Start never
  waits on a pick.

The briefing still writes nothing (`routine-builder/session-scope.test.ts`,
which scans the plan card's three files too), and it reads the starting
routines only while the plan card for a client starting out is drawn
(`useStartingRoutines`'s `enabled`). Every reader of Routine A here reads
`todayFor`, so an empty Routine A with a day one runs day one, and a
routine is found by either spelling of its name (`matchesRoutineLetter`:
an older seeder wrote "A"). "Not set up yet · today only" on a routine
button means what it says: Start no longer saves a list built here as a
routine.

**The leave gate.** The briefing registers what it holds with
`useUnsavedChanges` ("the briefing": the arrival note, the Dials and body
states tapped, today changed on the plan card), so the app's own navigation
asks before it drops them, and "Leave" puts them back. Its own ways out, the
close button and Enter the routine on Programming, ask the gate BEFORE
anything moves (`useLeaveGuard`): the tracker's close drops the briefing
first and moves the screen second, so asked any later, "Keep editing" would
keep nothing. Start is not a navigation and never asks.

**Round 2 and the review, on the briefing (Oct 9 2026; the round
document's §4b to §4d and §7.3).** Still write-free, and still never holding
Start:

- **A session on Routine B with a plan of swaps** draws B's Road (today under
  the bracket, the swaps still to come) with "B · 2 of 5 swaps". Today's
  machines are `runnableToday`, so neither the briefing nor the session runs
  a machine the client can't do (AJ's "2a": can't-do lives on Routine A's
  plan and is read by A and B); a B swap on the bench is drawn crossed under
  "Not for {First}".
- **A weak area** is said once on the glance line, "Focus: Delts": on the
  Road's progress line for a plan in progress, on B's Road line, on the
  routine line for a Routine B of the client's own, and on the kept plan
  card's line.
- **A studio that starts new clients on A and B together** (the setting
  `newClientsStart`, read through `useNewClientsStart` for the studio whose
  starting routines the card offers): one line under the walk-in card's
  Road, "B · planned with A: Leg Extension for Leg Press first · 3 swaps",
  and Change B (a sheet with Programming's same part). Start hands it up with
  the plan, and the tracker keeps it in the Start batch. While the setting is
  being read the card says so, and Start keeps no B; a change to B is unsaved
  work, beside today changed.
- **This floor only**: the walk-in card says what the start's road lacks on
  this floor ("Not on {studio}'s floor: …"), never dropping it silently.

## The order of the page is the whole design

AJ, Sep 13: "at the very top, everything the trainer needs to know about
that client is known instantly"; then today's routine; then log and start.
The trainer has usually trained this client a dozen times — the page is a
refresher, and it has to say what is NEW.

1. **Who is in front of you** — name, last session and which routine it ran,
   the global goal in one line.
2. **Before you start** — everything that still matters and nothing stale,
   counted in the heading: clinical flags · Critical journal entries · **Heads
   ups** (elevated notes inside their "until" day, or not yet read out at four of her sessions — `client-notes/heads-up.ts`, Oct 3 2026) · **body
   regions carried over** from the last session while their "matters until"
   day has not passed · upcoming events (the Hub markers) · the renewal line ·
   active coaching focuses. When there is nothing: "Nothing flagged — clear
   to go."
3. **Something to ask about** — one quiet FORD row, and since the reporting
   round a button: tap it and the capture opens underneath, filed under the
   pillar it asked about. Gone when there is nothing to ask.
4. **Today's routine** — A or B, suggested but overridable, and each button
   says when THAT routine last ran ("Last run Sep 12 · 6 machines").
5. **Execution sequence** — the shared Routine Builder.
6. **On the way in** — four Dials (Sleep · Energy · Recovery · Stress),
   body regions on the same Dial with an optional "matters until" day, the
   arrival note, and **Update Pulse**. All optional; untouched = not asked.
7. **START SESSION** — one loud action, and the only orange on the page.

Steps 2 and 3 used to be the other way round. A goal is a direction; a
contraindication is a thing that must not happen in the next ninety minutes.

## Reporting round (Sep 16 2026)

- **What is written at START:** `checkIn.readiness = { sleep?, energy?,
  recovery?, stress? }` (−2…2), only the dials that were tapped, and only when
  one was; `checkIn.bodyStates[]` as `{ region, state, dial, until? }` with
  `until` OMITTED rather than undefined. `sleepQuality`, `stressLevel`,
  `energyLevel` and `mood` are no longer written; Mood has no dial (the
  trainer can see it). Old sessions are read through `features/rating/scales.ts`.
- **Heads ups** come from `useClientJournal().headsUpEntries`
  (`isHeadsUpLive`, `HEADS_UP_WINDOW_DAYS = 21`): elevated, unresolved, and
  either inside their `effectiveUntil` day or not yet heard at four of her
  sessions since their newest word (three weeks only while her sessions are
  unknown). Under the news, one folded line: **her standing health context**
  (`standingHealth`, Oct 3 2026) — Health and Incident notes that are simply
  true, never counted in "Before you start", a tap from read.
  Drawn under the Critical strip and quieter — the warn edge, no fill wash.
- **Carried-over regions** are `carriedRegions(lastSession, studioTodayKey())`
  in `briefing-facts.ts`: any `bodyStates` tag on the LAST session whose
  `until` (yyyy-mm-dd, string compare on the studio day) is today or later.
  Coloured by urgency from the Dial's tone, never by region.
- **"Last run"** is `lastRunOfRoutine(sessions, routines, letter)`: the newest
  completed session whose `routineId` names that routine, or whose recorded
  `routineName` / legacy `sessionType` letter matches. `WorkoutTrackerView`
  passes the client's completed sessions as `sessions`.
- **Update Pulse** mounts `PulseQuickLogDialog` from `../subjective-report`;
  the old `QuickCheckInDialog` is no longer used here.
- **Density:** card padding 14px, check-in gap 12px, the four Dials two-up
  from 700px. The sticky START bar is untouched.

## Conventions, same as every other feature folder here

- **Tokens only.** No hex, no `slate-###`, no `dark:` pairs in the component.
  Every colour resolves through `--br-*`, which means light and dark cannot
  drift apart one element at a time — which is exactly what had happened.
- **44px minimum** on anything tappable. Gym floor, tablet, gloved hands.
- **WCAG 2.1 AA**, ratios recorded beside each token value.
- **One scroller, and it is `<main>`.** This view does not declare its own
  height or its own `overflow`. See the header of `briefing.css`.
- **One loud action.** START SESSION is `--br-go` with `--br-go-on` words (the
  logo orange, navy words, since the Navy Frame, Oct 4 2026) and nothing else is.

## Known: three shared children still carry their own styling

`JournalEntryCard`, `RoutineCompareCard` and `SequenceRow` (`ConditionChip`,
unused, was deleted in the colour round's review, Oct 4 2026)
are used on other screens too, so converting them would be a change to those
screens as much as this one. They read acceptably against the new surfaces.
Worth a pass of its own when the next screen that uses them is redesigned.
