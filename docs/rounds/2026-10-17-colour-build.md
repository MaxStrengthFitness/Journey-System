# The colour build (Oct 17 2026)

Light mode's plain greys, the header and bottom bar edged by one 1px line in both modes, a calmer Active Session in dark, and the quiet blue for buttons that repeat down a list; then the card round's Hub cards (Now, Next, Done) with the calmer Hub, both modes; then the narrow cards round, "Two at Once" (Oct 18: two or three at once side by side, saying less). Branch `oct17/colour-build`, cut from master `9b36d4d5`, with master `bb39cbb5` merged in on Oct 18 and master `b7773a53` (`5481c7a6`) before the narrow cards, and master `0f6a936f` (`d427098b`, the trainer lock and the iPad no-zoom fix) after them. **Not pushed, not deployed.** Stylesheets, components, code comments, docs and tests: no rules, index, Cloud Function, cron, Mindbody or Firestore change. The Hub now reads each studio's `journeyCutoverDate`, which it already held.

It follows the three plans AJ answered, `harness/colour/light2/recommendation.md`, `harness/colour/dark2/recommendation.md` and `harness/colour/cards/recommendation.md` (git-ignored). Each has a "Build plan" section with the exact values, the edits and the tests.

## What AJ asked

- **Oct 16 2026**, with a Bing Images window beside the app: light mode "hurts to look at because it has this like blue hue to the white", and "some of it just seems so harsh". The cause the light round found: every big light surface was the logo blue at a pale tint (97% of the light pixels inside the navy frame).
- **The light page: 1A 2A 3A.** Calm the harsh parts too (the frame and the shelves as lines, and the calmer Hub); the brighter "Neutral daylight" (page `#EEEEEE`, cards `#FCFCFC`); navy words kept.
- **The dark page: 1b and 2a.** Keep today's navy surfaces, with the fixes; quiet the rows of solid blue buttons in both modes. No pick on its third question (what a finished card looks like on the dark Hub): AJ asked for a round on the card designs first.
- **His go for this build:** "light's plain-grey palette (#EEEEEE / #FCFCFC), the crisp 1px header and bottom-bar line, dark's Active Session fix, and the quieter repeated blue buttons. Hub cards wait for the card-round page. On its own branch, nothing pushed."
- **Oct 17 2026, the card page ("Now, Next, Done").** The Hub's cards were hard to look at: a passed session didn't feel any different, so the day was "one big block". His note on the light page's first question asked for past sessions "a little bit more out of the way ... apparent that like hey this session was passed and recorded And so that way if the session was passed and not recorded we might be able to tell the difference a little bit easier and like oh hey what happened here". His answers: **1A** (Not logged stands out from each studio's Journey cutover date, in every column), **2A** (the soft 1px outline on every light card, fainter on finished tiles), **3A** (no shade behind the past). Then: "Build the card phases on the same branch, and I'll walk it on the iPad before anything is pushed." He paused the build that evening and said "continue" on Oct 18.

## What was built

