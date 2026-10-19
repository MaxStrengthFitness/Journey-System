import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FIT_SLACK_PX, NARROW_LINES, NARROW_NAME_FACE, nameNeed, nameOverAttr } from "./name-fit";

/**
 * THE NARROW CARDS ROUND, PHASE 3 (Oct 18 2026): the short form, for two or
 * three at once. AJ: "Keep them side by side, cards say less", then "Build
 * it as you described, including initials for the very long names."
 * hub-card.css (and hub-grid.css for the slot) holds it; these pins hold
 * the stylesheets:
 *
 *   1. Decided by the COLUMN (hs-col) and the slot's data-lanes, never a
 *      container per card: the short form in a lane under 155px (two to a
 *      slot under 310px, three under 465, four under 620), the shortest in
 *      a lane under 76px (three under 228, four under 304), one body per
 *      lanes count, the same body each time.
 *   2. The short form: her name whole in the narrow face (name-fit.ts's
 *      own), the time alone, what happened as a symbol, at most one mark;
 *      everything else hidden whole, never clipped, and nothing it does
 *      costs a layer (no opacity, filter, shadow or overflow).
 *   3. The shortest: her initials, the time first, then the one mark or
 *      symbol; never initials on a card with no profile or still loading.
 *   4. The long-name rule: one block per narrow line and lanes count,
 *      asking for the line its column gives a card, so a name that shows
 *      always fits on two lines with a pixel to spare, and one that takes
 *      initials is within 2px of not fitting.
 *   5. Contrast: each symbol 3:1 and her initials 4.5:1 on its card, in both
 *      modes, on the grid and in your own lane; the Key's symbols 3:1 on its
 *      sheet.
 *
 * jsdom lays out nothing, so these read the stylesheets; the lanes harness
 * (harness/colour/lanes, not in git) measured the layout.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");
const uncomment = (css: string) => css.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "");
const CARD = uncomment(readFileSync(join(HERE, "hub-card.css"), "utf8"));
const GRID = uncomment(readFileSync(join(HERE, "hub-grid.css"), "utf8"));
const KEY = uncomment(readFileSync(join(HERE, "day-header.css"), "utf8"));

const normalise = (selector: string) => selector.trim().replace(/\s+/g, " ");

interface Rule {
  selectors: string[];
  body: Record<string, string>;
  /** The at-rules it sits inside. */
  at: string[];
  /** Where it starts in the stylesheet. */
  index: number;
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
        for (const d of css.slice(top.start, i).matchAll(/(?:^|;)\s*(--[\w-]+|[\w-]+)\s*:\s*([^;]+)/g)) body[d[1]] = d[2].trim().replace(/\s+/g, " ");
        out.push({ selectors: top.prelude.split(",").map(normalise), body, at: stack.map((s) => normalise(s.prelude)), index: top.start });
      }
      last = i + 1;
    }
  }
  return out;
}

const ALL = rules(CARD);
const GRID_RULES = rules(GRID);
const KEY_RULES = rules(KEY);

/** The short form's and the shortest's widths: the column's content box, under which a lane is under 155px and 76px. */
const SHORT: [number, string][] = [
  [2, "309.98"],
  [3, "464.98"],
  [4, "619.98"],
];
const SHORTEST: [number, string][] = [
  [3, "227.98"],
  [4, "303.98"],
];
const S = (n: number) => `.hs-slot[data-lanes="${n}"] .hs-card`;
const atOf = (max: string) => `@container hs-col (max-width: ${max}px)`;

/** The rules of one block, with the lanes count written as N, so blocks for different counts compare. */
function body(lanes: number, max: string): string[] {
  const found = ALL.filter((r) => r.at.length === 1 && r.at[0] === atOf(max) && r.selectors.every((s) => s.startsWith(S(lanes))) && !r.selectors.some((s) => s.includes("data-name-over")));
  expect(found.length, `${lanes} lanes under ${max}px`).toBeGreaterThan(0);
  return found.map((r) => `${r.selectors.map((s) => s.split(S(lanes)).join(S(0))).join(", ")} { ${Object.entries(r.body).map(([k, v]) => `${k}: ${v}`).join("; ")} }`);
}

