/**
 * Where a concept card sits, and when the word has moved enough for it to go.
 */
import { describe, expect, it } from "vitest";
import {
  POPOVER_EDGE,
  POPOVER_GAP,
  anchorMoved,
  conceptCard,
  linkText,
  placePopover,
  popoverWidth,
  pushConcept,
  samePlace,
} from "./concepts";

const viewport = { width: 820, height: 1180 };
const card = { width: 360, height: 240 };
const word = (top: number, left = 300, width = 60, height = 20) => ({ top, left, width, height });

describe("popoverWidth", () => {
  it("is 360, or the screen less 16px a side", () => {
    expect(popoverWidth(820)).toBe(360);
    expect(popoverWidth(390)).toBe(358);
    expect(popoverWidth(300)).toBe(268);
    expect(popoverWidth(10)).toBe(0);
  });
});

describe("placePopover", () => {
  it("sits under the word, centred on it, when there is room", () => {
    const p = placePopover(word(200), card, viewport);
    expect(p.side).toBe("below");
    expect(p.top).toBe(200 + 20 + POPOVER_GAP);
    expect(p.left).toBe(Math.round(330 - 180));
  });

  it("sits above the word when there is no room below", () => {
    const p = placePopover(word(1000), card, viewport);
    expect(p.side).toBe("above");
    expect(p.top).toBe(1000 - POPOVER_GAP - 240);
  });

  it("keeps 16px from either edge, however near the edge the word is", () => {
    expect(placePopover(word(200, 0, 30), card, viewport).left).toBe(POPOVER_EDGE);
    expect(placePopover(word(200, 800, 20), card, viewport).left).toBe(820 - POPOVER_EDGE - 360);
  });

  it("with no room either side, takes the roomier side and stays on screen", () => {
    const short = { width: 844, height: 390 };
    const tall = { width: 360, height: 300 };
    const low = placePopover(word(250, 300, 60, 20), tall, short);
    expect(low.side).toBe("over");
    expect(low.top).toBeGreaterThanOrEqual(POPOVER_EDGE);
    expect(low.top + tall.height).toBeLessThanOrEqual(short.height - POPOVER_EDGE);
    const high = placePopover(word(60, 300, 60, 20), tall, short);
    expect(high.side).toBe("over");
    expect(high.top + tall.height).toBeLessThanOrEqual(short.height - POPOVER_EDGE);
  });

  it("pins a card taller than the screen to the top edge (it scrolls inside)", () => {
    const p = placePopover(word(300), { width: 360, height: 2000 }, viewport);
    expect(p.top).toBe(POPOVER_EDGE);
  });
});

describe("anchorMoved and samePlace", () => {
  it("lets a nudge through and lets a scroll go", () => {
    expect(anchorMoved(word(200), word(210))).toBe(false);
    expect(anchorMoved(word(200), word(240))).toBe(true);
    expect(anchorMoved(word(200, 10), word(200, 60))).toBe(true);
  });

  it("knows the same place", () => {
    expect(samePlace({ top: 1, left: 2, side: "below" }, { top: 1, left: 2, side: "below" })).toBe(true);
    expect(samePlace({ top: 1, left: 2, side: "below" }, { top: 1, left: 2, side: "above" })).toBe(false);
    expect(samePlace(null, null)).toBe(true);
    expect(samePlace(null, { top: 1, left: 2, side: "below" })).toBe(false);
  });
});

describe("the re-exports", () => {
  it("lets a design import every concept name from concepts.ts", () => {
    expect(typeof conceptCard).toBe("function");
    expect(typeof linkText).toBe("function");
    expect(pushConcept(["a"], "b")).toEqual(["a", "b"]);
  });
});
