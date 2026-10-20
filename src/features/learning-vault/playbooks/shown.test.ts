/**
 * THE PLAYBOOKS A READER SEES (the Mix for everyone, Oct 20 2026). AJ:
 * "playbooks hidden until head office reads them." A page shows once its
 * file says it was read; the paths lose only the steps to what is hidden.
 */
import { describe, expect, it } from "vitest";
import type { Track } from "../types";
import { PLAYBOOKS, PLAYBOOKS_DECK_SHOWN, SHOWN_PLAYBOOKS, TRACKS, shownTracks } from "./index";

describe("the playbooks a reader sees", () => {
  it("are the ones head office has read: none yet, so none shows and the playbooks deck waits", () => {
    expect(PLAYBOOKS.length).toBeGreaterThan(0);
    expect(SHOWN_PLAYBOOKS).toEqual(PLAYBOOKS.filter((p) => p.status === "read"));
    // Oct 20 2026: nobody has read them for head office yet. Change this
    // line in the same commit that marks a page "read".
    expect(SHOWN_PLAYBOOKS).toEqual([]);
    expect(PLAYBOOKS_DECK_SHOWN).toBe(false);
  });
});

describe("shownTracks", () => {
  it("drops every step to a hidden playbook and to the waiting deck, and keeps the rest in order", () => {
    const out = shownTracks(TRACKS, [], false);
    for (const t of out) {
      for (const s of t.steps) {
        expect(s.route.kind).not.toBe("playbook");
        if (s.route.kind === "quiz") expect(s.route.deck).not.toBe("playbooks");
      }
    }
    const before = TRACKS.find((t) => t.id === "life-transformer-101");
    const after = out.find((t) => t.id === "life-transformer-101");
    expect(before?.steps.some((s) => s.route.kind === "playbook")).toBe(true);
    expect(after?.steps.map((s) => s.title)).toEqual(
      before?.steps.filter((s) => s.route.kind !== "playbook").map((s) => s.title),
    );
  });

  it("brings a read playbook's step back, and leaves out a path with no step left", () => {
    const read = { ...PLAYBOOKS[0], status: "read" as const };
    const solo: Track = {
      id: "solo",
      title: "Solo",
      who: "Anyone",
      steps: [{ route: { kind: "playbook", id: read.id }, title: read.title, why: "Read it." }],
    };
    expect(shownTracks([solo], [], false)).toEqual([]);
    expect(shownTracks([solo], [read], true)).toEqual([solo]);
  });

  it("hands back a path with nothing hidden as it was", () => {
    const plain: Track = {
      id: "plain",
      title: "Plain",
      who: "Anyone",
      steps: [{ route: { kind: "glossary" }, title: "Glossary", why: "The words." }],
    };
    expect(shownTracks([plain], [], false)[0]).toBe(plain);
  });
});
