# One word per dial (the dial-names round, Oct 23 2026)

**Status: AJ has answered (§7, Oct 23 2026); built to his answers, waiting on his go.** Nothing is written to production. The script, the seed change and the test are on `claude/compassionate-diffie-d2420a`, tuned to his answers, so the dry-run numbers in §5 are the real ones. All of §4 is answered (the last three on Oct 23 evening). Front end and one data script: no Firestore rule, index, structure, Cloud Function, cron or Mindbody change.

## 1. What AJ asked

After the Strongsville import (`2026-10-21-strongsville-import.md`) and the dials from the export's setting columns (`backups/filemaker/IMPORT-LOG.md`, Oct 23), AJ: the dial NAMES are inconsistent, and he wants **one vocabulary per machine**: Journey's catalog names, FileMaker's labels and what trainers type on the iPad should be one set of words.

Already decided on Oct 23, not reopened here: the Compound Row is **Gap · Chest Pad · Handles · Chest Pad Height** (Up / Down); handles are **words, not letters**; a 0 or blank setting is nothing.

## 2. The three sources, read

- **Journey's names** are `machines/{id}.settingOptions` (the seed `src/data/default-machines.ts`): plain labels, and **the label IS the storage key** for every client's set-up (`clientMachineSettings/{client}_{machine}.settings["Back Pad"]`; `equipment/adapters.ts` buildFields, step 1). No catalog machine has `settingFields` or `defaultSettings` in production (checked Oct 23), so renaming a dial means renaming the label and moving every saved value to the new key.
- **FileMaker's labels** are the `MachineSetting1..6` columns of the Strongsville export (107,622 lines): a label on nearly every line, a value on the first-visit lines only. `backups/filemaker/tools/tally-labels.mts` (read-only, Oct 23) counts them per Journey machine. What each label means on each machine is AJ's, in `letters-strongsville.csv`.
- **What trainers typed on the iPad** at Strongsville (52 set-ups by hand, `tools/read-dial-names.mts`): the card keys a value by the catalog's label, so the names are Journey's; the SPELLINGS are theirs (Handles "M", "W", "Inside").

## 3. The vocabulary, machine by machine

The principle: **the word the floor says, and one word for one pad on every machine.** AJ's answers (§7) set the words: S on the hip and leg machines is the **back pad** (the seat back), the Leg Press's angle is its **back pad** at P1–P4, the Leg Curl's lower pad is the **shin pad**, the Pullover has **elbow pads** and a **back pad**, the Lumbar a **foot plate**. The letters table (`src/features/filemaker-import/letters-strongsville.csv`) says what each chart label means on each machine. **FileMaker's labels are the input, not the answer** (AJ: "im describing how it is labeled in filemaker"); the final names are a joint decision, **a plain, short set per machine** ("we dont need to be 100% spot on with every single special detail on settings"), and **a studio that calls a dial something else renames it on its own copy** (the roster override the app already has, `overrides.settingFields`; "just allow studios to rename settings if they call it different"). What a client adds for comfort or reach (extra padding on a pillow pad, a yoga block or a stool under the feet) is **a note on the client's machine, never a dial**.

Values seen = the Strongsville export's first-visit values (count ×). iPad = spellings trainers typed by hand. **Bold** = a change proposed.

