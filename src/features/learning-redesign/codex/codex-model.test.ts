import { describe, expect, it } from "vitest";
import type { Track, VaultGraph, VaultSection } from "../../learning-vault/types";
import {
  bentoFacts,
  chapterNumber,
  domainWords,
  floorGlanceOrder,
  floorTiles,
  groupReasons,
  hideReserved,
  isEquipmentTerm,
  machineAccent,
  machineCategory,
  machineLayers,
  momentSections,
  nextLayer,
  offFloor,
  orderLabel,
  otherMachines,
  outlineSections,
  pathShelf,
  pickLayer,
  pieceLabel,
  pieceMachineId,
  readNextOf,
  resolveOpen,
  rootForSection,
  stepKind,
  termSections,
  topicCueMoments,
  topicLayers,
  versionFitsTrail,
  waitState,
  whoLine,
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

  it("lists every MSF machine under a floor that could not be read, or has nothing on it", () => {
    const all = [{ machineId: "m-leg-press" }, { machineId: "m-chest-press" }];
    // Read: what the floor lacks.
    expect(otherMachines(all, [{ id: "m-leg-press" }], "ready")).toEqual({ every: false, machines: [{ machineId: "m-chest-press" }] });
    // Unreadable is final: the Catalog is never a dead end.
    expect(otherMachines(all, null, "unreadable")).toEqual({ every: true, machines: all });
    // Read and empty: every machine too.
    expect(otherMachines(all, [], "empty")).toEqual({ every: true, machines: all });
    // Still being read: nothing yet, so the list does not jump when the floor lands.
    expect(otherMachines(all, null, "loading")).toEqual({ every: false, machines: [] });
    expect(otherMachines(all, null)).toEqual({ every: false, machines: [] });
  });
});

