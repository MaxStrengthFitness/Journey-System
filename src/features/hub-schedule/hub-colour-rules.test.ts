import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE HUB'S COLOUR RULES (the Navy Frame, Oct 4 2026).
 *
 * equipment-tokens.test.ts measures the palette's pairs; this holds the RULES
 * that draw them, so a later edit can't quietly put a pair back that no
 * longer passes. AJ asked for the logo's blue and orange as the accents, and
 * answered "your pick" to the three questions (2A: a coming-up card gets a
 * quiet blue edge). What the rules promise:
 *
 *   - orange is now and go: today's ring and numeral, and ONE orange at the
 *     now marker (the line, the rail's dot and the pill, with navy words);
 *   - blue is yours and picked: the picked day, your column, its head and
 *     the blue rule under your name; colleagues' circles are quiet;
 *   - every morning today IS the picked day, so its orange underline is drawn
 *     OUTSIDE the blue chip, where it measures 3:1 (inside, hue alone);
 *   - a coming-up client card has the quiet blue mark, by attributes HubCard
 *     always sets (a rule keyed on a missing attribute matches nothing);
 *   - Start session and every orange chip with words are the logo orange with
 *     navy words, the fill restated on :hover (an iPad keeps hover after a
 *     tap), and nothing on these screens reads a white "hero-on" word colour;
 *   - words are never in the faint ink, and a card that is over still reads:
 *     since the cards round (Oct 17 2026; AJ's 1A 2A 3A) a recorded card is
 *     a pale tile with muted words, a card nobody recorded a whole card
 *     with a plum mark, and a past card the light round's flat fill.
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
  at: number;
}

/** Every rule in a stylesheet, nested ones included, in source order. */
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const head = m[1].trim();
    if (!head || head.startsWith("@")) continue;
    const body: Record<string, string> = {};
    for (const d of m[2].matchAll(/([\w-]+)\s*:\s*([^;]+);?/g)) body[d[1]] = d[2].trim();
    out.push({ selectors: head.split(",").map(normalise), body, at: m.index ?? 0 });
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

/** Where the first rule naming `selector` starts. */
function position(css: string, selector: string): number {
  const want = normalise(selector);
  const rule = rules(css).find((r) => r.selectors.includes(want));
  if (!rule) throw new Error(`no rule for ${selector}`);
  return rule.at;
}

const GRID = stylesheet("features/hub-schedule/hub-grid.css");
const TOP = stylesheet("features/hub-schedule/day-header.css");
const CARD = stylesheet("features/hub-schedule/hub-card.css");

describe("the now marker", () => {
  it("is one orange: the line, the rail's dot and the pill", () => {
    expect(declared(GRID, ".hs-now")["border-top"]).toContain("var(--eq-hero)");
    expect(declared(GRID, ".hs-rail-now").background).toBe("var(--eq-hero)");
    expect(declared(GRID, ".hs-now-pill").background).toBe("var(--eq-hero)");
  });

  it("carries navy words on its pill, never white", () => {
    expect(declared(GRID, ".hs-now-pill").color).toBe("var(--eq-go-on)");
  });
});

describe("the week", () => {
  it("rings today in orange, with its numeral in the deep orange", () => {
    expect(declared(TOP, '.hd-day[data-today="true"]')["border-color"]).toBe("var(--eq-hero)");
    expect(declared(TOP, '.hd-day[data-today="true"] .hd-day-name strong').color).toBe("var(--eq-hero-text)");
  });

  it("fills the picked day in blue", () => {
    const picked = declared(TOP, '.hd-day[aria-selected="true"]');
    expect(picked.background).toBe("var(--eq-live)");
    expect(picked.color).toBe("var(--eq-live-on)");
  });

  it("underlines today in orange OUTSIDE the blue chip when today is the picked day, 2px since the light round's A3", () => {
    const both = declared(TOP, '.hd-day[data-today="true"][aria-selected="true"]');
    expect(both["border-color"]).toBe("var(--eq-live)");
    expect(both["box-shadow"]).toMatch(/^0 2px 0 var\(--eq-hero\)$/);
    expect(both["box-shadow"]).not.toMatch(/inset/);
    expect(declared(TOP, '.hd-day[data-today="true"][aria-selected="true"] .hd-day-name strong').color).toBe("var(--eq-live-on)");
  });

  it("raises the layer you're on as a chip on the bar, not a tint alone", () => {
    // Moved on purpose (type and depth, phase 11): the chip is RAISED out of
    // the bar's well now, the raised fill a hair lighter than the card and
    // the control's lift (it was the card's fill and a 1px shadow).
    const on = declared(TOP, '.hd-bar .hl-btn[aria-pressed="true"]');
    expect(on.background).toBe("var(--eq-raised)");
    expect(on["box-shadow"]).toContain("var(--eq-elev-1)");
  });
});

describe("your column", () => {
  it("has a blue cast, opaque because it is sticky", () => {
    expect(declared(GRID, '.hs-col[data-me="true"]').background).toBe("var(--eq-mine)");
  });

  it("has a blue head with a 3px blue rule under your name", () => {
    const head = declared(GRID, '.hs-colhead[data-me="true"]');
    expect(head.background).toBe("var(--eq-mine-head)");
    expect(head["box-shadow"]).toBe("inset 0 -3px 0 var(--eq-live)");
  });

  it("keeps the only solid blue disc; colleagues' circles are quiet", () => {
    expect(declared(GRID, '.hs-colhead[data-me="true"] .hs-avatar').background).toBe("var(--eq-live)");
    const theirs = declared(GRID, ".hs-avatar");
    expect(theirs.background).toBe("var(--eq-surface-3)");
    expect(theirs.color).toBe("var(--eq-ink)");
  });

  it("sets the YOU tag on a card-coloured chip so it stands off the head", () => {
    expect(declared(GRID, '.hs-colhead[data-me="true"] .hs-you').background).toBe("var(--eq-surface)");
  });
});

describe("a coming-up client card (AJ's answer 2A)", () => {
  const COMING_UP = '.hs-card[data-kind="client"][data-state="live"]';

  // Since the cards round (Oct 17 2026) a card's state is its mark, a 3px
  // band inside the left edge painted from --hs-mark (--hn-mark on the
  // strip), not its left border: the same colours, one property over.
  it("has the quiet blue mark", () => {
    expect(declared(CARD, COMING_UP)["--hs-mark"]).toBe("var(--eq-rail-booked)");
  });

  it("is keyed on attributes HubCard always sets, never on a missing one", () => {
    const card = readFileSync(join(HERE, "HubCard.tsx"), "utf8");
    expect(card).toContain("data-kind={kind}");
    expect(card).toContain("data-state={cardState}");
    expect(CARD).not.toMatch(/\.hs-card[^{,]*:not\(\[data-(state|kind|recede)\]\)/);
  });

  it("comes before in session, which keeps the full blue mark and its fill", () => {
    expect(position(CARD, COMING_UP)).toBeLessThan(position(CARD, '.hs-card[data-state="in-session"]'));
    const live = declared(CARD, '.hs-card[data-state="in-session"]');
    expect(live["--hs-mark"]).toBe("var(--eq-live)");
    expect(live.background).toBe("var(--eq-live-fill)");
  });

  it("turns blue while its peek is open: the blue mark and the blue ring", () => {
    const open = declared(CARD, `${COMING_UP}[data-open="true"]`);
    expect(open["--hs-mark"]).toBe("var(--eq-live)");
    expect(open["box-shadow"]).toBe("0 0 0 2px var(--eq-live), var(--eq-elev-3)");
  });

  it("is drawn the same way in the Key", () => {
    expect(declared(TOP, '.hd-swatch[data-state="live"]')["border-left"]).toContain("var(--eq-rail-booked)");
  });

  it("is drawn the same way on the Next 30 minutes strip, and an open or unlinked item there still wins", () => {
    const STRIP = stylesheet("features/hub-schedule/next-strip.css");
    const SOON = '.hn-item[data-when="soon"]';
    expect(declared(STRIP, SOON)["--hn-mark"]).toBe("var(--eq-rail-booked)");
    // Same specificity, so the later rule wins: unlinked has no mark, as on
    // the grid, and an open item takes the blue mark.
    expect(declared(STRIP, '.hn-item[data-kind="unlinked"]::before').content).toBe("none");
    expect(declared(CARD, '.hs-card[data-kind="unlinked"]::before').content).toBe("none");
    expect(declared(STRIP, '.hn-item[data-open="true"]')["--hn-mark"]).toBe("var(--eq-live)");
    expect(position(STRIP, SOON)).toBeLessThan(position(STRIP, '.hn-item[data-kind="unlinked"]'));
    expect(position(STRIP, SOON)).toBeLessThan(position(STRIP, '.hn-item[data-open="true"]'));
  });
});

/** Start session and the orange chips with words: [stylesheet, selector, its :hover (buttons only), the palette]. */
const GO: Array<[string, string, string | null, string]> = [
  ["features/hub-schedule/peek.css", '.hp-btn[data-primary="true"]', '.hp-btn[data-primary="true"]:hover', "eq"],
  ["features/hub-opportunities/run-sheet.css", '.ho-action[data-primary="true"]', '.ho-action[data-primary="true"]:hover', "eq"],
  ["features/client-directory/client-directory.css", ".cd-start", ".cd-start:hover", "eq"],
  ["features/admin/admin.css", ".adm-btn--hero", ".adm-btn--hero:not(:disabled):hover", "adm"],
  ["features/machine-fit/ui/machine-fit.css", ".fit-btn--hero", ".fit-btn--hero:hover", "eq"],
  // The machine card's Save and Add note are the solid blue since Oct 10 2026 (buttons-depth.test.ts, SOLID).
  ["features/routines/routines.css", ".rt-btn--hero", ".rt-btn--hero:hover", "eq"],
  ["features/routines/routines.css", ".rt-routine--today .rt-badge", null, "eq"],
  ["features/routines/routines.css", ".rt-today", null, "eq"],
];

describe("the one loud action and every orange chip with words", () => {
  for (const [file, selector, hover, palette] of GO) {
    it(`${selector} is the logo orange with navy words`, () => {
      const css = stylesheet(file);
      const rule = declared(css, selector);
      expect(rule.background).toBe(`var(--${palette}-go)`);
      expect(rule.color).toBe(`var(--${palette}-go-on)`);
      if (hover) {
        const kept = declared(css, hover);
        expect(kept.background).toBe(`var(--${palette}-go)`);
        expect(kept.color).toBe(`var(--${palette}-go-on)`);
        expect(kept.filter).toBeUndefined();
      }
    });
  }

  it("leaves no white hero word colour on the Hub, the peek, the run sheet and the other Start buttons", () => {
    const files = [...new Set(GO.map(([file]) => file))].concat([
      "features/hub-schedule/hub-grid.css",
      "features/hub-schedule/day-header.css",
      "features/hub-schedule/hub-card.css",
    ]);
    for (const file of files) expect({ file, reads: /-hero-on\)/.test(stylesheet(file)) }).toEqual({ file, reads: false });
  });
});

/* ---------------------------------------------------------------------------
   Words that must still read: the faint ink is for edges and marks, and a
   card that is over keeps its name at 4.5:1 over the grid and your lane.
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

function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a flat hex colour: ${hex}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const contrast = (a: [number, number, number], b: [number, number, number]) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/**
 * A card that is over is a SOLID colour since the cards round (Oct 17 2026;
 * it was a veil of the ground over the card, the pixels opacity 0.70 drew):
 * the card mixed into its own ground (--hs-ground, the grid's or your
 * lane's), 62% card for a past card (the light round's A2) and
 * --eq-done-mix for a recorded one. How much of the card a rule's fill
 * keeps, in a mode:
 */
function cardShare(selector: string, mode: keyof typeof THEMES): number {
  const fill = declared(CARD, selector).background;
  const m = /^color-mix\(in srgb, var\(--eq-surface\) (var\(--eq-done-mix\)|\d+%), var\(--hs-ground, var\(--eq-bg\)\)\)$/.exec(fill ?? "");
  expect(m, `${selector}: ${fill}`).not.toBeNull();
  const share = m![1] === "var(--eq-done-mix)" ? THEMES[mode]["--eq-done-mix"] : m![1];
  return Number(/^(\d+)%$/.exec(share)![1]) / 100;
}

/** color-mix(in srgb, a share, b): each channel mixed as stored. */
const mixed = (a: [number, number, number], share: number, b: [number, number, number]) =>
  a.map((v, i) => v * share + b[i] * (1 - share)) as [number, number, number];

const RECORDED = ["done", "didnt-come"].map((st) => `.hs-card[data-kind="client"][data-state="${st}"]`);
const NOT_RECORDED = ["not-logged", "left-open"].map((st) => `.hs-card[data-kind="client"][data-state="${st}"]`);
const PAST = '.hs-card[data-recede="true"]';

describe("words that must still read", () => {
  it("never sets the Hub's words in the faint ink", () => {
    for (const css of [GRID, TOP, CARD, stylesheet("features/hub-schedule/peek.css")]) {
      expect(css).not.toMatch(/(^|[\s;{])color:\s*var\(--eq-ink-faint\)/);
    }
    expect(declared(GRID, ".hs-rest-head").color).toBe("var(--eq-ink-muted)");
  });

  it("draws a card that is over in a solid colour, no opacity and no veil, mixed into its own ground set per column (the iPad round, Oct 6 2026; the cards round)", () => {
    for (const sel of [PAST, ...RECORDED, ...NOT_RECORDED]) expect(declared(CARD, sel).opacity, `${sel}: no translucent layer per card`).toBeUndefined();
    expect(CARD, "no veil drawn over a card").not.toMatch(/::after/);
    expect(declared(GRID, ".hs-col")["--hs-ground"]).toBe("var(--eq-bg)");
    expect(declared(GRID, '.hs-col[data-me="true"]')["--hs-ground"]).toBe("var(--eq-mine)");
    expect(declared(GRID, '.hs-col[data-me="true"]').background).toBe("var(--eq-mine)");
    for (const mode of ["light", "dark"] as const) {
      expect(cardShare(PAST, mode), `${mode}: past, A2's flat fill`).toBeCloseTo(0.62, 5);
      for (const sel of RECORDED) expect(cardShare(sel, mode), `${mode}: ${sel}, the recorded tile`).toBeCloseTo(0.3, 5);
    }
    // Not recorded is the whole card, flat.
    for (const sel of NOT_RECORDED) expect(declared(CARD, sel).background, sel).toBe("var(--eq-surface)");
    expect(declared(CARD, PAST)["box-shadow"]).toBe("none");
  });

  it("rings an open card that is over in blue with the outline aside, keeps a recorded one markless, and dims a card that is over as far as any (the review, Oct 6 2026)", () => {
    // A1's no border left an open finished card with no sign it was open:
    // the open card's own ring, on every client card that is over.
    expect(declared(CARD, '.hs-card[data-kind="client"][data-recede="true"][data-open="true"]')["box-shadow"]).toBe("0 0 0 2px var(--eq-live), var(--eq-elev-3)");
    const aside = '.hs-card[data-kind][data-open="true"]:not(:focus-visible)';
    expect(declared(CARD, aside)["outline-color"]).toBe("transparent");
    // Last of the outline rules, so at equal weight it wins.
    const outlines = rules(CARD).filter((r) => r.body["outline-color"] !== undefined || r.body.outline !== undefined);
    expect(Math.max(...outlines.map((r) => r.at))).toBe(position(CARD, aside));
    // An open recorded or past card shows no mark: their rules clear it after
    // (or over) the open card's blue mark; a card nobody recorded keeps its plum.
    for (const sel of [PAST, ...RECORDED]) expect(declared(CARD, sel)["--hs-mark"], sel).toBe("transparent");
    expect(position(CARD, '.hs-card[data-open="true"]')).toBeLessThan(position(CARD, PAST));
    for (const sel of NOT_RECORDED) expect(declared(CARD, sel)["--hs-mark"], sel).toBe("var(--eq-unlogged-mark)");
    // Dimmed: a solid colour, so the dim's 0.22 is the whole fade, as for any card.
    expect(declared(CARD, '.hs-card[data-dim="true"]').opacity).toBe("0.22");
  });

  it("lifts the column holding focus over its neighbours, under your column and the axis", () => {
    expect(declared(GRID, ".hs-col:focus-within")["z-index"]).toBe("2");
    expect(declared(GRID, '.hs-col[data-me="true"]')["z-index"]).toBe("3");
    expect(position(GRID, ".hs-col:focus-within")).toBeLessThan(position(GRID, '.hs-col[data-me="true"]'));
  });

  it("keeps every word on a card that is over at 4.5:1 over the grid and over your lane, in both modes (the cards round's C6)", () => {
    // Each state's words in the inks its rules draw them in, on the fill as
    // drawn. A recorded name is the muted ink on the pale tile: the cards
    // plan measured 5.20 light and 6.72 dark at the least, on your lane.
    const ink = (sel: string, part: string) => declared(CARD, `${sel} ${part}`).color.replace(/^var\((--[\w-]+)\)$/, "$1");
    for (const [mode, t] of Object.entries(THEMES) as [keyof typeof THEMES, Record<string, string>][]) {
      for (const ground of ["--eq-bg", "--eq-mine"]) {
        const under = rgb(t[ground]);
        const card = rgb(t["--eq-surface"]);
        const cases: [string, [number, number, number], string][] = [
          ...RECORDED.flatMap((sel) => [".hs-card-name", ".hs-card-when strong"].map((p) => [`${sel} ${p}`, mixed(card, cardShare(sel, mode), under), ink(sel, p)] as [string, [number, number, number], string])),
          [`${PAST} .hs-card-name`, mixed(card, cardShare(PAST, mode), under), ink(PAST, ".hs-card-name")],
          [`${PAST} .hs-card-when`, mixed(card, cardShare(PAST, mode), under), "--eq-ink-muted"],
          ...NOT_RECORDED.map((sel) => [`${sel} .hs-card-name`, card, ink(sel, ".hs-card-name")] as [string, [number, number, number], string]),
          [`${NOT_RECORDED[0]} .hs-card-when strong`, card, ink(NOT_RECORDED[0], ".hs-card-when strong")],
          [`${NOT_RECORDED[1]} .hs-card-when strong`, card, ink(NOT_RECORDED[1], ".hs-card-when strong")],
        ];
        for (const [what, fill, token] of cases) {
          const ratio = contrast(rgb(t[token]), fill);
          expect({ mode, ground, what, pass: ratio >= 4.5 }).toEqual({ mode, ground, what, pass: true });
        }
        // The pins the plan names, with their margins.
        const tile = mixed(card, cardShare(RECORDED[0], mode), under);
        expect(contrast(rgb(t["--eq-ink-muted"]), tile), `${mode} ${ground}: a recorded name`).toBeGreaterThanOrEqual(mode === "light" ? 5.1 : 6.6);
      }
    }
  });

  it("says what happened in its own voice: recorded words muted, Not logged in the ink, Left open in plum, a past card's name in ink-2", () => {
    for (const sel of RECORDED) {
      for (const part of [".hs-card-name", ".hs-card-when strong", ".hs-card-rest strong"]) {
        expect(declared(CARD, `${sel} ${part}`).color, `${sel} ${part}`).toBe("var(--eq-ink-muted)");
      }
    }
    for (const sel of NOT_RECORDED) expect(declared(CARD, `${sel} .hs-card-name`).color, sel).toBe("var(--eq-ink)");
    expect(declared(CARD, `${NOT_RECORDED[0]} .hs-card-when strong`).color, "Not logged").toBe("var(--eq-ink)");
    expect(declared(CARD, `${NOT_RECORDED[1]} .hs-card-when strong`).color, "Left open").toBe("var(--eq-warn)");
    expect(declared(CARD, `${PAST} .hs-card-name`).color).toBe("var(--eq-ink-2)");
    // The words of a card that is over are no longer lifted to the ink: the
    // base rules' muted ink reads on every fill above.
    expect(rules(CARD).some((r) => r.selectors.some((x) => x.startsWith('.hs-card[data-recede="true"] .hs-card-when')))).toBe(false);
    for (const part of [".hs-card-when", ".hs-card-rest", ".hs-card-num"]) expect(declared(CARD, part).color, part).toBe("var(--eq-ink-muted)");
  });

  it("draws the Key's finished swatches as the cards are, with no opacity: done the recorded tile, left open the card with its plum band", () => {
    const done = declared(TOP, '.hd-swatch[data-state="done"]');
    const leftOpen = declared(TOP, '.hd-swatch[data-state="left-open"]');
    expect(done.opacity).toBeUndefined();
    expect(leftOpen.opacity).toBeUndefined();
    expect(done.background).toBe("color-mix(in srgb, var(--eq-surface) var(--eq-done-mix), var(--eq-bg))");
    expect(leftOpen["border-left"], "a band, never a 4px border on the rounded swatch").toBeUndefined();
    expect(leftOpen.background).toBe("linear-gradient(var(--eq-unlogged-mark), var(--eq-unlogged-mark)) 4px 4px / 3px calc(100% - 8px) no-repeat, var(--eq-surface)");
  });
});

/* ---------------------------------------------------------------------------
   A selection is blue (AJ, Oct 4 2026: "yes"). The Equipment tab's picked
   machine was the hero orange, which is for now and go; the review of the
   follow-ups found it. Its fill is kept on :hover (an iPad keeps hover after
   the tap that picked it) and on a machine not in use.
   --------------------------------------------------------------------------- */

describe("the Equipment tab's picked machine is the blue", () => {
  const EQ = stylesheet("features/equipment/equipment.css");

  it("fills with the live fill and a blue edge, kept on :hover and on a machine not in use", () => {
    for (const selector of [".eq-item--selected", ".eq-item--selected:hover", ".eq-item--selected.eq-item--idle"]) {
      const rule = declared(EQ, selector);
      expect(rule.background, selector).toBe("var(--eq-live-fill)");
      expect(rule["border-left-color"], selector).toBe("var(--eq-live)");
    }
    // Equal weight, so the picked rule must come after the plain hover and the idle ground.
    expect(position(EQ, ".eq-item--selected:hover")).toBeGreaterThan(position(EQ, ".eq-item:hover"));
    expect(position(EQ, ".eq-item--selected.eq-item--idle")).toBeGreaterThan(position(EQ, ".eq-item--idle"));
    expect(EQ).not.toMatch(/\.eq-item--selected[^{]*\{[^}]*--eq-hero/);
  });

  it("keeps every word on it at 4.5:1 and its edge at 3:1, in both modes", () => {
    for (const [mode, t] of Object.entries(THEMES)) {
      const fill = rgb(t["--eq-live-fill"]);
      for (const ink of ["--eq-ink", "--eq-ink-2", "--eq-ink-muted", "--eq-hero-text"]) {
        expect({ mode, ink, pass: contrast(rgb(t[ink]), fill) >= 4.5 }).toEqual({ mode, ink, pass: true });
      }
      expect({ mode, edge: contrast(rgb(t["--eq-live"]), rgb(t["--eq-surface"])) >= 3 }).toEqual({ mode, edge: true });
    }
    // "No load yet" and the session count are words: the muted ink, never the faint.
    expect(declared(EQ, ".eq-item__empty").color).toBe("var(--eq-ink-muted)");
    expect(declared(EQ, ".eq-item__count").color).toBe("var(--eq-ink-muted)");
  });
});
