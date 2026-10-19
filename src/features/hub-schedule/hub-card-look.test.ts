import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * NOW, NEXT, DONE: HOW A HUB CARD SAYS WHAT HAPPENED (the cards round,
 * Oct 17 2026; AJ's 1A 2A 3A, with the light round's calmer Hub, A1-A4,
 * and the dark round's rim, D5).
 *
 * AJ: a past session "a little bit more out of the way ... apparent that
 * like hey this session was passed and recorded", and one passed and not
 * recorded easy to tell: "oh hey what happened here". The pins the cards
 * plan's C6 names that hub-colour-rules.test.ts and hub-depth.test.ts do
 * not already hold:
 *
 *   1. Every card is drawn one way: no border, a 1px outline, and its state
 *      a straight 3px band painted as a background (--hs-mark / --hn-mark),
 *      never a border, so nothing tapers round a corner.
 *   2. A rule that changes the outline on a state is written
 *      :not(:focus-visible), so a focused card keeps its 3px ring wherever
 *      the rule sits in the file (the dark round's D5 pin).
 *   3. Now: the orange mark steps aside for an open card (picked is blue),
 *      and the word "Now" is real text in the deep orange, never CSS.
 *   4. Before the studio's cutover, Not logged lies down with the recorded
 *      past and KEEPS its words: nothing under data-logging="not-yet" hides
 *      or writes a word.
 *   5. What is over steps back and still reads as a card: in light a
 *      recorded tile stands at least 1.03:1 off the page, in both modes it
 *      sits between the page and the card and keeps its quiet edge; a card
 *      still to come stands at least 1.05:1 off the page.
 *   6. Lighter Hub type (A4): names 600, figures 700, nothing on the Hub's
 *      four stylesheets at 800.
 *
 * Read from source, comments removed. If one of these fails, the fix is the
 * stylesheet, not the test.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");

/** A file with its line endings made \n, and for a stylesheet its comments taken out. */
const read = (path: string) => readFileSync(join(SRC, path), "utf8").replace(/\r\n/g, "\n");
const stylesheet = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "");

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

/** The declarations every rule naming `selector` adds up to (a later one wins). */
function declared(css: string, selector: string): Record<string, string> {
  const want = normalise(selector);
  const found = rules(css).filter((r) => r.selectors.includes(want));
  if (found.length === 0) throw new Error(`no rule for ${selector}`);
  return Object.assign({}, ...found.map((r) => r.body));
}

const FILES = {
  card: "features/hub-schedule/hub-card.css",
  strip: "features/hub-schedule/next-strip.css",
  grid: "features/hub-schedule/hub-grid.css",
  top: "features/hub-schedule/day-header.css",
} as const;
const CARD = stylesheet(FILES.card);
const STRIP = stylesheet(FILES.strip);

/* ---------------------------------------------------------------------------
   Tokens and colour maths
   --------------------------------------------------------------------------- */

const TOKENS = stylesheet("features/equipment/equipment.tokens.css");

function block(selector: string): Record<string, string> {
  const at = TOKENS.indexOf(selector);
  if (at < 0) throw new Error(`token block not found: ${selector.trim()}`);
  const open = TOKENS.indexOf("{", at);
  const out: Record<string, string> = {};
  for (const m of TOKENS.slice(open + 1, TOKENS.indexOf("}", open)).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const LIGHT = block("\n:root {");
const THEMES = { light: LIGHT, dark: { ...LIGHT, ...block('\n.dark,\n[data-theme="dark"] {') } };
type Theme = keyof typeof THEMES;
const BOTH: Theme[] = ["light", "dark"];

type Rgba = [number, number, number, number];

/** A token's colour in a theme, its var() aliases followed: #rrggbb or rgba(). */
function colour(theme: Theme, token: string, depth = 0): Rgba {
  const value = THEMES[theme][token];
  if (value === undefined) throw new Error(`${token} is not set in ${theme}`);
  const alias = /^var\((--[\w-]+)\)$/.exec(value);
  if (alias) {
    if (depth > 6) throw new Error(`var() loop at ${token}`);
    return colour(theme, alias[1], depth + 1);
  }
  let m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16), 1];
  m = /^rgba\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\)$/.exec(value);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  throw new Error(`${token} is not a colour: ${value}`);
}