/** The one rule in a block whose selector list is exactly these suffixes on the card. */
function ruleOf(lanes: number, max: string, ...suffixes: string[]): Record<string, string> {
  const want = suffixes.map((x) => normalise(`${S(lanes)}${x}`));
  const found = ALL.filter((r) => r.at.length === 1 && r.at[0] === atOf(max) && r.selectors.length === want.length && want.every((w) => r.selectors.includes(w)));
  expect(found.length, want.join(", ")).toBe(1);
  return found[0].body;
}

/* ------------------------------------------------------------------ */
/* 1. Decided by the column and the slot's lanes                        */
/* ------------------------------------------------------------------ */

describe("the short form is decided by the column and the slot's lanes, never a card (phase 3)", () => {
  it("is a lane under 155px: two to a slot under 310px, three under 465, four under 620; the shortest a lane under 76px", () => {
    for (const [n, max] of SHORT) {
      expect(Number(max) / n, `${n} lanes`).toBeLessThan(155);
      expect((Number(max) + 0.02) / n, `${n} lanes`).toBeGreaterThanOrEqual(155);
    }
    for (const [n, max] of SHORTEST) {
      expect(Number(max) / n, `${n} lanes`).toBeLessThan(76);
      expect((Number(max) + 0.02) / n, `${n} lanes`).toBeGreaterThanOrEqual(76);
    }
  });

  it("writes one body per lanes count, the same body each time", () => {
    const [two, three, four] = SHORT.map(([n, max]) => body(n, max));
    expect(three).toEqual(two);
    expect(four).toEqual(two);
    const [short3, short4] = SHORTEST.map(([n, max]) => body(n, max));
    expect(short4).toEqual(short3);
  });

  it("gives the slot's cards 1.75px more each side under the same widths, in hub-grid.css", () => {
    for (const [n, max] of SHORT) {
      const found = GRID_RULES.filter((r) => r.selectors.includes(`.hs-slot[data-lanes="${n}"]`));
      expect(found.map((r) => [r.at.join(" "), r.body]), `${n} lanes`).toEqual([[atOf(max), { padding: "0 1.25px" }]]);
    }
    expect(GRID_RULES.find((r) => r.selectors.includes(".hs-slot") && r.at.length === 0)?.body.padding).toBe("0 3px");
  });

  it("comes after the consult's rules it changes: the short form's hidden state word follows the consult's display: block", () => {
    const consult = ALL.find((r) => r.selectors.includes('.hs-slot .hs-card[data-span="tall"] .hs-card-state-part'))!;
    expect(consult.body.display).toBe("block");
    for (const [n, max] of SHORT) {
      const hidden = ALL.find((r) => r.at[0] === atOf(max) && r.selectors.includes(`${S(n)} .hs-card-state-part`))!;
      expect(hidden.body.display).toBe("none");
      expect(hidden.index, `${n} lanes`).toBeGreaterThan(consult.index);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 2. What the short form shows                                         */
/* ------------------------------------------------------------------ */

describe("the short form: the name whole in the narrow face, the time alone, a symbol, one mark (phase 3)", () => {
  it("sets her name in name-fit.ts's narrow face, broken only between words, on 16px lines", () => {
    for (const [n, max] of SHORT) {
      const name = ruleOf(n, max, " .hs-card-name");
      expect(name).toEqual({
        display: "var(--hs-name-shown, inline)",
        "font-family": "var(--font-display)",
        "font-weight": String(NARROW_NAME_FACE.weight),
        "line-height": "16px",
        "letter-spacing": `${NARROW_NAME_FACE.letterSpacingEm}em`,
      });
      expect(ruleOf(n, max, " .hs-card-head")).toEqual({ "line-height": "16px" });
      expect(ruleOf(n, max, " .hs-card-initials")).toEqual({ display: "var(--hs-initials-shown, none)" });
    }
    // The face is Saira Condensed at the card's own 14px, as name-fit.ts measures it.
    expect(readFileSync(join(SRC, "index.css"), "utf8")).toMatch(/--font-display:\s*'Saira Condensed'/);
    expect(NARROW_NAME_FACE).toMatchObject({ family: "Saira Condensed", weight: 700, sizePx: 14, lines: 2 });
    const head = ALL.find((r) => r.selectors.includes(".hs-card-head") && r.at.length === 0)!.body;
    expect(head["font-size"]).toBe(`${NARROW_NAME_FACE.sizePx}px`);
    // Never cut: the name keeps the full card's overflow-wrap (a word that is somehow too long breaks, never clips).
    expect(ALL.find((r) => r.selectors.includes(".hs-card-name") && r.at.length === 0)!.body["overflow-wrap"]).toBe("anywhere");
  });

  it("gives the name the line name-fit.ts measures against: the lane less 15.5px", () => {
    for (const [n, max] of SHORT) {
      expect(ruleOf(n, max, "")).toEqual({ padding: "4px 3px 4px 10px" });
      expect(ruleOf(n, max, "::before")).toEqual({ left: "4px" });
      // A card with no profile is dashed all round: its 1px comes out of the padding, so its line is the same.
      expect(ruleOf(n, max, '[data-kind="unlinked"]')).toEqual({ padding: "3px 2px 3px 9px" });
      expect(ruleOf(n, max, " .hs-card-top")).toEqual({ gap: "4px" });
    }
    const unlinked = ALL.find((r) => r.selectors.includes('.hs-card[data-kind="unlinked"]') && r.at.length === 0)!.body;
    expect(unlinked.border).toBe("1px dashed var(--eq-border)");
    // The slot's two 1.25px sides, the card's 10px left and 3px right; the dashed card's 1 + 9 and 2 + 1.
    expect(1.25 * 2 + 10 + 3).toBe(15.5);
    expect(1.25 * 2 + (1 + 9) + (2 + 1)).toBe(15.5);
    // name-fit.ts's narrow lines are this line, every 2px, from three to a slot in a 229px column (about 60.5)
    // to just under a 155px lane (139.5).
    expect(NARROW_LINES[0]).toBe(60);
    expect(NARROW_LINES[NARROW_LINES.length - 1]).toBe(138);
    expect(228 / 3 - 15.5).toBeGreaterThanOrEqual(60);
    expect(155 - 15.5).toBeLessThan(138 + 2);
  });

  it("hides what the peek and the label say, whole: her number, the words, the state word, the other marks, the dot", () => {
    for (const [n, max] of SHORT) {
      const hidden = ruleOf(
        n,
        max,
        " .hs-card-num",
        " .hs-card-rest",
        " .hs-card-state-part",
        " .hs-card-unsynced",
        " .hs-g-word",
        ' .hs-g[data-family="more"]',
        ' .hs-g:not([data-rank="0"])',
        " .hs-card-top > .hs-tri",
        '[data-critical="true"] .hs-glyphs',
        " .hs-live-dot",
        '[data-state="in-session"] .hs-card-when > strong',
        "[data-span] .hs-card-clock",
      );
      expect(hidden).toEqual({ display: "none" });
    }
  });

  it("shows the symbol, the triangle at the end of the time line, the time where a word stood, and a span without its AM or PM", () => {
    for (const [n, max] of SHORT) {
      expect(ruleOf(n, max, " .hs-card-sym", " .hs-tri.hs-tri--short")).toEqual({ display: "inline-flex" });
      expect(ruleOf(n, max, " .hs-card-alt-time", "[data-span] .hs-card-clock-short")).toEqual({ display: "inline" });
      expect(ruleOf(n, max, " .hs-card-meta")).toEqual({ gap: "4px" });
      expect(ruleOf(n, max, " .hs-card-when")).toEqual({ flex: "0 1 auto", gap: "3px" });
      expect(ruleOf(n, max, ' .hs-card-when[data-now="true"]')).toEqual({ gap: "0" });
      expect(ruleOf(n, max, "[data-span] .hs-card-when")).toEqual({ "flex-wrap": "nowrap" });
    }
    // The span says itself from its attribute, wrapping only at its spaces: never inside a clock.
    expect(ALL.find((r) => r.selectors.includes(".hs-card-clock-short::before"))!.body).toEqual({ content: "attr(data-time)" });
    expect(ALL.find((r) => r.selectors.includes(".hs-card-clock-short") && r.at.length === 0 && !("display" in r.body))!.body).toEqual({ "white-space": "normal" });
    for (const r of ALL.filter((x) => x.selectors.some((s) => /hs-card-(?:clock|when)/.test(s)))) {
      expect(r.body["overflow-wrap"], r.selectors.join(", ")).toBeUndefined();
      expect(r.body["word-break"], r.selectors.join(", ")).toBeUndefined();
    }
  });

  it("draws the narrow parts' own look once, outside every container query, in tokens", () => {
    const top = (sel: string) => {
      const found = ALL.filter((r) => r.selectors.includes(sel) && r.at.length === 0 && !("display" in r.body));
      expect(found.length, sel).toBe(1);
      return found[0].body;
    };
    expect(top(".hs-card-sym")).toEqual({ flex: "none", "align-items": "center", "justify-content": "center", width: "13px", height: "13px" });
    expect(top('.hs-card-sym[data-sym="not-logged"]')).toEqual({ color: "var(--eq-ink)" });
    expect(top('.hs-card-sym[data-sym="left-open"]')).toEqual({ color: "var(--eq-warn)" });
    expect(top('.hs-card-sym[data-sym="late-cancel"]')).toEqual({ color: "var(--eq-ink-muted)" });
    expect(top('.hs-scroll[data-logging="not-yet"] .hs-card[data-kind="client"][data-state="not-logged"] .hs-card-sym')).toEqual({ color: "var(--eq-ink-muted)" });
    expect(top(".hs-tri.hs-tri--short")).toEqual({ width: "20px", height: "20px" });
    expect(top(".hs-card-initials")).toEqual({
      "font-family": "var(--font-display)",
      "font-weight": "700",
      "font-size": "15px",
      "line-height": "17px",
      "letter-spacing": "0.02em",
      color: "var(--eq-ink)",
    });
  });

  it("never cuts, clips or costs a layer: every rule in every narrow block only places, shows, hides or sets type", () => {
    // Every block with a max-width but the word widths' and the 155 to 176px lane's (min-width, or phase 2's 175.98).
    const narrow = ALL.filter((r) => r.at.some((a) => /^@container hs-col \(max-width: \d{3}\.\d+px\)$/.test(a) && !a.includes("175.98")));
    expect(narrow.length).toBeGreaterThan(150);
    const ALLOWED = new Set(["display", "padding", "left", "gap", "row-gap", "line-height", "font-family", "font-weight", "letter-spacing", "flex", "flex-wrap", "flex-direction", "justify-content", "align-items", "max-width", "height", "overflow", "order", "--hs-name-shown", "--hs-initials-shown"]);
    for (const r of narrow) {
      const sel = r.selectors.join(", ");
      for (const [k, v] of Object.entries(r.body)) {
        expect(ALLOWED.has(k), `${sel}: ${k}`).toBe(true);
        // The shortest's time line lets go of the Now part's one-line clip; nothing narrow clips.
        if (k === "overflow") expect(v, sel).toBe("visible");
        if (k === "height") expect(v, sel).toBe("auto");
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* 3. The shortest                                                      */
/* ------------------------------------------------------------------ */

describe("the shortest: her initials, then the time, then the one mark or symbol (phase 3)", () => {
  it("says her initials on a client's card, and drops a Mindbody Unavailable block's word; a card with no profile keeps its name", () => {
    for (const [n, max] of SHORTEST) {
      expect(ruleOf(n, max, '[data-kind="client"]', '[data-kind="staff"]')).toEqual({ "--hs-name-shown": "none", "--hs-initials-shown": "inline" });
    }
  });

  it("puts the time on its own line first, the mark or symbol under it, and lets the word Now give way to the orange mark", () => {
    for (const [n, max] of SHORTEST) {
      expect(ruleOf(n, max, " .hs-card-meta")).toEqual({ "flex-wrap": "wrap", "justify-content": "flex-start", "align-items": "flex-start", "row-gap": "2px" });
      expect(ruleOf(n, max, " .hs-card-when", ' .hs-card-when[data-now="true"]')).toEqual({
        flex: "1 0 100%",
        "max-width": "100%",
        "flex-direction": "column",
        "align-items": "flex-start",
        "flex-wrap": "nowrap",
        height: "auto",
        overflow: "visible",
        gap: "2px",
      });
      // The time's part takes a box of its own, so it can go first (a display: contents part has no order).
      expect(ruleOf(n, max, " .hs-card-clock")).toEqual({ display: "inline", order: "-1" });
      expect(ruleOf(n, max, " .hs-card-clock-short", " .hs-card-alt-time")).toEqual({ order: "-1" });
      // A card with no profile drops its cloud: its dashed edge and its label say it.
      expect(ruleOf(n, max, " .hs-card-now-part", '[data-kind="unlinked"] .hs-card-when > svg')).toEqual({ display: "none" });
    }
  });

  it("never gives initials to a card with no profile, still loading, or unread: only a client's card, by kind or by its name's own attribute", () => {
    const setting = ALL.filter((r) => "--hs-initials-shown" in r.body || "--hs-name-shown" in r.body);
    expect(setting.length).toBe(SHORTEST.length + SHORT.length * NARROW_LINES.length);
    for (const r of setting) {
      for (const s of r.selectors) {
        expect(s, s).toMatch(/\[data-kind="(?:client|staff)"\]$|\[data-name-over~="\d+"\]$/);
        expect(s, s).not.toMatch(/unlinked|pending|unknown/);
      }
    }
    // Where the name or the initials are read, the default is the name.
    for (const [n, max] of SHORT) {
      expect(ruleOf(n, max, " .hs-card-name").display).toBe("var(--hs-name-shown, inline)");
      expect(ruleOf(n, max, " .hs-card-initials").display).toBe("var(--hs-initials-shown, none)");
    }
  });
});

/* ------------------------------------------------------------------ */
/* 4. The long-name rule                                                */
/* ------------------------------------------------------------------ */

const FIRST = ["Margaret", "Linda", "Barbara", "Susan", "Karen", "Nancy", "Donna", "Carol", "Sandra", "Sharon", "Patricia", "Deborah", "Janet", "Diane", "Joyce", "Kathleen", "Cheryl", "Teresa", "Judith", "Christine", "Robert", "James", "John", "Michael", "William", "David", "Richard", "Thomas", "Charles", "Gary", "Larry", "Dennis", "Steven", "Kenneth", "Mark", "Paul", "Donald", "Jerry", "Ronald", "Frank", "Elena", "Priya", "Aisha", "Mei", "Sofia", "Hiroshi", "Mateo", "Omar", "Anika", "Tomasz"];
const LAST = ["Anderson", "Baker", "Carter", "Dawson", "Evans", "Fischer", "Garcia", "Hughes", "Iverson", "Jenkins", "Kowalski", "Lambert", "Morrison", "Novak", "O'Brien", "Patel", "Quinn", "Romano", "Sullivan", "Thompson", "Underwood", "Vasquez", "Whitfield", "Young", "Zimmerman", "Brennan", "Castellano", "Delaney", "Ellison", "Fitzgerald", "Gallagher", "Hollister", "Kaczmarek", "Lindqvist", "McAllister", "Nakamura", "Ostrowski", "Petrakis", "Reinholt", "Szymanski"];
const COMMON = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores", "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell", "Carter", "Roberts"];
const COMMON_FIRST = ["Mary", "Linda", "Susan", "Elizabeth", "Jennifer", "James", "John", "Robert", "Michael", "Christopher"];
/** The lanes round's 2,500 realistic names (name-fit.test.ts's), and the stress names AJ's initials are for. */
const STRESS = ["Bartholomew Hollingsworth", "Christopher Zimmerman", "Mary Ellen Szymanski-Abernathy", "Anne-Marie O'Shaughnessy", "Ann Lee", "Margaret Kaczmarek", "Szymanski-Abernathy", "Mary Ellen Noss"];
const NAMES = [...FIRST.flatMap((f) => LAST.map((l) => `${f} ${l}`)), ...COMMON_FIRST.flatMap((f) => COMMON.map((l) => `${f} ${l}`)), ...STRESS];

/** The long-name blocks: each one condition and one rule. */
const LONG = [...CARD.matchAll(/@container hs-col \(max-width: ([\d.]+)px\) \{\s*([^{}]+)\{([^{}]*)\}\s*\}/g)]
  .filter((m) => m[2].includes("data-name-over"))
  .map((m) => ({ max: Number(m[1]), selector: normalise(m[2]), body: m[3].trim().replace(/\s+/g, " ") }));

describe("the long-name rule: initials where her name won't fit the short form (phase 3)", () => {
  it("asks, for every lanes count and every narrow line, for the line its column gives a card", () => {
    expect(LONG).toHaveLength(SHORT.length * NARROW_LINES.length);
    for (const [n, cap] of SHORT) {
      for (const L of NARROW_LINES) {
        const found = LONG.filter((b) => b.selector === `${S(n)}[data-name-over~="${L}"]`);
        expect(found, `${n} lanes, ${L}px`).toHaveLength(1);
        // The line (the lane less 15.5px) is under L + 2 up to this width: the column asks for the even line at or under its own.
        const max = Math.min(Number(cap), Math.round((n * (L + 2 + 15.5) - 0.02) * 100) / 100);
        expect(found[0].max, `${n} lanes, ${L}px`).toBe(max);
        expect(found[0].body).toBe("--hs-name-shown: none; --hs-initials-shown: inline;");
      }
    }
  });

  it("shows a name only where it fits two lines with a pixel to spare, and initials only within 2px of that, at every column width", () => {
    expect(NAMES).toHaveLength(2500 + STRESS.length);
    // Each name's narrow lines run from 60 up to the widest it is too long for, so a block asks of it one
    // question: is that widest line at or over the block's own?
    const names = NAMES.map((name) => {
      const over = (nameOverAttr(name) ?? "").split(" ").filter(Boolean).map(Number);
      expect(over, name).toEqual(NARROW_LINES.slice(0, over.length));
      return { name, need: nameNeed(name) + FIT_SLACK_PX, widest: over.length ? over[over.length - 1] : -Infinity };
    });
    const wrong: string[] = [];
    let shown = 0;
    let initials = 0;
    for (const [n, capText] of SHORT) {
      const cap = Number(capText);
      const shortest = SHORTEST.find(([m]) => m === n);
      // A column is at least 156px, 155 inside its edge (hub-grid.css's --hs-col-min).
      for (let w = 155; w <= cap; w += 0.37) {
        if (shortest && w <= Number(shortest[1])) continue; // initials for every client there
        const line = w / n - 15.5;
        const asked = LONG.filter((b) => b.selector.startsWith(S(n)) && w <= b.max).map((b) => Number(/~="(\d+)"/.exec(b.selector)![1]));
        const least = Math.min(...asked);
        for (const { name, need, widest } of names) {
          if (widest >= least) {
            initials += 1;
            if (!(need > line - 2)) wrong.push(`${name} takes initials at ${w.toFixed(2)}px, ${n} lanes: it needs ${need.toFixed(1)} of ${line.toFixed(1)}`);
          } else {
            shown += 1;
            // Each block ends 0.02px under its line's boundary, as the house writes "under" (309.98).
            if (!(need <= line + 0.02)) wrong.push(`${name} shows at ${w.toFixed(2)}px, ${n} lanes: it needs ${need.toFixed(1)} of ${line.toFixed(1)}`);
          }
        }
      }
    }
    expect(wrong.slice(0, 5)).toEqual([]);
    expect(shown).toBeGreaterThan(initials);
    expect(initials).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* 5. Contrast, both modes                                              */
/* ------------------------------------------------------------------ */

const TOKENS = uncomment(readFileSync(join(SRC, "features/equipment/equipment.tokens.css"), "utf8"));

function tokenBlock(selector: string): Record<string, string> {
  const at = TOKENS.indexOf(selector);
  if (at < 0) throw new Error(`token block not found: ${selector.trim()}`);
  const open = TOKENS.indexOf("{", at);
  const out: Record<string, string> = {};
  for (const m of TOKENS.slice(open + 1, TOKENS.indexOf("}", open)).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const LIGHT = tokenBlock("\n:root {");
const THEMES = { light: LIGHT, dark: { ...LIGHT, ...tokenBlock('\n.dark,\n[data-theme="dark"] {') } };
type Theme = keyof typeof THEMES;
type Rgb = [number, number, number];

function colour(theme: Theme, token: string, depth = 0): Rgb {
  const value = THEMES[theme][token];
  if (value === undefined) throw new Error(`${token} is not set in ${theme}`);
  const alias = /^var\((--[\w-]+)\)$/.exec(value);
  if (alias) {
    if (depth > 6) throw new Error(`var() loop at ${token}`);
    return colour(theme, alias[1], depth + 1);
  }
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (!m) throw new Error(`${token} is not an opaque colour: ${value}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

const mixed = (a: Rgb, share: number, b: Rgb): Rgb => [0, 1, 2].map((i) => a[i] * share + b[i] * (1 - share)) as Rgb;
function luminance(c: Rgb): number {
  const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}
function contrast(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const share = (theme: Theme) => Number(/^(\d+)%$/.exec(THEMES[theme]["--eq-done-mix"])![1]) / 100;

describe("the narrow card's symbols and initials read, in both modes (phase 3)", () => {
  const GROUNDS = ["--eq-bg", "--eq-mine"];
  it("each symbol stands 3:1 on its card, on the grid and in your own lane", () => {
    for (const theme of ["light", "dark"] as Theme[]) {
      for (const ground of GROUNDS) {
        const card = colour(theme, "--eq-surface");
        const tile = mixed(card, share(theme), colour(theme, ground));
        const pairs: [string, Rgb, Rgb][] = [
          ["the ring on a card nobody recorded", colour(theme, "--eq-ink"), card],
          ["the ring before the cutover, on the recorded tile", colour(theme, "--eq-ink-muted"), tile],
          ["the pause on a card left open", colour(theme, "--eq-warn"), card],
          ["the cross on a late cancel's tile", colour(theme, "--eq-ink-muted"), tile],
          ["the check on a done tile (the time's ink)", colour(theme, "--eq-ink-muted"), tile],
          ["the triangle at the end of the time line", colour(theme, "--eq-alert"), colour(theme, "--eq-alert-fill")],
        ];
        for (const [what, fg, bg] of pairs) expect(contrast(fg, bg), `${theme} ${ground}: ${what}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("her initials stand 4.5:1 on her card in every state, on the grid and in your own lane", () => {
    for (const theme of ["light", "dark"] as Theme[]) {
      for (const ground of GROUNDS) {
        const card = colour(theme, "--eq-surface");
        const g = colour(theme, ground);
        const pairs: [string, Rgb, Rgb][] = [
          ["coming up, Now", colour(theme, "--eq-ink"), card],
          ["in session", colour(theme, "--eq-ink"), colour(theme, "--eq-live-fill")],
          ["done, a late cancel, before the cutover", colour(theme, "--eq-ink-muted"), mixed(card, share(theme), g)],
          ["not logged, left open", colour(theme, "--eq-ink"), card],
          ["over, nothing to claim (62% card)", colour(theme, "--eq-ink-2"), mixed(card, 0.62, g)],
        ];
        for (const [what, fg, bg] of pairs) expect(contrast(fg, bg), `${theme} ${ground}: ${what}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // Each state's initials take the ink the rule above measures.
    const top = (sel: string) => ALL.find((r) => r.selectors.includes(sel) && r.at.length === 0 && "color" in r.body)?.body.color;
    expect(top(".hs-card-initials")).toBe("var(--eq-ink)");
    expect(top('.hs-card[data-recede="true"] .hs-card-initials')).toBe("var(--eq-ink-2)");
    expect(top('.hs-card[data-kind="client"][data-state="done"] .hs-card-initials')).toBe("var(--eq-ink-muted)");
    expect(top('.hs-card[data-kind="client"][data-state="didnt-come"] .hs-card-initials')).toBe("var(--eq-ink-muted)");
    expect(top('.hs-card[data-kind="client"][data-state="not-logged"] .hs-card-initials')).toBe("var(--eq-ink)");
    expect(top('.hs-card[data-kind="client"][data-state="left-open"] .hs-card-initials')).toBe("var(--eq-ink)");
    expect(top('.hs-scroll[data-logging="not-yet"] .hs-card[data-kind="client"][data-state="not-logged"] .hs-card-initials')).toBe("var(--eq-ink-muted)");
  });

  it("the Key draws each symbol in the card's ink, 3:1 on its sheet", () => {
    const keyInk = (sym: string) => KEY_RULES.find((r) => r.selectors.includes(`.hd-key-sym[data-sym="${sym}"]`))?.body.color;
    expect(keyInk("done")).toBe("var(--eq-ink-muted)");
    expect(keyInk("late-cancel")).toBe("var(--eq-ink-muted)");
    expect(keyInk("not-logged")).toBe("var(--eq-ink)");
    expect(keyInk("left-open")).toBe("var(--eq-warn)");
    for (const theme of ["light", "dark"] as Theme[]) {
      for (const sym of ["done", "late-cancel", "not-logged", "left-open"]) {
        const token = /^var\((--[\w-]+)\)$/.exec(keyInk(sym)!)![1];
        expect(contrast(colour(theme, token), colour(theme, "--eq-popover")), `${theme}: ${sym}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
