import { describe, expect, it } from "vitest";
import type { Track, VaultGraph, VaultSection } from "../../learning-vault/types";
import {
  bentoFacts,
  chapterNumber,
  domainWords,
  floorTiles,
  isEquipmentTerm,
  machineAccent,
  machineCategory,
  momentSections,
  nextLayer,
  offFloor,
  orderLabel,
  outlineSections,
  pathShelf,
  pickLayer,
  readNextOf,
  resolveOpen,
  rootForSection,
  stepKind,
  termSections,
  topicCueMoments,
  topicLayers,
  whoLine,
  wordIndex,
} from "./codex-model";

const line = (key: string, text: string, kind: VaultSection["blocks"][number]["kind"] = "para") => ({ key, kind, text });

describe("sections and trails", () => {
  it("opens each masthead section on its own root", () => {
    expect(rootForSection("learning")).toEqual({ kind: "home" });
    expect(rootForSection("machine-anatomy")).toEqual({ kind: "catalog" });
    expect(rootForSection("academy")).toEqual({ kind: "academy" });
  });

  it("goes back to a machine as the reader left it (its tier too)", () => {
    const stack = [{ kind: "catalog" as const }, { kind: "machine" as const, id: "m-leg-press", tier: "script" as const }];
    expect(resolveOpen(stack, { kind: "machine", id: "m-leg-press" })).toBe(stack[1]);
    // A tier asked for is kept; another machine lands as given.
    expect(resolveOpen(stack, { kind: "machine", id: "m-leg-press", tier: "adapt" })).toEqual({
      kind: "machine",
      id: "m-leg-press",
      tier: "adapt",
    });
    expect(resolveOpen(stack, { kind: "machine", id: "m-chest-press" })).toEqual({ kind: "machine", id: "m-chest-press" });
    expect(resolveOpen(stack, { kind: "glossary" })).toEqual({ kind: "glossary" });
  });
});

describe("categories and the floor", () => {
  it("colours a machine by its Academy category, and a stranger neutral", () => {
    expect(machineAccent("m-leg-press")).toBe("legs");
    expect(machineAccent("m-chest-press")).toBe("push");
    expect(machineAccent("sm-our-own")).toBe("other");
    expect(machineCategory("m-leg-press")).toBe("Lower Body");
    expect(machineCategory("sm-our-own")).toBeNull();
  });

  it("numbers the floor in walking order, and says nothing for an unknown floor", () => {
    expect(floorTiles(null)).toEqual([]);
    const tiles = floorTiles([
      { id: "m-leg-press", name: "Leg Press", code: "LP" },
      { id: "sm-x", name: "  ", code: null },
    ]);
    expect(tiles.map((t) => [t.order, t.name, t.accent])).toEqual([
      [1, "Leg Press", "legs"],
      [2, "sm-x", "other"],
    ]);
    expect(orderLabel(3)).toBe("03");
    expect(orderLabel(12)).toBe("12");
  });

  it("lists the MSF machines a floor lacks, and none while the floor is unknown", () => {
    const all = [{ machineId: "m-leg-press" }, { machineId: "m-chest-press" }];
    expect(offFloor(all, [{ id: "m-leg-press" }])).toEqual([{ machineId: "m-chest-press" }]);
    expect(offFloor(all, null)).toEqual([]);
  });
});