Five commits for the light and dark pages, one per phase, each typechecked and tested on its own (the card round's commits are under "The card round's build", below).

| Phase | Commit | What changes on screen |
| --- | --- | --- |
| Light 1, the colours | `0fb95e10` | Light mode loses the blue tint: a plain grey page, near-white cards |
| Light 3, the frame and the shelves | `1e8af1ca` | In light, the navy shadow under the header, over the bottom bar and under a room's bar becomes one thin line |
| Dark D3, the frame line in dark | `b6a8e52d` | In dark, the dark smear under the header and over the bottom bar becomes one thin pale line |
| Dark D4, the Active Session in dark | `916afbf0` | In dark, a calmer "+196%" green and a calmer blue on a tapped date |
| Dark D6 (a), the quiet repeated blue | `e1e624cb` | In both modes, a blue button that repeats down a list is blue words on a blue tint, not a solid block |

**Light 1** (`0fb95e10`, 19 files). 143 edits in the light `:root` blocks of 14 token files (index.css 26, journey-grid 18, equipment 11, admin 11, calendar 10, ford 9; briefing, routine-builder, studio-tasks, subjective-report, trainer-profile and wiki 8 each; catalog 6, progress-report 4), every copy of an `--eq-` value with it. The page is `#EEEEEE`, cards and menus `#FCFCFC`, raised controls `#FDFDFD`, wells and the Now Bar `#F2F2F2`, hairlines `#E2E2E2`, the tab tray `#DADADA`. Blue stays only where it means something, a little calmer: your lane `#D9E3EF`, your column's head `#D4E1EF`, a booked card's rail `#6E93B9`, the recorded-set tile `#E4EDF6`, the tapped-date blue `#E1ECF5`. The Now Bar's "+196%" is `#077A37` (4.88:1 on its grey; it was 4.17). Unchanged: the navy words (13.7:1 on a card), the navy frame, orange, crimson, the in-session fill and the paper report sheet. No dark block moved (all 42 compared before and after). The Hub's cards take the new colours through the tokens alone; no Hub stylesheet changed. Also the hex fallbacks no test reads: `clinical-review.css`'s eight and `profile-nav.css`'s page. Tests: `neutral-ramp.test.ts`'s ground is `#EEEEEE`; `contrast.test.ts` says what the tapped-date blue paints and holds the gain green on its grey at 4.5:1. `DECISIONS.md`: the Navy Frame's light line, with the old values kept in an "Amended by the light round" sentence.

**Light 3** (`1e8af1ca`, 5 files). `--frame-down` and `--frame-up` are `0 ±1px 0 rgba(0,18,36,0.22)`; `--shelf` is `0 1px 0 rgba(25,45,65,0.10)`. The shelf is read by ten rules in eight stylesheets (the Hub's top and its names row, My Studio's header and Relay's sub-bar, Learning's masthead and bar, Operations' tabs, the shared room bar, the machine card's head, the Relay sheet's head): a line under each bar, never a card's shape. Buttons and panels keep their lift and press. `elevation.test.ts` pins the three as one 1px layer with no blur. `DECISIONS.md` amends Type and depth ("a room's bar is a shelf"); the header and bottom bar comments say the new edge.

**Dark D3** (`b6a8e52d`, 5 files). In `index.css` `.dark`: `--frame-down` and `--frame-up` `0 ±1px 0 rgba(150,180,210,0.16)`, `--shelf` `0 1px 0 rgba(150,180,210,0.12)`. The cast dug a groove 10 to 14 pixels deep under the header; the pale line is what tells the frame from the page now (1.37:1 off the room bar under the header, on today's navy). The phase 3 pin now holds both modes and each line's ink. `DECISIONS.md` gives Type and depth its dark half.

**Dark D4** (`916afbf0`, 2 files). In `journey-grid.tokens.css` `.dark` and its fallback: `--jg-pf-gain` `#75d78d` (was Tailwind's stock `#4ade80`) and `--jg-live-fill` `#203a53` (was `#143a5c`). "+196%" reads 7.64:1 on the Now Bar; a tapped date stays 1.27:1 off the cells (the floor is 1.15). The machine card's "+25%" reads the same token, and a new pin in `machine-menu/look.test.ts` holds that.

**Dark D6, option (a)** (`e1e624cb`, 7 files). On Operations → Today and its Review notes, a row's own blue button (Acknowledge, Seen, Got it, Still matters) is blue words on the blue tint inside a firm blue edge, with its lift and press kept (`overview.css`); the one "Acknowledge all" stays solid. The floor's two switches, Map | Tiles on Relay (`relay.css`) and Look up | Cleaning on the map (`studio-map.css`), pick with the same quiet blue; "Mark all wiped" stays solid. Words 7.11:1 in light and 6.20 in dark. `studio-map/look.test.ts:71` now pins the tint (it pinned the solid blue, and the plan names it); the new `src/quiet-blue.test.ts` holds the three places in both modes; a new render test on Operations holds that Acknowledge all is in the section's door and each row's button in its row. `DECISIONS.md` amends the Navy Frame's "a picked chip, tab or switch the blue with its on-colour".

## What waits, and what was not built

**Waits for the card round** (AJ: "Hub cards wait for the card-round page"):

- Light phase 2: the head row half is built (below, with dark D2). Its other half, a finished card's own fill (`--eq-recede-fill` `#F9F9F9`), is superseded: with A2 and the card round's C3 no client card reads a separate recede fill, so the token is never created. Until C3 a finished Hub card is drawn as before, the well (now `#F2F2F2`) under its veil.
- Light phase 4: the calmer Hub (A1 to A4: no outline, the inner mark, the flat finished card, lighter type). AJ's note on the light page's first question belongs here: a past session should be "a little bit more out of the way", so it is apparent it "was passed and recorded", and one passed but not recorded reads as "oh hey what happened here". **Built in C3** (below), with the card round, AJ's 2A putting the outline back in light.
- Dark D2's head fill is built with light phase 2 (below); its recede fill is superseded the same way. D5 (dark's half of the calmer Hub, the rim token, every rule written `:not(:focus-visible)`) waited for the card phases and is **built in C3**.

**Not built, by AJ's answers:** light phase 5 (near-black words; AJ kept navy, 3A) and dark D1 (the calmer navy palette; AJ kept today's navy, 1b).

**The gap is closed (Oct 17 2026).** AJ's dark 1b is "today's navy, with the fixes", and "everything else on this page still goes in (`rec-dark-today-navy.css`)", so the two fixes that sat inside D1's edit list are built after all, in their own commit, `2998231b`, "Dark fixes on today's navy (G3, G4)" (below, under the card round's build).

## The card round's build (Oct 17 2026)

AJ's answers on the card page ("Now, Next, Done"): 1A, Not logged stands out from each studio's Journey cutover date, in every column; 2A, the soft 1px outline on every light card, fainter on finished tiles; 3A, no shade behind the past. Then: "Build the card phases on the same branch, and I'll walk it on the iPad before anything is pushed." The plan is `harness/colour/cards/recommendation.md`, "Build plan" (C7, the shade, is not built: 3A).

**Dark G3 and G4, the booked rail and the firmer edges** (13 token files, 30 values; each `.dark` block and its fallback together). The 18 names of `rec-dark-today-navy.css`'s second `.dark` block that are neither D2's, D3's nor D4's. A booked card's blue rail in dark is `#5581b0` (was `#4675a4`): 3.64:1 on the card, was 3.07, so it has room over 3:1 if it becomes the only state mark. The control edge (`--eq-border-strong` and its ten copies, `--jg-control-edge`, `--input`) is `#8393a3` (was `#6e8397`): 4.71:1 on a card, 4.29 on the Now Bar, 4.00 on a raised button, was 3.79, 3.45 and 3.21. Inside menus and dialogs (`--eq-popover-edge`, `--adm-popover-edge`, `--popover-input`) it is `#8da0b3` (was `#7d92a6`): 4.55:1 on the menu, was 3.81. Light did not move. `--input` is also painted as a fill in dark (KNOWN-TRAPS, "`--input` is two things"), measured: the switch's off track now clears 3:1 on a card (3.56, was 2.94) with its thumb 3.34:1 on it (was 4.05); the outline button's hover keeps its words at 6.55:1 (was 7.11). No test moved: the colour set passes as it stood, as the dark plan measured. Comments and docs that quoted the old numbers say the new ones (`journey-grid/README.md`, two lines of `KNOWN-TRAPS.md`, `hub-card.css`, `progress-report.css`); the Navy Frame entry in `DECISIONS.md` quotes none of them and is unchanged.

**The Hub's head row in the card colour, light phase 2 and dark D2** (`hub-grid.css`, 5 rules). The trainer row, its corner, the column heads and the time column read `var(--eq-surface)` in both modes, as both plans agree: as the well they stood 1.04:1 off the grid in light and 1.07 in dark; as the card, 1.13 and 1.16. The shelf and the soft edge stay; your head keeps its blue (1.29:1 off a colleague's in light, 1.18 in dark; it was 1.19 and 1.29, the cost the dark plan names). A half hour's ring on the time column (`.hs-dot`) takes the column's colour too, so it stays hollow over the rail: the plans did not name it, and left on the well it would be a dark pit in a ring. No token of its own (the plans' `--eq-head-fill` would only ever have been the card) and no `--eq-recede-fill`. Tests: `equipment-tokens.test.ts` measures the column head's words and the now dot on the axis on the card (they read the well); the new `hub-schedule/hub-head-row.test.ts` (17) holds the rules, no dark rule of their own, the shelf and edge, your blue head, the hollow ring, the row 1.10:1 off the grid and its three inks at 4.5:1 in light, dark and the system-dark fallback, and your head 1.15:1 off a colleague's. `hub-colour-rules.test.ts:315` (a finished card's name on `--eq-surface-2`) is left for C3, which replaces the finished card. Full suite on this commit: 14,721 passed in 892 files (the tip before G3 and G4: 14,704 in 891; G3 and G4 add none); tsc 2.

