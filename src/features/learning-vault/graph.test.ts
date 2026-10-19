/**
 * THE KNOWLEDGE GRAPH (Learning vault redesign, Oct 19 2026).
 *
 * Holds what graph.ts promises: every link has a reason the repo can show,
 * the words are matched the way the header says (whole words, codes by
 * case, never a machine by its bare code), a clinical flag brings its label
 * and never its instruction, the build is deterministic, and a page's
 * constellation shares its places between the kinds of link.
 */
import { describe, expect, it } from "vitest";
import { CLINICAL_FLAGS_MATRIX } from "../../data/clinical-matrix";
import { buildAcademyMachines } from "../academy/academy-machines";
import cards from "../academy/content/cards.json";
import cuesFile from "../academy/content/cues.json";
import glossaryFile from "../academy/content/glossary.json";
import index from "../academy/content/index.json";
import overviews from "../academy/content/overviews.json";
import scripts from "../academy/content/scripts.json";
import type { AcademyIndex, CardsFile, CuesFile, GlossaryFile, OverviewsFile, ScriptsFile } from "../academy/types";
import { EXERCISE_SUBSTITUTES, MACHINE_CATEGORY } from "../routine-builder/academy";
import graphIndexJson from "./graph-index.json";
import { cueMomentLabel } from "./cue-label";
import {
  CUES_TOPIC_ID,
  CUE_EXAMPLES,
  DOMAIN_COLOUR,
  DOMAIN_LABEL,
  DOMAIN_ORDER,
  EQUIPMENT_FROM,
  KIND_PRIORITY,
  SUBSTITUTE_LABEL,
  blankAbsent,
  buildVaultGraph,
  constellationOf,
  cueLabel,
  glossaryForms,
  groupLinks,
  linkHeading,
  machineForms,
  nodeIdForRoute,
  termForms,
  wordMatcher,
  type GraphIndexFile,
  type VaultGraphInput,
} from "./graph";
import { EXCLUDED_TOPIC_IDS } from "./graph-index-build";
import type { GraphDomain, PlaybookPage, VaultGraph } from "./types";

const INDEX = index as unknown as AcademyIndex;
const GLOSSARY = (glossaryFile as unknown as GlossaryFile).glossary;
const CUES = (cuesFile as unknown as CuesFile).cues;
const MACHINES = buildAcademyMachines(
  (cards as unknown as CardsFile).cards,
  (scripts as unknown as ScriptsFile).scripts,
  (overviews as unknown as OverviewsFile).overviews,
);
const GRAPH_INDEX = graphIndexJson as unknown as GraphIndexFile;

const PLAYBOOK: PlaybookPage = {
  id: "the-floor",
  title: "The twenty minutes on the floor",
  lede: "A fixture.",
  pillar: "floor",
  status: "draft",
  sections: [],
  related: [
    { route: { kind: "machine", id: "m-leg-press" }, title: "Leg Press", why: "fixture" },
    { route: { kind: "topic", moduleId: "performance", topicId: "performance-speed-of-movement" }, title: "Speed", why: "fixture" },
    { route: { kind: "home" }, title: "Home", why: "not a node" },
  ],
};

function input(over: Partial<VaultGraphInput> = {}): VaultGraphInput {
  return {
    index: INDEX,
    machines: MACHINES,
    glossary: GLOSSARY,
    cues: CUES,
    clinical: CLINICAL_FLAGS_MATRIX,
    playbooks: [PLAYBOOK],
    graphIndex: GRAPH_INDEX,
    substitutes: EXERCISE_SUBSTITUTES,
    categories: MACHINE_CATEGORY,
    ...over,
  };
}

const graph = buildVaultGraph(input());
const node = (g: VaultGraph, id: string) => g.nodes.find((n) => n.id === id);
const edgesBetween = (g: VaultGraph, a: string, b: string) =>
  g.edges.filter((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));

