import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * LEARNING'S TAPS AND NAMES, ENFORCED (voice review follow-up, Sep 27 2026).
 *
 * CLAUDE.md: nothing tappable under 40px, and names are never truncated. The
 * audit found thirteen controls in Learning under 40px (the breadcrumb, the
 * search button and its clear, "Show more", the related-machine chips, a
 * studio note's Edit, every control on the studio setup card) and a setting's
 * name cut with an ellipsis. This scans the stylesheets themselves, as the
 * codex's scale.test.ts does for the codex:
 *
 *   1. Every control Learning draws is 40px or more in the direction a
 *      finger lands on it (TAPS names each one, by its rule).
 *   2. No other rule that looks like a control sets a size under 40px.
 *   3. Nothing is clipped: no ellipsis, no line clamp, no one-line cut-off.
 *
 * Inline text links inside a sentence (a glossary term, the group note's
 * link) are exempt, as WCAG's target-size rule exempts them.
 *
 * If this fails on a size, the fix is the size, not the list.
 */

const here = dirname(fileURLToPath(import.meta.url));
const read = (...p: string[]) => readFileSync(join(here, "..", ...p), "utf8");

/**
 * The Catalog's upkeep card is the .stu block of studio-tasks.css, and only
 * that block: the rest of the sheet is Relay's. The same slice
 * learning-tokens.test.ts takes.
 */
function upkeepBlock(): string {
  const css = read("studio-tasks", "studio-tasks.css");
  const start = css.indexOf(".stu {");
  const lane = css.indexOf("REQUESTS LANE", start);
  if (start < 0 || lane < 0) throw new Error("the .stu block moved");
  return css.slice(start, css.lastIndexOf("/*", lane));
}

const SHEETS: Record<string, string> = {
  "wiki/wiki.css": read("wiki", "wiki.css"),
  "learning/learning.css": read("learning", "learning.css"),
  "catalog/catalog.css": read("catalog", "catalog.css"),
  "comments/comments.css": read("comments", "comments.css"),
  "studio-tasks/studio-tasks.css .stu": upkeepBlock(),
  // The Learning vault prototypes (Oct 19 2026): the parts all three designs
  // share, the switcher between them, and each design's own sheet.
  "learning-vault/ui/version.css": read("learning-vault", "ui", "version.css"),
  "learning-vault/ui/concept.css": read("learning-vault", "ui", "concept.css"),
  "learning-vault/ui/graph.css": read("learning-vault", "ui", "graph.css"),
  "learning-vault/ui/peek.css": read("learning-vault", "ui", "peek.css"),
  "learning-vault/ui/rep.css": read("learning-vault", "ui", "rep.css"),
  "learning-vault/ui/quiz.css": read("learning-vault", "ui", "quiz.css"),
  "learning-vault/ui/share.css": read("learning-vault", "ui", "share.css"),
  "learning-vault/ui/queue.css": read("learning-vault", "ui", "queue.css"),
  "learning-vault/ui/article.css": read("learning-vault", "ui", "article.css"),
  "learning-redesign/redesign.css": read("learning-redesign", "redesign.css"),
  "learning-redesign/codex/codex.css": read("learning-redesign", "codex", "codex.css"),
  "learning-redesign/vault/vault-map.css": read("learning-redesign", "vault", "vault-map.css"),
  "learning-redesign/course/course.css": read("learning-redesign", "course", "course.css"),
};

interface Rule {
  sheet: string;
  selectors: string[];
  body: string;
}

/** Every innermost `selector { body }`, comments removed (an @media's rules included). */
function rules(sheet: string, css: string): Rule[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    sheet,
    selectors: m[1].split(",").map((s) => s.trim()).filter(Boolean),
    body: m[2],
  }));
}

const ALL = Object.entries(SHEETS).flatMap(([sheet, css]) => rules(sheet, css));

/** A declared size in px: 40px, 2.5rem, var(--wk-tap). Null when it is not a length. */
function px(value: string): number | null {
  const v = value.trim();
  if (v === "var(--wk-tap)") return 44;
  const m = v.match(/^([\d.]+)(px|rem)$/);
  if (!m) return null;
  return Number(m[1]) * (m[2] === "rem" ? 16 : 1);
}

