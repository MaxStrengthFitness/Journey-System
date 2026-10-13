# The progress report: one printed page, and a client view you can read (Oct 13 2026)

Branch `oct13/report-page`, stacked on `oct12/filemaker-import` (`e33f6fb8`). Not pushed. Front end only: no rules, index, Cloud Function, Mindbody or Render cron change. One new client field, `trainingFocus`, which AJ OK'd ("A", below).

## What AJ asked

> "i want to nail the look of the client progress report Client view, the finalized report that we can print, currently you cant read all the text, we could enhance the look to feel more like our app and then also we need to make sure the printed version is a giant 3 page, im looking to get this all on 1 page for a print"

The Deep Dive comes after this ("the client progress report and the deep dive").

His answers, in the order they came:

- Two layouts were drawn on a canvas (everything condensed, a headline page): **"lets see both"**, then **"White page, navy band"** for the paper and **"A richer screen version"** for the screen, kept apart from the print.
- **"A sounds good, but ... it kind of needs to be modular. So not every single client's progress report is the exact same ... not everyone is training for the same reason ... at different stages of their life"**, and some data isn't there yet for everyone ("maybe they don't do the in-body").
- **"Trainer ticks, smart defaults"**: the trainer ticks what is on the page, starting from defaults set by why the client trains.
- **"Yes, picked per report"**, and the reasons themselves: **"Custom goals should be on there, studios need to know the goals of their clients. a lot of our clients are over 45 years old all the way to 85 so some do it because they need to but the whole point of this progress report is to show people that this is worth it, Everyday strength, Pain-free movement, Body composition, A goal to hit"**.
- **"A"**: the focus lives on the client (a new field on the client), not only on the report.

## What was built (one commit per phase)

1. **The one-page sheet** (`4b5bc3aa`). `report-page.ts` is the page's rules: the five focuses (everyday strength and independence, pain-free movement, body composition, a goal to hit, their own goal), the ten modules (sessions and the thank-you, the numbers, accolades, machines, the 4 P's, body composition, the Pulse, goals, the plan, the closing note), each focus's order and pairs (`ROWS`) and its defaults (`DEFAULTS`). A module the data can't fill isn't offered, and the editor says why; a read that failed (InBody, the Pulse) is "couldn't read", never "none". `fitPage` estimates the page roomy, then condensed, then a little smaller (down to 88%); the drawn sheet (`ReportSheet.tsx`, `report-sheet.css`) measures itself and steps down the same way, and a trainer who wrote more than a page holds gets two pages rather than a page that loses its end. US Letter less a 0.4in margin; the frame's navy band on white paper. `sheet-from-report.ts` builds the page from a real report and makes up no sentence. The print check (`harness/report-print/check.mjs`) prints five sample reports through headless Chrome and counts the PDF's pages.
2. **The editor** (`4750035f`). Step 1 opens with why the client trains (`FocusPicker`); a sixth step, The printed page (`ReportPageStep`), lists the modules in the focus's order, ticked from its defaults, with the real sheet drawn beside the list and the fit line ("Fits on one page", "printed a little smaller (96%)", "Runs onto a second page...") read from it. Save keeps `focus` and `modules` on the report, so a finalized report prints the same page later, and writes the focus onto the client in one field (never the whole client, nothing waits on it). Print prints the sheet only (`body.printing-sheet`).
3. **The focus on the client** (`8e0f34b9`). Notes & Profile → Goals & Focus opens with **Training for** (`goals/TrainingForCard.tsx`), a field of the record form (`trainingFocus`, anchor `goals-training`) saved by the Save bar; tapping the chosen one again clears it. The briefing's hero says it in a line, "Training for ...", above the client's why, only once it is chosen.
4. **The client view on screen** (`766a0f14`). `ReportScreen.tsx` and `report-screen.css` draw a finalized report from the same plan as the sheet, in the app's look: panels and wells on the page ground, light and dark (the Hub's palette), words 12px and up, nothing in capitals or slanted. It replaces the always-navy page of translucent cards and 7px capitals. Richer than the paper: every ticked machine (the page shows six or eight), every step of the plan, the coaching focus history and the trainer's highlights under the 4 P's, the scans' days, the whole Pulse client copy. An upright iPad reads one column; pairs sit side by side from 900px of the report's width; a machines table longer than six rows takes a row of its own. The toolbar is the app's buttons, Print the one loud one. `harness/report-print/shots.mjs` photographs it at 820, 1180 and 390 wide in both themes.
5. **The old renderers retired** (`edf7ea3d`): `ClientReportSections.tsx`, `InBodyReportSection.tsx`, `AccoladeCards`, `FocusSnapshotCard` and the `.pr-pcard*` styles, which nothing drew any more. Their tests' rules carry on where the report draws now.