/** `fg` painted over an opaque `bg`. */
const over = (fg: Rgba, bg: Rgba): Rgba => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1) as Rgba;
/** color-mix(in srgb, a share, b), each channel mixed as stored. */
const mixed = (a: Rgba, share: number, b: Rgba): Rgba => [0, 1, 2].map((i) => a[i] * share + b[i] * (1 - share)).concat(1) as Rgba;

function luminance(c: Rgba): number {
  const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

function contrast(a: Rgba, b: Rgba): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const RECORDED = ["done", "didnt-come"].map((s) => `.hs-card[data-kind="client"][data-state="${s}"]`);
const NOT_RECORDED = ["not-logged", "left-open"].map((s) => `.hs-card[data-kind="client"][data-state="${s}"]`);
const PAST = '.hs-card[data-recede="true"]';
const PRE_CUTOVER = ['.hs-scroll[data-logging="not-yet"]', '.ph-day[data-logging="not-yet"]'].map(
  (scope) => `${scope} .hs-card[data-kind="client"][data-state="not-logged"]`,
);

/* ------------------------------------------------------------------ */
/* 1. Drawn one way                                                     */
/* ------------------------------------------------------------------ */

describe("a Hub card and a Next 30 minutes item are drawn one way", () => {
  it.each([
    [".hs-card", CARD, "--hs-mark"],
    [".hn-item", STRIP, "--hn-mark"],
  ])("%s: no border, a 1px outline in the card edge, its state a straight 3px band painted from its mark", (base, css, mark) => {
    const box = declared(css, base);
    expect(box.border).toBe("0");
    expect(box.outline).toBe("1px solid var(--eq-card-edge)");
    const band = declared(css, `${base}::before`);
    expect(band.content).toBe('""');
    expect(band.position).toBe("absolute");
    expect(band.width).toBe("3px");
    expect(band.background).toBe(`var(${mark})`);
    expect(band["border-radius"], "square-ended").toBeUndefined();
  });

  it.each([
    [FILES.card, CARD, "--hs-mark"],
    [FILES.strip, STRIP, "--hn-mark"],
  ])("%s draws no rail: no rule sets a left border, and every state colours the mark, not an edge", (_file, css, mark) => {
    for (const r of rules(css)) {
      for (const prop of ["border-left", "border-left-width", "border-left-color", "border-left-style"]) {
        expect(r.body[prop], `${r.selectors.join(", ")} ${prop}`).toBeUndefined();
      }
    }
    expect(rules(css).filter((r) => r.body[mark] !== undefined).length).toBeGreaterThan(3);
  });

  it("takes the mark off a card that is over, and keeps it only on a card nobody recorded", () => {
    for (const sel of [PAST, ...RECORDED, ...PRE_CUTOVER]) expect(declared(CARD, sel)["--hs-mark"], sel).toBe("transparent");
    for (const sel of NOT_RECORDED) expect(declared(CARD, sel)["--hs-mark"], sel).toBe("var(--eq-unlogged-mark)");
  });
});

/* ------------------------------------------------------------------ */
/* 2. The focus ring wins                                               */
/* ------------------------------------------------------------------ */

describe("a focused card keeps its 3px ring (the dark round's D5)", () => {
  const OUTLINE = /^outline(?:-color|-width|-style)?$/;

  it.each([
    [FILES.card, CARD, ".hs-card"],
    [FILES.strip, STRIP, ".hn-item"],
  ])("%s: every rule that changes a card's outline on a state is written :not(:focus-visible)", (_file, css, base) => {
    const stateRules = rules(css).filter(
      (r) => Object.keys(r.body).some((p) => OUTLINE.test(p)) && !r.selectors.every((s) => s === base || s === `${base}:focus-visible`),
    );
    expect(stateRules.length).toBeGreaterThan(1);
    for (const r of stateRules) {
      for (const s of r.selectors) expect(s, "an outline rule on a state").toContain(":not(:focus-visible)");
    }
    const ring = declared(css, `${base}:focus-visible`);
    expect(ring.outline).toBe("3px solid var(--eq-focus-ring)");
  });

  it("gives every card that is over, or is not a client's, the quiet edge, and a card nobody recorded the full one", () => {
    for (const sel of [PAST, '.hs-card[data-kind="pending"]', '.hs-card[data-kind="unknown"]', '.hs-card[data-kind="staff"]']) {
      expect(declared(CARD, `${sel}:not(:focus-visible)`)["outline-color"], sel).toBe("var(--eq-card-edge-quiet)");
    }
    for (const sel of NOT_RECORDED) expect(declared(CARD, `${sel}:not(:focus-visible)`)["outline-color"], sel).toBe("var(--eq-card-edge)");
    expect(declared(CARD, '.hs-card[data-kind="unlinked"]:not(:focus-visible)').outline).toBe("0");
    expect(declared(STRIP, '.hn-item[data-kind="unlinked"]:not(:focus-visible)').outline).toBe("0");
  });
});

/* ------------------------------------------------------------------ */
/* 3. Now                                                               */
/* ------------------------------------------------------------------ */

describe("Now: the orange mark and the word", () => {
  it("guards the orange mark with :not([data-open=\"true\"]) on the card and on the strip, so an open one keeps the blue", () => {
    const readers = (css: string) => rules(css).filter((r) => Object.values(r.body).some((v) => v.includes("--eq-now-mark")));
    for (const [css, sel, mark] of [
      [CARD, '.hs-card[data-kind="client"][data-state="live"][data-now="true"]:not([data-open="true"])', "--hs-mark"],
      [STRIP, '.hn-item[data-when="now"]:not([data-kind="unlinked"]):not([data-open="true"])', "--hn-mark"],
    ] as const) {
      expect(declared(css, sel)[mark]).toBe("var(--eq-now-mark)");
      const found = readers(css);
      expect(found.length).toBe(1);
      for (const s of found[0].selectors) expect(s).toContain(':not([data-open="true"])');
    }
    expect(declared(CARD, '.hs-card[data-open="true"]')["--hs-mark"]).toBe("var(--eq-live)");
    expect(declared(STRIP, '.hn-item[data-open="true"]')["--hn-mark"]).toBe("var(--eq-live)");
  });

  it("colours only the word, in the deep orange of words, and writes it as text, never CSS", () => {
    expect(declared(CARD, ".hs-card-when .hs-card-now").color).toBe("var(--eq-now-text)");
    expect(declared(STRIP, ".hn-when .hn-now").color).toBe("var(--eq-now-text)");
    expect(read("features/hub-schedule/HubCard.tsx")).toContain('<strong className="hs-card-now">Now</strong>');
    expect(read("features/hub-schedule/NextStrip.tsx")).toContain('<span className="hn-now">Now</span>');
    for (const css of [CARD, STRIP]) {
      for (const r of rules(css)) {
        if (r.body.content === undefined) continue;
        // The one exception, a time and never a word (the narrow cards round, phase 3): a card sharing its
        // slot shows a span without its AM or PM from HubCard's own data-time, so the full card's text stays
        // the nodes it was; the part is aria-hidden and the card's label says the whole time.
        if (css === CARD && r.selectors.join(", ") === ".hs-card-clock-short::before") {
          expect(r.body.content).toBe("attr(data-time)");
          continue;
        }
        expect(r.body.content, r.selectors.join(", ")).toMatch(/^(""|none)$/);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* 4. Before the cutover                                                */
/* ------------------------------------------------------------------ */

describe("before the studio's Journey cutover", () => {
  it("lays Not logged down with the recorded past, on the grid and the phone's list: the tile, the quiet edge, the muted words", () => {
    for (const sel of PRE_CUTOVER) {
      expect(declared(CARD, sel).background).toBe("color-mix(in srgb, var(--eq-surface) var(--eq-done-mix), var(--hs-ground, var(--eq-bg)))");
      expect(declared(CARD, sel)["background-clip"]).toBe("padding-box");
      expect(declared(CARD, `${sel}:not(:focus-visible):not([data-open="true"])`)["outline-color"]).toBe("var(--eq-card-edge-quiet)");
      for (const part of [".hs-card-name", ".hs-card-when strong"]) expect(declared(CARD, `${sel} ${part}`).color, part).toBe("var(--eq-ink-muted)");
    }
  });

  it("keeps the words: nothing under data-logging=\"not-yet\" hides or writes one, and only Not logged steps back (never Left open)", () => {
    const gated = rules(CARD).filter((r) => r.selectors.some((s) => s.includes('[data-logging="not-yet"]')));
    expect(gated.length).toBeGreaterThan(2);
    for (const r of gated) {
      for (const prop of ["display", "visibility", "content", "opacity", "font-size"]) expect(r.body[prop], `${r.selectors.join(", ")} ${prop}`).toBeUndefined();
      for (const s of r.selectors) {
        expect(s).toContain('[data-state="not-logged"]');
        expect(s).not.toContain("left-open");
      }
    }
    // HubCard says "Not logged" on every linked not-logged card; the gate only recolours it.
    expect(read("features/hub-schedule/HubCard.tsx")).toMatch(/\{isNotLogged && \([\s\S]*?Not logged[\s\S]*?\)\}/);
  });
});

/* ------------------------------------------------------------------ */
/* 5. Over, and still a card                                            */
/* ------------------------------------------------------------------ */

describe("what is over steps back and still reads as a card", () => {
  /** A rule's color-mix share of the card, as drawn in `theme`. */
  function share(sel: string, theme: Theme): number {
    const m = /^color-mix\(in srgb, var\(--eq-surface\) (var\(--eq-done-mix\)|\d+%), var\(--hs-ground, var\(--eq-bg\)\)\)$/.exec(declared(CARD, sel).background ?? "");
    expect(m, sel).not.toBeNull();
    return Number((m![1] === "var(--eq-done-mix)" ? THEMES[theme]["--eq-done-mix"] : m![1]).replace("%", "")) / 100;
  }

  it("stands a recorded tile at least 1.03:1 off the page in light, over the grid and your lane", () => {
    for (const ground of ["--eq-bg", "--eq-mine"]) {
      const page = colour("light", ground);
      const tile = mixed(colour("light", "--eq-surface"), share(RECORDED[0], "light"), page);
      expect(contrast(tile, page), ground).toBeGreaterThanOrEqual(1.03);
    }
  });

  it("puts a recorded tile between the page and the card in both modes, with its quiet edge drawn at least 1.10:1 off the page", () => {
    for (const theme of BOTH) {
      for (const ground of ["--eq-bg", "--eq-mine"]) {
        const page = colour(theme, ground);
        const card = colour(theme, "--eq-surface");
        const tile = mixed(card, share(RECORDED[0], theme), page);
        const [lp, lt, lc] = [luminance(page), luminance(tile), luminance(card)];
        expect({ theme, ground, between: (lt - lp) * (lc - lt) > 0 }).toEqual({ theme, ground, between: true });
        const quiet = colour(theme, "--eq-card-edge-quiet");
        expect(quiet[3], `${theme}: the quiet edge is drawn`).toBeGreaterThan(0);
        expect(contrast(over(quiet, page), page), `${theme} ${ground}: the quiet edge`).toBeGreaterThanOrEqual(1.1);
      }
    }
  });

  it("draws Not logged as the card, a past card as A2's flat fill, and a card still to come at least 1.05:1 off the page", () => {
    for (const sel of NOT_RECORDED) expect(declared(CARD, sel).background, sel).toBe("var(--eq-surface)");
    for (const theme of BOTH) {
      expect(share(PAST, theme)).toBeCloseTo(0.62, 5);
      for (const ground of ["--eq-bg", "--eq-mine"]) {
        expect(contrast(colour(theme, "--eq-surface"), colour(theme, ground)), `${theme} ${ground}`).toBeGreaterThanOrEqual(1.05);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* 6. Lighter Hub type                                                  */
/* ------------------------------------------------------------------ */

describe("lighter Hub type (the light round's A4, both modes)", () => {
  it("sets nothing on the Hub's four stylesheets at 800", () => {
    for (const file of Object.values(FILES)) {
      const heavy = rules(stylesheet(file))
        .filter((r) => r.body["font-weight"] === "800")
        .map((r) => r.selectors.join(", "));
      expect({ file, heavy }).toEqual({ file, heavy: [] });
    }
  });

  it("sets a name at 600 and a figure at 700, the in-session time included", () => {
    expect(declared(CARD, ".hs-card-name")["font-weight"]).toBe("600");
    expect(declared(STRIP, ".hn-name")["font-weight"]).toBe("600");
    expect(declared(CARD, ".hs-card-when strong")["font-weight"]).toBe("700");
    expect(declared(CARD, '.hs-card[data-state="in-session"] .hs-card-when')["font-weight"]).toBe("700");
    expect(declared(STRIP, ".hn-when")["font-weight"]).toBe("700");
    expect(declared(CARD, ".hs-g")["font-weight"]).toBe("700");
  });
});