describe("words", () => {
  it("reads a glossary term's brackets the way the header says", () => {
    expect(termForms("Failure (Fatigue)")).toEqual({ words: ["failure"], codes: [] });
    expect(termForms("Timed Static Contraction (TSC)")).toEqual({ words: ["timed static contraction"], codes: ["TSC"] });
    expect(termForms("Lower Turnaround (Lower Turn/Bottom)")).toEqual({ words: ["lower turnaround", "lower turn"], codes: [] });
    expect(termForms("Tension (also Mechanical Tension or Muscular Tension)").words).toEqual([
      "tension",
      "mechanical tension",
      "muscular tension",
    ]);
    expect(termForms("Movement Arm (or Work Arm)").words).toEqual(["movement arm", "work arm"]);
    expect(termForms("Contract(ion)").words).toEqual(["contract", "contraction"]);
    expect(termForms("Assumed vs. Real Objective (of exercise)").words).toEqual(["assumed vs. real objective"]);
  });

  it("gives a shared form to the first term that has it", () => {
    const forms = glossaryForms(GLOSSARY);
    expect(forms.get("Range of Motion (ROM)")).toEqual({ words: ["range of motion"], codes: ["ROM"] });
    expect(forms.get("Range of Motion (of machine)")).toEqual({ words: [], codes: [] });
  });

  it("matches whole words with a plural, and codes only in capitals", () => {
    const m = wordMatcher({ words: ["lower turnaround"], codes: ["TSC"] })!;
    expect(m.count("Lower turnarounds matter. A lower  turnaround too.")).toBe(2);
    expect(m.count("the slower turnaround")).toBe(0);
    expect(m.count("TSC, not tsc")).toBe(1);
    expect(m.first("we do TSC")).toBe(6);
    expect(m.first("nothing here")).toBe(-1);
    expect(wordMatcher({ words: [], codes: [] })).toBeNull();
  });

  it("finds a machine by its names and never by a bare code", () => {
    const codes = ["LP", "Cx", "Abs", "Biceps", "Flye"];
    expect(machineForms(["CHEST/PEC FLY", "Chest Flye"], codes).words).toEqual(["chest fly", "pec fly", "chest flye"]);
    expect(machineForms(["CX (4 WAY NECK)", "Cervical Extension"], codes).words).toEqual(["4 way neck", "cervical extension"]);
    // A one-word name that is a muscle or an everyday word counts nothing: "BICEP"
    // would count every "biceps", "Overhead" every "overhead storage".
    expect(machineForms(["BICEP", "Biceps Curl", "Biceps"], codes).words).toEqual(["biceps curl"]);
    expect(machineForms(["OVERHEAD PRESS", "Overhead"], codes).words).toEqual(["overhead press"]);
    expect(machineForms(["SEATED ABDOMINALS", "Abs"], codes).words).toEqual(["seated abdominals"]);
    expect(machineForms(["LUMBAR", "Lumbar Extension (Lumbar, Lower Back)"], codes).words).toEqual(["lumbar", "lumbar extension"]);
    expect(machineForms(["LP"], codes).words).toEqual([]);
  });
});

describe("cue moments", () => {
  it("label the turnaround moments by what tells them apart, in the cueing page's own words", () => {
    expect(cueLabel(CUES[6].moment)).toBe("Before a lower turn where the stack touches");
    expect(cueLabel(CUES[7].moment)).toBe("Before a lower turn where the stack does not touch");
    expect(cueLabel("Speed of Motion")).toBe("Speed of motion");
    expect(cueLabel("To begin the exercise - pulling movement")).toBe("To begin: a pulling movement");
    for (const c of CUES) expect(cueLabel(c.moment)).toBe(cueMomentLabel(c.moment));
  });

  it("read each example list from a real heading that names those machines", () => {
    for (const ex of CUE_EXAMPLES) {
      const hits = CUES.filter((c) => c.moment.startsWith(ex.prefix));
      expect(hits, ex.prefix).toHaveLength(1);
      expect(ex.machineIds.length).toBeGreaterThan(0);
      for (const id of ex.machineIds) expect(MACHINES.some((m) => m.machineId === id), id).toBe(true);
    }
  });

  it("are explained in a topic the index has", () => {
    expect(INDEX.modules.some((m) => m.topics.some((t) => t.id === CUES_TOPIC_ID))).toBe(true);
  });
});

