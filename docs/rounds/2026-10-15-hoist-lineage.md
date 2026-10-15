# The Hoist leg press's lineage, ahead of the machine editor round (Oct 15 2026)

AJ, Oct 15 2026, on the plan: *"Yes, write the Hoist fix script: Most like = Leg Press, pattern = Lower Body: Quad Dominant, and keep the region Hamstring / Glute."*

## Why now

A ten-agent check of Gemini's answers about the machine editor found a safety gap in the code. A studio-built machine is matched to Max Strength's clinical watch-outs through its lineage, `basedOn` (the editor's "Most like"; `comparisonKey` is `basedOn ?? machineId`, `src/lib/clinical-watchouts.ts`). With no lineage it is matched by its name alone. Strongsville's Hoist leg press has none, and its name matches no machine in the clinical matrix. With every clinical flag on, it shows **0** of the leg press's watch-outs. The standard Leg Press shows **8**: abdominal hernia, high fall risk, osteoporosis, peripheral neuropathy, total knee replacement, and the hip, knee and lower back limitations.

AJ's Oct 14 answer (Q15 = A) planned this correction for the machine editor round, which also makes "Most like" editable. It is done now because of the safety gap.

## What production held (read only, Oct 15 2026)

`studios/BVDDRe5AqQZFihRLW0vK/roster/sm-BVDDRe5AqQZFihRLW0vK-hoist-leg-press`, last written Sep 9 2026:

- `source: "custom"`. No `basedOn` on the entry or in its definition.
- `definition.movementPattern: "Upper Body: Horizontal Push"`: the blank form's default that day (it also defaulted the region to "Chest"), so nobody chose it (`docs/KNOWN-TRAPS.md`, "emptyMachineDefinition() must not guess the taxonomy").
- `definition.anatomicalRegion: "Hamstring / Glute"`: not the default, so a person picked it. It stays.
- No model (`modelId`) and no unit record (no serial, maker or measured size). Not offered to other studios.
- Strongsville's standard Leg Press is a separate catalog copy at `m-leg-press`.

## The fix

`scripts/fix-hoist-lineage.ts` (its decision is `scripts/lib/fix-hoist-lineage-core.ts`, held by `src/lib/hoist-lineage-fix.test.ts`) writes that one document by dotted path:

- `basedOn`: none → `m-leg-press`
- `definition.movementPattern` → `Lower Body: Quad Dominant`
- `updatedAt` the server's time, `updatedBy` `fix-hoist-lineage`

It runs dry by default and writes only with `--commit --expect 1`. It refuses if a field holds anything other than what was read here, and the write is conditioned on the document's last update time. The fields as they were go to `backups/` before the write, and `--revert` undoes it. No rules, index, Function, cron or Mindbody change, and no deploy is needed: the app already reads `basedOn`, so iPads see the change once the script runs.

## What else changes with the lineage

- **Search and the Catalog:** it becomes the Leg Press movement. Searching "Leg Press" or "LP" finds it, it is filed in the Academy's Legs family, and the map labels it LP. It keeps its own name.
- **Shared tips:** a note offered from it is filed under the Leg Press (`machine-db/database.ts`). Once an administrator shares it, it reaches every leg press. There were none either way.
- **Compare:** head office finds it on the Leg Press's Compare page as Strongsville's own machine.
- **Map size:** still unknown (no model, not measured), so the map's shape doesn't change. Its size card now offers the Imagine Strength IS2019 Leg Press as its model. A leader should not pick that for a Hoist, or the map would draw it at the wrong size (`studio-map/sizes.ts`).
- **New clients' plans:** they still start on the standard Leg Press (`routine-plan/starting-plan.ts` `floorIndex`). Inside a plan, the order rules now treat the Hoist as a leg press.
- **Unchanged:** the routine builder's checks (they don't read lineage; that is still Q15's, in the editor round), machine trends, machine fit and leaderboards (they count by the machine's own id), and the Hoist's history and settings.

Three other studio-built machines have no lineage: westlake's Calf, Willoughby's Calf Raises and Willoughby's Shoulder Extensions. The catalog has nothing to link them to.

## Running it (AJ)

In PowerShell, in the project folder (`C:\Users\austi\Projects\Journey-System-Beta-master`, where `.env` and `service-account.json` are), once this branch is merged there:

1. `npx tsx scripts/fix-hoist-lineage.ts`: the dry run. It should say 2 changes, `Documents to write: 1`, and watch-outs `0 now → 8 after`.
2. `npx tsx scripts/fix-hoist-lineage.ts --commit --expect 1`: the write. It ends with "Leg-press watch-outs on the floor now: 8."
3. On an iPad at Strongsville, open a client with a knee replacement or osteoporosis and look at the Hoist on the session grid. The leg press's watch-out shows.

Before the merge, the same commands run from the project folder with the worktree's path: `npx tsx .claude\worktrees\blissful-dewdney-1632dc\scripts\fix-hoist-lineage.ts`.

## Checks

The dry run against production on Oct 15 2026 gave the result in step 1. Suite 14,658 tests in 890 files (5 of them new), typecheck 2.
