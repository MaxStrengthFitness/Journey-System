# The colour build (Oct 17 2026)

Light mode's plain greys, the header and bottom bar edged by one 1px line in both modes, a calmer Active Session in dark, and the quiet blue for buttons that repeat down a list. Branch `oct17/colour-build`, cut from master `9b36d4d5`. **Not pushed, not deployed.** Stylesheets, code comments and tests only: no rules, index, Cloud Function, cron, Mindbody or Firestore change.

It follows the two plans AJ answered, `harness/colour/light2/recommendation.md` and `harness/colour/dark2/recommendation.md` (git-ignored). Each has a "Build plan" section with the exact values, the edits and the tests.

## What AJ asked

- **Oct 16 2026**, with a Bing Images window beside the app: light mode "hurts to look at because it has this like blue hue to the white", and "some of it just seems so harsh". The cause the light round found: every big light surface was the logo blue at a pale tint (97% of the light pixels inside the navy frame).
- **The light page: 1A 2A 3A.** Calm the harsh parts too (the frame and the shelves as lines, and the calmer Hub); the brighter "Neutral daylight" (page `#EEEEEE`, cards `#FCFCFC`); navy words kept.
- **The dark page: 1b and 2a.** Keep today's navy surfaces, with the fixes; quiet the rows of solid blue buttons in both modes. No pick on its third question (what a finished card looks like on the dark Hub): AJ asked for a round on the card designs first.
- **His go for this build:** "light's plain-grey palette (#EEEEEE / #FCFCFC), the crisp 1px header and bottom-bar line, dark's Active Session fix, and the quieter repeated blue buttons. Hub cards wait for the card-round page. On its own branch, nothing pushed."

## What was built

Five commits, one per phase, each typechecked and tested on its own.

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

- Light phase 2: the two light-only Hub fills (`--eq-recede-fill` `#F9F9F9`, `--eq-head-fill` the card) and their six pins in a new `hub-light-only.test.ts`. Until then a finished Hub card is drawn as before, the well (now `#F2F2F2`) under its veil, so it still sits close to the page in the evening; and the Hub's head row, corner and time column are the well.
- Light phase 4: the calmer Hub (A1 to A4: no outline, the inner mark, the flat finished card, lighter type). AJ's note on the light page's first question belongs here: a past session should be "a little bit more out of the way", so it is apparent it "was passed and recorded", and one passed but not recorded reads as "oh hey what happened here".
- Dark D2 (dark's own Hub fills) and D5 (dark's half of the calmer Hub, the rim token, every rule written `:not(:focus-visible)`).

**Not built, by AJ's answers:** light phase 5 (near-black words; AJ kept navy, 3A) and dark D1 (the calmer navy palette; AJ kept today's navy, 1b).

**A gap for AJ to decide.** The dark plan's answer (b) is "today's navy, with the fixes", and two of those fixes sit inside D1's edit list in the build plan, so they are not on this branch: a booked card's blue rail in dark (`#5581b0`, was `#4675a4`; 3.64:1 on today's card, was 3.07) and the firmer dark control edges (`#8393a3` on cards, `#8da0b3` in menus and dialogs; 4.71 on a card and 4.55 in a menu, was 3.8). They are 18 of the 27 names in the `.dark` block of `harness/colour/dark2/rec-dark-today-navy.css` (the rest are D2's, D3's and D4's), and each file with a `prefers-color-scheme` fallback needs them there too. The booked rail is a Hub card's edge, so it may belong with the card round.

**Parked, outside this round:** the map can leave a machine's name off when it measures the name before the title font has loaded (`studio-map/ui/StudioRoom.tsx`, `textWidth`; the dark plan's Q2 note).

## The gates

Run in the worktree `.claude\worktrees\colour-build` on AJ's PC, on the tip `e1e624cb` unless the line says otherwise.

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

Stylesheets and tests only. Before it ships, AJ walks it on an iPad, light then dark, portrait then landscape (the walks in both plans): the Active Session (a tapped date with no sets, "+196%", older rep counts), the brightness against Oct 4's "so bright", the profile's tab tray and the map's surround (heavier on the grey: 1.205 off the page, today 1.121), the frame's line in both modes, and the quiet buttons on Operations → Today and the floor's two switches.

With AJ's go: merge to master and push, then on Render Manual Deploy on the web service and Manual Build on both cron jobs (`journey-cron-renewals`, `journey-cron-leaderboards`) so all three run the same commit, and check `/version.json`. The test count goes into `CLAUDE.md` at ship time.

**Not known yet:** how either mode looks on a studio iPad under the gym's lights with True Tone; the plans' measurements are sRGB on the PC. This branch's gates are tests and a build; the plans' pictures are of the same values laid over the app in the harness.
