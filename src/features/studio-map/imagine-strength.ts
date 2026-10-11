/**
 * THE IMAGINE STRENGTH SIZES — the seed's data (the studio map, Oct 2026).
 *
 * One maker's model for each of the twenty MSF movements, with the frame's
 * size at rest as Imagine Strength's 2026 brochure prints it on page 2.
 * scripts/seed-imagine-strength-models.ts writes them to machineModels once
 * (create-only); nothing here marks a studio's unit as one of them, which is
 * a leader's job on the Sizes sheet (AJ's floors are mixed).
 *
 * A NOTE is stored on the model and shown on every door, so it is in feet
 * and inches and says only what affects where the machine stands. What a
 * reader of the dry run needs and a trainer doesn't (a height that another
 * page prints differently, a weight Journey doesn't store, the brochure's
 * own millimetres) is `dryRunOnly`, printed by the script and never stored.
 *
 * PURE MODULE — no React, no Firestore.
 */

import type { ModelSize } from "../../types/machines";

export const IMAGINE_STRENGTH_BRAND = "Imagine Strength";
export const IMAGINE_STRENGTH_SOURCE = "Imagine Strength brochure, 2026, page 2";
/** Who the seed signs its models as: `--remove` takes back only what still says so. */
export const IMAGINE_STRENGTH_SEED_BY = "seed:imagine-strength-2026";

export type SeedFlag = "length-doubtful" | "copied-entry" | "weight-doubtful" | "height-revision" | "match-inferred";

export interface SeedModel {
  /** modelIdFor("Imagine Strength", model). */
  id: string;
  movementId: string;
  model: string;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  /** Stored on size.note: inches only, and only what affects the drawing. */
  note?: string;
  /** Printed by the dry run, never stored. */
  dryRunOnly?: string;
  flags: readonly SeedFlag[];
}

const SAME_ARMS =
  "The brochure prints the same size for the Bicep and the Tricep. Measure yours to be sure.";
const HIPS = "The brochure mixes up the names of the two hip machines. Check the plate on the machine.";
const HIPS_DRY =
  "The brochure gives both hip machines 1880 x 1300 x 1700 mm; Triumph Fitness lists both as a thigh adductor.";