function declared(body: string, prop: string): number | null {
  const m = body.match(new RegExp(`(?:^|[;\\s{])${prop}\\s*:\\s*([^;]+)`));
  return m ? px(m[1]) : null;
}

/** The rule that DEFINES a control: its selector list names it exactly. */
function ruleFor(selector: string): Rule {
  const found = ALL.find((r) => r.selectors.includes(selector) && /(min-)?height|width/.test(r.body));
  if (!found) throw new Error(`no sized rule for ${selector}`);
  return found;
}

/**
 * Every control Learning draws, and what makes it 40px. `height` means the
 * rule's min-height or height; `square` means width as well (an icon button).
 */
const TAPS: Record<string, "height" | "square"> = {
  ".wk__up": "square",
  ".wk__crumb": "height",
  ".wk__searchbtn": "height",
  ".wk__mast-home": "height",
  ".wk__mast-search": "height",
  ".wk__cat": "height",
  ".wk__row": "height",
  ".wk__fold-summary": "height",
  ".wk__warnings-more": "height",
  ".wk__linkcard": "height",
  ".wk__chip": "height",
  ".wk__seg-btn": "height",
  ".wk__search-clear": "square",
  ".wk__hit": "height",
  ".wk__studio-edit": "height",
  ".wk__addnote": "height",
  ".wk__btn": "height",
  ".lh__search": "height",
  ".lh__more": "height",
  ".lh__status": "height",
  ".lh__tile-head": "height",
  ".lh__machine": "height",
  ".lh__start": "height",
  ".cat__btn": "height",
  // The Catalog's own index (Machine Catalog round, Sep 28 2026).
  ".mcat-filter__clear": "height",
  ".mcat-row": "height",
  ".mcat-door": "height",
  ".mcat-lens__btn": "height",
  ".mcat-body__chip": "height",
  ".mcat-body__other": "height",
  ".ssc__value": "height",
  ".ssc__remove": "square",
  ".ssc__addbtn": "square",
  ".ssc__draft": "height",
  ".ssc__save": "height",
  ".cm__link": "height",
  ".cm__pick": "height",
  ".cm__btn": "height",
  ".stu__tick": "square",
  ".stu__note": "height",
  // The Learning vault prototypes (Oct 19 2026). A glossary term inside a
  // line (.vtc__term) is an inline link in a sentence, so it is exempt.
  // The version toggle and the concept card.
  ".vtv__opt": "height",
  ".vtv__toggle": "height",
  ".vtc__crumb": "height",
  ".vtc__icon": "square",
  ".vtc__chip": "height",
  ".vtc__btn": "height",
  // The local constellation: a pill, and an orbit node's button and its hit circle.
  ".vtg__pill": "height",
  ".vtg__node": "height",
  ".vtg__node-hit": "square",
  // The peek sheet.
  ".vtp__grip": "height",
  ".vtp__crumb": "height",
  ".vtp__icon-btn": "square",
  ".vtp__open": "height",
  // The rep scrubber: the whole track is the slider, the thumb a finger's width.
  ".vtr__seg-btn": "height",
  ".vtr__track": "height",
  ".vtr__thumb": "square",
  ".vtr__step": "height",
  ".vtr__btn": "height",
  // The quiz.
  ".qz__deck": "height",
  ".qz__option": "height",
  ".qz__placed-row": "height",
  // Share, head office's queue, and a line's actions and in-place forms.
  ".vts__btn": "height",
  ".vtq__open": "height",
  ".vtq__btn": "height",
  ".vta__line": "height",
  ".vta__marker": "square",
  ".vta__reveal": "height",
  ".vta__btn": "height",
  ".vta__choice": "height",
  // The switcher between the three designs.
  ".ld__opt": "height",
  // Design 1, the Tactical Codex.
  ".cdx__more": "height",
  ".cdx__btn": "height",
  ".cdx__row": "height",
  ".cdx__mtile": "height",
  ".cdx__entry": "height",
  ".cdx__chapter": "height",
  ".cdx__word": "height",
  ".cdx__ref": "height",
  ".cdx__shelf-row": "height",
  ".cdx__deck": "height",
  ".cdx__ho": "height",
  ".cdx__dial": "height",
  ".cdx__piece": "height",
  ".cdx__tier": "height",
  ".cdx__deeper": "height",
  ".cdx__from": "height",
  ".cdx__link": "height",
  ".cdx__step": "height",
  ".cdx__wide-door": "height",
  // Design 2, the Living Vault: the map's nodes are squares, as are its mini orbit's.
  ".vm__btn": "height",
  ".vm__map-btn": "height",
  ".vm__more": "height",
  ".vm__icon-btn": "square",
  ".vm__seg-opt": "height",
  ".vm__chip": "height",
  ".vm__node": "square",
  ".vm__list-row": "height",
  ".vm__back": "height",
  ".vm__pill": "height",
  ".vm__track": "height",
  ".vm__deck": "height",
  ".vm__floor-row": "height",
  ".vm__module": "height",
  ".vm__door": "height",
  ".vm__row": "height",
  ".vm__mini-centre": "height",
  ".vm__mini-node": "height",
  ".vm__mini-hit": "square",
  ".vm__path-card": "height",
  // Design 3, the Interactive Course. Every .crs__btn is at least a square,
  // the icon-only ones exactly that; a pin is a button on the set-up page.
  ".crs__btn": "square",
  ".crs__more": "height",
  ".crs__chip": "height",
  ".crs__lesson": "height",
  ".crs__course": "height",
  ".crs__deckrow": "height",
  ".crs__mode-btn": "height",
  ".crs__q-opt": "height",
  ".crs__rail-title": "height",
  ".crs__rail-row": "height",
  ".crs__coursebar-name": "height",
  ".crs__pin": "height",
  ".crs__tier": "height",
  ".crs__link": "height",
  ".crs__tile": "height",
  ".crs__station": "height",
  ".crs__other": "height",
  ".crs__door": "height",
  ".crs__module": "height",
  ".crs__row": "height",
  ".crs__find": "height",
  ".crs__find-clear": "square",
  ".crs__filter": "height",
  ".crs__az-btn": "square",
  ".crs__vcard-more": "height",
  ".crs__taught-row": "height",
  ".crs__term": "height",
  ".crs__queue": "height",
};

