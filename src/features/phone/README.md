# Journey on a phone (Journey Lite)

Oct 1 2026. AJ: "its not that its a serperat app its just the phone style of
it", leading with "operations and schedule", and a session on a phone allowed
but not advised: "we could make running a session just show the routine and
current weight and reps but it is not advised to run a session on your
phone ... seeing at least 5 sessions at a time is actually meaningful".

**There is no second app, route or data path.** Journey on a phone is the same
build, the same sign-in, the same reads and the same writes, laid out for a
phone. Screens ask one question, `usePhone()` (`device.ts`), and draw
themselves differently; nothing here reads or writes Firestore.

## What a phone is

`PHONE_QUERY`: under 600px wide (a phone upright), or under 500px tall with a
touch pointer (a phone sideways; no iPad is that short). Every screen asks
`usePhone()` / `isPhoneNow()`, never its own width check. Stylesheets that
only need to tighten use `@media (max-width: 599px)` or a container query.

## What changes on a phone

| Where | On a phone | File |
| --- | --- | --- |
| Bottom bar | **Schedule · Operations · Clients · My Studio**, and **Session** while one runs (labelled "Session": five tabs leave no room for her name, and names are never cut). Operations only for `mayOpenOperations`. A tap switches the app mode itself (Schedule is the Hub in trainer mode, Operations is Operations) through AppContent's guarded `switchAppMode`. | `components/AppBottomBar.tsx` (`phone`) |
| Header | The bell (and the reminders that ring it) and the avatar; Refresh, the theme, feedback and Settings move into the avatar menu, with **Learning** and **Calendar**. | `AppContent.tsx` |
| The Hub | **The minimalist mode** (Oct 19 2026; AJ: "the phone mode is the minimalist mode, we can get rid of a lot of the features on the screen so that way we get more information on the screen"). The day as **one list in time order** (`PhoneDayList`, ordering in `day-list.ts`): a row per booking, the time (and whose, on Everyone) beside the Hub's own `HubCard` drawn **dense** (the name whole, the Critical triangle, a state word, the glyphs; no time, number, "New to Journey" or service), about a dozen to a screen, the same Peek. **My week** (`PhoneWeekList`, `week-list.ts`): the strip's seven days in one scroll, a heading each (Today · Mon 19 · 3 booked), from the Hub's own window (no new read); a tap on a card picks its day and opens its peek there. The top keeps the layers and the doors (Today, Tasks) on one row: no chips, no Key, no Next-30-minutes strip. Under the week, the phone's one switch: **My day · Everyone · My week** (`PhoneViewSwitch`; the focus and the range, `hub-schedule/focus.ts`, both remembered on the phone). | `components/ClientsView.tsx`, `PhoneDayList.tsx`, `PhoneWeekList.tsx`, `PhoneViewSwitch.tsx`, `day-list.ts`, `week-list.ts` |
| The Active Session | The briefing, Start, every write, Finish, the Wrap-up and the watching view are the iPad's, unchanged. Only the live part is drawn differently: one **card per machine** in today's order (`PhoneSessionStage`). The briefing says once, above Start, that sessions are meant for the iPad; it is never a gate. The session bar wraps: the name first, whole. | `components/WorkoutTrackerView.tsx`, `PhoneSessionStage.tsx`, `phone-session.ts`, `briefing/BriefingScreen.tsx`, `journey-grid.css` |

## The session cards

Each card, in the order the floor needs it (the-floor.md, "Where the eye goes"):

1. **The machine**: its order number and its name, whole. The name opens the
   machine menu (settings, notes, how the client has done), as on the iPad.
   The loudest open note on the machine shows beside the name in the one
   note key (`machine-menu/note-key.ts`): a plum circle for a Heads up, the
   Hub's crimson triangle for Critical.
2. **Its settings**, one 40px button since the open session round (Oct 9
   2026; AJ's "2a"), the iPad Now Bar's (`journey-grid/setup-button.ts`):
   "Set up · 2 not set" on a first time, the settings by their full names
   once set, opening the machine card on the first empty dial; Save closes
   it, with Undo in the toast. Without `onSetUp`, the short keys as words.
3. **Its last five times**, side by side, newest on the right (`lastTimes`):
   the date, the weight, the count, the star or the kaizen. They are the
   machine's own last five times, not her last five sessions: a card stands
   alone, with no column beside it to line up with. A not-reached set is not
   a time she did it; a practice set is drawn grey with a P, a skip says Skip.
   With no times to show, the card says what the machine menu's header would
   (`noPastWords`): "First time on this machine." only with every session
   read and the whole story in Journey, never for a machine a running total
   knows, and "in the sessions loaded here" while older ones are unread.
   While the sets are still loading, or the read failed, it says so first
   ("Loading past times…", "Couldn't load past times."): a failed read is
   never "nothing recorded".
4. **Today**: the weight, pre-filled with the iPad's own pre-fill (the
   prescription, else the last performed load) and stepped by 2 lb, and the
   count, **never pre-filled**: last time's count is a ghost. A machine she
   last did as a timed hold opens in seconds; Timed switches it. A machine
   with sides takes L and R.
5. **The marks**: the star and the kaizen (held until a count is in, a second
   tap returns the set to an ordinary one), Practice, Skip.