## Decisions made along the way (each is AJ's to change)

- **What the session line claims.** "213 sessions in all, since your first session, November 27, 2023" only when Journey holds the whole story (`history-claims.ts` coverage complete) and the count starts at the first session. A window the trainer chose, or a client older than Journey, is "213 sessions since June 1, 2026 · 412 before Journey". (The recalculation stores the first session's day as the start when none was chosen, so that day is not a chosen window.) This is the old tile's rule, "Total Sessions" / "First Session" against "Sessions" / "Since", said as a sentence.
- **A body-composition change inside the scanner's variation reads "about the same"** on the page and the screen, with no number. The InBody round printed it as "+1.2 lb · within normal variation" with a footnote; on a one-page sheet for the client, "about the same" says the same thing in fewer words. Either way it is never called progress. If AJ wants the number back beside it, it is one line in `sheet-from-report.ts` `bodyCells`.
- **No default praise.** The old view printed "Incredible work ... clinical protocol" when the trainer wrote no thank-you, and "peak clinical efficiency" as a closing note; nothing on the page or the screen says a sentence the trainer didn't write.
- **The Pulse's client copy leaves an unanswered protein or hydration question off** instead of printing "—" (`SubjectiveDashboard.tsx`, `SubjectiveClientCopy`).
- **A Pulse-only report** is its Pulse and nothing else, on screen and on paper, as before.
- **Gains are the report's orange words** (the hero text), on paper and on screen, so the client sees the same colour in both; green is good, plum caution, crimson a P that needs work.
- **Nothing InBody is stored on the report**: `progressReports` is readable by anyone signed in, so the scans are read live (`useInBodyScans`) exactly as before. The report stores only its focus and the ticked modules.

## Measured

On `edf7ea3d`: **14,538** tests in 882 files (`TZ=America/New_York npx vitest run --dir src --testTimeout=30000`, the worktree on AJ's PC); typecheck **2** (the same two); the print check prints FULL, EVERYDAY, BODY and NEW_CLIENT on one page each, and OVERFULL on two, as it should.

```bash
node harness/report-print/check.mjs
```

```bash
node harness/report-print/shots.mjs FULL EVERYDAY BODY NEW_CLIENT
```

Both write to `%TEMP%\journey-report-print\`.

## Not done, and what to look at on the iPad

- **Print from Safari on an iPad to a real printer.** The check is Chrome's PDF; Safari is its own printer. One page, the band in colour, nothing cut at the bottom.
- **The client view in portrait and on its side, light and dark**, with a client whose history is in Journey (one of the three imported trial clients) and one who is new.
- **Goals & Focus → Training for**, and the briefing's line once it is set.
- **The Deep Dive** is the next piece AJ named.
- Two importer items wait from the same day: Torso Rotation written as "8/8", "8 8" or "8-8" (left and right), and the reset script lowering `priorHistory.importedCount` when it deletes imported sessions. Both are in `docs/rounds/2026-10-12-filemaker-import.md`'s list.

## How it ships

Front end only, with `oct12/filemaker-import` (this branch is stacked on it): typecheck, the suite, `npx vite build` and `npm run check:bundle`, push, then Render's **web service** Manual Deploy. No cron rebuild is needed for this round (no server or job file changed), no rules or index deploy.
