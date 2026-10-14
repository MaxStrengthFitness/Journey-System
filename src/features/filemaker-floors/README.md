# FileMaker floors: westlake and Willoughby

Oct 12 2026. AJ: "using these we can build the floors for westlake and willoughby" — one client's FileMaker chart from each studio. A chart's rows are FileMaker's machines in FileMaker's Order, and its left column shows each machine's setting letters. Neither studio had a floor in Journey (`studios/{s}/roster` was empty), so every screen that bridges an empty roster showed all twenty MSF machines there.

This folder is the pure half. `scripts/build-floors-from-filemaker.ts` reads, prints and writes.

## What each FileMaker row becomes

One roster document per row, in FileMaker's order (`order` 1..n, the walking order the floor editor keeps), named exactly as FileMaker spells it. That way the FileMaker history import's machine table (`features/filemaker-import/machine-map.ts`, "Same name on the floor") matches each one by itself.

| The row is | It becomes |
| --- | --- |
| The unit of a movement that follows the MSF standard: the Imagine Strength one ("IS", "Imag.", "Imagine"), else the first in FileMaker's order (AJ) | A catalog copy at the movement's own id, `overrides.name` its floor name, inheriting everything else live |
| Any other unit of that movement (westlake's Leg Press NT and MX) | The studio's own machine (`source: "custom"`, `basedOn` the movement), carrying the movement's definition as the catalog document held it, copied once |
| A machine with no MSF movement (Calf, Calf Raises, Shoulder Extensions) | The studio's own machine, no lineage, its name and FileMaker's letters |

A floor holds a catalog copy once, under the movement's id, so a second unit can only be the studio's own. A custom entry inherits nothing (`resolveMachine`): a correction head office makes later reaches the first unit only. Each unit's set-up guide is its own either way, because the app looks a guide up by a unit's own id, never its lineage (`equipment/adapters.ts` `knowledgeOf`). Each unit still rolls up to its movement (`comparisonKey`), and the clinical watch-outs reach it through that.

An Imagine Strength unit names its model (`modelId`, one of head office's twenty), so the studio map draws it at its real size. Willoughby's "Rowing Back" is Imagine Strength's name for the Simple Row, but a name is not the unit, so a leader marks it on the Sizes sheet.

## The dials: both sets

AJ: "we will have to decide on this later, build both for now". Every unit carries:

- **FileMaker's letters**, from FileMaker's own machine list (Setting 1-6 on each machine, read on Oct 12 2026 with AJ's login, read only), in their order (Leg Press SSS: SH, UT, LT, HP, P, F). What was left out and why is in `floors.ts`'s header: "Weight", a keyboard-mash on westlake's ABD VR2, and a few labels one client's chart carries that the machine list does not.
- **The MSF standard's** (Gap, Seat, Back Pad...), as the catalog document holds them.

`--dials` chooses which set the floor is written with, and `--switch-dials` later moves every unit to the other set. Only the dials change, and a unit a person has saved since the script wrote it (its `updatedBy` is no longer `floors-from-filemaker`) is named and left alone. A studio's own machine has no standard, so it takes FileMaker's letters either way. A catalog copy whose chart shows no dials keeps the standard's, because an empty list on a copy falls back to the catalog's anyway (`floor-machines.ts`).

Client settings saved under one set's labels don't follow a switch. Switch before trainers start saving settings on these floors.

## Running it

Read the script's header. It does a dry run by default, which prints every unit with both dial sets. Production is refused unless the project id is typed twice. A studio whose floor already has any machine is refused, and so is a studio id whose name isn't the table's. A refusal stops the whole run. `--remove` deletes only the units still signed by the script, and is meant for before trainers use the floor.

Rehearsed on the Firestore emulator on Oct 12 2026 (build, the refusals, both switches, a leader's unit left alone, remove): the rehearsal is git-ignored, at `backups/fm-floors-rehearsal/rehearse.mjs`.