| Machine | Journey today | Proposed | FileMaker label → values seen | iPad |
| --- | --- | --- | --- | --- |
| CX (4-way neck) | Gap · Back Pad · Seat | same | B, S, G: never filled | B 2, S 5 |
| Overhead Press | Gap · Seat | same | S 2–6, G 2–4 | as Journey |
| Lateral Raise | Gap · Seat · Handles | same | S 3–5, H 1–3 (numbered handles) | Handles 1, 2 |
| Pulldown | Gap · Back Pad · Seat · Handles | same | B 2 (×13), S 3–6, G 3–5, "Belt" (= Seat belt On) | as Journey |
| Seated Pullover | Gap · Seat · Handles | Gap · Seat · **Elbow Pads** · **Back Pad** (AJ: elbow pads Wide / Middle / In; the back pad Up or Down) | S 5–7, G 7–8, E: M ×6, N ×3, W ×2; Pad: never filled | Handles "M" |
| Compound Row | Gap · Chest Pad · Handles · Chest Pad Height | same (decided Oct 23) | S 2–6 (×149), G 0–4, H: M ×106, N ×23, W ×4, Mid ×2; Pad: Low/⬇️/Down ×15, Up/⬆️ ×6 | Handles "M" (Q8) |
| Simple Row | Gap · Chest Pad · Seat Pad | same for now (Q7 open) | S 1–4, B 4–5 (= chest pad), Pad: "Block" once | as Journey |
| Chest Press | Gap · Back Pad · Seat | same | S 3–5, G 4–6, B 2–5 / Pad 4 (= back pad) | as Journey |
| Chest/Pec Fly | Gap · Back Pad · Seat | same | S 1–4, G 0–1, Pad 2–3; B, C never filled | as Journey |
| Bicep | Gap · Seat | same | S 6, G 0 | as Journey |
| Tricep Extension | Gap · Seat | same | nothing filled | as Journey |
| Seated Dip | Gap · Back Pad Height · Back Pad Angle · Seat · Handles | same names; Handles **In · Wide** (AJ: "Neutral is in") | S 3–5, B 3–5 (= height), G 1, H: W ×11, N ×5 | Handles "W", "Inside" |
| Seated Abdominals | Gap · Seat | same | S 1–4, G 6–8 | as Journey |
| Lumbar | Gap · Seat | Gap · Seat · **Foot Plate** (AJ: "FT is Foot Plate") | S 1–3, G 2–6; Ft on 8,433 lines, never a value | as Journey |
| Torso Rotation | Gap · Arms · Seat | same | nothing filled | as Journey |
| Hip Abduction | Gap · Back Pad · Thigh Pads | same (AJ: "back pad") | S 6–8 (×21), Pads/P 1–3, "Tight" once | as Journey |
| Hip Adduction | Gap · Back Pad | same (AJ: "back pad") | S 6–10 (×25), G 6–10 | as Journey |
| Leg Press | Gap · Seat Angle · Shoulder Pads · Seat Distance | Gap · **Back Pad** (P1–P4) · Shoulder Pads · Seat Distance (AJ; Q2b open) | S 1–10 with halves (×133, = seat distance), G 4–10 (×181), Pad 2 ×9 / 3 ×1 (= the back pad, P1–P4); SP, Ft never filled | Seat Angle "2", Seat Distance "1.5", "7" |
| Leg Extension | Gap · Back Pad | same (AJ: "back pad") | S 3–7 (×16), G 2–4; "Shin pad" / "SH" once each (a note, not a dial) | as Journey |
| Leg Curl | Gap · Back Pad · Ankle Pad | Gap · Back Pad · **Shin Pad** (AJ: "Shin Pad") | S 2–6 (×20), Sh 2–6 (×17), Calf (older charts), G 2; Pads: never filled | as Journey |

## 4. The questions for AJ, with a recommendation each

