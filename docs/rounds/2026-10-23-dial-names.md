# One word per dial (the dial-names round, Oct 23 2026)

**Status: a proposal.** Nothing is written to production. The script, the seed change and the test are built on `claude/compassionate-diffie-d2420a` so the dry-run numbers below are real, and they follow the recommendations in §4; a different answer from AJ is a one-line change to the rename table (§6). Front end and one data script: no Firestore rule, index, structure, Cloud Function, cron or Mindbody change.

## 1. What AJ asked

After the Strongsville import (`2026-10-21-strongsville-import.md`) and the dials from the export's setting columns (`backups/filemaker/IMPORT-LOG.md`, Oct 23), AJ: the dial NAMES are inconsistent, and he wants **one vocabulary per machine**: Journey's catalog names, FileMaker's labels and what trainers type on the iPad should be one set of words.

Already decided on Oct 23, not reopened here: the Compound Row is **Gap · Chest Pad · Handles · Chest Pad Height** (Up / Down); handles are **words, not letters**; a 0 or blank setting is nothing.

## 2. The three sources, read

- **Journey's names** are `machines/{id}.settingOptions` (the seed `src/data/default-machines.ts`): plain labels, and **the label IS the storage key** for every client's set-up (`clientMachineSettings/{client}_{machine}.settings["Back Pad"]`; `equipment/adapters.ts` buildFields, step 1). No catalog machine has `settingFields` or `defaultSettings` in production (checked Oct 23), so renaming a dial means renaming the label and moving every saved value to the new key.
- **FileMaker's labels** are the `MachineSetting1..6` columns of the Strongsville export (107,622 lines): a label on nearly every line, a value on the first-visit lines only. `backups/filemaker/tools/tally-labels.mts` (read-only, Oct 23) counts them per Journey machine. What each label means on each machine is AJ's, in `letters-strongsville.csv`.
- **What trainers typed on the iPad** at Strongsville (52 set-ups by hand, `tools/read-dial-names.mts`): the card keys a value by the catalog's label, so the names are Journey's; the SPELLINGS are theirs (Handles "M", "W", "Inside").

## 3. The vocabulary, machine by machine

The principle: **the word the floor says, and one word for one pad on every machine.** The chart's letter is that word's initial wherever it can be: S is Seat, G Gap, H Handles, B Back Pad, C Chest Pad, Sh Shin or Ankle Pad (Q3), SP Shoulder Pads, P/Pads Thigh Pads, E Elbow Pads. The two charts that break their own letter (the Simple Row's B is its chest pad; the Chest Fly's C is its back pad) stay as AJ read them in the letters table.

Values seen = the Strongsville export's first-visit values (count ×). iPad = spellings trainers typed by hand. **Bold** = a change proposed.

| Machine | Journey today | Proposed | FileMaker label → values seen | iPad |
| --- | --- | --- | --- | --- |
| CX (4-way neck) | Gap · Back Pad · Seat | same | B, S, G: never filled | B 2, S 5 |
| Overhead Press | Gap · Seat | same | S 2–6, G 2–4 | as Journey |
| Lateral Raise | Gap · Seat · Handles | same | S 3–5, H 1–3 (numbered handles) | Handles 1, 2 |
| Pulldown | Gap · Back Pad · Seat · Handles | same | B 2 (×13), S 3–6, G 3–5, "Belt" (= Seat belt On) | as Journey |
| Seated Pullover | Gap · Seat · Handles | Gap · Seat · **Elbow Pads** (Q6) | S 5–7, G 7–8, E: M ×6, N ×3, W ×2; Pad: never filled | Handles "M" |
| Compound Row | Gap · Chest Pad · Handles · Chest Pad Height | same (decided Oct 23) | S 2–6 (×149), G 0–4, H: M ×106, N ×23, W ×4, Mid ×2; Pad: Low/⬇️/Down ×15, Up/⬆️ ×6 | Handles "M" (Q8) |
| Simple Row | Gap · Chest Pad · Seat Pad | Gap · Chest Pad · **Seat** (Q7) | S 1–4, B 4–5 (= chest pad), Pad: "Block" once | as Journey |
| Chest Press | Gap · Back Pad · Seat | same | S 3–5, G 4–6, B 2–5 / Pad 4 (= back pad) | as Journey |
| Chest/Pec Fly | Gap · Back Pad · Seat | same | S 1–4, G 0–1, Pad 2–3; B, C never filled | as Journey |
| Bicep | Gap · Seat | same | S 6, G 0 | as Journey |
| Tricep Extension | Gap · Seat | same | nothing filled | as Journey |
| Seated Dip | Gap · Back Pad Height · Back Pad Angle · Seat · Handles | same names; Handles **In · Wide** (Q4) | S 3–5, B 3–5 (= height), G 1, H: W ×11, N ×5 | Handles "W", "Inside" |
| Seated Abdominals | Gap · Seat | same | S 1–4, G 6–8 | as Journey |
| Lumbar | Gap · Seat | same (Q5: no Ft dial) | S 1–3, G 2–6; Ft on 8,433 lines, never a value | as Journey |
| Torso Rotation | Gap · Arms · Seat | same | nothing filled | as Journey |
| Hip Abduction | Gap · Back Pad · Thigh Pads | Gap · **Seat** · Thigh Pads (Q1) | S 6–8 (×21), Pads/P 1–3, "Tight" once | as Journey |
| Hip Adduction | Gap · Back Pad | Gap · **Seat** (Q1) | S 6–10 (×25), G 6–10 | as Journey |
| Leg Press | Gap · Seat Angle · Shoulder Pads · Seat Distance | Gap · **Seat** · **Back Pad** · Shoulder Pads (Q2) | S 1–10 with halves (×133, = seat distance), G 4–10 (×181), Pad 2 ×9 / 3 ×1 (= the back pad, P1–P4); SP, Ft never filled | Seat Angle "2", Seat Distance "1.5", "7" |
| Leg Extension | Gap · Back Pad | Gap · **Seat** (Q1) | S 3–7 (×16), G 2–4; "Shin pad" / "SH" once each (a note, not a dial) | as Journey |
| Leg Curl | Gap · Back Pad · Ankle Pad | Gap · **Seat** · Ankle Pad (Q1, Q3) | S 2–6 (×20), Sh 2–6 (×17), Calf (older charts), G 2; Pads: never filled | as Journey |

