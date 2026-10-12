import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE MACHINE CARD'S LOOK, HELD (the studio map, phase 4, Oct 2026).
 * my-studio/look.test.ts holds its names, taps and type with the rest of My
 * Studio; this holds what is the card's own:
 *
 *   - it draws in equipment.tokens.css's colours, imported first;
 *   - no orange (only now and go) and no crimson (Critical, destructive and
 *     rep quality only): Flagged and Out of service are plum, a caution;
 *   - every class is the card's own (mdc-), so it never styles another
 *     screen and another screen never styles it.
 */

const CSS_RAW = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "machine-card.css"), "utf8");
const CSS = CSS_RAW.replace(/\/\*[\s\S]*?\*\//g, "");

describe("the machine card's look", () => {
  it("imports the equipment tokens first", () => {
    expect(CSS.trimStart().startsWith('@import "../equipment/equipment.tokens.css";')).toBe(true);
  });

  it("uses no orange and no crimson, and plum for a caution", () => {
    expect(CSS).not.toMatch(/--eq-(?:hero|go|go-on|alert)\b/);
    expect(CSS).toMatch(/\.mdc-flag\s*\{[^}]*border:\s*1px solid var\(--eq-warn\)/);
  });

  it("draws open notes as a neutral chip on the firm edge: plum is for Flagged and Out of service only", () => {
    expect(CSS).toMatch(/\.mdc-flag--notes\s*\{[^}]*border-color:\s*var\(--eq-border-strong\)[^}]*background:\s*var\(--eq-raised\)/);
  });

  it("owns every class it defines (mdc-), beside the panel it rides in", () => {
    const classes = [...CSS.matchAll(/(^|[\s,{}])\.([a-z][\w-]*)/g)].map((m) => m[2]);
    expect(classes.length).toBeGreaterThan(0);
    expect(classes.filter((c) => !c.startsWith("mdc") && c !== "cp" && c !== "cp--tall")).toEqual([]);
  });
});