describe("a page that is not here yet", () => {
  const data = (over: Partial<Parameters<typeof waitState>[1]> = {}): Parameters<typeof waitState>[1] => ({
    defs: { "m-leg-press": {} as never },
    floor: null,
    floorState: "loading",
    moduleFailed: () => false,
    referenceFailed: false,
    ...over,
  });

  it("is on its way while nothing has failed", () => {
    expect(waitState({ kind: "machine", id: "m-leg-press" }, data())).toEqual({ kind: "loading" });
    expect(waitState({ kind: "glossary" }, data())).toEqual({ kind: "loading" });
    expect(waitState({ kind: "topic", moduleId: "performance", topicId: "performance-gradual-load-up" }, data())).toEqual({
      kind: "loading",
    });
  });

  it("says a studio's own machine waits on a floor that could not be read", () => {
    expect(waitState({ kind: "machine", id: "sm-our-own" }, data({ floorState: "unreadable" }))).toEqual({ kind: "floor" });
    // Still reading the floor: on its way, even if a reference chunk failed (it does not need one).
    expect(waitState({ kind: "machine", id: "sm-our-own" }, data({ referenceFailed: true }))).toEqual({ kind: "loading" });
  });

  it("names the module a topic is waiting on when its chunk failed", () => {
    const failed = data({ moduleFailed: (id) => id === "performance" });
    expect(waitState({ kind: "topic", moduleId: "performance", topicId: "performance-gradual-load-up" }, failed)).toEqual({
      kind: "module",
      moduleId: "performance",
    });
    // A topic never waits on a reference chunk.
    expect(
      waitState({ kind: "topic", moduleId: "performance", topicId: "performance-gradual-load-up" }, data({ referenceFailed: true })),
    ).toEqual({ kind: "loading" });
  });

  it("says a page waiting on a failed reference chunk did not load", () => {
    const failed = data({ referenceFailed: true });
    expect(waitState({ kind: "machine", id: "m-leg-press" }, failed)).toEqual({ kind: "reference" });
    expect(waitState({ kind: "glossary" }, failed)).toEqual({ kind: "reference" });
    expect(waitState({ kind: "cueing" }, failed)).toEqual({ kind: "reference" });
    expect(waitState({ kind: "card", id: "lp" }, failed)).toEqual({ kind: "reference" });
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

  it("leaves the workout out when the category in the eyebrow already says it", () => {
    // The Leg Press: "Lower Body" over "Workout: Lower Body".
    const legPress = [...facts, { label: "Begins with", value: "A gradual load-up" }];
    expect(bentoFacts(legPress, { dials: true, category: "Lower Body" }).map((f) => f.label)).toEqual(["Begins with"]);
    // The Pulldown: "Upper Body — Pull" over "Workout: Upper Body".
    const pulldown = [
      { label: "Category", value: "Upper Body — Pull" },
      { label: "Workout", value: "Upper Body" },
      { label: "Begins with", value: "A handoff" },
    ];
    expect(bentoFacts(pulldown, { dials: true, category: "Upper Body — Pull" }).map((f) => f.label)).toEqual(["Begins with"]);
    // A workout the category does not say stays; so does every workout with no category.
    expect(bentoFacts([{ label: "Workout", value: "SpineTrunkCore" }], { dials: true, category: "Core" }).map((f) => f.label)).toEqual([
      "Workout",
    ]);
    expect(bentoFacts([{ label: "Workout", value: "Lower Body" }], { dials: true, category: null }).map((f) => f.label)).toEqual([
      "Workout",
    ]);
  });

  it("groups Read next's links that give the same reason, saying it once", () => {
    // One set's machines share its reason, which names the whole set (pages.ts substituteWhy).
    const why = "If LEG PRESS can't be used: LEG EXTENSION + HIP ABDUCTION + LUMBAR.";
    const items = [
      { route: { kind: "machine" as const, id: "m-leg-extension" }, title: "LEG EXTENSION", why },
      { route: { kind: "machine" as const, id: "m-hip-abduction" }, title: "HIP ABDUCTION", why },
      { route: { kind: "machine" as const, id: "m-lumbar" }, title: "LUMBAR", why },
      { route: { kind: "topic" as const, moduleId: "m", topicId: "t" }, title: "A topic", why: "Explains it." },
      { route: { kind: "glossary" as const }, title: "Glossary", why: "The words." },
    ];
    const groups = groupReasons(items);
    expect(groups.map((g) => [g.why, g.items.map((i) => i.title)])).toEqual([
      [why, ["LEG EXTENSION", "HIP ABDUCTION", "LUMBAR"]],
      [null, ["A topic", "Glossary"]],
    ]);
    // Nothing shared: one group, each link with its own reason, the order kept.
    expect(groupReasons(items.slice(2)).map((g) => [g.why, g.items.length])).toEqual([[null, 3]]);
    // An empty reason is never "shared".
    const blank = items.map((i) => ({ ...i, why: "" }));
    expect(groupReasons(blank).map((g) => g.why)).toEqual([null]);
    expect(groupReasons([])).toEqual([]);
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

  it("lays a topic out as 1, 2 and 3 by place on the bar, leaving out an empty tier", () => {
    const sections: VaultSection[] = [{ id: "o", title: "", blocks: [line("a", "One."), line("b", "Two.")] }];
    const say: VaultSection[] = [{ id: "moment-1", title: "To begin", blocks: [line("c", "Slowly begin", "cue")] }];
    expect(topicLayers(sections, say).map((l) => [l.n, l.title, l.partial])).toEqual([
      [1, "In one minute", true],
      [2, "Say it", true],
      [3, "Full text", false],
    ]);
    expect(topicLayers(sections, say)[1].home).toBe("cueing");
    // The Mix's bar: 1 In one minute · 2 Say it · 3 Lesson · 4 Full text.
    expect(topicLayers(sections, say, true).map((l) => [l.n, l.id, l.title, l.partial])).toEqual([
      [1, "minute", "In one minute", true],
      [2, "say", "Say it", true],
      [3, "lesson", "Lesson", true],
      [4, "full", "Full text", false],
    ]);
    // A tier that would be empty is left out and the rest renumber by place.
    expect(topicLayers(sections, [], true).map((l) => [l.n, l.id])).toEqual([
      [1, "minute"],
      [2, "lesson"],
      [3, "full"],
    ]);
    expect(topicLayers([{ id: "o", title: "", blocks: [line("a", "One.")] }], [], true).map((l) => [l.n, l.id])).toEqual([
      [1, "lesson"],
      [2, "full"],
    ]);
    // Say it left out: 1 · 2, never 1 · 4 (a bar that skips a number looks broken).
    expect(topicLayers(sections, []).map((l) => [l.n, l.id])).toEqual([
      [1, "minute"],
      [2, "full"],
    ]);
    expect(topicLayers([{ id: "o", title: "", blocks: [line("a", "One.")] }], []).map((l) => [l.n, l.id])).toEqual([[1, "full"]]);
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

  it("drops the article before matching, and only a whole article", () => {
    // "A Life Transformer" is the title's own words once its article goes.
    expect(whoLine(track("x", "Life Transformer 101", "A Life Transformer"))).toBeNull();
    expect(whoLine(track("x", "For a studio leader", "The studio leader"))).toBeNull();
    expect(whoLine(track("x", "Leading an assessment", "An assessment lead"))).toBe("An assessment lead");
    // A word that merely starts like an article keeps its letters ("As…", "Ass…").
    expect(whoLine(track("x", "For an assistant", "Assistant trainers"))).toBe("Assistant trainers");
    expect(whoLine(track("x", "Sistant trainers 101", "Assistant trainers"))).toBe("Assistant trainers");
  });

  it("names the kind of each step", () => {
    expect(stepKind({ kind: "machine", id: "m" })).toBe("machine");
    expect(stepKind({ kind: "glossary" })).toBe("words");
    expect(stepKind({ kind: "quiz", deck: "mixed" })).toBe("quiz");
    expect(stepKind({ kind: "queue" })).toBe("page");
  });
});

describe("a machine's Academy pieces", () => {
  const machines = [
    { machineId: "m-leg-press", cardId: "lp-card", scriptId: "lp-script", overviewId: "lp-deep" },
    { machineId: "m-pulldown", cardId: null, scriptId: "pd-script", overviewId: null },
  ];
  const name = (id: string) => (id === "m-leg-press" ? "LEG PRESS" : "PULLDOWN");

  it("finds the machine a quick card, script or deep dive belongs to", () => {
    expect(pieceMachineId({ kind: "card", id: "lp-card" }, machines)).toBe("m-leg-press");
    expect(pieceMachineId({ kind: "script", id: "pd-script" }, machines)).toBe("m-pulldown");
    expect(pieceMachineId({ kind: "overview", id: "lp-deep" }, machines)).toBe("m-leg-press");
    expect(pieceMachineId({ kind: "card", id: "nobody's" }, machines)).toBeNull();
    expect(pieceMachineId({ kind: "machine", id: "m-leg-press" }, machines)).toBeNull();
  });

  it("names a piece first, and its machine only where the trail has not just said it", () => {
    expect(pieceLabel({ kind: "card", id: "lp-card" }, machines, name)).toBe("Quick card · LEG PRESS");
    expect(pieceLabel({ kind: "script", id: "lp-script" }, machines, name)).toBe("Script · LEG PRESS");
    expect(pieceLabel({ kind: "overview", id: "lp-deep" }, machines, name)).toBe("Deep dive · LEG PRESS");
    // Right after its own machine in the trail: "Catalog › LEG PRESS › Quick card".
    expect(pieceLabel({ kind: "card", id: "lp-card" }, machines, name, { kind: "machine", id: "m-leg-press" })).toBe("Quick card");
    // After another page, the machine is named.
    expect(pieceLabel({ kind: "card", id: "lp-card" }, machines, name, { kind: "machine", id: "m-pulldown" })).toBe(
      "Quick card · LEG PRESS",
    );
    // Not a machine's piece: the caller's own name.
    expect(pieceLabel({ kind: "card", id: "nobody's" }, machines, name)).toBeNull();
    expect(pieceLabel({ kind: "glossary" }, machines, name)).toBeNull();
  });
});

describe("the version switch's place", () => {
  it("rides the trail's row when the crumbs and the switch fit beside each other", () => {
    // Catalog › LEG PRESS, with a line crossed out, on a portrait iPad.
    expect(versionFitsTrail({ labels: ["Catalog", "LEG PRESS"], struck: true, width: 820 })).toBe(true);
    expect(versionFitsTrail({ labels: ["Overview", "Exercise Performance", "Gradual Load-up"], struck: false, width: 820 })).toBe(true);
  });

  it("goes under the title when the trail would scroll its first crumb off", () => {
    const moment = ["Academy", "Cueing phrasebook", "Before a lower turn where the stack does not touch"];
    expect(versionFitsTrail({ labels: moment, struck: false, width: 820 })).toBe(false);
    // In landscape the same trail has the room.
    expect(versionFitsTrail({ labels: moment, struck: false, width: 1180 })).toBe(true);
    // The hide switch takes room too.
    expect(versionFitsTrail({ labels: ["Overview", "Exercise Performance", "Gradual Load-up"], struck: true, width: 820 })).toBe(false);
  });
});

describe("the switch's place does not hang on the lens", () => {
  it("keeps room for Hide whenever the studio crossed a line out here, or the reader may", () => {
    // A trainer on a page Solon crossed a line out on: the same answer on both lenses (the lens is not an input).
    expect(hideReserved({ studioOpen: true, canStrike: false, studioStruck: 1 })).toBe(true);
    // A leader, before the first strike: the room is already kept, so the first one moves nothing.
    expect(hideReserved({ studioOpen: true, canStrike: true, studioStruck: 0 })).toBe(true);
    expect(hideReserved({ studioOpen: true, canStrike: false, studioStruck: 0 })).toBe(false);
    expect(hideReserved({ studioOpen: false, canStrike: true, studioStruck: 3 })).toBe(false);
    // The reviewer's trail: Overview › Life Transformer 101 › LEG PRESS at 820 goes under the title, on either lens.
    const labels = ["Overview", "Life Transformer 101", "LEG PRESS"];
    const struck = hideReserved({ studioOpen: true, canStrike: false, studioStruck: 1 });
    expect(versionFitsTrail({ labels, struck, width: 820 })).toBe(false);
  });
});

describe("the floor glance", () => {
  const s = (id: string) => ({ id, title: id, blocks: [] as VaultSection["blocks"] });

  it("keeps the Codex's order, Stop first (Safety, the settings, then Notes)", () => {
    const order = floorGlanceOrder([s("leaf-stop"), s("leaf-setup"), s("leaf-getset"), s("leaf-begin")]).map((x) => x.id);
    expect(order).toEqual(["leaf-stop", "leaf-setup", "leaf-getset", "leaf-begin"]);
    // No set-up written: nothing moves, nothing is dropped.
    expect(floorGlanceOrder([s("leaf-stop"), s("leaf-begin")]).map((x) => x.id)).toEqual(["leaf-stop", "leaf-begin"]);
    expect(floorGlanceOrder([])).toEqual([]);
  });

  it("keeps every tier's sections, number and title", () => {
    const tiers = [
      { id: "glance", n: 1, title: "Floor glance", sections: [s("leaf-stop"), s("leaf-setup")] },
      { id: "adapt", n: 3, title: "Adapt & clinical", sections: [s("leaf-wrong"), s("leaf-setup")] },
    ];
    const layers = machineLayers(tiers);
    expect(layers.map((l) => [l.id, l.n, l.title, l.partial])).toEqual([
      ["glance", 1, "Floor glance", true],
      ["adapt", 3, "Adapt & clinical", true],
    ]);
    expect(layers[0].sections.map((x) => x.id)).toEqual(["leaf-stop", "leaf-setup"]);
    expect(layers[1].sections.map((x) => x.id)).toEqual(["leaf-wrong", "leaf-setup"]);
    expect(machineLayers(undefined)).toEqual([]);
  });
});

describe("words", () => {
  it("starts a domain's noun as a sentence does, and numbers a topic in its module", () => {
    expect(domainWords("clinical flag")).toBe("Clinical flag");
    expect(domainWords("")).toBe("");
    expect(chapterNumber(4, 5)).toBe("4.6");
  });
});
