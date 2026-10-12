import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SAFETY_MIN_PX } from "./ui/StudioRoom";

/**
 * THE STUDIO MAP'S LOOK, HELD (Oct 2026). my-studio/look.test.ts holds its
 * names, taps and type with the rest of My Studio; this holds what is the
 * map's own:
 *
 *   - the drawing frame's height has its own variable with a fallback, so it
 *     is bounded in every host;
 *   - what each tool drags takes no pan up front (a browser decides when a
 *     touch starts, before any handler);
 *   - the floor is drawn with no edge, so two boxes read as one floor;
 *   - an overlap is plum (--eq-warn) and nothing else; there is no "due"
 *     mark on the map;
 *   - the safety markers keep their size and their words' halo;
 *   - no orange (only now and go) and no crimson (Critical, destructive and
 *     rep quality only) anywhere in the map's stylesheet.
 */

const CSS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "studio-map.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

type Rule = { selectors: string[]; body: string };
const RULES: Rule[] = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter((m) => !m[1].trim().startsWith("@"))
  .map((m) => ({ selectors: m[1].split(",").map((s) => s.trim()), body: m[2] }));
const ruleFor = (sel: string) => RULES.filter((r) => r.selectors.includes(sel));
const declared = (body: string, prop: string) => [...body.matchAll(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`, "g"))].map((m) => m[1].trim());

describe("the studio map's look", () => {
  it("bounds the drawing frame with its own variable, never the hosted frame's bare", () => {
    const [frame] = ruleFor(".smap-frame");
    expect(declared(frame.body, "max-height")).toEqual(["calc(100dvh - var(--smap-chrome, 12rem) - 220px)"]);
    expect(declared(frame.body, "touch-action")).toEqual(["pan-x pan-y"]);
  });

  it("takes the pan off what each tool drags, up front", () => {
    for (const sel of [".smap-frame--machines .smap-m", ".smap-frame--room .smap--sel", ".smap-frame--room .smap-handle"]) {
      const rules = ruleFor(sel);
      expect(rules.length, sel).toBeGreaterThan(0);
      expect(rules.flatMap((r) => declared(r.body, "touch-action")), sel).toEqual(["none"]);
    }
  });

  it("draws the floor with no edge", () => {
    const [floor] = ruleFor(".smap-floor");
    expect(declared(floor.body, "stroke")).toEqual(["none"]);
  });

  it("marks an overlap in plum and nothing else, and has no due mark", () => {
    const over = ruleFor(".smap-m--over .smap-m__body");
    expect(over.flatMap((r) => declared(r.body, "stroke"))).toEqual(["var(--eq-warn)"]);
    expect(over.flatMap((r) => declared(r.body, "fill"))).toEqual([]);
    expect(CSS).not.toMatch(/\.smap-m--due\b/);
  });

  it("keeps the safety markers at 28 px or more, their words haloed in the floor's colour", () => {
    expect(SAFETY_MIN_PX).toBe(28);
    const [name] = ruleFor(".smap-safety__name");
    expect(declared(name.body, "paint-order")).toEqual(["stroke"]);
    expect(declared(name.body, "stroke")).toEqual(["var(--eq-bg)"]);
    expect(declared(name.body, "font-size")).toEqual(["12px"]);
  });

  it("marks Used since its wipe in plum and Wiped today in the done green, and nothing in orange (phase 4)", () => {
    expect(ruleFor(".smap-m__used").flatMap((r) => declared(r.body, "fill"))).toEqual(["var(--eq-warn)"]);
    expect(ruleFor(".smap-m__tick").flatMap((r) => declared(r.body, "stroke"))).toEqual(["var(--eq-ok)"]);
    expect(ruleFor(".smap-mode__btn[aria-pressed=\"true\"]").flatMap((r) => declared(r.body, "background"))).toEqual(["var(--eq-live)"]);
  });

  it("draws a machine still to wipe as an empty box on the control edge, in the tick's place (phase 4 review fixes)", () => {
    const [box] = ruleFor(".smap-m__box");
    expect(declared(box.body, "fill")).toEqual(["var(--eq-raised)"]);
    expect(declared(box.body, "stroke")).toEqual(["var(--eq-border-strong)"]);
    expect(declared(box.body, "stroke-width")).toEqual(["1.5"]);
  });

  it("gives the map's buttons Refined Lift: a raised lift, a blue fill's glow, and a press", () => {
    expect(ruleFor(".smap-btn").flatMap((r) => declared(r.body, "box-shadow"))).toEqual(["var(--eq-elev-1), inset 0 1px 0 var(--eq-highlight)"]);
    expect(ruleFor(".smap-btn--primary").flatMap((r) => declared(r.body, "box-shadow"))).toEqual(["var(--eq-glow-live), var(--eq-solid-light)"]);
    expect(ruleFor(".smap-btn--primary:hover").flatMap((r) => declared(r.body, "box-shadow"))).toEqual(["var(--eq-glow-live), var(--eq-solid-light)"]);
    const [press] = ruleFor(".smap-btn:not(:disabled):active");
    expect(declared(press.body, "transform")).toEqual(["translateY(1px)"]);
    expect(declared(press.body, "box-shadow")).toEqual(["var(--eq-press)"]);
  });

  it("uses no orange and no crimson", () => {
    expect(CSS).not.toMatch(/--eq-(?:hero|go|go-on|alert)\b/);
  });

  it("puts no filter or shadow on the drawing", () => {
    for (const r of RULES.filter((x) => x.selectors.some((s) => /\.smap-(?:svg|floor|wall|door|place|m|safety|handle|grid|box)/.test(s)))) {
      for (const prop of ["filter", "will-change", "backdrop-filter"]) expect(declared(r.body, prop), `${r.selectors.join(", ")} ${prop}`).toEqual([]);
    }
  });
});