1. **Hip Adduction, Hip Abduction, Leg Extension, Leg Curl: "Back Pad" or "Seat"?** The chart says S on all four and the four have no other seat; the recommendation was Seat. **AJ: "back pad".** They keep Back Pad; the chart's S stays mapped to it in the letters table. Nothing moves.
2. **Leg Press "Seat Angle" is the back pad (P1–P4; FileMaker "Pad" 2 or 3).** **AJ: "seat angles are P1 P2 P3 P4 and is the back pad to leg press".** The dial is **Back Pad**, stored as **P1–P4** (the recommendation was the bare number; AJ's word wins): the 20 values on file (2, 4, 1, 3) become P2, P4, P1, P3, and the card's number pad takes a P on this dial from now on. **2b, "Seat Distance" → "Seat": AJ, Oct 23: "D2b Yes".** The Leg Press is Gap · Back Pad · Shoulder Pads · Seat.
3. **Leg Curl: "Ankle Pad" or "Shin Pad"?** The recommendation was Ankle Pad (the Academy's word). **AJ: "Shin Pad".** Ankle Pad → **Shin Pad** (26 records move; Calf and Sh on the charts both read as it).
4. **Seated Dip handles.** The import wrote FileMaker's N as "Neutral"; AJ: the dip's handles are In or Out/Wide. **AJ: "Neutral is in".** **In · Wide**: Neutral / Inside → In (5 records), W → Wide (3); the 13 "Wide" stay; the six numbers a trainer typed stay as typed.
5. **Lumbar "Ft", Pullover "Pad", Leg Curl "Pads", Simple Row "Block": dials or not?** The export never carries a value for any of them (Ft on 8,433 Lumbar lines, Pullover Pad on 2,736, Leg Curl Pads on 16; "Block" is one client's value under the Simple Row's Pad), so the recommendation was no new dial. **AJ: "Lumbar - lumbar has a seat height a gap and a foot plate. FT is Foot Plate. Pull over has elbow pads and a back pad, back pad can be up or down".** So the Lumbar gains **Foot Plate** and the Pullover gains **Back Pad** (Up / Down); both are appended to the catalog with nothing to migrate, and the letters table reads Ft and the Pullover's Pad into them. **Leg Curl "Pads" and Simple Row "Block": not dials** (AJ: "there is an ankle pad but then also some clients use extra padding on the pillow pad"; "clients also on some machines will use a yoga block or a stool in order for their feet to reach the pad or the floor"). Extra padding, a block or a stool is the client's note on that machine (Profile only, as the import keeps a leftover), on any machine.
6. **Pullover "Handles" → "Elbow Pads"?** **AJ: the Pullover "has elbow pads", which "can [be] out/wide, neutral/middle or in/narrow".** Handles → **Elbow Pads** (18 records move), and the words on it are **Wide · Middle · In**: Neutral → Middle (3), M → Middle (2). N on the Pullover is Middle; on the Dip it is In (his answer 4).
7. **Simple Row "Seat Pad" → "Seat"?** S on the chart, like every seat. Recommend yes (20 records). **AJ, Oct 23: "D7 Yes".** The Simple Row is Gap · Chest Pad · Seat.
8. **Compound Row: are Middle and Neutral one position or two?** 106 records say Middle and 23 say Neutral. His Pullover answer calls "neutral/middle" one position there; the Compound Row was not answered. **AJ, Oct 23: "D8 Yes"**: one position, Middle (N / Neutral → Middle).

Not asked, not changed: the Dip's Back Pad Angle stays (rare, never alone); the Compound Row's four dials and their order.

**All answered** (AJ, Oct 23 evening: "D2b Yes, D7 Yes, D8 Yes"). The table, the seed, the generated definitions and the letters table say so; the dry run's count changes with them, so run it again before `--commit`.

## 5. What changes, and where

**In the app (one commit, deployed like any):** `src/data/default-machines.ts` carries the new names; `src/data/machine-definitions.ts` is regenerated from it; `src/features/filemaker-import/letters-strongsville.csv` is the letters table's copy in the repo (what a FileMaker label means on each Strongsville machine), and `src/data/dial-names.test.ts` fails if a dial it names is not one of that machine's dials in the seed. The gitignored working copy `backups/filemaker/letters-strongsville.csv` (what `bulk-dials.mts` reads) is updated to match. The app itself needs no code change: every screen reads the dials from the catalog.

**In production (`scripts/rename-dials.ts`, dry run by default):** for each rename, addition and reword in `scripts/lib/dial-renames.ts`, in this order:

1. `machines/{id}.settingOptions`: the label replaced in place, a new dial (Foot Plate, the Pullover's Back Pad) appended (and any `standardSettings` / `defaultSettings` key, none today). Administrators' write, "Only administrators edit a standard machine": the script runs as the service account, on AJ's go.
2. `studios/*/roster/{id}` overrides and `studioMachineSettings`: any `settingOptions` entry or `standardSettings` key under the old name (none at any studio today; checked, and the script checks again).
3. `clientMachineSettings/*`: every `settings` key, `sources` key and `fitAcks` key under the old name moved to the new, value untouched, except on a reworded dial: the Dip's Handles (In / Wide), the Pullover's Elbow Pads (Wide / Middle / In) and the Leg Press's Back Pad (P1–P4), each spelling listed in the dry run. All studios, Demo Mode included (a real studio with no second code path).
4. `clients/*/machineTotals/current.currentMachineMetrics[id].settings`: the same key move and spellings on the session snapshot (its reader is the legacy chart importer only; moved so nothing on file says the old word).
5. `machines/{id}/settingHistory`: the rows' words, "Seat Angle: 2", become "Back Pad: P2". The machine card draws a dial's history by matching the row's label to the dial's and its lane by the values (`machine-menu/dial-control.ts`, `timeline-model.ts`), so a row left in the old words would fall off the dial it belongs to. The reason is untouched.
6. After the commit: `npx tsx scripts/rebuild-machine-fit.ts --commit` (the fit index keys by the normalised label, so "back-pad" becomes "seat").

A backup file of every document it will change is written first (`backups/dial-rename-backup-<stamp>.json`), `--commit` needs `--expect N` with N the number of documents, and a document already carrying the new name is skipped, so an interrupted run is simply run again.

**The dry run (Oct 23 2026, ~2:50 PM ET, on production, read-only; AJ's answers): 149 documents.**

| What | Documents |
| --- | --- |
| Catalog machines (`settingOptions`) | 4: Leg Press, Leg Curl, Pullover, Lumbar |
| Roster copies and studio standards naming an old dial | 0 |
| Clients' set-ups | 72: Leg Curl 26 (Ankle Pad → Shin Pad), Leg Press 20 (Seat Angle → Back Pad, and 2 → P2 ×13, 4 → P4 ×3, 3 → P3 ×2, 1 → P1 ×2), Pullover 18 (Handles → Elbow Pads, and Neutral → Middle ×3, M → Middle ×2), Dip 8 (Neutral → In ×4, Inside → In ×1, W → Wide ×3) |
| Session snapshots on `machineTotals` | 6 (all Demo Mode's) |
| History rows reworded | 67 |

No set-up had a value under both an old and a new name. Nothing written: `--commit --expect 149` on AJ's go, then the machine-fit rebuild. (The first dry run, on the recommendations before his answers, was 592 documents; most of that was the four hip and leg machines' Back Pad → Seat, which he turned down.)

**The floors at westlake and Willoughby** are their FileMaker charts' letters on their roster copies (`overrides.settingFields`, the FileMaker floors round), so a catalog rename changes nothing they show; no client at either has a set-up on file yet.

## 6. What it never does

- Never changes a value a trainer typed, except a reworded dial's spelling (the Dip's and the Pullover's words, the Leg Press's P), each listed in the dry run.
- Never deletes a value: a key with nothing under the new name moves; a document that somehow has both keeps the value under the new name (saved by the app after the catalog changed, so the newer) and says so in the dry run. Today none has both.
- Never touches a studio's own unit (`sm-…`), whose dials are its own words.
- Never writes without `--commit --expect N`, the backup file first, and AJ's go.
- No Firestore structure change: the same documents, the same fields, new words.

## 7. AJ's answers and the build log

**AJ's answers (Oct 23 2026, in the import session, verbatim):**

> "1. back pad / 2. seat angles are P1 P2 P3 P4 and is the back pad to leg press / 3. Shin Pad / 4. Neutral is in / 5. Lumbar - lumbar has a seat height a gap and a foot plate. FT is Foot Plate. Pull over has elbow pads and a back pad, back pad can be up or down and elbow pads can out out/wide, neurtal/middle or in/narrow"

And, the same afternoon:

> "im describing how it is labeled in filemaker, we can 100% work together to come to a conclusive decsion of final names for each setting and just allow studios to rename settings if they call it different type of deal. Legcurl- there is an ankle pad but then also some clients use extra padding on the pillow pad. we dont need to be 100% spot on with every single special detail on settings ... clients also on some machines will use a yoga block or a stool in order for their feet to reach the pad or the floor"

Read as: (1) Hip Adduction, Hip Abduction, Leg Curl and Leg Extension keep **Back Pad**. (2) The Leg Press's dial is **Back Pad**, positions **P1–P4**, stored as P1..P4 (FileMaker's "Pad 2" is P2). (3) Leg Curl's Ankle Pad becomes **Shin Pad**. (4) The Dip's N / Neutral is **In** (its handles In or Wide). (5) The Lumbar is Seat (height) · Gap · **Foot Plate** (FileMaker Ft); the Pullover gains **Back Pad** (Up / Down; FileMaker Pad) and its Handles are the **Elbow Pads**, **Wide / Middle / In** (FileMaker E-W / E-M / E-N; N is Middle on the Pullover, In on the Dip). The second answer: FileMaker's labels are the input and the final names a joint decision, plain and short; a studio renames a dial on its own copy if it calls it something else; the Leg Curl's lower pad is the one he named (**Shin Pad**), and extra padding on it, like a block or a stool under the feet on any machine, is a per-client note, not a dial. Not answered: 2b, 7, 8 (listed under §4).

**Built, Oct 23 2026, to his answers** (branch `claude/compassionate-diffie-d2420a`; first on the recommendations, then retuned the same afternoon; nothing written to production):

- `scripts/lib/dial-renames.ts` — the rename table (2, 3, 6), the additions (5), the words (4, 6, and P1–P4), and the pure half: `moveKeys`, `moveAckKeys`, `rewordValues`, `rewordHistoryText`, `renamedOptions`.
- `scripts/rename-dials.ts` — the script (§5), dry run by default.
- `src/data/default-machines.ts` renamed; `src/data/machine-definitions.ts` regenerated (`npx tsx scripts/generate-machine-definitions.ts`, run with the asset stub loader; this also brought the Compound Row's Chest Pad Height into the definitions, which the Oct 23 seed commit had left out).
- `src/features/filemaker-import/letters-strongsville.csv` — the letters table in the repo, in the new names.
- `src/data/dial-names.test.ts` — the seed, the definitions, the letters table and the rename table agree; the pure helpers.
- Tests that named the Leg Press's old dials moved with it: `filemaker-floors/plan.test.ts`, `admin/machines/models/ModelsPage.render.test.tsx`.
- `docs/KNOWN-TRAPS.md` → Machines: a dial's label is its storage key.

**On AJ's yes, in order:** (1) merge to master; (2) `npx tsx scripts/rename-dials.ts` once more (the numbers may have moved with a day's set-ups), then `--commit --expect N`; (3) `npx tsx scripts/rebuild-machine-fit.ts --commit`; (4) Render: Manual Deploy on the web service and Manual Build on both crons, so the seed every iPad falls back on says the same words as the catalog; (5) add the decision to `docs/DECISIONS.md` and its line to `CLAUDE.md`. An answer to one of the open questions is one line in `scripts/lib/dial-renames.ts` and the seed, and the test says which.
