/**
 * WESTLAKE'S AND WILLOUGHBY'S FLOORS, AS FILEMAKER HAS THEM.
 *
 * Read on Oct 12 2026: the machines and their order from one client's chart
 * at each studio (AJ's screenshots), then every active machine's Setting
 * 1-6 from FileMaker's own machine list (Machines, AJ's login, read only),
 * which agreed on every name and the order. Neither studio had a floor in
 * Journey, so every screen that bridges showed all twenty MSF machines.
 *
 * AJ's answers (Oct 12 2026):
 *  - the readings are right: "CR" is the Compound Row, "Ab T/R" the Torso
 *    Rotation, and Calf, Calf Raises and Shoulder Extensions are each
 *    studio's own machines (no MSF movement);
 *  - when a studio has two or more of one movement, the Imagine Strength
 *    unit follows the MSF standard, else the first in FileMaker's order;
 *  - the dials: "we will have to decide on this later, build both for now".
 *    So every unit carries both: FileMaker's letters (`dials` below) and the
 *    MSF standard's, and the script writes one set and can switch.
 *
 * `dials` are the machine list's Setting 1-6 in their order, the trailing
 * "-" FileMaker writes after a letter dropped ("S-" is S). Left out:
 *  - "Weight" (Willoughby keeps the client's weight as a setting; Journey
 *    records the weight with every set);
 *  - a label with no letters (westlake Calf's "-");
 *  - westlake ABD VR2's Setting 3, a keyboard-mash ("hymm,,mjmftr,..."), and
 *    its Setting 6 "J,", where that client's chart says "GP" (GP is added,
 *    below).
 * Added from the client's CHART, which keeps its own copy of the labels and
 * carries some the machine list does not (AJ, Oct 12 2026: "Add them"; the
 * trainers fill them in, "Hands Down", "SP No"), each after the list's own
 * and in the chart's order: westlake ABD VR2 GP, Pulldown SSS Handle (the
 * chart's "Handl", cut short), LR B and G, Ab MX G and SP; Willoughby Leg
 * Press Nt Prefer, Pulldown Imag. and Overhead Imag. Stool, Chest Press Hoist
 * Neutral (the chart's "Neutra"), Rowing Back Hands. The chart's "Block" is
 * the list's "Blocks", one label.
 * Not sure even on the list: Willoughby Lumbar's Setting 3 reads "Ft-"
 * (perhaps "Fl-"), asked of AJ.
 *
 * `imagineStrength` is set only where FileMaker's name says so ("IS",
 * "Imag.", "Imagine"); Willoughby's "Rowing Back" is Imagine Strength's
 * name for the Simple Row, but the name alone is not the unit, so it is
 * left for a leader to mark on the Sizes sheet.
 *
 * No client's name or data is here: only machines.
 */

export interface FloorUnitSpec {
  /** FileMaker's name for the unit, which becomes its floor name. */
  fm: string;
  /** The MSF movement it is (a catalog id), or null for the studio's own machine. */
  movement: string | null;
  /** FileMaker's setting labels, in the chart's order. */
  dials: readonly string[];
  /** FileMaker's name says it is an Imagine Strength unit. */
  imagineStrength?: true;
}

export interface FilemakerFloor {
  key: "westlake" | "willoughby";
  studioId: string;
  /** How the studio document names it, checked before anything is written. */
  studioName: string;
  units: readonly FloorUnitSpec[];
}