export const IMAGINE_STRENGTH_MODELS: readonly SeedModel[] = [
  { id: "mm-imagine-strength-is2024-compound-rowing", movementId: "m-compound-row", model: "IS2024 Compound Rowing", lengthMm: 1594, widthMm: 1227, heightMm: 1850, flags: [] },
  { id: "mm-imagine-strength-is2020-torso-arm", movementId: "m-pulldown", model: "IS2020 Torso Arm", lengthMm: 1644, widthMm: 1118, heightMm: 2334, flags: [] },
  { id: "mm-imagine-strength-is2022-seated-pullover", movementId: "m-pullover", model: "IS2022 Seated Pullover", lengthMm: 1243, widthMm: 1123, heightMm: 1674, flags: [] },
  {
    id: "mm-imagine-strength-is2010g-rowing-back",
    movementId: "m-simple-row",
    model: "IS2010G Rowing Back",
    lengthMm: 1130,
    widthMm: 1180,
    heightMm: 1920,
    note: "Head office matched this model by its movement. Check the plate on the machine.",
    flags: ["match-inferred"],
  },
  {
    id: "mm-imagine-strength-is2011-seated-bicep-curl",
    movementId: "m-bicep",
    model: "IS2011 Seated Bicep Curl",
    lengthMm: 1128,
    widthMm: 1008,
    heightMm: 1674,
    note: SAME_ARMS,
    flags: ["copied-entry"],
  },
  { id: "mm-imagine-strength-is2023-chest-press", movementId: "m-chest-press", model: "IS2023 Chest Press", lengthMm: 1319, widthMm: 1223, heightMm: 2134, flags: [] },
  {
    id: "mm-imagine-strength-is2013-overhead-press",
    movementId: "m-overhead-press",
    model: "IS2013 Overhead Press",
    lengthMm: 1196,
    widthMm: 1417,
    heightMm: 1674,
    dryRunOnly:
      "The brochure gives 1674 mm tall; Triumph Fitness's page for an earlier revision gives 1744 mm; length and width agree.",
    flags: ["height-revision"],
  },
  { id: "mm-imagine-strength-is2014-lateral-raise", movementId: "m-lateral-raise", model: "IS2014 Lateral Raise", lengthMm: 1322, widthMm: 1118, heightMm: 1674, flags: [] },
  { id: "mm-imagine-strength-is2010h-pec-fly", movementId: "m-chest-fly", model: "IS2010H Pec Fly", lengthMm: 1215, widthMm: 1251, heightMm: 1920, flags: [] },
  { id: "mm-imagine-strength-is2030x-seated-dip", movementId: "m-dip", model: "IS2030X Seated Dip", lengthMm: 1128, widthMm: 1242, heightMm: 1674, flags: [] },
  {
    id: "mm-imagine-strength-is2030-seated-tricep",
    movementId: "m-tricep-ext",
    model: "IS2030 Seated Tricep",
    lengthMm: 1128,
    widthMm: 1008,
    heightMm: 1674,
    note: SAME_ARMS,
    flags: ["copied-entry"],
  },
  {
    id: "mm-imagine-strength-is2019-leg-press",
    movementId: "m-leg-press",
    model: "IS2019 Leg Press",
    lengthMm: 2120,
    widthMm: 1260,
    heightMm: 1800,
    note: "The seat moves past the frame.",
    dryRunOnly:
      "The brochure gives 1800 mm tall; Triumph Fitness's page for the same model number gives 1674 mm; length and width agree.",
    flags: ["height-revision"],
  },
  { id: "mm-imagine-strength-is2017-seated-leg-extension", movementId: "m-ext", model: "IS2017 Seated Leg Extension", lengthMm: 1448, widthMm: 1087, heightMm: 1674, flags: [] },
  { id: "mm-imagine-strength-is2021a-seated-leg-curl", movementId: "m-leg-curl", model: "IS2021A Seated Leg Curl", lengthMm: 1506, widthMm: 1086, heightMm: 1674, flags: [] },
  { id: "mm-imagine-strength-is2018b-exercise-low-back", movementId: "m-lumbar", model: "IS2018B Exercise Low Back", lengthMm: 1755, widthMm: 1146, heightMm: 1674, flags: [] },
  {
    id: "mm-imagine-strength-is2012-4-way-neck",
    movementId: "m-neck",
    model: "IS2012 4-Way Neck",
    // The larger of the brochure's two lengths: it errs safe for overlaps.
    lengthMm: 1177,
    widthMm: 1160,
    heightMm: 1674,
    note: "The brochure gives two lengths, 46 in and 44 in. Journey uses 46 in. Measure yours to be sure.",
    dryRunOnly: "The brochure prints the length as 1177 mm in one place and 44 in in another; 1177 mm is 46.3 in.",
    flags: ["length-doubtful"],
  },
  { id: "mm-imagine-strength-is2018f-seated-abdominal", movementId: "m-abs", model: "IS2018F Seated Abdominal", lengthMm: 1550, widthMm: 1060, heightMm: 1674, flags: [] },
  // Wider than it is long; the brochure doesn't say which way it faces, and the checks' frame line covers it.
  { id: "mm-imagine-strength-is2029-rotary-torso", movementId: "m-torso-rotation", model: "IS2029 Rotary Torso", lengthMm: 1196, widthMm: 1577, heightMm: 1932, flags: [] },
  {
    id: "mm-imagine-strength-is2027w-hip-abductor",
    movementId: "m-hip-abd",
    model: "IS2027W Hip Abductor",
    lengthMm: 1880,
    widthMm: 1300,
    heightMm: 1700,
    note: HIPS,
    dryRunOnly: HIPS_DRY,
    flags: ["match-inferred"],
  },
  {
    id: "mm-imagine-strength-is2027n-hip-adductor",
    movementId: "m-hip-add",
    model: "IS2027N Hip Adductor",
    lengthMm: 1880,
    widthMm: 1300,
    heightMm: 1700,
    note: HIPS,
    dryRunOnly: `${HIPS_DRY} The brochure's machine weight for this model copies the Abdominal's; Journey stores no weight.`,
    flags: ["match-inferred", "weight-doubtful"],
  },
];