describe("the glossary's two runs", () => {
  it("turns to equipment words where the Academy's Equipment Nomenclature starts", () => {
    expect(GLOSSARY[EQUIPMENT_FROM - 1].term).toBe("Volume");
    expect(GLOSSARY[EQUIPMENT_FROM].term).toBe("Accessory stack");
    expect(node(graph, "term:volume")?.domain).toBe("method");
    expect(node(graph, "term:accessory stack")?.domain).toBe("equipment");
  });
});

describe("nodeIdForRoute", () => {
  it("names the node each page stands for", () => {
    expect(nodeIdForRoute({ kind: "machine", id: "m-leg-press" })).toBe("machine:m-leg-press");
    expect(nodeIdForRoute({ kind: "topic", moduleId: "mastery", topicId: "mastery-pace" })).toBe("topic:mastery-pace");
    expect(nodeIdForRoute({ kind: "module", moduleId: "mastery" })).toBe("module:mastery");
    expect(nodeIdForRoute({ kind: "glossary", term: "Failure (Fatigue)" })).toBe("term:failure (fatigue)");
    expect(nodeIdForRoute({ kind: "cueing", moment: 3 })).toBe("cue:3");
    expect(nodeIdForRoute({ kind: "playbook", id: "the-floor" })).toBe("playbook:the-floor");
    expect(nodeIdForRoute({ kind: "map", focus: "clinical:bone-osteoporosis" })).toBe("clinical:bone-osteoporosis");
  });

  it("is null for a page that is not one node", () => {
    for (const route of [
      { kind: "home" },
      { kind: "glossary" },
      { kind: "cueing" },
      { kind: "card", id: "lp" },
      { kind: "quiz" },
      { kind: "map" },
    ] as const) {
      expect(nodeIdForRoute(route)).toBeNull();
    }
  });

  it("round-trips every node's own route", () => {
    for (const n of graph.nodes) expect(nodeIdForRoute(n.route), n.id).toBe(n.id);
  });
});