describe("Learning's controls are 40px or more", () => {
  it.each(Object.entries(TAPS))("%s", (selector, shape) => {
    const rule = ruleFor(selector);
    const height = declared(rule.body, "min-height") ?? declared(rule.body, "height");
    expect(height, `${rule.sheet} ${selector} height`).not.toBeNull();
    expect(height!, `${rule.sheet} ${selector} height`).toBeGreaterThanOrEqual(40);
    if (shape === "square") {
      const width = declared(rule.body, "min-width") ?? declared(rule.body, "width");
      expect(width!, `${rule.sheet} ${selector} width`).toBeGreaterThanOrEqual(40);
    }
  });

  it("and no other rule that looks like a control is sized under 40px", () => {
    const CONTROL = /(btn|chip|crumb|-edit\b|-more\b|-clear\b|remove|addbtn|save|tick|search\b|__link\b|pick\b)/;
    const small: string[] = [];
    for (const rule of ALL) {
      const controls = rule.selectors.filter((s) => CONTROL.test(s) && !s.includes("::") && !/svg|label|icon/.test(s));
      if (controls.length === 0) continue;
      for (const prop of ["min-height", "height", "width"]) {
        const v = declared(rule.body, prop);
        if (v !== null && v < 40) small.push(`${rule.sheet} ${controls.join(", ")} ${prop} ${v}px`);
      }
    }
    expect(small).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * The app's type voice (voice review follow-up, Sep 27 2026)
 * ------------------------------------------------------------------ */

const TYPE_SHEETS: Record<string, string> = {
  // Every sheet in SHEETS, the Learning vault prototypes' included.
  ...SHEETS,
  "machine-trends/machine-trends.css": read("machine-trends", "machine-trends.css"),
  "settings/settings.css": read("settings", "settings.css"),
};
const TYPE_RULES = Object.entries(TYPE_SHEETS).flatMap(([sheet, css]) => rules(sheet, css));
const typeRule = (selector: string) => {
  const found = TYPE_RULES.find((r) => r.selectors.includes(selector) && /font-size/.test(r.body));
  if (!found) throw new Error(`no type rule for ${selector}`);
  return found;
};

/** A field: 16px, the one size off the scale, or iOS zooms the page on focus. */
const FIELD = /(input|textarea|__value|__draft)/;

describe("Learning's text is on the codex's scale", () => {
  it("sets every size to 11, 12, 14, 17, 22 or 30, and a field to 16", () => {
    const off: string[] = [];
    for (const rule of TYPE_RULES) {
      const size = declared(rule.body, "font-size");
      if (size === null) continue;
      const field = rule.selectors.every((s) => FIELD.test(s));
      // 22 joined the codex scale on Oct 4 2026 (type and depth, phase 2).
      if (![11, 12, 14, 17, 22, 30].includes(size) && !(field && size === 16)) {
        off.push(`${rule.sheet} ${rule.selectors.join(", ")}: ${size}px`);
      }
    }
    expect(off).toEqual([]);
  });

  it.each([
    ".wk__search-input",
    ".wk__input",
    ".wk__textarea",
    ".cat__textarea",
    ".ssc__value",
    ".ssc__draft",
    ".cm__input",
    // The Learning vault prototypes (Oct 19 2026): a line's forms, share, head office's note, the glossary's find.
    ".vta__input",
    ".vts__input",
    ".vtq__input",
    ".crs__find-input",
  ])(
    "keeps the field %s at 16px, so iOS does not zoom on focus",
    (selector) => {
      const rule = TYPE_RULES.find((r) => r.selectors.includes(selector) && declared(r.body, "font-size") !== null);
      expect(declared(rule!.body, "font-size"), selector).toBe(16);
    },
  );

  /*
   * Moved on purpose (type and depth, phase 12, Oct 4 2026; AJ's 1A): these
   * titles were the display face in italic capitals. A page title, a room's
   * title and a region's title are now the display face UPRIGHT, in their own
   * capitalisation; the slanted capitals are the studio name's and Start
   * session's alone. The section title (.lh__h2) left the display face for
   * Geist 22/800, the codex's .cx-section-head.
   */
  it.each([
    ".wk__mast-title",
    ".wk__index-title",
    ".wk__h1",
    ".lh__title",
    ".mcat-body__title",
    // The Learning vault prototypes' page titles (Oct 19 2026).
    ".cdx__title",
    ".vm__index-title",
    ".crs__title",
    ".qz__title",
  ])(
    "gives the title %s the display face at 800, upright, in its own capitalisation",
    (selector) => {
      const body = typeRule(selector).body;
      expect(body).toMatch(/font-family:\s*var\(--wk-font-display\)/);
      expect(body).toMatch(/font-weight:\s*800/);
      expect(body).toMatch(/font-style:\s*normal/);
      expect(body).toMatch(/text-transform:\s*none/);
      expect(body).not.toMatch(/italic|uppercase/);
    },
  );

  it("sizes the page titles 30 and the masthead's room title 22", () => {
    for (const sel of [".wk__index-title", ".wk__h1", ".lh__title", ".mcat-body__title", ".cdx__title", ".vm__index-title", ".crs__title", ".qz__title"]) {
      expect(declared(typeRule(sel).body, "font-size"), sel).toBe(30);
    }
    expect(declared(typeRule(".wk__mast-title").body, "font-size")).toBe(22);
  });

  it("writes the section title .lh__h2 in Geist 22/800, in its own capitalisation", () => {
    const body = typeRule(".lh__h2").body;
    expect(body).not.toMatch(/font-family/);
    expect(declared(body, "font-size")).toBe(22);
    expect(body).toMatch(/font-weight:\s*800/);
    expect(body).not.toMatch(/italic|uppercase/);
  });

  it("draws Learning's facts as headline figures: the display face at 22/800, the words Geist 12", () => {
    const strong = typeRule(".lh__facts strong").body;
    expect(strong).toMatch(/font-family:\s*var\(--wk-font-display\)/);
    expect(declared(strong, "font-size")).toBe(22);
    expect(strong).toMatch(/font-weight:\s*800/);
    expect(declared(typeRule(".lh__facts").body, "font-size")).toBe(12);
  });

  it("draws a machine's code as a jersey tag: the display face at 14/700, ringed in its own ink", () => {
    const body = typeRule(".wk__row-code").body;
    expect(body).toMatch(/font-family:\s*var\(--wk-font-display\)/);
    expect(declared(body, "font-size")).toBe(14);
    expect(body).toMatch(/font-weight:\s*700/);
    expect(body).toMatch(/box-shadow:\s*inset 0 0 0 1px color-mix\(in srgb, currentColor 22%, transparent\)/);
    expect(body).not.toMatch(/italic|uppercase/);
  });

  it("gives Settings' title the display face, upright, as My Profile writes a name", () => {
    const body = typeRule(".stg-head__title").body;
    expect(body).toMatch(/font-family:\s*var\(--font-display/);
    expect(body).toMatch(/font-weight:\s*800/);
    expect(body).not.toMatch(/italic|uppercase/);
  });

  it.each([
    ".wk__searchbtn",
    ".wk__warnings-more",
    ".wk__studio-edit",
    ".wk__btn",
    ".lh__more",
    ".cat__btn",
    ".mcat-filter__clear",
    ".mcat-door",
    ".ssc__save",
    ".cm__btn",
    ".cm__link",
    // The Learning vault prototypes' buttons (Oct 19 2026).
    ".vtv__toggle",
    ".vtc__btn",
    ".vtp__open",
    ".vtr__btn",
    ".vts__btn",
    ".vtq__open",
    ".vtq__btn",
    ".vta__reveal",
    ".vta__btn",
    ".cdx__btn",
    ".cdx__more",
    ".vm__btn",
    ".vm__more",
    ".crs__btn",
    ".crs__more",
  ])(
    "writes the button %s in 14px bold sentence case",
    (selector) => {
      const body = typeRule(selector).body;
      expect(declared(body, "font-size")).toBe(14);
      expect(body).toMatch(/font-weight:\s*700/);
      expect(body).not.toMatch(/text-transform:\s*uppercase/);
    },
  );

  it("points the display face at the app's, with a fallback of its own", () => {
    expect(read("wiki", "wiki.tokens.css")).toMatch(/--wk-font-display:\s*var\(--font-display,\s*"Saira Condensed"/);
  });
});

describe("nothing in Learning is cut off", () => {
  it("has no ellipsis, no line clamp and no one-line cut-off", () => {
    const clipped: string[] = [];
    for (const rule of ALL) {
      const where = `${rule.sheet} ${rule.selectors.join(", ")}`;
      if (/text-overflow\s*:\s*ellipsis/.test(rule.body)) clipped.push(`${where}: ellipsis`);
      if (/line-clamp\s*:/.test(rule.body)) clipped.push(`${where}: line-clamp`);
      if (/white-space\s*:\s*nowrap/.test(rule.body) && /overflow(-x)?\s*:\s*hidden/.test(rule.body)) {
        clipped.push(`${where}: nowrap and overflow hidden`);
      }
    }
    expect(clipped).toEqual([]);
  });

  it("lets a setting's name and an upkeep task's name wrap", () => {
    const setting = ALL.find((r) => r.selectors.includes(".ssc__name"));
    expect(setting?.body).toMatch(/overflow-wrap:\s*anywhere/);
    const tasks = readFileSync(join(here, "..", "studio-tasks", "studio-tasks.css"), "utf8");
    const name = tasks.match(/(?:^|\n)\.stu__task-name\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(name).toMatch(/overflow-wrap:\s*anywhere/);
    expect(name).not.toMatch(/ellipsis|nowrap/);
  });

  it("and Settings shows a whole report rather than two lines of it", () => {
    const settings = read("settings", "settings.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(settings).not.toMatch(/line-clamp|text-overflow/);
  });
});