/** Where the brochure is, and the seven Triumph Fitness pages that cross-check it (the dry run's footer). */
export const IMAGINE_STRENGTH_SOURCES = {
  brochure:
    "https://img1.wsimg.com/blobby/go/2185823b-5035-4ff9-b522-c827c3affe90/downloads/b146fe41-bf23-48d0-baf3-c0556a47b415/Revised%20flyer%20brochure.pdf",
  crossChecks: [
    "http://www.triumphfitnessllc.com/LEG%20PRESS-IS2019.html",
    "http://triumphfitnessllc.com/EXERCISE%20LOW%20BACK-IS2018B.html",
    "http://www.triumphfitnessllc.com/TORSO%20ARM-IS1020.html",
    "http://www.triumphfitnessllc.com/SEATED%20PULLOVER-IS1022.html",
    "http://www.triumphfitnessllc.com/SEATED%20LEG%20EXTENSION-IS1017.html",
    "http://www.triumphfitnessllc.com/OVERHEAD%20PRESS-IS1013.html",
    "http://triumphfitnessllc.com/LATERAL%20RAISE-IS2014.html",
  ],
} as const;

/**
 * What a run writes: every row whose id isn't there yet. An id that is
 * there is skipped (an administrator may have edited it); the write itself
 * is a create, which Firestore refuses for a document that exists.
 */
export function seedPlan(existing: ReadonlySet<string>): { write: SeedModel[]; skip: string[] } {
  return {
    write: IMAGINE_STRENGTH_MODELS.filter((r) => !existing.has(r.id)),
    skip: IMAGINE_STRENGTH_MODELS.filter((r) => existing.has(r.id)).map((r) => r.id),
  };
}

/**
 * The way back (`--remove`): only the seed's own models that no
 * administrator has saved since (still signed by the seed), and only those
 * no studio's unit names. `namedBy` is each model id's units, as
 * "{studioId}/{machineId}".
 */
export function removePlan(
  found: Readonly<Record<string, { updatedBy: unknown } | null>>,
  namedBy: Readonly<Record<string, readonly string[]>>,
): { remove: string[]; edited: string[]; named: { id: string; units: readonly string[] }[]; absent: string[] } {
  const out = { remove: [] as string[], edited: [] as string[], named: [] as { id: string; units: readonly string[] }[], absent: [] as string[] };
  for (const { id } of IMAGINE_STRENGTH_MODELS) {
    const doc = found[id];
    if (!doc) out.absent.push(id);
    else if (doc.updatedBy !== IMAGINE_STRENGTH_SEED_BY) out.edited.push(id);
    else if ((namedBy[id] ?? []).length > 0) out.named.push({ id, units: namedBy[id] });
    else out.remove.push(id);
  }
  return out;
}

/**
 * One row as the model document the seed writes, without the stamp the
 * script adds (`updatedAt`, `updatedBy`). No `dials` and no `notes`: the
 * shape `machineModelValid` and `modelSizeValid` accept.
 */
export function seedModelDocument(row: SeedModel): { brand: string; model: string; movementId: string; size: ModelSize } {
  const size: ModelSize = {
    lengthMm: row.lengthMm,
    widthMm: row.widthMm,
    heightMm: row.heightMm,
    source: IMAGINE_STRENGTH_SOURCE,
  };
  if (row.note) size.note = row.note;
  return { brand: IMAGINE_STRENGTH_BRAND, model: row.model, movementId: row.movementId, size };
}