6. **Next**, on the card in hand only. On the last card, when Routine A's
   plan has a machine today's session doesn't (the first-session design
   round, Oct 8 2026, §4.6: "On a phone, the last card's Next becomes 'Next
   in the plan · Add'"), it reads "Next in the plan: Hip Abduction · Add" and
   adds it to TODAY only, through the tracker's `onAddPlanned` (the one
   recorder, `applySessionMachineIds`); the Wrap-up decides what the routine
   keeps. An empty list offers the same. `cardNextOf` (phone-session.ts) is
   which Next a card draws. The offer is the iPad's quiet dashed blue
   (`.ph-card__next--plan`, never the card's loud blue Next), with "Last
   machine · Finish is at the top" kept under it: adding is a door left
   open, never the step that comes next (the whole-branch review, Oct 9
   2026).

The card in hand IS the Now Bar's machine (`gridFocusMachineId`), so the
machine clocks, the progress count and Finish read the same thing on a phone
as on an iPad; touching a card makes it the machine in hand, as a tap on a
Today cell does on the grid. Every change goes through the grid's own
`handleGridLiveChange`, so the debounced writes, the first-touch stamps, the
auto "completed" mark and the heartbeat are the iPad's.

What a phone leaves to the iPad: the grid and its older columns, the
analytics, the stopwatch and the per-machine flag line. Reorder, add or take
off a machine is the iPad's own RoutineOrderSheet, from the foot of the list.
Beside it, while Routine A has a plan, **The plan · 3 of 6** opens the iPad
corner's plan sheet (`SessionPlanSheet`: Swap in the plan, Can't do,
Re-plan, the Academy column), so a can't-do mid-session is never out of
reach on a phone (AJ's Q6: "you shouldn't really be blocked"; the
whole-branch review, Oct 9 2026). Left to the iPad on purpose: the Academy's
starting range in the Now Bar's readout and the one order-effect line under
the grid (the card's own "First time on this machine." is the phone's
first-time line); a column picked on the plan's sheet still shows on the
iPad.

**The FileMaker floor on a phone** (the open session round, Oct 9 2026; AJ's
"1b"). While the floor is showing (an open session, a client session with no
routine: the tracker's `showAllMachines`), today's machines stay cards and the
rest of the floor follows them as a plain list of names in the walking order
(`floor`, `.ph-floor`), each name whole and wrapping (`names-wrap.test.ts`)
with its own 40px **Add** in the plan's quiet dashed blue. Add sends what
waits on the card in hand, then calls the tracker's add (`onAddMachine`, the
grid's +): the machine joins today's list and is the card in hand. An empty
day says "Tap Add on a machine you're doing." A machine out of service on
the roster is listed with "Out of service" in place of its Add. The tracker
lets a second add inside 400ms go (`journey-grid/add-bounce.ts`). The
session records only what was added, never the floor. **Start from a
routine…** is at the foot beside Reorder (`onStartFrom`, the iPad corner's
sheet, `routine-plan/ui/StartFromRoutineSheet`): one tap lays a routine's
machines on today's list, what is done kept first.

## Tests

`phone-session.test.ts`, `day-list.test.ts` and `week-list.test.ts` are the pure
halves; `PhoneSessionStage.render.test.tsx`, `PhoneDayList.render.test.tsx` and
`PhoneWeekList.render.test.tsx` mount the screens; the dense card is
`hub-schedule/HubCard.dense.render.test.tsx`. `home-screen.test.ts` counts the phone bar's bottom inset.

## At a glance (from CLAUDE.md, Oct 9 2026)

- The round is `docs/rounds/2026-10-01-journey-lite.md`.
- Rooms tighten for a phone only (under `@media (max-width: 599px)`, or a
  container query where a part needs one), so the iPad is unchanged.

## The minimalist mode (Oct 19 2026)

AJ, from a phone screenshot of the Hub: the phone should help a trainer "at
home to plan their week and know their schedules easy", and "really the
phone mode is the minimalist mode, we can get rid of a lot of the features
on the screen so that way we get more information on the screen". His
answers: My week as the seven days in one scroll with headings ("3a").

- **A row, not a card.** The iPad's card in a 72px box showed four bookings
  a screen. The row is 44px: the time in its own column, the Hub's card
  drawn dense (`HubCard` `dense`), about a dozen a screen. The card keeps
  what the peek can't say first: the name whole, the Critical triangle, the
  state word (In session, Not logged, Late cancel, Left open, Done), the
  glyphs. It drops the time (the row's column), the number, "New to
  Journey" and the service (the peek says them).
- **My week** is the Hub's own window (hub-window.ts) laid out day by day
  with the same column plan and the same list order, so no new read, no new
  Mindbody call and no new index. A free day is a heading too ("Nothing
  booked"; "Nobody booked with you." on My week), never a day gone missing;
  a day not read yet says so under its heading. Another day's card shows
  who and when and says nothing it hasn't worked out: the marks and the
  number are the day on screen's (the engine runs for one day, R6). A tap
  picks that day and opens the peek there, so the peek reads that day's
  moments; the strip highlights the day and a strip tap scrolls the week
  to it.
- **Off the phone's top:** the family chips, the Key and the Next 30
  minutes strip (the Now line says it). Kept: Schedule | Opportunities,
  Today, Tasks with its count, the week with each day's count.
- **One switch** under the week: My day · Everyone · My week; Day · Week
  for someone with no column on the day. The focus (`journey.hub.focus`)
  and the range (`journey.hub.range`) are remembered on the phone and
  cleared by a sign-out with the rest.
- **The bottom gap** (the Home Screen app on a phone) is the shell taking
  the smallest height iOS reports (`home-screen/app-height.ts`), short by a
  status bar that is about 59pt on a phone with the Dynamic Island, plus
  the home inset painted navy under the bar. It waits for the numbers from
  Settings → My account → This screen on a phone before the shell trusts a
  taller height; not changed in this round.