**C1, "Now" on the card and the strip** (`ecacc965`, no colour yet). `hubCardIsNow({ state, start, end, now })` in `lib/hub-card-state.ts`: true only for a `live` card from its start until the five minutes after its end at which, with nothing logged, it turns Not logged (`SLOT_SLACK_MS`; no end is the half hour). `HubCard` sets `data-now` and writes "Now · " before the time as text; the word and its dot are one part that drops whole to a hidden second line when the card is short of room, and a consult's span never carries it (checked in headless Chrome, lanes 40 to 440px: the word shows from a lane of about 92px). `sameCard` compares Now too, so the minute that crosses a card's start redraws the memoised card. The Next 30 minutes strip asks the same helper. Full suite 14,741 in 892 files.

**The merge** (`91e87a6c`, Oct 18 2026). Master `bb39cbb5` (the walk-ready branch: the briefing round, F22 and the Oct 15 small fixes) merged in with `--no-ff`, no rebase, so the branch ships over what is on master. Full suite 14,848 in 900 files, exactly master's 14,782 in 898 plus the branch's 66 in 2.

**C2, the card states' tokens** (`5361630b`). In `equipment.tokens.css` (`:root`, `.dark` and the fallback, kept identical): `--eq-done-mix` 30%, `--eq-unlogged-mark` (the plum, 5.55:1 on the card light, 5.97 dark), `--eq-now-mark` and `--eq-now-text` (the orange mark 3.89 / 4.96, the word 5.72 / 6.80), and the two edges, light `rgba(25,45,65,0.12)` and `0.07` (AJ's 2A), dark D5's `var(--eq-edge)` and `rgba(150,180,210,0.077)`. No `--adm-` twins: no admin screen draws a Hub card, so `admin-tokens.test.ts` excludes the six beside `--eq-rail-w`. No `--eq-recede-fill`.

