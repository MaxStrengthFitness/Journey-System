/**
 * One word per dial (the dial-names round, Oct 23 2026): the seed, the generated
 * definitions, the Strongsville letters table and the rename table agree on every
 * dial's name. `docs/rounds/2026-10-23-dial-names.md`.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_MACHINES } from "./default-machines";
import { MACHINE_DEFINITIONS } from "./machine-definitions";
import { SEAT_BELT_LABEL } from "../features/equipment/seat-belt";
import {
  DIAL_ADDITIONS,
  DIAL_RENAMES,
  DIAL_VALUE_REWORDS,
  moveAckKeys,
  moveKeys,
  renamedOptions,
  renamesFor,
  rewordHistoryText,
  rewordValue,
  rewordValues,
  rewordsFor,
  touchedMachineIds,
} from "../../scripts/lib/dial-renames";

const LETTERS = path.resolve(__dirname, "../features/filemaker-import/letters-strongsville.csv");

const dialsOf = (machineId: string): string[] | undefined => DEFAULT_MACHINES.find((m) => m.id === machineId)?.settingOptions;

describe("the seed and the generated definitions", () => {
  it("name every dial the same way, in the same order", () => {
    for (const m of DEFAULT_MACHINES) {
      const def = MACHINE_DEFINITIONS[m.id];
      expect(def, `${m.id} is generated`).toBeTruthy();
      expect(def.settingFields.map((f) => f.label), `${m.id}: regenerate with scripts/generate-machine-definitions.ts`).toEqual(m.settingOptions);
    }
  });

  it("use one word for one pad: no machine names a dial two ways", () => {
    for (const m of DEFAULT_MACHINES) {
      const folded = (m.settingOptions ?? []).map((o) => o.toLowerCase().replace(/[^a-z0-9]/g, ""));
      expect(new Set(folded).size, `${m.id}: ${m.settingOptions?.join(" · ")}`).toBe(folded.length);
    }
  });

  it("say what AJ said on Oct 23 2026", () => {
    expect(dialsOf("m-leg-press")).toEqual(["Gap", "Back Pad", "Shoulder Pads", "Seat Distance"]);
    expect(dialsOf("m-leg-curl")).toEqual(["Gap", "Back Pad", "Shin Pad"]);
    expect(dialsOf("m-lumbar")).toEqual(["Gap", "Seat", "Foot Plate"]);
    expect(dialsOf("m-pullover")).toEqual(["Gap", "Seat", "Elbow Pads", "Back Pad"]);
    for (const id of ["m-hip-add", "m-hip-abd", "m-ext"]) expect(dialsOf(id), id).toContain("Back Pad");
  });
});

describe("the Strongsville letters table (what a FileMaker label means on each machine)", () => {
  const rows = fs
    .readFileSync(LETTERS, "utf-8")
    .split(/\r?\n/)
    .slice(1)
    .filter((l) => l.trim())
    .map((l) => l.split(",").map((c) => c.trim()));

  it("has a header and three cells on every row", () => {
    expect(fs.readFileSync(LETTERS, "utf-8").split(/\r?\n/)[0]).toBe("machine,filemaker,dial");
    for (const r of rows) expect(r, r.join(",")).toHaveLength(3);
  });

  it("names a dial the seed has on every catalog machine (a studio's own unit keeps its own words)", () => {
    for (const [machine, fm, dial] of rows) {
      if (machine.startsWith("sm-")) continue;
      const dials = dialsOf(machine);
      expect(dials, `${machine} (${fm})`).toBeTruthy();
      expect([...dials!, SEAT_BELT_LABEL], `${machine}: ${fm} → "${dial}"`).toContain(dial);
    }
  });

  it("says one thing per label per machine", () => {
    const seen = new Map<string, string>();
    for (const [machine, fm, dial] of rows) {
      const k = `${machine}|${fm.toLowerCase()}`;
      expect(seen.get(k) ?? dial, k).toBe(dial);
      seen.set(k, dial);
    }
  });
});

describe("the rename table", () => {
  it("renames to a dial the seed has, from a name it no longer has", () => {
    for (const r of DIAL_RENAMES) {
      const dials = dialsOf(r.machineId);
      expect(dials, r.machineId).toBeTruthy();
      expect(dials, `${r.machineId}: "${r.to}" is in the seed`).toContain(r.to);
      expect(dials, `${r.machineId}: "${r.from}" has left the seed`).not.toContain(r.from);
      expect(r.from).not.toBe(r.to);
    }
    const keys = DIAL_RENAMES.map((r) => `${r.machineId}|${r.from}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("adds a dial the seed has, and rewords a value on a dial the seed has", () => {
    for (const a of DIAL_ADDITIONS) expect(dialsOf(a.machineId), `${a.machineId}: ${a.dial}`).toContain(a.dial);
    for (const w of DIAL_VALUE_REWORDS) expect(dialsOf(w.machineId), `${w.machineId}: ${w.dial}`).toContain(w.dial);
    expect(touchedMachineIds()).toEqual(["m-leg-press", "m-leg-curl", "m-pullover", "m-lumbar", "m-dip"]);
  });
});

describe("moving a set-up's keys", () => {
  const legPress = renamesFor("m-leg-press");

  it("moves each old key to its new one, in place, and leaves the rest", () => {
    const r = moveKeys({ Gap: "9", "Seat Angle": "2", "Shoulder Pads": "3", "Seat Distance": "7", "Seat belt": "On" }, legPress);
    expect(r.next).toEqual({ Gap: "9", "Back Pad": "2", "Shoulder Pads": "3", "Seat Distance": "7", "Seat belt": "On" });
    expect(Object.keys(r.next!)).toEqual(["Gap", "Back Pad", "Shoulder Pads", "Seat Distance", "Seat belt"]);
    expect(r.moved).toEqual(["Seat Angle"]);
    expect(r.kept).toEqual([]);
  });

  it("does nothing to a set-up with nothing under an old name", () => {
    expect(moveKeys({ Gap: "9", "Seat Distance": "7" }, legPress)).toEqual({ next: null, moved: [], kept: [] });
    expect(moveKeys(null, legPress).next).toBeNull();
    expect(moveKeys({}, legPress).next).toBeNull();
  });

  it("keeps the value already under the new name and says which old one it dropped", () => {
    const r = moveKeys({ "Seat Angle": "2", "Back Pad": "P3" }, legPress);
    expect(r.next).toEqual({ "Back Pad": "P3" });
    expect(r.kept).toEqual(["Seat Angle"]);
    expect(r.moved).toEqual([]);
  });

  it("moves a review's normalised key, and a combination's parts, re-sorted", () => {
    const r = moveAckKeys({ "seat-angle": { value: "2" }, "gap+seat-angle": { value: "9+2" }, gap: { value: "9" } }, legPress);
    expect(r.next).toEqual({ "back-pad": { value: "2" }, "back-pad+gap": { value: "9+2" }, gap: { value: "9" } });
    expect(moveAckKeys({ gap: { value: "9" } }, legPress).next).toBeNull();
  });
});

describe("rewording a value", () => {
  it("the Dip's handles become In or Wide; a number or the word itself is left alone", () => {
    const words = rewordsFor("m-dip").get("Handles")!;
    expect(rewordValue("Neutral", words)).toBe("In");
    expect(rewordValue("N", words)).toBe("In");
    expect(rewordValue("Inside", words)).toBe("In");
    expect(rewordValue("W", words)).toBe("Wide");
    expect(rewordValue("Wide", words)).toBeNull();
    expect(rewordValue("In", words)).toBeNull();
    expect(rewordValue("5", words)).toBeNull();
    expect(rewordValue(undefined, words)).toBeNull();
  });

  it("the Pullover's elbow pads: N is Middle there, not In", () => {
    const words = rewordsFor("m-pullover").get("Elbow Pads")!;
    expect(rewordValue("Neutral", words)).toBe("Middle");
    expect(rewordValue("N", words)).toBe("Middle");
    expect(rewordValue("M", words)).toBe("Middle");
    expect(rewordValue("Wide", words)).toBeNull();
    expect(rewordValue("narrow", words)).toBe("In");
  });

  it("the Leg Press's back pad is P1 to P4", () => {
    const words = rewordsFor("m-leg-press").get("Back Pad")!;
    expect(rewordValue("2", words)).toBe("P2");
    expect(rewordValue("p4", words)).toBe("P4");
    expect(rewordValue("P2", words)).toBeNull();
    expect(rewordValue("5", words)).toBeNull();
  });

  it("rewords a settings map and says what changed", () => {
    const r = rewordValues({ Gap: "9", "Back Pad": "2", "Seat Distance": "7" }, rewordsFor("m-leg-press"));
    expect(r.next).toEqual({ Gap: "9", "Back Pad": "P2", "Seat Distance": "7" });
    expect(r.changed).toEqual(['Back Pad: "2" → P2']);
    expect(rewordValues({ Gap: "9", "Back Pad": "P2" }, rewordsFor("m-leg-press")).next).toBeNull();
    expect(rewordValues(null, rewordsFor("m-leg-press")).next).toBeNull();
  });
});

describe("rewording a history row", () => {
  const legPress = renamesFor("m-leg-press");
  const legPressWords = rewordsFor("m-leg-press");

  it("replaces the label where it stands as a label, never inside a value, and the value's word", () => {
    expect(rewordHistoryText("Gap: —, Seat Angle: 2", legPress, legPressWords)).toBe("Gap: —, Back Pad: P2");
    expect(rewordHistoryText("Seat Angle: —", legPress, legPressWords)).toBe("Back Pad: —");
    expect(rewordHistoryText("Seat Angle: 3", legPress)).toBe("Back Pad: 3");
    expect(rewordHistoryText("Gap: Seat Angle: 6", legPress)).toBeNull();
    expect(rewordHistoryText("Gap: 6, Seat Distance: 4", legPress, legPressWords)).toBeNull();
    expect(rewordHistoryText("", legPress)).toBeNull();
    expect(rewordHistoryText(undefined, legPress)).toBeNull();
  });

  it("rewords a value on a dial that keeps its name", () => {
    expect(rewordHistoryText("Back Pad Height: 4, Seat: 4, Handles: W", renamesFor("m-dip"), rewordsFor("m-dip"))).toBe("Back Pad Height: 4, Seat: 4, Handles: Wide");
  });
});

describe("a catalog machine's dials after the renames and the additions", () => {
  const legPress = renamesFor("m-leg-press");

  it("takes the seed's order when the dials are the seed's", () => {
    const r = renamedOptions(["Gap", "Seat Angle", "Shoulder Pads", "Seat Distance"], legPress, dialsOf("m-leg-press"));
    expect(r).toEqual({ next: ["Gap", "Back Pad", "Shoulder Pads", "Seat Distance"], changed: true, conflict: null });
  });

  it("keeps the catalog's own order when it has a dial the seed lacks", () => {
    const r = renamedOptions(["Gap", "Seat Angle", "Foot Plate", "Seat Distance"], legPress, dialsOf("m-leg-press"));
    expect(r).toEqual({ next: ["Gap", "Back Pad", "Foot Plate", "Seat Distance"], changed: true, conflict: null });
  });

  it("appends an added dial, in the seed's place when the dials are then the seed's", () => {
    expect(renamedOptions(["Gap", "Seat"], new Map(), dialsOf("m-lumbar"), ["Foot Plate"])).toEqual({ next: ["Gap", "Seat", "Foot Plate"], changed: true, conflict: null });
    const pullover = renamedOptions(["Gap", "Seat", "Handles"], renamesFor("m-pullover"), dialsOf("m-pullover"), ["Back Pad"]);
    expect(pullover).toEqual({ next: ["Gap", "Seat", "Elbow Pads", "Back Pad"], changed: true, conflict: null });
    expect(renamedOptions(["Gap", "Seat", "Foot Plate"], new Map(), dialsOf("m-lumbar"), ["Foot Plate"]).changed).toBe(false);
  });

  it("is unchanged once renamed, and refuses a machine that has both names", () => {
    expect(renamedOptions(["Gap", "Back Pad", "Shoulder Pads", "Seat Distance"], legPress, dialsOf("m-leg-press")).changed).toBe(false);
    expect(renamedOptions(["Gap", "Seat Angle", "Back Pad"], legPress, null).conflict).toContain("both");
  });
});