describe("buildVaultGraph", () => {
  it("holds the curriculum, the machines, the glossary, the cues, the flags that name a machine, the playbooks", () => {
    const count = (d: GraphDomain) => graph.nodes.filter((n) => n.domain === d).length;
    expect(count("module")).toBe(INDEX.modules.length);
    expect(count("topic")).toBe(INDEX.modules.reduce((n, m) => n + m.topics.length, 0));
    expect(count("machine")).toBe(20);
    expect(count("method") + count("equipment")).toBe(GLOSSARY.length);
    expect(count("cue")).toBe(CUES.length);
    expect(count("playbook")).toBe(1);
    const naming = CLINICAL_FLAGS_MATRIX.filter((f) => f.protocolHandling.some((h) => h.affectedMachineIds.length > 0));
    expect(count("clinical")).toBe(naming.length);
    expect(graph.nodes.length).toBeLessThanOrEqual(250);
  });

  it("is the same graph every time", () => {
    expect(buildVaultGraph(input())).toEqual(graph);
  });

  it("joins only nodes it has, never a node to itself, never the same link twice", () => {
    const ids = new Set(graph.nodes.map((n) => n.id));
    const seen = new Set<string>();
    for (const e of graph.edges) {
      expect(ids.has(e.from) && ids.has(e.to), `${e.from} -> ${e.to}`).toBe(true);
      expect(e.from).not.toBe(e.to);
      const key = `${e.kind}|${e.from}|${e.to}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      expect(e.label.length).toBeGreaterThan(0);
    }
  });

  it("weighs each node by its links", () => {
    for (const n of graph.nodes) {
      const links = graph.edges.filter((e) => e.from === n.id || e.to === n.id).length;
      expect(n.weight, n.id).toBe(links);
    }
  });

  it("draws the Academy's substitutes and families", () => {
    const sub = edgesBetween(graph, "machine:m-ext", "machine:m-leg-press").find((e) => e.kind === "substitutes");
    expect(sub).toMatchObject({ from: "machine:m-ext", to: "machine:m-leg-press", label: "is part of a set that replaces" });
    expect(edgesBetween(graph, "machine:m-leg-press", "machine:m-leg-curl").some((e) => e.kind === "same-category")).toBe(true);
    expect(edgesBetween(graph, "machine:m-leg-press", "machine:m-pulldown").some((e) => e.kind === "same-category")).toBe(false);
  });

  it("explains a term in the topics its title names, and the cue moments in the cues topic", () => {
    const pace = graph.edges.filter((e) => e.from === "term:pace" && e.kind === "explained-in").map((e) => e.to);
    expect(pace).toContain("topic:mastery-pace");
    expect(pace.length).toBeLessThanOrEqual(3);
    expect(graph.edges.some((e) => e.from === "cue:3" && e.to === `topic:${CUES_TOPIC_ID}` && e.kind === "explained-in")).toBe(true);
  });

  it("cues the machines a turnaround heading names", () => {
    const squeeze = CUES.findIndex((c) => c.moment.startsWith("Upper Turnaround (movements without an end stop"));
    expect(graph.edges.some((e) => e.from === "machine:m-lumbar" && e.to === `cue:${squeeze}` && e.kind === "cued-at")).toBe(true);
  });

  it("brings a clinical flag's label and the machines it names, never its instruction", () => {
    const flag = CLINICAL_FLAGS_MATRIX.find((f) => f.id === "bone-osteoporosis")!;
    const n = node(graph, "clinical:bone-osteoporosis")!;
    expect(n.label).toBe(flag.conditionName);
    expect(n.route).toEqual({ kind: "map", focus: "clinical:bone-osteoporosis" });
    const affected = graph.edges.filter((e) => e.from === n.id && e.kind === "affects").map((e) => e.to).sort();
    expect(affected).toEqual(["machine:m-abs", "machine:m-leg-press", "machine:m-lumbar", "machine:m-torso-rotation"]);
    const instructions = CLINICAL_FLAGS_MATRIX.flatMap((f) => f.protocolHandling.map((h) => h.instruction));
    for (const x of graph.nodes) expect(instructions).not.toContain(x.label);
    expect(node(graph, "clinical:cv-hypertension")).toBeUndefined();
  });

  it("links a playbook to the pages it names, and skips a route that is not a node", () => {
    const out = graph.edges.filter((e) => e.from === "playbook:the-floor").map((e) => `${e.kind}:${e.to}`);
    expect(out).toEqual(["playbook-for:machine:m-leg-press", "playbook-for:topic:performance-speed-of-movement"]);
  });

  it("drops a topic the Academy index no longer has, and builds with nothing loaded yet", () => {
    const stale: GraphIndexFile = { corpusHash: "x", termTopics: { Pace: ["gone-topic", "mastery-pace"] }, machineTopics: { "m-lumbar": ["gone-topic"] } };
    const g = buildVaultGraph(input({ graphIndex: stale }));
    expect(g.edges.some((e) => e.from === "topic:gone-topic" || e.to === "topic:gone-topic")).toBe(false);
    const bare = buildVaultGraph(input({ glossary: null, cues: null, clinical: [], playbooks: [] }));
    expect(bare.nodes.every((n) => n.domain === "module" || n.domain === "topic" || n.domain === "machine")).toBe(true);
  });
});

describe("constellationOf", () => {
  it("is null for a node the graph does not have", () => {
    expect(constellationOf(graph, "machine:nope")).toBeNull();
  });

  it("keeps one link per neighbour, the strongest reason", () => {
    const c = constellationOf(graph, "machine:m-leg-press", 500)!;
    const ids = c.links.map((l) => l.node.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Leg Extension is both in sets that replace Leg Press and in its family: substitutes wins.
    expect(c.links.find((l) => l.node.id === "machine:m-ext")?.edge.kind).toBe("substitutes");
  });

  it("shares its places between the kinds of link instead of filling them with one", () => {
    const c = constellationOf(graph, "machine:m-leg-press", 8)!;
    expect(c.links).toHaveLength(8);
    const kinds = new Set(c.links.map((l) => l.edge.kind));
    expect(kinds.has("substitutes")).toBe(true);
    expect(kinds.has("affects")).toBe(true);
    expect(kinds.has("mentions")).toBe(true);
  });

  it("orders its links by the strength of the reason, a group at a time", () => {
    const c = constellationOf(graph, "term:pace", 40)!;
    const ranks = c.links.map((l) => KIND_PRIORITY.indexOf(l.edge.kind));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    expect(c.links[0].edge.kind).toBe("explained-in");
  });

  it("can be asked for nothing", () => {
    expect(constellationOf(graph, "machine:m-leg-press", 0)!.links).toEqual([]);
  });
});

describe("headings", () => {
  it("say a link from the centre's side", () => {
    const c = constellationOf(graph, "machine:m-leg-press", 500)!;
    const groups = groupLinks(c);
    const headings = groups.map((g) => g.heading);
    expect(headings).toContain("In sets that replace it");
    expect(headings).toContain("Clinical flags");
    expect(headings).toContain("Comes up in");
    expect(new Set(groups.map((g) => g.key)).size).toBe(groups.length);
    const ext = constellationOf(graph, "machine:m-ext", 500)!;
    expect(groupLinks(ext).map((g) => g.heading)).toContain("Part of a set that replaces");
  });

  it("read the same both ways for a family", () => {
    const edge = { from: "a", to: "b", kind: "same-category" as const, label: "x" };
    expect(linkHeading({ edge, direction: "in" })).toBe(linkHeading({ edge, direction: "out" }));
  });
});

describe("substitutes say the Academy's sets truthfully", () => {
  const subs = () => graph.edges.filter((e) => e.kind === "substitutes");

  it("a machine in a set of two or more is part of a set that replaces the main one, never a substitute for it", () => {
    for (const e of subs()) expect(e.label).not.toMatch(/substitutes for/);
    // Leg Extension only ever comes with others for the Leg Press.
    expect(edgesBetween(graph, "machine:m-ext", "machine:m-leg-press").find((e) => e.kind === "substitutes")?.label).toBe(
      SUBSTITUTE_LABEL.inSet,
    );
  });

  it("only a set of one says one for one: Chest Press can replace Overhead Press", () => {
    const e = edgesBetween(graph, "machine:m-chest-press", "machine:m-overhead-press").find(
      (x) => x.kind === "substitutes" && x.from === "machine:m-chest-press",
    );
    expect(e?.label).toBe(SUBSTITUTE_LABEL.alone);
    // On Overhead Press, Dip (a set of one) can replace it. (Chest Press is
    // linked both ways, and a neighbour shows once: either way it says true.)
    const ohp = groupLinks(constellationOf(graph, "machine:m-overhead-press", 500)!);
    const alone = ohp.find((g) => g.heading === "Can be replaced by");
    expect(alone?.links.map((l) => l.node.id)).toContain("machine:m-dip");
    for (const g of ohp) {
      for (const l of g.links.filter((x) => x.edge.kind === "substitutes")) {
        const solo = l.edge.label === SUBSTITUTE_LABEL.alone;
        const want = l.direction === "in" ? (solo ? "Can be replaced by" : "In sets that replace it") : solo ? "Can replace" : "Part of a set that replaces";
        expect(g.heading, l.node.id).toBe(want);
      }
    }
  });

  it("every label matches the Academy's table: alone only where a set is that machine alone", () => {
    for (const [main, sets] of Object.entries(EXERCISE_SUBSTITUTES)) {
      for (const set of sets) {
        for (const id of set.machineIds) {
          const e = graph.edges.find((x) => x.kind === "substitutes" && x.from === `machine:${id}` && x.to === `machine:${main}`);
          if (!e) continue;
          const alone = sets.some((s) => s.machineIds.length === 1 && s.machineIds[0] === id);
          expect(e.label, `${id} → ${main}`).toBe(alone ? SUBSTITUTE_LABEL.alone : SUBSTITUTE_LABEL.inSet);
        }
      }
    }
  });

  it("groups a machine's set partners apart from its one-for-one replacements", () => {
    const edge = (label: string) => ({ from: "a", to: "b", kind: "substitutes" as const, label });
    expect(linkHeading({ edge: edge(SUBSTITUTE_LABEL.inSet), direction: "in" })).toBe("In sets that replace it");
    expect(linkHeading({ edge: edge(SUBSTITUTE_LABEL.inSet), direction: "out" })).toBe("Part of a set that replaces");
    expect(linkHeading({ edge: edge(SUBSTITUTE_LABEL.alone), direction: "in" })).toBe("Can be replaced by");
    expect(linkHeading({ edge: edge(SUBSTITUTE_LABEL.alone), direction: "out" })).toBe("Can replace");
  });
});

describe("domains", () => {
  it("each have a label and a colour from Learning's tokens, never orange or crimson", () => {
    expect(new Set(DOMAIN_ORDER).size).toBe(8);
    for (const d of DOMAIN_ORDER) {
      expect(DOMAIN_LABEL[d].length).toBeGreaterThan(0);
      for (const v of Object.values(DOMAIN_COLOUR[d])) {
        expect(v).toMatch(/^var\(--wk-[a-z0-9-]+\)$/);
        expect(v).not.toMatch(/--wk-(hero|alert)/);
      }
    }
    expect(DOMAIN_COLOUR.clinical.accent).toBe("var(--wk-warn)");
  });
});

/** The content review (Oct 19 2026): every link says something true. */
describe("the content review's corrections", () => {
  const kindsBetween = (a: string, b: string) => edgesBetween(graph, a, b).map((e) => e.kind);

  it("explains a term only in a title that is about it, not about a longer term inside which it sits", () => {
    // "Timed Static Contraction (TSC)" is TSC's, not Contract(ion)'s.
    expect(kindsBetween("term:contract(ion)", "topic:variations-timed-static-contraction-tsc")).not.toContain("explained-in");
    expect(kindsBetween("term:timed static contraction (tsc)", "topic:variations-timed-static-contraction-tsc")).toContain("explained-in");
    // "High-Intensity" titles are High Intensity's (the hyphen bends), not Intensity's.
    for (const t of ["topic:mastery-the-benefits-of-high-intensity-resistance-training", "topic:further-msf-fundamentals-of-high-intensity-exercise"]) {
      expect(kindsBetween("term:intensity", t), t).not.toContain("explained-in");
    }
    expect(kindsBetween("term:high intensity", "topic:mastery-the-benefits-of-high-intensity-resistance-training")).toContain("explained-in");
    expect(wordMatcher({ words: ["high intensity"], codes: [] })!.first("The Benefits of High-Intensity Resistance Training")).toBe(16);
  });

  it("never says the squeeze moment talks about End Stop: its heading names it by its absence", () => {
    const squeezeMoment = CUES.findIndex((c) => c.moment.startsWith("Upper Turnaround (movements without an end stop"));
    expect(squeezeMoment).toBeGreaterThanOrEqual(0);
    expect(kindsBetween(`cue:${squeezeMoment}`, "term:end stop")).toEqual([]);
    // The moment that IS about an end stop still says so.
    const endStopMoment = CUES.findIndex((c) => c.moment.startsWith("Upper Turnaround (movements with an end stop"));
    expect(kindsBetween(`cue:${endStopMoment}`, "term:end stop")).toContain("mentions");
    expect(blankAbsent("movements without an end stop and")).toBe("movements                     and");
  });

  it("draws no see-also from a word used in its everyday sense", () => {
    // "For our purposes" (Force, Volume, Stretch); "The purpose of an end stop".
    for (const t of ["term:force", "term:volume", "term:stretch", "term:end stop"]) {
      expect(kindsBetween(t, "term:purpose"), t).not.toContain("see-also");
    }
    // "the continuous renewal of bone tissue".
    expect(kindsBetween("term:bone density (remodeling)", "term:continuous")).not.toContain("see-also");
  });

  it("never links a term or a machine to a page the round keeps out", () => {
    for (const e of graph.edges) {
      if (!e.from.startsWith("term:") && !e.from.startsWith("machine:") && !e.to.startsWith("term:") && !e.to.startsWith("machine:")) continue;
      for (const end of [e.from, e.to]) {
        if (!end.startsWith("topic:")) continue;
        expect(EXCLUDED_TOPIC_IDS.has(end.slice("topic:".length)), `${e.from} ${e.kind} ${e.to}`).toBe(false);
      }
    }
  });
});