export const WESTLAKE: FilemakerFloor = {
  key: "westlake",
  studioId: "A4uvDltWoJuCas0hqEkG",
  studioName: "westlake",
  units: [
    { fm: "ABD VR2", movement: "m-hip-abd", dials: ["F", "R", "GP"] },
    { fm: "ABD CBX", movement: "m-hip-abd", dials: ["F", "R"] },
    { fm: "ADD VR2", movement: "m-hip-add", dials: ["F", "R"] },
    { fm: "ADD CBX", movement: "m-hip-add", dials: ["F", "R"] },
    { fm: "Leg Curl SSS", movement: "m-leg-curl", dials: ["S"] },
    { fm: "Leg Curl CBX", movement: "m-leg-curl", dials: ["S", "R", "C", "F"] },
    { fm: "LE", movement: "m-ext", dials: ["S", "R", "UT"] },
    { fm: "Calf", movement: null, dials: ["SH", "LT"] },
    { fm: "Leg Press SSS", movement: "m-leg-press", dials: ["SH", "UT", "LT", "HP", "P", "F"] },
    { fm: "Leg Press NT", movement: "m-leg-press", dials: ["S", "P", "F"] },
    { fm: "Leg Press MX", movement: "m-leg-press", dials: ["SH", "S", "G", "P"] },
    { fm: "CR SSS", movement: "m-compound-row", dials: ["S", "H"] },
    { fm: "CR CBX", movement: "m-compound-row", dials: ["S", "C"] },
    { fm: "CR MX", movement: "m-compound-row", dials: ["S", "G"] },
    { fm: "CR A90", movement: "m-compound-row", dials: ["S", "G"] },
    { fm: "Pulldown SSS", movement: "m-pulldown", dials: ["S", "Handle"] },
    { fm: "Pulldown MX", movement: "m-pulldown", dials: ["S", "B", "G"] },
    { fm: "PO", movement: "m-pullover", dials: ["S"] },
    { fm: "Bicep", movement: "m-bicep", dials: ["S", "G"] },
    { fm: "H Bi", movement: "m-bicep", dials: [] },
    { fm: "Simple Row", movement: "m-simple-row", dials: ["S", "C"] },
    { fm: "Chest Press IS", movement: "m-chest-press", dials: ["S", "B", "G"], imagineStrength: true },
    { fm: "Chest Press NT", movement: "m-chest-press", dials: ["S", "G"] },
    { fm: "Chest Press VT", movement: "m-chest-press", dials: ["S", "G", "H"] },
    { fm: "Flye", movement: "m-chest-fly", dials: ["S", "B"] },
    { fm: "Overhead SSS", movement: "m-overhead-press", dials: ["S"] },
    { fm: "Overhead CBX", movement: "m-overhead-press", dials: ["S", "H"] },
    { fm: "Overhead MX", movement: "m-overhead-press", dials: ["S", "G"] },
    { fm: "LR", movement: "m-lateral-raise", dials: ["S", "B", "G"] },
    { fm: "Seated Dip", movement: "m-dip", dials: ["S", "B", "G"] },
    { fm: "Ab MX", movement: "m-abs", dials: ["S", "G", "SP"] },
    { fm: "Ab H", movement: "m-abs", dials: ["G"] },
    { fm: "Ab T/R", movement: "m-torso-rotation", dials: ["K", "F", "R"] },
    { fm: "Lumbar ROM", movement: "m-lumbar", dials: ["K", "F", "ROM"] },
    { fm: "Cx", movement: "m-neck", dials: ["S", "C"] },
  ],
};

export const WILLOUGHBY: FilemakerFloor = {
  key: "willoughby",
  studioId: "1WV88AvJKRpgypnmmO1N",
  studioName: "Willoughby Ohio",
  units: [
    { fm: "Cx", movement: "m-neck", dials: ["B", "S", "G"] },
    { fm: "Calf Raises", movement: null, dials: ["B", "S"] },
    { fm: "Hip ADD", movement: "m-hip-add", dials: ["S", "Blocks"] },
    { fm: "Hip ABD", movement: "m-hip-abd", dials: ["S", "Pads", "Blocks"] },
    { fm: "Leg Curl", movement: "m-leg-curl", dials: ["S", "Sh", "Gap"] },
    { fm: "Leg Ext.", movement: "m-ext", dials: ["S", "G"] },
    { fm: "Leg Press Nt", movement: "m-leg-press", dials: ["B", "S", "Prefer"] },
    { fm: "Leg Press Imag.", movement: "m-leg-press", dials: ["G", "S"], imagineStrength: true },
    { fm: "Pulldown Hoist", movement: "m-pulldown", dials: ["H", "S"] },
    { fm: "Pulldown Imag.", movement: "m-pulldown", dials: ["B", "S", "G", "Stool"], imagineStrength: true },
    { fm: "Chest Press Hoist", movement: "m-chest-press", dials: ["S", "Blocks", "Neutral"] },
    { fm: "Chest Press Imagine", movement: "m-chest-press", dials: ["B", "S", "G"], imagineStrength: true },
    { fm: "Comp. Row Hoist", movement: "m-compound-row", dials: [] },
    { fm: "Compound Row Imagine", movement: "m-compound-row", dials: ["H", "S", "G", "Pad"], imagineStrength: true },
    { fm: "Overhead Hoist", movement: "m-overhead-press", dials: ["S", "Blocks"] },
    { fm: "Overhead Imag.", movement: "m-overhead-press", dials: ["S", "G", "Stool"], imagineStrength: true },
    { fm: "Pullover", movement: "m-pullover", dials: ["E", "S", "G", "Pad"] },
    { fm: "Seated Dip", movement: "m-dip", dials: ["H", "S", "B", "Blocks"] },
    { fm: "Bicep", movement: "m-bicep", dials: ["Blocks", "S", "G"] },
    { fm: "Chest Flys", movement: "m-chest-fly", dials: ["S", "B", "G"] },
    { fm: "Shoulder Extensions", movement: null, dials: [] },
    { fm: "Rowing Back", movement: "m-simple-row", dials: ["C", "S", "G", "Hands"] },
    { fm: "Lateral Raise", movement: "m-lateral-raise", dials: ["S", "H", "G", "B"] },
    { fm: "Lumbar", movement: "m-lumbar", dials: ["S", "Ft"] },
    { fm: "Torso Rotation", movement: "m-torso-rotation", dials: ["S"] },
    { fm: "Abs Imagine", movement: "m-abs", dials: ["S", "G", "Blocks"], imagineStrength: true },
    { fm: "Ab Hoist", movement: "m-abs", dials: [] },
  ],
};

export const FILEMAKER_FLOORS: readonly FilemakerFloor[] = [WESTLAKE, WILLOUGHBY];
