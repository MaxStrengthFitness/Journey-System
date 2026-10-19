/**
 * The vault's entities: the matcher's rules, the cards' words, and the
 * promise that every rule card QUOTES the Academy topic it names.
 *
 * The corpus is imported statically here (tests may; source files never do).
 */
import { describe, expect, it } from "vitest";
import glossaryFile from "../academy/content/glossary.json";
import cardsFile from "../academy/content/cards.json";
import scriptsFile from "../academy/content/scripts.json";
import overviewsFile from "../academy/content/overviews.json";
import indexFile from "../academy/content/index.json";
import intro from "../academy/content/intro.json";
import benefits from "../academy/content/benefits.json";
import principles from "../academy/content/principles.json";
import performance from "../academy/content/performance.json";
import continuousTension from "../academy/content/continuous-tension.json";
import programming from "../academy/content/programming.json";
import variations from "../academy/content/variations.json";
import equipment from "../academy/content/equipment.json";
import instruction from "../academy/content/instruction.json";
import mastery from "../academy/content/mastery.json";
import consultation from "../academy/content/consultation.json";
import further from "../academy/content/further.json";
import summaryModule from "../academy/content/summary.json";
import { buildAcademyMachines, cardTitle, scriptTitle } from "../academy/academy-machines";
import type { AcademyIndex, MachineScript, ModuleContent, OverviewsFile, QuickCard } from "../academy/types";
import { CLINICAL_FLAGS_MATRIX } from "../../data/clinical-matrix";
import { MACHINE_DEFINITIONS } from "../../data/machine-definitions";
import type { LinkedSegment, PlaybookPage } from "./types";
import {
  ACADEMY_MACHINE_WORDS,
  RULE_ENTITIES,
  TOPIC_LINK_WORDS,
  buildEntityIndex,
  clinicalAliases,
  clinicalMachineIds,
  clinicalSummary,
  conceptCard,
  firstSentences,
  isLinkableCode,
  linkText,
  machineNameWords,
  pushConcept,
  seeAlsoNames,
  termEntityId,
  termSummary,
  topicLabel,
  type EntityIndex,
} from "./entities";

const glossary = (glossaryFile as { glossary: { term: string; definition: string }[] }).glossary;
const cards = (cardsFile as unknown as { cards: QuickCard[] }).cards;
const scripts = (scriptsFile as unknown as { scripts: MachineScript[] }).scripts;
const overviews = (overviewsFile as unknown as OverviewsFile).overviews;
const academyIndex = indexFile as unknown as AcademyIndex;
const MODULES: Record<string, ModuleContent> = Object.fromEntries(
  [intro, benefits, principles, performance, continuousTension, programming, variations, equipment, instruction, mastery, consultation, further, summaryModule].map(
    (m) => [(m as ModuleContent).id, m as unknown as ModuleContent],
  ),
);

const machines = buildAcademyMachines(cards, scripts, overviews);

const playbook: PlaybookPage = {
  id: "the-twenty-minutes",
  title: "The twenty minutes on the floor",
  lede: "One set to failure on five to eight machines, and what a trainer does at each.",
  pillar: "floor",
  status: "draft",
  sections: [],
  related: [
    { route: { kind: "machine", id: "m-leg-press" }, title: "Leg Press", why: "the first machine" },
    { route: { kind: "glossary", term: "Inroad" }, title: "Inroad", why: "the word" },
    { route: { kind: "topic", moduleId: "performance", topicId: "performance-set-duration" }, title: "Set Duration", why: "how long" },
    { route: { kind: "quiz" }, title: "Quiz", why: "not an entity" },
  ],
};

const realIndex: EntityIndex = buildEntityIndex({
  glossary,
  machines,
  clinical: CLINICAL_FLAGS_MATRIX,
  playbooks: [playbook],
  modules: academyIndex.modules,
});