## 4. The questions for AJ, with a recommendation each

1. **Hip Adduction, Hip Abduction, Leg Extension, Leg Curl: "Back Pad" or "Seat"?** The chart says S on all four, AJ says seat, and the four machines have no other seat. **Recommend Seat.** The rail then reads "S 6" where the chart read "S- 6". "Back Pad" stays on the machines whose chart says B or Pad AND that have a seat as well: Pulldown, Chest Press, Chest Fly, Neck.
2. **Leg Press "Seat Angle" is the back pad (P1–P4; FileMaker "Pad" 2 or 3).** **Recommend "Back Pad", stored as the bare number "2"**: it is what the number pad types, what the import wrote (2, 3, 4, 1: 20 records) and what trainers typed ("2"); no "P2" exists on file, so nothing is converted. **2b, the same machine: "Seat Distance" → "Seat"** (S on the chart; the only reason for the long name was telling it from "Seat Angle", which is leaving). **Recommend yes.**
3. **Leg Curl: "Ankle Pad" or "Shin Pad"?** The charts themselves use two words for this one pad (Calf on Judy's, Sh on Pam's and 2,686 lines), and the Academy's set-up guide says "ankle pad on Achilles" (`machine-database.ts`). **Recommend keeping Ankle Pad** (the method's word; both chart labels already read as it) unless the floor says "shin" out loud, in which case Shin Pad is one line in the table and the script does it the same way.
4. **Seated Dip handles.** The import wrote FileMaker's N as "Neutral" (the Compound Row's word); AJ: the dip's handles are In or Out/Wide. **Recommend In · Wide**: N / Neutral / Inside → In (5 records), W → Wide (3); the 13 "Wide" stay; the six numbers a trainer typed stay as typed.
5. **Lumbar "Ft", Pullover "Pad", Leg Curl "Pads", Simple Row "Block": dials or not?** The export answers: Ft is printed on 8,433 Lumbar lines and never once filled; Pullover Pad 2,736 lines, never filled; Leg Curl Pads 16 lines, never filled; the Simple Row's "Block" is one client's VALUE under "Pad" (a block under the feet, kept as that client's note on the machine). **Recommend no new dial for any of them**: a label nobody ever fills is not an adjustment. (Willoughby's own Lumbar lists Ft among its letters, from its FileMaker chart; that is its unit's field, untouched here.)
6. **Pullover "Handles" → "Elbow Pads"?** AJ, Oct 19: E is the elbow pad, which Journey's Pullover calls Handles. Its values are the same words as handles (Middle / Neutral / Wide). **Recommend Elbow Pads** (18 records move, the words stay).
7. **Simple Row "Seat Pad" → "Seat"?** S on the chart, like every seat. **Recommend yes** (20 records).
8. **Compound Row: are Middle and Neutral one position or two?** The Oct 23 note says "Middle(neutral)"; 106 records say Middle and 23 say Neutral. **Recommend no change unless AJ says they are one**, in which case Neutral → Middle is one line in the table. Nothing merged on a guess.

Not asked, not changed: the Dip's Back Pad Angle stays (rare, never alone); the Compound Row's four dials and their order.

## 5. What changes, and where

**In the app (one commit, deployed like any):** `src/data/default-machines.ts` carries the new names; `src/data/machine-definitions.ts` is regenerated from it; `src/features/filemaker-import/letters-strongsville.csv` is the letters table's copy in the repo (what a FileMaker label means on each Strongsville machine), and `src/data/dial-names.test.ts` fails if a dial it names is not one of that machine's dials in the seed. The gitignored working copy `backups/filemaker/letters-strongsville.csv` (what `bulk-dials.mts` reads) is updated to match. The app itself needs no code change: every screen reads the dials from the catalog.

**In production (`scripts/rename-dials.ts`, dry run by default):** for each rename in `scripts/lib/dial-renames.ts`, in this order:

1. `machines/{id}.settingOptions`: the label replaced in place (and any `standardSettings` / `defaultSettings` key, none today). Administrators' write, "Only administrators edit a standard machine": the script runs as the service account, on AJ's go.
2. `studios/*/roster/{id}` overrides and `studioMachineSettings`: any `settingOptions` entry or `standardSettings` key under the old name (none at any studio today; checked, and the script checks again).
3. `clientMachineSettings/*`: every `settings` key, `sources` key and `fitAcks` key under the old name moved to the new, value untouched; the Dip's Handles spellings reworded (Q4). All studios, Demo Mode included (a real studio with no second code path).
4. `clients/*/machineTotals/current.currentMachineMetrics[id].settings`: the same key move on the session snapshot (its reader is the legacy chart importer only; moved so nothing on file says the old word).
5. `machines/{id}/settingHistory`: the rows' words, "Back Pad: 3 → 6", become "Seat: 3 → 6". The machine card draws a dial's history by matching the row's label to the dial's (`machine-menu/dial-control.ts`), so a row left in the old word would fall off the dial it belongs to. The value and the reason are untouched.
6. After the commit: `npx tsx scripts/rebuild-machine-fit.ts --commit` (the fit index keys by the normalised label, so "back-pad" becomes "seat").

A backup file of every document it will change is written first (`backups/dial-rename-backup-<stamp>.json`), `--commit` needs `--expect N` with N the number of documents, and a document already carrying the new name is skipped, so an interrupted run is simply run again.

**The dry run (Oct 23 2026, ~1:25 PM ET, on production, read-only; the recommendations of §4): 592 documents.**

| What | Documents |
| --- | --- |
| Catalog machines (`settingOptions`) | 7 |
| Roster copies and studio standards naming an old dial | 0 |
| Clients' set-ups (keys moved) | 314: Leg Press 143, Hip Adduction 37, Hip Abduction 34, Leg Curl 28, Leg Extension 26, Simple Row 20, Pullover 18 |
| Dip handle spellings (Q4) | 8: Neutral → In ×4, Inside → In ×1, W → Wide ×3 |
| Session snapshots on `machineTotals` | 6 |
| History rows reworded | 265 |

No set-up had a value under both an old and a new name. Nothing written: `--commit --expect 592` on AJ's go, then the machine-fit rebuild.

**The floors at westlake and Willoughby** are their FileMaker charts' letters on their roster copies (`overrides.settingFields`, the FileMaker floors round), so a catalog rename changes nothing they show; no client at either has a set-up on file yet.

## 6. What it never does

- Never changes a value a trainer typed, except the Dip's handle spellings (Q4), each listed in the dry run.
- Never deletes a value: a key with nothing under the new name moves; a document that somehow has both keeps the value under the new name (saved by the app after the catalog changed, so the newer) and says so in the dry run. Today none has both.
- Never touches a studio's own unit (`sm-…`), whose dials are its own words.
- Never writes without `--commit --expect N`, the backup file first, and AJ's go.
- No Firestore structure change: the same documents, the same fields, new words.

## 7. AJ's answers and the build log

**AJ's answers:** _(recorded here as they come; until then the table in `scripts/lib/dial-renames.ts` carries §4's recommendations)_