describe("the bento", () => {
  const facts = [
    { label: "Code", value: "LP" },
    { label: "Category", value: "Lower Body" },
    { label: "Workout", value: "Lower Body" },
    { label: "Preset", value: "Gap 3" },
    { label: "In the Academy", value: "Card · Script" },
  ];

  it("never says the eyebrow, the preset or the Academy's pieces twice", () => {
    expect(bentoFacts(facts, { dials: true }).map((f) => f.label)).toEqual(["Workout"]);
    expect(bentoFacts(facts, { dials: false }).map((f) => f.label)).toEqual(["Workout", "Preset"]);
  });

  it("reads next once: no Academy pieces, no repeats, nothing the bento already shows", () => {
    const related = [
      { route: { kind: "card" as const, id: "lp" }, title: "Quick reference card", why: "" },
      { route: { kind: "machine" as const, id: "m-ext" }, title: "Leg Extension", why: "" },
      { route: { kind: "machine" as const, id: "m-ext" }, title: "Leg Extension", why: "" },
      { route: { kind: "machine" as const, id: "m-ext-2" }, title: "LEG EXTENSION", why: "" },
      { route: { kind: "machine" as const, id: "m-leg-curl" }, title: "Leg Curl", why: "" },
    ];
    const out = readNextOf({ related }, { skipAcademyPieces: true, shown: new Set(["machine:m-leg-curl"]) });
    expect(out.map((r) => r.title)).toEqual(["Leg Extension"]);
    expect(readNextOf({ related }).map((r) => r.title)).toEqual(["Quick reference card", "Leg Extension", "Leg Curl"]);
  });
});

describe("tiers", () => {
  it("picks the tier asked for when the page has it, else the first", () => {
    const layers = [{ id: "glance" }, { id: "script" }];
    expect(pickLayer(layers, "script")).toBe("script");
    expect(pickLayer(layers, "science")).toBe("glance");
    expect(pickLayer([], "script")).toBeNull();
    expect(nextLayer(layers, "glance")).toEqual({ id: "script" });
    expect(nextLayer(layers, "script")).toBeNull();
  });

  it("outlines a topic from its own lines: each heading and the first line under it", () => {
    const sections: VaultSection[] = [
      { id: "opening", title: "", blocks: [line("a", "First."), line("b", "Second.")] },
      {
        id: "how",
        title: "How",
        blocks: [line("c", "Do this."), line("h", "A part", "subheading"), line("d", "Then that."), line("e", "More.")],
      },
    ];
    const outline = outlineSections(sections);
    expect(outline.map((s) => s.blocks.map((b) => b.key))).toEqual([["a"], ["c", "h", "d"]]);
    // Every word is the topic's own: nothing is written for the outline.
    for (const s of outline) for (const b of s.blocks) expect(sections.some((x) => x.blocks.includes(b))).toBe(true);
  });

  it("has no outline when it would be the whole text", () => {
    expect(outlineSections([{ id: "one", title: "", blocks: [line("a", "Only line.")] }])).toEqual([]);
  });

  it("finds the phrasebook moments that use a topic's words", () => {
    const graph: VaultGraph = {
      nodes: [],
      edges: [
        { from: "term:load-up", to: "topic:t1", kind: "explained-in", label: "" },
        { from: "topic:t1", to: "term:force", kind: "mentions", label: "" },
        { from: "cue:3", to: "term:force", kind: "mentions", label: "" },
        { from: "cue:1", to: "term:load-up", kind: "mentions", label: "" },
        { from: "cue:1", to: "term:force", kind: "mentions", label: "" },
        { from: "cue:7", to: "term:squeeze", kind: "mentions", label: "" },
        { from: "cue:5", to: "topic:t1", kind: "explained-in", label: "" },
      ],
    };
    expect(topicCueMoments(graph, "t1")).toEqual([1, 3]);
    expect(topicCueMoments(graph, "t1", 1)).toEqual([1]);
    expect(topicCueMoments(graph, "nothing")).toEqual([]);
    expect(topicCueMoments(null, "t1")).toEqual([]);
  });

  it("lays a topic out as 1, 2 and 4, leaving out an empty tier", () => {
    const sections: VaultSection[] = [{ id: "o", title: "", blocks: [line("a", "One."), line("b", "Two.")] }];
    const say: VaultSection[] = [{ id: "moment-1", title: "To begin", blocks: [line("c", "Slowly begin", "cue")] }];
    expect(topicLayers(sections, say).map((l) => [l.n, l.title, l.partial])).toEqual([
      [1, "In one minute", true],
      [2, "Say it", true],
      [4, "Full text", false],
    ]);
    expect(topicLayers(sections, say)[1].home).toBe("cueing");
    expect(topicLayers([{ id: "o", title: "", blocks: [line("a", "One.")] }], []).map((l) => l.id)).toEqual(["full"]);
  });

  it("takes a phrasebook's moments by number", () => {
    const cueing = {
      sections: [
        { id: "moment-0", title: "Before", blocks: [line("a", "x")] },
        { id: "moment-1", title: "Empty", blocks: [] },
        { id: "moment-2", title: "Begin", blocks: [line("b", "y")] },
      ],
    };
    expect(momentSections(cueing, [2, 1, 9]).map((s) => s.id)).toEqual(["moment-2"]);
    expect(momentSections(null, [0])).toEqual([]);
  });
});