/** The ids of the linked segments, in order. */
function linked(text: string, index: EntityIndex | null = realIndex, opts?: Parameters<typeof linkText>[2]): string[] {
  return linkText(text, index, opts)
    .map((s) => s.entityId)
    .filter((id): id is string => !!id);
}

function joined(segments: LinkedSegment[]): string {
  return segments.map((s) => s.text).join("");
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

describe("RULE_ENTITIES: the method's rules, quoted", () => {
  it("has unique ids, all rules, each with words that can link", () => {
    const ids = RULE_ENTITIES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(10);
    for (const r of RULE_ENTITIES) {
      expect(r.kind).toBe("rule");
      expect(r.id.startsWith("rule:")).toBe(true);
      expect(r.aliases.length).toBeGreaterThan(0);
      for (const a of r.aliases) expect(a).toBe(a.toLowerCase());
    }
    // The contract's named rules are all here.
    for (const id of ["rule:four-ps", "rule:tsc", "rule:static-hold", "rule:gradual-load-up", "rule:turnarounds", "rule:handoff"]) {
      expect(ids).toContain(id);
    }
  });

  it("quotes every summary, word for word, from the Academy topic its route opens", () => {
    for (const r of RULE_ENTITIES) {
      expect(r.route.kind).toBe("topic");
      if (r.route.kind !== "topic") continue;
      const mod = MODULES[r.route.moduleId];
      expect(mod, `${r.id}: module ${r.route.moduleId}`).toBeTruthy();
      const topic = mod.topics.find((t) => t.id === (r.route as { topicId: string }).topicId);
      expect(topic, `${r.id}: topic`).toBeTruthy();
      const quote = squash(r.summary);
      const found = topic!.blocks.some((b) => squash(b.text).includes(quote));
      expect(found, `${r.id}: "${quote.slice(0, 60)}…" is not in ${topic!.id}`).toBe(true);
      // The source line names the topic the quotation is from.
      expect(r.source.endsWith(topic!.title), `${r.id} source`).toBe(true);
      expect(r.source).toContain(mod.title);
    }
  });

  it("points only at things that exist in the real corpus", () => {
    for (const r of RULE_ENTITIES) {
      for (const id of r.related) expect(realIndex.byId.has(id), `${r.id} -> ${id}`).toBe(true);
    }
  });

  it("never states a rep count as a rule (the-floor.md: the advised range is never a target)", () => {
    for (const r of RULE_ENTITIES) {
      expect(r.summary).not.toMatch(/\b\d+\s*(to|-)\s*\d+\s*(reps|repetitions)\b/i);
    }
  });

  it("is never mutated by building an index", () => {
    const before = JSON.stringify(RULE_ENTITIES);
    buildEntityIndex({ glossary, machines, clinical: CLINICAL_FLAGS_MATRIX, playbooks: [], modules: academyIndex.modules });
    expect(JSON.stringify(RULE_ENTITIES)).toBe(before);
  });
});

describe("the words a machine is known by", () => {
  const academyNames = new Set<string>();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const o of overviews) {
    academyNames.add(norm(o.title));
    const bracket = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(o.title);
    if (bracket) {
      academyNames.add(norm(bracket[1]));
      for (const part of bracket[2].split(",")) academyNames.add(norm(part));
    }
  }
  for (const s of scripts) academyNames.add(norm(scriptTitle(s)));
  for (const c of cards) academyNames.add(norm(cardTitle(c)));

  it("takes every Academy name from the corpus itself", () => {
    for (const [machineId, words] of Object.entries(ACADEMY_MACHINE_WORDS)) {
      expect(MACHINE_DEFINITIONS[machineId], machineId).toBeTruthy();
      for (const w of words) expect(academyNames.has(norm(w)), `${machineId}: ${w}`).toBe(true);
    }
  });

  it("keeps a name's bracket and drops a lone body part", () => {
    expect(machineNameWords("CX (4 WAY NECK)")).toEqual(["CX (4 WAY NECK)", "CX", "4 WAY NECK"]);
    expect(machineNameWords("LUMBAR")).toEqual([]);
    expect(machineNameWords("BICEP")).toEqual([]);
    expect(machineNameWords("LEG PRESS")).toEqual(["LEG PRESS", "LEG PRESS"]);
    // A one-word bracket is a maker or a model, never a word to link.
    expect(machineNameWords("Leg Press (Hammer)")).toEqual(["Leg Press (Hammer)", "Leg Press"]);
  });

  it("links a studio's renamed machine by its own name, and never by its maker", () => {
    const renamed = buildEntityIndex({
      glossary: null,
      machines: [{ machineId: "m-leg-press", name: "Leg Press (Nautilus)", abbr: "LP", cardId: "lp", scriptId: null, overviewId: null, workout: "Lower Body" }],
      clinical: [],
      playbooks: [],
      modules: [],
    });
    expect(linked("The Leg Press, after Nautilus.", renamed)).toEqual(["machine:m-leg-press"]);
    expect(renamed.byId.get("machine:m-leg-press")!.label).toBe("Leg Press (Nautilus)");
  });

  it("links a machine by the Catalog's name, the Academy's names and its code in capitals", () => {
    expect(linked("Set up the Leg Press.")).toEqual(["machine:m-leg-press"]);
    expect(linked("The Chest Flye and the Cervical Extension.")).toEqual(["machine:m-chest-fly", "machine:m-neck"]);
    expect(linked("Then the Torso Arm.")).toEqual(["machine:m-pulldown"]);
    expect(linked("LE + LC")).toEqual(["machine:m-ext", "machine:m-leg-curl"]);
    expect(linked("A - SR, TR, OH, Pd, LP")).toEqual([
      "machine:m-simple-row",
      "machine:m-torso-rotation",
      "machine:m-overhead-press",
      "machine:m-leg-press",
    ]);
  });

  it("never links a code in lower case, inside a word, or one that is an ordinary word", () => {
    expect(linked("lp and help and HELP")).toEqual([]);
    expect(linked("ADD, ABD and Abs")).toEqual([]);
    expect(isLinkableCode("ADD")).toBe(false);
    expect(isLinkableCode("Pd")).toBe(false);
    expect(isLinkableCode("LP")).toBe(true);
  });

  it("does not link the muscle when the machine shares its name", () => {
    expect(linked("Keep the lumbar spine neutral; the biceps assist.")).not.toContain("machine:m-lumbar");
    expect(linked("Keep the lumbar spine neutral; the biceps assist.")).not.toContain("machine:m-bicep");
  });

  it("says the Catalog's line under the name, and what the definition records", () => {
    const pulldown = realIndex.byId.get("machine:m-pulldown")!;
    expect(pulldown.summary).toContain(MACHINE_DEFINITIONS["m-pulldown"].clinicalNote);
    expect(pulldown.summary).toContain("It starts with a handoff.");
    expect(pulldown.related).toContain("rule:handoff");
    expect(pulldown.related).toContain("rule:squeeze");
    expect(pulldown.source).toBe("Machine definition");
    const lumbar = realIndex.byId.get("machine:m-lumbar")!;
    expect(lumbar.summary).toContain("It is never taken to failure.");
    const press = realIndex.byId.get("machine:m-leg-press")!;
    expect(press.related).toContain("rule:gradual-load-up");
    expect(press.related).toContain("term:end stop");
    // The clinical flags that name it point back.
    expect(press.related).toContain("clinical:bone-osteoporosis");
    expect(press.codes).toEqual(["LP"]);
    expect(press.route).toEqual({ kind: "machine", id: "m-leg-press" });
  });
});