**Built, Oct 23 2026** (branch `claude/compassionate-diffie-d2420a`; nothing written to production):

- `scripts/lib/dial-renames.ts` — the rename table (Q1, Q2, Q2b, Q6, Q7), the Dip's handle words (Q4), and the pure half: `moveKeys`, `moveAckKeys`, `rewordHistoryText`, `rewordValue`, `renamedOptions`.
- `scripts/rename-dials.ts` — the script (§5), dry run by default.
- `src/data/default-machines.ts` renamed; `src/data/machine-definitions.ts` regenerated (`npx tsx scripts/generate-machine-definitions.ts`, run with the asset stub loader; this also brought the Compound Row's Chest Pad Height into the definitions, which the Oct 23 seed commit had left out).
- `src/features/filemaker-import/letters-strongsville.csv` — the letters table in the repo, in the new names.
- `src/data/dial-names.test.ts` — the seed, the definitions, the letters table and the rename table agree; the pure helpers.
- Tests that named the Leg Press's old dials moved with it: `filemaker-floors/plan.test.ts`, `machine-codex/format.test.ts`.
- `docs/KNOWN-TRAPS.md` → Machines: a dial's label is its storage key.

**On AJ's yes, in order:** (1) merge to master; (2) `npx tsx scripts/rename-dials.ts` once more (the numbers may have moved with a day's set-ups), then `--commit --expect N`; (3) `npx tsx scripts/rebuild-machine-fit.ts --commit`; (4) Render: Manual Deploy on the web service and Manual Build on both crons, so the seed every iPad falls back on says the same words as the catalog; (5) add the decision to `docs/DECISIONS.md` and its line to `CLAUDE.md`. A different answer to a question is one line in `scripts/lib/dial-renames.ts` and the seed, and the test says which.
