import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE QUIET REPEATED BLUE (the dark round's Q2, AJ "2a", Oct 17 2026: yes,
 * in both modes).
 *
 * When the same blue button repeats down a list, each one is the quiet blue,
 * not a column of solid lamps: blue words on the blue tint, a firm blue
 * edge, the lift and the press kept. It still follows the Navy Frame's
 * "every Save and selection is blue": they stay blue, only quieter. Three
 * places take it:
 *
 *   - each row's own blue button on Operations → Today and its Review notes
 *     (Acknowledge, Seen, Got it, Still matters), overview.css; the one
 *     "Acknowledge all" sits in the section's door, not a row, and stays
 *     solid, as does every .adm-btn--primary outside a row;
 *   - the floor's two switches, Map | Tiles on Relay (relay.css) and
 *     Look up | Cleaning on the map (studio-map.css): the picked segment is
 *     the tint inside a blue ring, and the map's Mark all wiped stays solid
 *     (studio-map/look.test.ts holds the map's half by name).
 *
 * Every pair the look leans on is measured on the real token files, in both
 * modes. If one fails, the fix is the stylesheet or the token, not the test.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
/** A file with its line endings made \n. */
const read = (rel: string) => readFileSync(join(HERE, rel), "utf8").replace(/\r\n/g, "\n");
const uncommented = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

type Rule = { selectors: string[]; body: string };
const rulesOf = (css: string): Rule[] =>
  [...uncommented(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => !m[1].trim().startsWith("@"))
    .map((m) => ({ selectors: m[1].split(",").map((s) => s.trim()), body: m[2] }));
const declared = (body: string, prop: string) =>
  [...body.matchAll(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`, "g"))].map((m) => m[1].trim());
/** The rules whose selector list is exactly `selectors`, in source order. */
const exactly = (rules: Rule[], ...selectors: string[]) =>
  rules.filter((r) => r.selectors.length === selectors.length && selectors.every((s, i) => r.selectors[i] === s));
const one = (rules: Rule[], prop: string, ...selectors: string[]) => exactly(rules, ...selectors).flatMap((r) => declared(r.body, prop));

/** Classes, attributes and pseudo-classes, a :not() counted by its argument (enough for these selectors). */
function specificity(selector: string): number {
  const classes = selector.match(/\.[\w-]+/g)?.length ?? 0;
  const attributes = selector.match(/\[[^\]]+\]/g)?.length ?? 0;
  const pseudo = (selector.match(/:(?!:)[\w-]+/g) ?? []).filter((p) => p !== ":not").length;
  return classes + attributes + pseudo;
}

const OVERVIEW = rulesOf(read("features/admin/overview/overview.css"));
const ADMIN = rulesOf(read("features/admin/admin.css"));
const RELAY = rulesOf(read("features/relay/board/relay.css"));
const MAP = rulesOf(read("features/studio-map/studio-map.css"));

const ROW = ".adm-ov__row-actions .adm-btn--primary";
const ROW_HOVER = ".adm-ov__row-actions .adm-btn--primary:not(:disabled):hover";

describe("Operations: a row's own blue button is the quiet blue", () => {
  it("is the tint with blue words and a blue edge, restated under a pointer", () => {
    expect(one(OVERVIEW, "background", ROW, ROW_HOVER)).toEqual(["var(--adm-live-fill)"]);
    expect(one(OVERVIEW, "color", ROW, ROW_HOVER)).toEqual(["var(--adm-live-text)"]);
    expect(one(OVERVIEW, "border-color", ROW, ROW_HOVER)).toEqual(["var(--adm-live)"]);
  });

  it("keeps the raised lift, lies flat when it can't be pressed, and the press still wins", () => {
    expect(one(OVERVIEW, "box-shadow", ROW)).toEqual(["var(--adm-elev-1), inset 0 1px 0 var(--adm-highlight)"]);
    expect(one(OVERVIEW, "box-shadow", `${ROW}:disabled`)).toEqual(["none"]);
    // The press is every .adm-btn's: a pixel down into an inset. The lift is set apart from the
    // hover so a lower selector carries it, and the press outranks it wherever the files land.
    const press = ".adm-btn:not(:disabled):active";
    expect(one(ADMIN, "box-shadow", press)).toEqual(["var(--adm-press)"]);
    expect(one(ADMIN, "transform", press)).toEqual(["translateY(1px)"]);
    expect(specificity(ROW)).toBeLessThan(specificity(press));
    expect(one(OVERVIEW, "box-shadow", ROW, ROW_HOVER)).toEqual([]);
  });

  it("leaves every other blue button solid: the quiet rule is a row's alone", () => {
    const quieting = OVERVIEW.filter((r) => r.selectors.some((s) => s.includes("adm-btn--primary")));
    expect(quieting.length).toBeGreaterThan(0);
    for (const r of quieting) for (const s of r.selectors) expect(s).toMatch(/^\.adm-ov__row-actions \.adm-btn--primary\b/);
    // The one "Acknowledge all" (TodayBrief's Needs you door) is the solid blue with its on-colour.
    expect(one(ADMIN, "background", ".adm-btn--primary")).toEqual(["var(--adm-live)"]);
    expect(one(ADMIN, "color", ".adm-btn--primary")).toEqual(["var(--adm-live-on)"]);
  });
});

describe("the floor's two switches: the picked segment is the quiet blue", () => {
  it.each([
    ["Relay's Map | Tiles", RELAY, '.fm__view[aria-pressed="true"]', ".fm__views", "st"],
    ["the map's Look up | Cleaning", MAP, '.smap-mode__btn[aria-pressed="true"]', ".smap-mode", "eq"],
  ])("%s: the tint, blue words, a blue ring, inside the switch's 3:1 edge", (_where, rules, picked, group, p) => {
    expect(one(rules, "background", picked)).toEqual([`var(--${p}-live-fill)`]);
    expect(one(rules, "color", picked)).toEqual([`var(--${p}-live-text)`]);
    expect(one(rules, "box-shadow", picked)).toEqual([`inset 0 0 0 1px var(--${p}-live)`]);
    expect(one(rules, "border", group)).toEqual([`1px solid var(--${p}-border-strong)`]);
  });
});

/* ---------------------------------------------------------------------------
   The pairs, measured on the token files in both modes
   --------------------------------------------------------------------------- */

function declarations(css: string, opener: string): Record<string, string> {
  const at = css.indexOf(opener);
  if (at < 0) throw new Error(`block not found: ${JSON.stringify(opener)}`);
  const open = css.indexOf("{", at);
  const body = uncommented(css.slice(open + 1, css.indexOf("\n}", open)));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const PALETTES: Record<string, [file: string, dark: string]> = {
  adm: ["features/admin/admin.tokens.css", '\n.dark,\n[data-theme="dark"] {'],
  st: ["features/studio-tasks/studio-tasks.tokens.css", '\n.dark, [data-theme="dark"] {'],
  eq: ["features/equipment/equipment.tokens.css", '\n.dark,\n[data-theme="dark"] {'],
};

function colour(p: string, theme: "light" | "dark", name: string): string {
  const [file, dark] = PALETTES[p];
  const css = read(file);
  const light = declarations(css, "\n:root {");
  const vars = theme === "light" ? light : { ...light, ...declarations(css, dark) };
  const v = vars[`--${p}-${name}`];
  if (!v || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`--${p}-${name} in ${theme} is not a hex: ${v}`);
  return v;
}

const channel = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => channel(c / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a: string, b: string) => {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** WCAG 2.1: 4.5:1 for words, 3:1 for a control's edge. */
const TEXT = 4.5;
const UI = 3;

describe.each(["light", "dark"] as const)("the quiet blue reads, %s mode", (theme) => {
  // [palette, what it sits on, where]
  it.each([
    ["adm", "surface", "a row's button on Operations' card"],
    ["st", "tray", "Relay's picked Map | Tiles, in its switch's tray"],
    ["eq", "tray", "the map's picked Look up | Cleaning, in its switch's tray"],
  ])("--%s: words 4.5:1 on the tint, the edge 3:1 on the tint and on the %s (%s)", (p, ground) => {
    const fill = colour(p, theme, "live-fill");
    const edge = colour(p, theme, "live");
    expect(ratio(colour(p, theme, "live-text"), fill)).toBeGreaterThanOrEqual(TEXT);
    expect(ratio(edge, fill)).toBeGreaterThanOrEqual(UI);
    expect(ratio(edge, colour(p, theme, ground))).toBeGreaterThanOrEqual(UI);
  });
});