describe("the glossary", () => {
  it("makes one entity per term, its card the definition's first sentence with the capital back", () => {
    for (const g of glossary) {
      const e = realIndex.byId.get(termEntityId(g.term));
      expect(e, g.term).toBeTruthy();
      expect(e!.route).toEqual({ kind: "glossary", term: g.term });
      expect(e!.summary[0]).toBe(e!.summary[0].toUpperCase());
      // Verbatim: the summary is the definition's opening, capital aside.
      expect(squash(g.definition).toLowerCase().startsWith(e!.summary.toLowerCase())).toBe(true);
    }
    const concentric = realIndex.byId.get("term:concentric")!;
    expect(concentric.summary.startsWith("The positive or lifting phase of a repetition (i.e. the actual lifting of the weight).")).toBe(true);
  });

  it("never links a term under four letters (Gap) and links a bare word (Failure)", () => {
    expect(linked("Check the gap before the set.")).toEqual([]);
    expect(linked("Train to failure.")).toEqual(["term:failure (fatigue)"]);
    expect(linked("Each contraction.")).toEqual(["term:contract(ion)"]);
    expect(linked("Keep the mechanical tension.")).toEqual(["term:tension (also mechanical tension or muscular tension)"]);
    expect(linked("Watch the ROM and the EIH.")).toEqual(["term:range of motion (rom)", "term:exercise induced headache (eih)"]);
  });

  it("lets the longest words win", () => {
    expect(linked("At the lower turnaround")).toEqual(["term:lower turnaround (lower turn/bottom)"]);
    expect(linked("Every turnaround")).toEqual(["rule:turnarounds"]);
    expect(linked("The continuous tension method")).toEqual(["rule:continuous-tension"]);
    expect(linked("Be continuous")).toEqual(["term:continuous"]);
  });

  it("gives the rule, not the glossary, the words both claim, and the rule points on to the term", () => {
    expect(linked("Use a static hold, or a timed static contraction (TSC).")).toEqual(["rule:static-hold", "rule:tsc"]);
    expect(realIndex.byId.get("rule:static-hold")!.related).toContain("term:static hold");
    expect(realIndex.byId.get("term:static hold")!.aliases).toEqual([]);
  });

  it("connects a term to its See also first", () => {
    expect(realIndex.byId.get("term:pace")!.related[0]).toBe("term:speed");
    expect(realIndex.byId.get("term:selector pin")!.related).toContain("term:stack pin");
    expect(realIndex.byId.get(termEntityId("Intent (Purpose)"))!.related).toContain(
      termEntityId("Assumed vs. Real Objective (of exercise)"),
    );
    expect(seeAlsoNames("x. See also Failure and Fatigue for more.")).toEqual(["Failure", "Fatigue"]);
    expect(seeAlsoNames("See also Intent, Pace, and Tension.")).toEqual(["Intent", "Pace", "Tension"]);
  });
});

