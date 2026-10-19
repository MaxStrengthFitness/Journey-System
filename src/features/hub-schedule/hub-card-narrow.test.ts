import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE NARROW CARDS ROUND, PHASE 2 (Oct 18 2026): three places a Hub card
 * that does NOT share its slot still cut a word or a mark, measured in the
 * lanes harness (1,388 of 5,346 card cases upright, 436 sideways; none now).
 * hub-card.css holds the fixes; these pins hold hub-card.css:
 *
 *   1. A consult (HubCard's data-span="tall", 45 minutes or more) puts its
 *      word on the line under its time at EVERY width (outside every
 *      at-rule), and its marks under the time where they don't fit beside
 *      it: in the grid only (.hs-slot), never the phone's list, which grows
 *      with its words. Nothing hides the word or clips the time.
 *   2. A lane of about 155 to 176px (one to a slot under a 176px lane, two
 *      in a column of 310 to 352px, and since phase 3 three in 465 to 528
 *      and four in 620 to 704): the Critical triangle hides her number, and
 *      "+N" gives way beside In session. Hidden whole, nothing else.
 *   3. The Unassigned column's "Booked with ..." has the room the name and
 *      the time leave and drops whole when that is too little (a column
 *      that wraps, behind a lead as wide as the box and no height), so the
 *      time stays; in the grid only.
 *
 * jsdom lays out nothing, so these read the stylesheet; the lanes harness
 * (harness/colour/lanes, not in git) is what measured the layout.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CARD = readFileSync(join(HERE, "hub-card.css"), "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "");

const normalise = (selector: string) => selector.trim().replace(/\s+/g, " ");

interface Rule {
  selectors: string[];
  body: Record<string, string>;
  /** The at-rules it sits inside. */
  at: string[];
}

/** Every innermost rule of a stylesheet, with the at-rules it sits inside, in source order. */
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  const stack: { prelude: string; start: number; nested: boolean }[] = [];
  let last = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === "{") {
      const prelude = css.slice(last, i).split(";").pop()!.trim();
      if (stack.length) stack[stack.length - 1].nested = true;
      stack.push({ prelude, start: i + 1, nested: false });
      last = i + 1;
    } else if (css[i] === "}") {
      const top = stack.pop();
      if (top && !top.nested && !top.prelude.startsWith("@") && !/^(?:from|to|\d+%)$/.test(top.prelude)) {
        const body: Record<string, string> = {};
        for (const d of css.slice(top.start, i).matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g)) body[d[1]] = d[2].trim().replace(/\s+/g, " ");
        out.push({ selectors: top.prelude.split(",").map(normalise), body, at: stack.map((s) => normalise(s.prelude)) });
      }
      last = i + 1;
    }
  }
  return out;
}

const ALL = rules(CARD);
/** The one rule naming exactly `selector`, at the top level (no at-rule). */
function topRule(selector: string): Record<string, string> {
  const found = ALL.filter((r) => r.selectors.includes(normalise(selector)));
  expect(found.length, selector).toBe(1);
  expect(found[0].at, `${selector} sits outside every at-rule`).toEqual([]);
  return found[0].body;
}

const TALL = '.hs-slot .hs-card[data-span="tall"]';

describe("a consult's word on its own line, at every width (phase 2)", () => {
  it("wraps its time line, in the grid only", () => {
    expect(topRule(`${TALL} .hs-card-meta`)).toMatchObject({ "flex-wrap": "wrap", "justify-content": "flex-start", "align-items": "flex-start", "row-gap": "2px" });
    expect(topRule(`${TALL} .hs-card-when`)).toMatchObject({ flex: "0 1 auto", "max-width": "100%", "flex-wrap": "wrap", "row-gap": "2px" });
    // Every rule about a tall card is the grid's: the phone's list is not inside a .hs-slot.
    for (const r of ALL.filter((x) => x.selectors.some((s) => s.includes('[data-span="tall"]')))) {
      for (const s of r.selectors) expect(s.startsWith(TALL), s).toBe(true);
      expect(r.at, r.selectors.join(", ")).toEqual([]);
    }
  });

  it("gives the state word the line under the time, as wide as the time, its dot dropped", () => {
    expect(topRule(`${TALL} .hs-card-state-part`)).toEqual({ display: "block", flex: "1 0 100%", width: "0" });
    expect(topRule(`${TALL} .hs-card-sep`)).toEqual({ display: "none" });
  });

  it("puts the marks at the right of the time where they fit, and under it where they don't, never shrunk", () => {
    // The -2px is the 2px the time line's centring gave them: a line that fit is drawn as before.
    expect(topRule(`${TALL} .hs-glyphs`)).toEqual({ flex: "0 0 auto", "margin-left": "auto", "margin-top": "-2px" });
  });

  it("never hides the word or clips the time: the time wraps only at its spaces", () => {
    expect(topRule(`${TALL} .hs-card-clock`)).toEqual({ "white-space": "normal" });
    for (const r of ALL.filter((x) => x.selectors.some((s) => s.startsWith(TALL)))) {
      const sel = r.selectors.join(", ");
      expect(r.body.overflow ?? "visible", sel).toBe("visible");
      expect(r.body["text-overflow"], sel).toBeUndefined();
      if (/hs-card-state|hs-card-clock|hs-card-when/.test(sel)) expect(r.body.display ?? "", sel).not.toBe("none");
    }
  });
});