**C3, the cards, with the light round's phase 4 and the dark round's D5** (`23cc45e4`), written once, in place, in `hub-card.css`, `next-strip.css`, `hub-grid.css` and `day-header.css`. Coming up the card, its lift and the blue mark; Now the orange mark and the word in the deep orange; in session as before; recorded (done, a late cancel) a pale flat tile with every word in the muted ink (5.20:1 at the least light, 6.72 dark); not recorded (Not logged, Left open) a whole flat card with the plum mark, "Left open" in plum; past (a failed read) A2's flat 62% fill. Drawn one way: no border, a 1px outline (the quiet edge on a card that is over), every outline state rule `:not(:focus-visible)`, the mark a straight 3px band from `--hs-mark`. The veil, the 70% edges and rails and the lifted words are gone; A4's lighter type and A3's picked day without its glow. The card's padding is `7px 9px 7px 14px` (A1 wrote 15 on the left), so the inside stays where the old edge and rail left it. Tests moved because they pinned today's look (the commit lists them); the new `hub-card-look.test.ts` holds the rest. Full suite 14,869 in 901 files.

**C4, the cutover gate** (`248cd9f9`). `loggingFrom(dayKey, cutover)` in `hub-day.ts`: "live" when the cutover is a real yyyy-mm-dd day and the day shown is that day or later, else "not-yet" (no date, or a malformed one, is not yet: the safe side). Never `studioIsLive`, the nightly job's gate, which turns live a day early. `ClientsView` asks it for the day shown with the active studio's `journeyCutoverDate` (from the studios AppContent already hands it), `HubGrid` sets `data-logging` on `.hs-scroll` and `PhoneDayList` on `.ph-day`; the Calendar's Day gets the date from AppContent through `CalendarView` (beside `mindbodySiteId`, rather than the whole studios list the plan named) and `DayView`. Before the date a Not logged card lies down as the recorded tile and keeps its words (C3's rule); Left open is never gated. 12 new tests: the helper, the grid, the phone list, the Hub (the active studio's date only, following the day picked) and the Calendar's Day.

**C5, the Key** (`d8451c9a`). "On the grid" as the card page's Key picture says it, with the skeptic's fix to Now: Coming up; Now, "Its time has come and no session has started in Journey yet." (the picture's "its half hour" was wrong for a consult and the five minutes after a slot); In session; Done · Late cancel; Not logged, with what happens before the cutover; Left open · Paused · At End Session; Over, no word; then Not synced yet, Unassigned, Not a session and Not working as before. Each swatch is drawn as its card is: no border, the outline, no opacity, each mark a straight band 4px in. `hub-colour-rules.test.ts`'s Key pins read the bands; the Key's coming-up and in-session swatches leave `elevation.test.ts`'s `KEPT_RAILS`; a new `DayHeader.render.test.tsx` test holds the rows.

**The docs** (this commit). `DECISIONS.md`: a new decision, [Hub card states](../DECISIONS.md#hub-card-states), with AJ's words, the cutover gate and the colour jobs, written as a level-4 entry under Type and depth for now (`src/claude-md.test.ts` asks for a `CLAUDE.md` link to every `###` entry, and `CLAUDE.md` is edited at ship time, when it becomes its own entry with its short form); the Navy Frame amended (orange marks Now, plum marks not recorded; and the light round's sentence now says it "left dark mode alone", the review's wording); Type and depth amended (the light outline, the Hub's cards drawn one way, the lighter Hub type, the picked day's glow gone); the iPad round's finished card (Oct 6 2026, a veil of the ground) amended inside the new decision, and `paint-cost.test.ts`'s comment says so. `KNOWN-TRAPS.md`: a card whose look changes with the clock must be compared in `sameCard` (React, tests, dates and tooling → The cards round), and the two numbers the review found stale (Type and depth's trap 4, `#808386` on `#EEEEEE` is 3.29:1 now; phase 13's trap 2, the shelf has no spread since L3 and D3). `clinical-review.css`'s `--cr-live-fill` fallback is `#e1ecf5`, the grid's light value. The hub-schedule README says the new looks. `CLAUDE.md` is left for the ship-time pass (its short decision and the test count).

**Parked, outside this round:** the map can leave a machine's name off when it measures the name before the title font has loaded (`studio-map/ui/StudioRoom.tsx`, `textWidth`; the dark plan's Q2 note).

## Two at Once: the narrow cards round (Oct 18 2026)

**What AJ asked.** The "Two at Once" page (the artifact <https://claude.ai/artifact/G9FKbC91zMatcuCnmqqA9h>; the working files are `harness/colour/lanes/`, git-ignored). When two or three clients start together with one trainer, HubGrid lays their cards side by side, each a half or a third of the column: 48.5px inside a card two to a slot in a 156px upright column, 22.7px three to a slot. There names broke inside a word, and the time, "Not logged" and a consult's span were cut, against "names are never truncated". The page recommended stacking them (one under the other, the half hour growing) and offered the short form beside it. AJ's answers:

- **Q1 = B: "Keep them side by side, cards say less."** Q2 (a Now line through every stacked card) fell away with the stack.
- To the brief-back: **"Build it as you described, including initials for the very long names."** Then "go ahead".
- He paused the build at 7:40 PM on Oct 18 and said "continue" to run it overnight.

The design is the lanes round's short form (`harness/colour/lanes/short.css`, `short/`; its report and the judges' notes are in `lanes-round.json`), with the reviewers' gaps closed. It also closes the card review's open item above: "Not logged", "Late cancel" and "Left open" cut at a narrow card's edge.

| Phase | Commit | What changes on screen |
| --- | --- | --- |
| 1, the parts and the label | `f214c8bd` | Nothing. Every card carries the narrow card's parts, hidden, and a spoken label that says the whole card |
| 2, a consult and the narrow single column | `7cd26b01` | A consult's word sits on the line under its time. In a lane of about 155 to 176px the Critical triangle hides her number, and "+N" gives way beside In session. The Unassigned column's "Booked with ..." drops whole, so the time stays |
| 3, the short form | `4fa6e200` | Two or three at once: her name in Saira, the time alone, a symbol for what happened, one mark. Three at once on an upright iPad, and any very long name: her initials. The Key's new row |
| 4, the guard and the docs | `898021e9` | Nothing |

**Phase 1** (`f214c8bd`, 12 files): the parts, the words and the long-name check.

- `card-words.ts` is new: `spokenCard` (the card's aria-label at every width), `cardStateWords`, `timeAndSuffix`, `cardSpanKind` and `initialsOf`.
- `name-fit.ts` is new: Saira Condensed 700's advance widths, read back out of the vendored fonts by its test, and `data-name-over`.
- `CardGlyph.rank` is new, and HubCard draws every part.
- A full card is drawn exactly as before. The lanes harness's 1,188 cases came to 23,790 card layouts, and 0 differed in any run of text or element box. The sheets are the same PNG byte for byte.
- Tests changed because they pinned the markup: `HubCard.render.test.tsx` (the triangle count, the Now part's time), `card-marks.test.ts` and `NextStrip.render.test.tsx` (rank).
- Full suite 14,956 in 904 files.

**Phase 2** (`7cd26b01`, 8 files), measured over HubCard's own markup and the built stylesheet at the iPad's thirteen column widths:

- One to a slot: 1,388 of 5,346 card cases had something cut upright, and 436 sideways. Now none.
- With the words after the time: 3,024 cases, 912 and 272 cut. Now none.
- The Unassigned column: 8,064 cases, 5,997 and 3,461 cut. Now none.
- Two to a slot in a 318 or 420px column: none.
- Two changes where nothing was cut. A half-hour Unassigned card's time sits 1px higher. A one-line staff name beside marks now drops (231 cases at 156px).
- `paint-cost.test.ts` counts nine container blocks, not seven.
- Full suite 14,967 in 905 files.

**Phase 3** (`4fa6e200`, 12 files). Failing cards before and after, upright and sideways:

| Case | Before | After |
| --- | --- | --- |
| The harness's names, two to a slot | 4,874 and 2,754 of 5,346 | 0 and 0 |
| The harness's names, three to a slot | 5,314 and 4,611 | 94 and 36, all cards with no profile or still loading |
| The stress names, two to a slot | 5,288 and 3,818 | 78 and 110 |
| The stress names, three to a slot | 5,346 and 5,072 | 142 and 96 |
| The Unassigned column (8,064), two to a slot | 7,680 and 5,652 | 0 and 0 |
| The Unassigned column, three to a slot | 8,028 and 7,812 | 210 and 108, no profile only |
| The words after the time (3,024), up to three to a slot | | 0 |

- None of the stress names' failures is a client's card in the short form. What is left is a card with no profile, and the full card two to a slot in your 318px column sideways, which breaks a stress name as one to a slot already does.
- Swept across every column from 155 to 720px, one to four to a slot, a client's card fails only four to a slot under a 186px column (parked), or where the full card does with a stress name.
- Drawn exactly as before: one to a slot at all thirteen widths, two to a slot at 318 and 420px, and the phone's list.
- The pause stays lucide's Pause, solid, at 13px. At arm's length it is 0.54 from the ring, its nearest, where the prototype's CirclePause was 0.25.
- Contrast: the symbols at least 4.91:1 in light and 5.01 in dark; her initials 5.18 and 6.75; the Key's symbols 5.55 and 4.92.
- First-screen bundle 476.7 KB gzip (was 473.7; the budget is 480).
- Tests changed because they pinned the look: `paint-cost.test.ts` (136 container blocks), `hub-card-narrow.test.ts` (the lane ends at 176px), `hub-card-look.test.ts` ("never CSS" names the one content, a time).
- Full suite 14,988 in 906 files.

**Phase 4** (`898021e9`): `src/lib/names-wrap.test.ts` holds a narrow card, its 8 earlier tests unchanged and 13 new ones.

- Her name: whole, switched off only for her initials.
- Her time: never in an ellipsis or a line clamp; clipped only on the Now line, where the clock comes first.
- Her state word: never cut, and hidden only where its symbol shows.
- The initials are named as the one exception, with AJ's words.
- Each rule was checked by breaking `hub-card.css` fifteen ways, and every one failed the file.
- `DECISIONS.md` amends "Names are never truncated". Until Oct 18 it lived only in `CLAUDE.md`; it is a level-4 entry beside Hub card states for now. It also amends Type and depth (Saira for a narrow card's name) and records AJ's Oct 1 corner number moving to the peek on a narrow card.
- `KNOWN-TRAPS.md` → Layout and CSS says a narrow card's words move only with a stand-in you can see and the spoken label, and that four at once is parked. Its "number in a part that never shrinks" trap no longer says `text-overflow: ellipsis`.
- The hub-schedule README is updated, and so is this section.
- No test that pinned today's look changed.
- Full suite 15,001 in 906 files (14,988 at phase 3; the 13 new tests are all in `names-wrap.test.ts`). Typecheck 0 after every phase.

**Open, for AJ.**

- **A card with no profile, three to a slot under a 228px column** (every upright iPad), keeps Mindbody's name in a line of 36 to 60px. A word breaks inside itself on 80% of the 2,500 realistic names in a 156px column, 23% at 196.5px and 6% at 220.8px, and the name pushes the time off a half-hour card as often. **Two to a slot too, for a long surname** (the review, Oct 19 2026): none of the 2,500 (their longest word is Zimmerman, 60.6px in the narrow face), but a word over about 61px breaks inside itself in an upright 156px column's 62px line: 28 of 78 long US surnames and first names tried, among them Montgomery (65.5px), Cunningham and Christiansen (62.4) and Weatherspoon (74.1). In headless Chrome over this tree's build, "Gwendolyn Christiansen" (156px) and "Jacqueline Weatherspoon" (156 to 175px) with no profile, two to a slot, break the surname and push the time off a half-hour card; three to a slot from 228px, the same. Nothing more is built for it without his answer.
- **The peek on an Unassigned booking** says "with Samuel" for a person and nothing for a "... Rotation" name (`withWords`), which is his to decide.

**Parked:** four or more at once. A card is about 36px wide, under the 40px tap minimum.

**The walk** adds to the cards' (below), portrait then landscape:

- two at once and three at once, in a colleague's column and in yours;
- a consult beside another booking;
- a very long name taking initials beside a short one;
- a card with no profile three to a slot, and two to a slot with a long surname such as Montgomery (the open item);
- each symbol at arm's length: the pause should read as left open, not a button;
- the Key's row;
- VoiceOver on a narrow card, reading the whole card;
- the Unassigned column's "Booked with";
- the Calendar's Day, where a tap opens the client.

**At ship time:**

- `CLAUDE.md`'s names bullet ("Names are never truncated, and a guard holds it") needs its one-line amendment: initials only on a narrow card, in AJ's Oct 18 words, the whole name in the label, the peek and the profile, never on a card with no profile.
- The level-4 entry becomes its own `###` entry, linked from that bullet, as Hub card states will be.
- The test count is updated.

**To undo:** each phase is one commit. Phase 3 builds on phase 1's parts and extends phase 2's lane rule, so revert newest first: `898021e9`, then `4fa6e200`, `7cd26b01`, `f214c8bd`.

## The gates

Run in the worktree `.claude\worktrees\colour-build` on AJ's PC. Each table names the tip it was run on.

**The narrow cards round, on the tip `d427098b`** (Oct 19 2026, its four phases in and master `0f6a936f` merged):

| Gate | Result |
| --- | --- |
| Typecheck, `npx tsc --noEmit` | **0** errors, the baseline (`.github/typecheck-baseline.txt`), after every phase and on the tip |
| Full suite, `TZ=America/New_York npx vitest run --dir src --testTimeout=30000` | **15,042** passed in **912** files, none failed, no unhandled errors: the merge's own count, run again on the tip. Phase 4 (`898021e9`): 15,001 in 906, so the merge's 41 tests and 6 files are all master's. Before the round (`5481c7a6`): 14,907 in 902, so the round adds 94 tests and 4 files (`hub-schedule/card-words.test.ts`, `name-fit.test.ts`, `hub-card-narrow.test.ts`, `hub-card-short.test.ts`). No test needed changing on the tip |
| Production build, `NODE_ENV=production npx vite build`, then `npm run check:bundle` | Clean. The first screen is **477.6 KB** gzip in 8 files (budget 480), 2.4 KB of room. At the whole branch's gates (`299e78b3`) it was 470.7, so **+6.9 KB** since: 3.0 before phase 3 (the card review's Key fix, master `b7773a53`, phases 1 and 2, not measured apart), 3.0 in phase 3 (473.7 to 476.7), and 0.9 with master `0f6a936f` (phase 4 is tests and docs only) |
| The case check, `git ls-files \| tr A-Z a-z \| sort \| uniq -d` | Prints nothing |
| Line ends | LF in all 79 files the branch changes from master, on disk and in the commits |
| `git status` | Clean; master `0f6a936f` is an ancestor of the tip; `master..HEAD` is 27 commits with this one: the whole branch's 18 (the table below), the card review's two (`ba27fc6a`, `adcff1f7`), the merge `5481c7a6`, the four phases, the merge `d427098b`, and these gates |

**The card build, phase by phase** (Oct 18 2026), each phase on its own commit: typecheck **2** after every one. Full suite: 14,721 in 892 at the head row (`80695c0f`), 14,741 in 892 at C1, 14,848 in 900 at the merge, 14,869 in 901 at C3, and **14,882** in **901**, none failed (C4 adds 12 tests, C5 1) at the docs commit. The colour set (`harness/colour/light2/judge-tests-css.txt`) with the Hub's tests, the card state, the quiet blue, the Calendar, the phone, `ClientsView` and `CalendarView`: 3,480 in 81 at C3, 3,493 at C4, 3,494 at C5, none failed.

**The whole branch, on the tip `d7c0ba2b`** (Oct 18 2026, every card phase in and master `bb39cbb5` merged):

| Gate | Result |
| --- | --- |
| Typecheck, `npx tsc --noEmit` | **2** errors, the baseline pair (`clinical-review/charts.tsx`, `EditTrainerModal.tsx`) |
| Full suite, `TZ=America/New_York npx vitest run --dir src --testTimeout=30000` | **14,882** passed in **901** files, none failed. Master `bb39cbb5`: 14,782 in 898. The branch adds 100 tests and three files (`quiet-blue.test.ts`, `hub-schedule/hub-head-row.test.ts`, `hub-schedule/hub-card-look.test.ts`). No test needed changing on the tip |
| Production build, `NODE_ENV=production npx vite build`, then `npm run check:bundle` | Clean. The first screen is **470.7 KB** gzip in 8 files (budget 480). Master `bb39cbb5`, built the same way from an export of that commit, is 469.6 KB, so the branch adds 1.1 KB (the app shell's script 0.6, its stylesheet 0.5) and leaves 9.3 KB of room |
| The case check, `git ls-files \| tr A-Z a-z \| sort \| uniq -d` | Prints nothing |
| Line ends | LF in all 70 files the branch changes from master, on disk and in the commits |
| `git status` | Clean; `master..HEAD` is 18 commits with this one: the first five phases, this document and the review's two, G3 and G4, the head row, C1, the merge, C2, C3, C4, C5, the docs, and these gates |

**The first five phases, on the tip `e1e624cb`** (Oct 17 2026):

| Gate | Result |
| --- | --- |
| Typecheck, `npx tsc --noEmit` | **2** errors, the baseline pair (`clinical-review/charts.tsx`, `EditTrainerModal.tsx`), after every phase |
| Full suite, `TZ=America/New_York npx vitest run --dir src --testTimeout=30000` | **14,704** passed in **891** files, none failed. Master `9b36d4d5`: 14,675 in 890. The 29 new tests: light 1 8, light 3 3, D3 4, D4 1, D6 13 (and the new file `quiet-blue.test.ts`) |
| The colour tests, after each phase | Light 1: 66 files, 3,223 passed (the same files on master: 3,215). Light 3: 68 files (adding the two frame tests), 3,252. D3: 3,256. D4: 3,257. D6: 70 files, 3,293. None failed |
| Production build, `NODE_ENV=production npx vite build`, then `npm run check:bundle` | Clean. The first screen is 469.2 KB gzip in 8 files (budget 480) |
| The case check, `git ls-files \| tr A-Z a-z \| sort \| uniq -d` | Prints nothing |
| `git status` | Clean; `master..HEAD` is the five phase commits, this document and the review's fix |

Line ends are LF in every file the branch touches.

**The review** (Oct 17 2026) checked every phase 1 value against the plan's list (143 of 143), every copy of an `--eq-` value, each `.dark` block against its fallback, the hex case, the shadows, the Hub stylesheets (untouched) and each phase's colour tests on its own commit, and re-ran the full suite on the tip (14,704 in 891 files). One fix, `dc52de40`, comments only: the light ramp's comment in `index.css` still named n-200 as `--border` and gave the Oct 4 ratios; n-200 is the tab tray now (`#DADADA`, the hairline split off at `#E2E2E2`), and the ratios are today's. Reverting it is never needed to revert a phase.

**The card review** (Oct 18 2026) read every commit after `d4862026`, the merge included (each side's changes land whole: `9b36d4d5..bb39cbb5` and `bb39cbb5..91e87a6c` match their branches line for line, and the one hand join, `docs/rounds/README.md`, keeps both lines). It checked `hubCardIsNow` against `slotOver` (Now ends where Not logged begins; a booking with no end is Now for 35 minutes and, as before, never Not logged), `sameCard` across a start, the gate's dates and the day shown, every state's fill, words and mark in both modes by arithmetic (within 0.03 of the plan's measured numbers), every outline rule `:not(:focus-visible)`, no rail, opacity or veil, every changed test against its old version, and G3 and G4 (30 values, no old value left). In headless Chrome over the real stylesheets, 648 Now cards (columns 60 to 440px, one to three lanes, none to three marks, the rest words): the time whole and in place every time, the word whole on one line or hidden. Fixes, docs only: the README's "a number is never cut" and today's 2px underline, the Navy Frame's "the light round's colours left dark mode alone", Past includes a cancellation, phase 11's Hub trap says what the cards round changed, and "How it ships" names the components. **Open, older than this round** (the cards plan's C1 named it, "worth a look while there"): "Not logged", "Late cancel" and "Left open" sit beside the time in `.hs-card-when`, which never gives way, so on a narrow card the card's edge cuts them. Measured in Geist: a consult's "10:00 – 10:45 AM · Not logged" runs 40px past a 156px column's card (the least a column is, five trainers upright) and 16px past a 180px one; with two bookings in a slot "10:30 · Not logged" runs 50px past at 156px and 8px past at 240px, and a consult's span itself 48px. The cards round makes Not logged the "what happened here" mark, so it is worth AJ's eye on the walk (item 7) and a small round of its own.

## How to undo a phase

Each phase is one commit, so `git revert <commit>` takes it out. In PowerShell, in the folder that has the branch (today the worktree):

```powershell
cd C:\Users\austi\Projects\Journey-System-Beta-master\.claude\worktrees\colour-build
git revert --no-edit 916afbf0
npx tsc --noEmit
$env:TZ = "America/New_York"; npx vitest run --dir src --testTimeout=30000
```

Checked against the tip with `git merge-tree` (nothing changed on disk):

- **D3, D4 and D6** each revert cleanly alone.
- **Light 3** shares lines with D3 (the three tokens, the header and bottom bar comments, the pin, Type and depth): revert D3 first, then light 3 (`git revert --no-edit b6a8e52d 1e8af1ca`). In that order both go cleanly.
- **Light 1** reverts cleanly in the code. Its one conflict is `docs/DECISIONS.md`, because D6 amended the same Navy Frame paragraph: keep D6's sentence and put back the old light line ("off-white cards `#F3F6F9` on a grey-blue ground `#DEE6EE`, navy ink at 13:1").

## How it ships

Stylesheets, components, docs and tests: no rules, index, Cloud Function, cron or Mindbody change. Before it ships, AJ walks it on an iPad, light then dark, portrait then landscape (the walks in both plans): the Active Session (a tapped date with no sets, "+196%", older rep counts), the brightness against Oct 4's "so bright", the profile's tab tray and the map's surround (heavier on the grey: 1.205 off the page, today 1.121), the frame's line in both modes, and the quiet buttons on Operations → Today and the floor's two switches.

The cards add their own walk (`harness/colour/cards/recommendation.md`, "The iPad walk"): any afternoon, the recorded past stepping back and the cards still to come reading as "check this"; dark at evening brightness; the Now row in the morning and the turn at :00 and :30 without a touch, and at five past from Now straight to Not logged; a tapped done card's ring and a tapped Now card's blue mark; a Left open card; a two-booking slot and a consult while Now; the live app before the cutover (the past calm, every card still saying Not logged); the Key in both modes; Settings → General → About for iPadOS 16.4 or later (a rounded outline needs it); the Calendar's Day and the phone layout. **Before the deploy, read every studio's Journey cutover date in production** (Admins → Studios): a date already passed while a studio's trainers still log in FileMaker shows the plum marks from the first minute, and that is AJ's call, not the build's.

With AJ's go: merge to master and push, then on Render Manual Deploy on the web service and Manual Build on both cron jobs (`journey-cron-renewals`, `journey-cron-leaderboards`) so all three run the same commit, and check `/version.json`. The test count goes into `CLAUDE.md` at ship time.

**Not known yet:** how either mode looks on a studio iPad under the gym's lights with True Tone; the plans' measurements are sRGB on the PC. This branch's gates are tests and a build; the plans' pictures are of the same values laid over the app in the harness.