describe("the clinical matrix: names and counts, never the instruction text", () => {
  /** A flag that names one of the Academy's machines: the ones the map (graph.ts) draws. */
  const academyIds = new Set(machines.map((m) => m.machineId));
  const onTheMap = CLINICAL_FLAGS_MATRIX.filter((f) => clinicalMachineIds(f).some((id) => academyIds.has(id)));

  it("makes one entity per matrix entry that names a machine, opened on the map", () => {
    expect(onTheMap.length).toBeGreaterThan(10);
    for (const flag of CLINICAL_FLAGS_MATRIX) {
      if (onTheMap.includes(flag)) continue;
      // Not on the map, so "Show on the map" would land on nothing: no card
      // (wave A integration, Oct 19 2026).
      expect(realIndex.byId.has(`clinical:${flag.id}`), flag.id).toBe(false);
    }
    for (const flag of onTheMap) {
      const e = realIndex.byId.get(`clinical:${flag.id}`)!;
      expect(e, flag.id).toBeTruthy();
      expect(e.kind).toBe("clinical");
      expect(e.label).toBe(flag.label ?? flag.conditionName);
      expect(e.route).toEqual({ kind: "map", focus: `clinical:${flag.id}` });
      expect(e.source).toBe("Clinical matrix");
    }
  });

  it("writes its card from the group and the count alone", () => {
    for (const flag of onTheMap) {
      const e = realIndex.byId.get(`clinical:${flag.id}`)!;
      expect(e.summary).toMatch(/^A clinical flag in the matrix's .+ group\. It names (one|two|three|four|five|six|seven|eight|nine|ten|\d+) machines?\.$/);
      // No run of five words from any instruction reaches the card.
      for (const h of flag.protocolHandling) {
        const words = h.instruction.split(/\s+/);
        for (let i = 0; i + 5 <= words.length; i++) {
          expect(e.summary).not.toContain(words.slice(i, i + 5).join(" "));
        }
        if (h.setupModification) expect(e.summary).not.toContain(h.setupModification.slice(0, 30));
      }
    }
    const osteo = CLINICAL_FLAGS_MATRIX.find((f) => f.id === "bone-osteoporosis")!;
    expect(clinicalSummary(osteo)).toBe("A clinical flag in the matrix's Bone Density & Aging group. It names four machines.");
    // Database keys become machine ids; two keys for one machine count once.
    const neck = CLINICAL_FLAGS_MATRIX.find((f) => f.id === "gen-neck")!;
    expect(clinicalMachineIds(neck)).toEqual(["m-neck", "m-overhead-press"]);
  });

  it("links a condition by its name and its parts, never a lone ordinary word", () => {
    expect(linked("Is it safe with osteoporosis?")).toEqual(["clinical:bone-osteoporosis"]);
    // A bracket that is itself a name links too. (Spinal deformity names no
    // machine, so it has no card in the real index; its words are checked here.)
    expect(clinicalAliases({ category: "Spinal & Cervical", conditionName: "Adult Spinal Deformity (Scoliosis / Hyper-Kyphosis)" })).toContain(
      "Scoliosis",
    );
    expect(linked("Mild scoliosis")).toEqual([]);
    expect(linked("After a stroke, a sore wrist, an unrepaired seam")).toEqual([]);
    expect(clinicalAliases({ category: "Common constraints", conditionName: "Elbow / wrist / hand limitation" })).toEqual([
      "Elbow / wrist / hand limitation",
    ]);
    expect(
      clinicalAliases({ category: "Cardiovascular & Cardiopulmonary", conditionName: "Uncontrolled Hypertension (Resting BP > 180/100 mmHg)" }),
    ).toEqual(["Uncontrolled Hypertension"]);
    expect(clinicalAliases({ category: "Soft Tissue & Inflammation", conditionName: "Rheumatoid Arthritis (RA) / Inflammatory Flare-ups" })).toEqual([
      "Rheumatoid Arthritis",
      "Inflammatory Flare-ups",
    ]);
  });
});

describe("topics and playbooks", () => {
  it("makes every topic an entity, and links only the listed titles", () => {
    let count = 0;
    for (const m of academyIndex.modules) {
      for (const t of m.topics) {
        count += 1;
        const e = realIndex.byId.get(`topic:${t.id}`)!;
        expect(e.route).toEqual({ kind: "topic", moduleId: m.id, topicId: t.id });
        expect(e.summary.startsWith(`${m.title}, module ${m.n} of the Academy.`)).toBe(true);
      }
    }
    expect(count).toBe(98);
    const topicIds = new Set(academyIndex.modules.flatMap((m) => m.topics.map((t) => t.id)));
    for (const id of Object.keys(TOPIC_LINK_WORDS)) expect(topicIds.has(id), id).toBe(true);
    expect(linked("Sarcopenia and body composition")).toEqual(["topic:benefits-sarcopenia", "topic:benefits-body-composition"]);
    expect(linked("Introduction. FAQ. Breathing.")).toEqual([]);
    expect(topicLabel("POSTURE")).toBe("Posture");
    expect(topicLabel("MSF - Suggested Starting Weights")).toBe("MSF - Suggested Starting Weights");
    // A topic points at the rule quoted from it.
    expect(realIndex.byId.get("topic:variations-forced-reps")!.related).toContain("rule:forced-reps");
  });

  it("makes a playbook a draft entity whose connections are its related pages", () => {
    const e = realIndex.byId.get("playbook:the-twenty-minutes")!;
    expect(e.kind).toBe("playbook");
    expect(e.summary).toBe(playbook.lede);
    expect(e.source).toContain("draft");
    expect(e.related).toEqual(["machine:m-leg-press", "term:inroad", "topic:performance-set-duration"]);
    expect(e.aliases).toEqual([]);
  });
});

describe("linkText", () => {
  it("returns every character, in order, with the prose's own casing", () => {
    const text = "The LEG PRESS starts with a gradual load up; the Pulldown with a handoff.";
    const segs = linkText(text, realIndex);
    expect(joined(segs)).toBe(text);
    expect(segs.find((s) => s.entityId === "machine:m-leg-press")!.text).toBe("LEG PRESS");
  });

  it("links each thing on its first appearance only", () => {
    expect(linked("Leg Press, then the leg press again, then LP.")).toEqual(["machine:m-leg-press"]);
  });

  it("stops at six links a passage, or the cap given", () => {
    const text = "Concentric, eccentric, inroad, intensity, frequency, volume, posture, purpose.";
    expect(linked(text)).toHaveLength(6);
    expect(linked(text, realIndex, { maxLinks: 2 })).toHaveLength(2);
    expect(linked(text, realIndex, { maxLinks: 0 })).toEqual([]);
  });

  it("matches whole words only", () => {
    expect(linked("Tensioner, reported, pacemakers' pacing")).toEqual([]);
  });

  it("never links the entity it is told to skip, and its words stay plain", () => {
    expect(linked("The handoff on the Pulldown", realIndex, { skip: "rule:handoff" })).toEqual(["machine:m-pulldown"]);
    expect(linked("Timed Static Contraction (TSC)", realIndex, { skip: "rule:tsc" })).toEqual([]);
  });

  it("carries first appearance across passages when given a set", () => {
    const seen = new Set<string>();
    expect(linked("The squeeze.", realIndex, { seen })).toEqual(["rule:squeeze"]);
    expect(linked("Another squeeze.", realIndex, { seen })).toEqual([]);
    expect(seen.has("rule:squeeze")).toBe(true);
  });

  it("gives the same answer every call (the patterns are reset)", () => {
    const text = "The handoff on the Pulldown, LP and CP.";
    const first = linked(text);
    for (let i = 0; i < 4; i++) expect(linked(text)).toEqual(first);
  });

  it("is plain words without an index, and nothing for nothing", () => {
    expect(linkText("Leg Press", null)).toEqual([{ text: "Leg Press" }]);
    expect(linkText("", realIndex)).toEqual([]);
    const empty = buildEntityIndex({ glossary: null, machines: [], clinical: [], playbooks: [], modules: [] });
    // The rules are always there, even before the glossary lands.
    expect(linked("A static hold.", empty)).toEqual(["rule:static-hold"]);
    expect(linked("The Leg Press.", empty)).toEqual([]);
  });

  it("survives odd rows without throwing", () => {
    const odd = buildEntityIndex({
      glossary: [{ term: "", definition: "x" }, { term: "Gap", definition: "" }, null as unknown as { term: string; definition: string }],
      machines: [{ machineId: "", name: "", abbr: null, cardId: null, scriptId: null, overviewId: null, workout: null }],
      clinical: [{ id: "x", category: "", conditionName: "", severity: "", protocolHandling: [] }],
      playbooks: [],
      modules: [{ id: "m", n: 1, title: "M", blurb: "", topics: [{ id: "t", title: "T", readingMinutes: 1, words: 1 }] }],
    });
    expect(odd.byId.get("term:gap")!.summary).toBe("");
    // A flag that names no machine gets no card; its words would still read.
    expect(odd.byId.has("clinical:x")).toBe(false);
    expect(clinicalSummary({ category: "", protocolHandling: [] })).toBe("A clinical flag in the matrix. It names no machines.");
  });
});

describe("conceptCard", () => {
  it("links the summary but never to itself, and offers connections the summary does not", () => {
    const card = conceptCard("rule:handoff", realIndex)!;
    expect(card.entity.id).toBe("rule:handoff");
    const ids = card.summary.map((s) => s.entityId).filter(Boolean);
    expect(ids).not.toContain("rule:handoff");
    expect(ids).toContain("machine:m-neck");
    expect(ids.length).toBeLessThanOrEqual(4);
    const connected = card.connected.map((e) => e.id);
    expect(connected.length).toBeLessThanOrEqual(6);
    for (const id of connected) expect(ids).not.toContain(id);
    // "Abdominals" in the quotation is a muscle word, so the machine comes as a connection.
    expect(connected).toContain("machine:m-abs");
  });

  it("is null for an id the index does not know", () => {
    expect(conceptCard("term:nothing", realIndex)).toBeNull();
  });
});

describe("pushConcept", () => {
  it("goes three deep, trims back to a card already open, and a fourth replaces the third", () => {
    expect(pushConcept([], "a")).toEqual(["a"]);
    expect(pushConcept(["a"], "b")).toEqual(["a", "b"]);
    expect(pushConcept(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(pushConcept(["a", "b", "c"], "d")).toEqual(["a", "b", "d"]);
    expect(pushConcept(["a", "b", "c"], "a")).toEqual(["a"]);
    expect(pushConcept(["a", "b", "c"], "b")).toEqual(["a", "b"]);
    expect(pushConcept(["a", "b"], "c", 2)).toEqual(["a", "c"]);
    expect(pushConcept(["a"], "b", 0)).toEqual(["b"]);
  });
});

describe("firstSentences and termSummary", () => {
  it("ends a sentence only before a capital, never after i.e. or vs.", () => {
    expect(firstSentences("the lifting phase (i.e. the actual lifting). During this phase it shortens and pulls hard. Third.")).toBe(
      "the lifting phase (i.e. the actual lifting). During this phase it shortens and pulls hard.",
    );
    expect(firstSentences("A long enough first sentence that it stands alone without any help from the next one at all. Second.")).toBe(
      "A long enough first sentence that it stands alone without any help from the next one at all.",
    );
    expect(firstSentences("See also Assumed vs. Real Objective. Next.")).toBe("See also Assumed vs. Real Objective. Next.");
    expect(firstSentences("No full stop at all")).toBe("No full stop at all");
    expect(firstSentences("   ")).toBe("");
    expect(termSummary("the distance the arm moves. More.")).toBe("The distance the arm moves. More.");
  });

  it("stops a term's card before its See also (the card shows those as connections)", () => {
    expect(termSummary("a less formal way to say lowering. See also Eccentric.")).toBe("A less formal way to say lowering.");
    const negative = realIndex.byId.get("term:negative")!;
    expect(negative.summary).not.toMatch(/See also/);
    expect(negative.related[0]).toBe("term:eccentric");
    for (const e of realIndex.byId.values()) if (e.kind === "term") expect(e.summary, e.label).not.toMatch(/See also/);
  });
});

describe("a clinical card", () => {
  it("is a plain sentence with its machines as its links (no glossary word inside a group's name)", () => {
    const card = conceptCard("clinical:bone-osteoporosis", realIndex)!;
    expect(card.summary).toEqual([{ text: "A clinical flag in the matrix's Bone Density & Aging group. It names four machines." }]);
    expect(card.connected.map((e) => e.id)).toEqual([
      "machine:m-abs",
      "machine:m-torso-rotation",
      "machine:m-lumbar",
      "machine:m-leg-press",
    ]);
  });
});
