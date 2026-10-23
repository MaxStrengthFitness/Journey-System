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
  DIAL_RENAMES,
  DIAL_VALUE_REWORDS,
  moveAckKeys,
  moveKeys,
  renamedOptions,
  renamesFor,
  rewordHistoryText,
  rewordValue,
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

  it("rewords a value on a dial the seed has", () => {
    for (const w of DIAL_VALUE_REWORDS) {
      expect(dialsOf(w.machineId), `${w.machineId}: ${w.dial}`).toContain(w.dial);
      for (const word of Object.values(w.words)) expect(Object.values(w.words)).toContain(word);
    }
  });
});

describe("moving a set-up's keys", () => {
  const legPress = renamesFor("m-leg-press");

  it("moves each old key to its new one, in place, and leaves the rest", () => {
    const r = moveKeys({ Gap: "9", "Seat Angle": "2", "Shoulder Pads": "3", "Seat Distance": "7", "Seat belt": "On" }, legPress);
    expect(r.next).toEqual({ Gap: "9", "Back Pad": "2", "Shoulder Pads": "3", Seat: "7", "Seat belt": "On" });
    expect(Object.keys(r.next!)).toEqual(["Gap", "Back Pad", "Shoulder Pads", "Seat", "Seat belt"]);
    expect(r.moved).toEqual(["Seat Angle", "Seat Distance"]);
    expect(r.kept).toEqual([]);
  });

  it("does nothing to a set-up with nothing under an old name", () => {
    expect(moveKeys({ Gap: "9", Seat: "7" }, legPress)).toEqual({ next: null, moved: [], kept: [] });
    expect(moveKeys(null, legPress).next).toBeNull();
    expect(moveKeys({}, legPress).next).toBeNull();
  });

  it("keeps the value already under the new name and says which old one it dropped", () => {
    const r = moveKeys({ "Seat Distance": "7", Seat: "8" }, legPress);
    expect(r.next).toEqual({ Seat: "8" });
    expect(r.kept).toEqual(["Seat Distance"]);
    expect(r.moved).toEqual([]);
  });

  it("moves a review's normalised key, and a combination's parts, re-sorted", () => {
    const r = moveAckKeys({ "seat-angle": { value: "2" }, "gap+seat-distance": { value: "9+7" }, gap: { value: "9" } }, legPress);
    expect(r.next).toEqual({ "back-pad": { value: "2" }, "gap+seat": { value: "9+7" }, gap: { value: "9" } });
    expect(moveAckKeys({ gap: { value: "9" } }, legPress).next).toBeNull();
  });
});

describe("rewording a history row and a handle", () => {
  it("replaces the label where it stands as a label, never inside a value", () => {
    const hip = renamesFor("m-hip-add");
    expect(rewordHistoryText("Gap: —, Back Pad: 6", hip)).toBe("Gap: —, Seat: 6");
    expect(rewordHistoryText("Back Pad: 3", hip)).toBe("Seat: 3");
    expect(rewordHistoryText("Gap: Back Pad: 6", hip)).toBeNull();
    expect(rewordHistoryText("Gap: 6, Seat: 4", hip)).toBeNull();
    expect(rewordHistoryText("", hip)).toBeNull();
    expect(rewordHistoryText(undefined, hip)).toBeNull();
  });

  it("the Dip's handles become In or Wide; a number or the word itself is left alone", () => {
    const words = DIAL_VALUE_REWORDS[0].words;
    expect(rewordValue("Neutral", words)).toBe("In");
    expect(rewordValue("N", words)).toBe("In");
    expect(rewordValue("Inside", words)).toBe("In");
    expect(rewordValue("W", words)).toBe("Wide");
    expect(rewordValue("Wide", words)).toBeNull();
    expect(rewordValue("In", words)).toBeNull();
    expect(rewordValue("5", words)).toBeNull();
    expect(rewordValue(undefined, words)).toBeNull();
  });
});

describe("a catalog machine's dials after the renames", () => {
  const legPress = renamesFor("m-leg-press");

  it("takes the seed's order when the dials are the seed's", () => {
    const r = renamedOptions(["Gap", "Seat Angle", "Shoulder Pads", "Seat Distance"], legPress, dialsOf("m-leg-press"));
    expect(r).toEqual({ next: ["Gap", "Seat", "Back Pad", "Shoulder Pads"], changed: true, conflict: null });
  });

  it("keeps the catalog's own order when it has a dial the seed lacks", () => {
    const r = renamedOptions(["Gap", "Seat Angle", "Foot Plate", "Seat Distance"], legPress, dialsOf("m-leg-press"));
    expect(r).toEqual({ next: ["Gap", "Back Pad", "Foot Plate", "Seat"], changed: true, conflict: null });
  });

  it("is unchanged once renamed, and refuses a machine that has both names", () => {
    expect(renamedOptions(["Gap", "Seat", "Back Pad", "Shoulder Pads"], legPress, dialsOf("m-leg-press")).changed).toBe(false);
    expect(renamedOptions(["Gap", "Seat Angle", "Back Pad"], legPress, null).conflict).toContain("both");
  });
});
