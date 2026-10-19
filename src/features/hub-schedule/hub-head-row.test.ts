import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE HUB'S HEAD ROW IS THE CARD (the colour build, Oct 17 2026).
 *
 * The light round's phase 2 and the dark round's D2, as AJ answered them
 * (light 1A 2A 3A, dark 1b): the trainer row, its corner, the column heads
 * and the time column take the card's colour in BOTH modes. As the well
 * (--eq-surface-2) they stood 1.04:1 off the grid in light and 1.07 in dark,
 * a band of fog over the day; as the card they stand 1.13 and 1.16 off it.
 * The plans' first draft gave this its own token (--eq-head-fill); with the
 * card round's answers no dark value differs from the card, so the rules
 * read --eq-surface itself and no new token exists. The shelf and the soft
 * edge under the row stay, and your own head keeps its blue.
 *
 * Pins, from the light plan's phase 2 list where they still apply: the rules
 * read the card, the head row 1.10:1 off the grid and its words at 4.5:1, in
 * both modes (and in the system-dark fallback). Plus: a half hour's ring on
 * the time column stays hollow (its fill is the column's), and your head
 * still stands off a colleague's now that theirs is lighter in dark.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");

/** A stylesheet with its line endings made \n and its comments taken out. */
const stylesheet = (path: string) =>
  readFileSync(join(SRC, path), "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "");

const normalise = (selector: string) => selector.trim().replace(/\s+/g, " ");

interface Rule {
  selectors: string[];
  body: Record<string, string>;
}

/** Every rule in a stylesheet, nested ones included, in source order. */
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const head = m[1].trim();
    if (!head || head.startsWith("@")) continue;
    const body: Record<string, string> = {};
    for (const d of m[2].matchAll(/([\w-]+)\s*:\s*([^;]+);?/g)) body[d[1]] = d[2].trim();
    out.push({ selectors: head.split(",").map(normalise), body });
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

const GRID = stylesheet("features/hub-schedule/hub-grid.css");
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
const THEMES = {
  light: LIGHT,
  dark: { ...LIGHT, ...block('\n.dark,\n[data-theme="dark"] {') },
  "system dark": { ...LIGHT, ...block(':root:not(.light):not([data-theme="light"]) {') },
};
type Theme = keyof typeof THEMES;
const ALL = Object.keys(THEMES) as Theme[];

function value(theme: Theme, token: string, depth = 0): string {
  const v = THEMES[theme][token];
  if (v === undefined) throw new Error(`${token} is not set for ${theme}`);
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  if (!ref) return v;
  if (depth > 8) throw new Error(`var() loop at ${token}`);
  return value(theme, ref[1], depth + 1);
}

function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a flat hex colour: ${hex}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}
const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
const luminance = ([r, g, b]: [number, number, number]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (theme: Theme, a: string, b: string) => {
  const [x, y] = [luminance(rgb(value(theme, a))), luminance(rgb(value(theme, b)))];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** The four parts of the head row and the time column, and what each is. */
const HEAD_ROW: [string, string][] = [
  [".hs-head", "the trainer row"],
  [".hs-corner", "its corner over the time column"],
  [".hs-colhead", "a colleague's column head"],
  [".hs-axis", "the time column"],
];

describe("the Hub's head row is the card", () => {
  it.each(HEAD_ROW)("%s (%s) is the card colour in both modes", (selector) => {
    expect(declared(GRID, selector).background).toBe("var(--eq-surface)");
  });

  it("has no dark rule of its own, so both modes take the card", () => {
    const parts = HEAD_ROW.map(([s]) => s);
    const darkRules = rules(GRID).filter((r) =>
      r.selectors.some((s) => /\.dark|data-theme/.test(s) && parts.some((p) => s.includes(p))),
    );
    expect(darkRules).toEqual([]);
  });

  it("keeps the shelf and the soft edge under the trainer row", () => {
    const head = declared(GRID, ".hs-head");
    expect(head["box-shadow"]).toBe("var(--eq-shelf)");
    expect(head["border-bottom"]).toBe("1px solid var(--eq-edge)");
  });

  it("keeps your own head blue, with the blue rule under your name", () => {
    const mine = declared(GRID, '.hs-colhead[data-me="true"]');
    expect(mine.background).toBe("var(--eq-mine-head)");
    expect(mine["box-shadow"]).toBe("inset 0 -3px 0 var(--eq-live)");
  });

  it("keeps a half hour's ring hollow: its fill is the time column's", () => {
    expect(declared(GRID, ".hs-dot").background).toBe(declared(GRID, ".hs-axis").background);
  });
});

describe("the head row on the grid", () => {
  it.each(ALL)("stands at least 1.10:1 off the grid in %s (as the well it was 1.04 light, 1.07 dark)", (theme) => {
    expect(contrast(theme, "--eq-surface", "--eq-bg")).toBeGreaterThanOrEqual(1.1);
  });

  it.each(ALL)("carries its words at 4.5:1 in %s: names, the hours, the counts and the half hours", (theme) => {
    for (const ink of ["--eq-ink", "--eq-ink-2", "--eq-ink-muted"]) {
      expect({ theme, ink, pass: contrast(theme, ink, "--eq-surface") >= 4.5 }).toEqual({ theme, ink, pass: true });
    }
  });

  it.each(ALL)("still sets your head apart from a colleague's by at least 1.15:1 in %s", (theme) => {
    expect(contrast(theme, "--eq-mine-head", "--eq-surface")).toBeGreaterThanOrEqual(1.15);
  });
});