describe("a lane of about 155 to 176px: two narrow rules (phase 2; three and four to a slot since phase 3)", () => {
  // Exactly these two selectors: the short form (phase 3) hides more under the same lanes, in its own blocks.
  const blocks = (lanes: number) => ALL.filter((r) => r.selectors.some((s) => s === `.hs-slot[data-lanes="${lanes}"] .hs-card[data-critical="true"] .hs-card-num` || s === `.hs-slot[data-lanes="${lanes}"] .hs-card[data-state="in-session"] .hs-g[data-family="more"]`));

  it("one to a slot under a 176px lane, two in a column of 310 to 352px, three of 465 to 528, four of 620 to 704: the column asked by name", () => {
    // 176 since phase 3 (it was 175): a lane of 175 to 176px still broke "Christophe / r" beside the number and the triangle.
    expect([...new Set(blocks(1).map((r) => r.at.join(" ")))]).toEqual(["@container hs-col (max-width: 175.98px)"]);
    expect([...new Set(blocks(2).map((r) => r.at.join(" ")))]).toEqual(["@container hs-col (min-width: 310px) and (max-width: 351.98px)"]);
    // Three and four to a slot since phase 3: the same lanes, from where the short form ends.
    expect([...new Set(blocks(3).map((r) => r.at.join(" ")))]).toEqual(["@container hs-col (min-width: 465px) and (max-width: 527.98px)"]);
    expect([...new Set(blocks(4).map((r) => r.at.join(" ")))]).toEqual(["@container hs-col (min-width: 620px) and (max-width: 703.98px)"]);
    // The lanes are the same width: 155 to 176px each.
    for (const [lanes, from, to] of [[2, 310, 351.98], [3, 465, 527.98], [4, 620, 703.98]]) {
      expect(from / lanes).toBe(155);
      expect(Math.round(to / lanes)).toBe(176);
    }
  });

  it("hides her number beside the triangle, and +N beside In session, whole, and nothing else", () => {
    for (const lanes of [1, 2, 3, 4]) {
      const found = blocks(lanes);
      expect(found.map((r) => r.selectors.join(", "))).toEqual([
        `.hs-slot[data-lanes="${lanes}"] .hs-card[data-critical="true"] .hs-card-num`,
        `.hs-slot[data-lanes="${lanes}"] .hs-card[data-state="in-session"] .hs-g[data-family="more"]`,
      ]);
      for (const r of found) expect(r.body).toEqual({ display: "none" });
    }
  });
});

describe("the Unassigned column's staff line drops whole before the time (phase 2)", () => {
  it("has the room the name and the time leave, a column that wraps and clips what it can't hold", () => {
    const box = topRule(".hs-slot .hs-card-staff");
    expect(box).toMatchObject({ flex: "1 1 0", "min-height": "0", display: "flex", "flex-direction": "column", "flex-wrap": "wrap", "align-content": "flex-start", overflow: "hidden" });
    // Centred, where the card's space-between put it, so where it fits it doesn't move.
    expect(box["justify-content"]).toBe("center");
    // Its margins less its padding reach 1px into each of the card's 2px gaps: a dropped line costs no gap.
    expect(box.margin).toBe("-3px 0");
    expect(box.padding).toBe("2px 0");
  });

  it("goes behind a lead as wide as the box and no height, so a line that doesn't fit leaves whole", () => {
    expect(topRule(".hs-slot .hs-card-staff-lead")).toEqual({ display: "block", flex: "none", width: "100%", height: "0" });
    expect(topRule(".hs-slot .hs-card-staff-name")).toEqual({ flex: "none", width: "100%", margin: "-0.5px 0" });
  });

  it("is the grid's alone: on the phone's list the line stands as it did and the lead takes no box", () => {
    expect(topRule(".hs-card-staff")).toMatchObject({ flex: "none", "overflow-wrap": "anywhere" });
    expect(topRule(".hs-card-staff-lead")).toEqual({ display: "none" });
    for (const r of ALL.filter((x) => x.selectors.some((s) => /\.hs-card-staff/.test(s)))) {
      for (const s of r.selectors) expect(s === ".hs-card-staff" || s === ".hs-card-staff-lead" || s.startsWith(".hs-slot .hs-card-staff"), s).toBe(true);
    }
  });
});