describe("the glossary", () => {
  const glossary = {
    sections: [
      {
        id: "letter-c",
        title: "C",
        blocks: [
          { key: "k1", kind: "line" as const, text: "The positive phase.", label: "Concentric", source: "Academy glossary" },
          { key: "k2", kind: "line" as const, text: "A pin.", label: "Cam", source: "Academy glossary · Equipment" },
        ],
      },
    ],
  };

  it("finds one word's line, whatever its case", () => {
    const one = termSections(glossary, "concentric");
    expect(one).toHaveLength(1);
    expect(one[0].blocks.map((b) => b.key)).toEqual(["k1"]);
    expect(isEquipmentTerm(termSections(glossary, "Cam"))).toBe(true);
    expect(isEquipmentTerm(one)).toBe(false);
    expect(termSections(glossary, "nothing")).toEqual([]);
  });

  it("indexes the words by letter", () => {
    expect(wordIndex(glossary)).toEqual([
      {
        letter: "C",
        words: [
          { term: "Concentric", equipment: false },
          { term: "Cam", equipment: true },
        ],
      },
    ]);
    expect(wordIndex(null)).toEqual([]);
  });
});

describe("paths", () => {
  const track = (id: string, title: string, who: string): Track => ({ id, title, who, steps: [] });

  it("leads with a new Life Transformer's path, then the other roles, then the pillars", () => {
    const tracks = [
      track("equipment-and-cueing", "Equipment and cueing", "Anyone"),
      track("studio-leader", "For a studio leader", "A studio leader"),
      track("life-transformer-101", "Life Transformer 101", "A new Life Transformer"),
      track("head-trainer", "For a head trainer", "A head trainer"),
    ];
    const shelf = pathShelf(tracks);
    expect(shelf.lead?.id).toBe("life-transformer-101");
    expect(shelf.roles.map((t) => t.id)).toEqual(["head-trainer", "studio-leader"]);
    expect(shelf.pillars.map((t) => t.id)).toEqual(["equipment-and-cueing"]);
    expect(pathShelf([]).lead).toBeNull();
  });

  it("never says who a path is for twice", () => {
    expect(whoLine(track("h", "For a head trainer", "A head trainer"))).toBeNull();
    expect(whoLine(track("l", "Life Transformer 101", "A new Life Transformer"))).toBe("A new Life Transformer");
    expect(whoLine(track("x", "Anything", ""))).toBeNull();
  });

  it("names the kind of each step", () => {
    expect(stepKind({ kind: "machine", id: "m" })).toBe("machine");
    expect(stepKind({ kind: "glossary" })).toBe("words");
    expect(stepKind({ kind: "quiz", deck: "mixed" })).toBe("quiz");
    expect(stepKind({ kind: "queue" })).toBe("page");
  });
});

describe("words", () => {
  it("starts a domain's noun as a sentence does, and numbers a topic in its module", () => {
    expect(domainWords("clinical flag")).toBe("Clinical flag");
    expect(domainWords("")).toBe("");
    expect(chapterNumber(4, 5)).toBe("4.6");
  });
});
