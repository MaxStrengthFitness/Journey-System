import { describe, expect, it } from "vitest";
import cardsFile from "../academy/content/cards.json";
import cuesFile from "../academy/content/cues.json";
import glossaryFile from "../academy/content/glossary.json";
import overviewsFile from "../academy/content/overviews.json";
import scriptsFile from "../academy/content/scripts.json";
import benefits from "../academy/content/benefits.json";
import consultation from "../academy/content/consultation.json";
import continuousTension from "../academy/content/continuous-tension.json";
import equipment from "../academy/content/equipment.json";
import further from "../academy/content/further.json";
import instruction from "../academy/content/instruction.json";
import intro from "../academy/content/intro.json";
import mastery from "../academy/content/mastery.json";
import performance from "../academy/content/performance.json";
import principles from "../academy/content/principles.json";
import programming from "../academy/content/programming.json";
import summary from "../academy/content/summary.json";
import variations from "../academy/content/variations.json";
import { buildAcademyMachines, machineName } from "../academy/academy-machines";
import type { CueMoment, MachineScript, ModuleContent, QuickCard } from "../academy/types";
import { ACADEMY_INDEX } from "../academy/useAcademyContent";
import { EXERCISE_SUBSTITUTES, MACHINE_CATEGORY } from "../routine-builder/academy";
import { CLINICAL_FLAGS_MATRIX } from "../../data/clinical-matrix";
import { MACHINE_DEFINITIONS } from "../../data/machine-definitions";
import { buildEntityIndex } from "./entities";
import { buildVaultGraph, nodeById, nodeIdForRoute, type GraphIndexFile } from "./graph";
import graphIndexJson from "./graph-index.json";
import { PILLARS, PLAYBOOKS, TRACKS } from "./playbooks";
import { pageFor } from "./pages";
import { questionBank } from "./quiz/bank";
import { isLinkId, learningLinkPath, targetKeyOf } from "./learning-link";
import { playableDecks } from "./quiz/decks";
import { buildRound } from "./quiz/round";
import { isPageRoute, routeKey } from "./routes";
import type { VaultPage, VaultRoute } from "./types";
import type { VaultData } from "./useVaultData";

/**
 * THE PARTS FIT (the Learning vault's wave A integration, Oct 19 2026).
 *
 * Nine parts were built side by side, each tested against stand-ins for the
 * others. This builds the vault the way useVaultData does, from the real
 * corpus, and follows every route one part hands another: a concept card's
 * "Open page", a graph node, a reading path's step, a playbook's related
 * page and a quiz question's "Read it" must each land on a page that draws
 * (never "gone"), and a card or node must be the same thing in both the
 * entity index and the graph. Each part's own tests still hold the details.
 */

type RawModule = { default?: unknown } | unknown;
const asModule = (m: RawModule) => m as unknown as ModuleContent;
const MODULES: Record<string, ModuleContent> = {
  intro: asModule(intro),
  benefits: asModule(benefits),
  principles: asModule(principles),
  performance: asModule(performance),
  "continuous-tension": asModule(continuousTension),
  programming: asModule(programming),
  variations: asModule(variations),
  equipment: asModule(equipment),
  instruction: asModule(instruction),
  mastery: asModule(mastery),
  consultation: asModule(consultation),
  further: asModule(further),
  summary: asModule(summary),
};

const glossary = (glossaryFile as unknown as { glossary: { term: string; definition: string }[] }).glossary;
const cues = (cuesFile as unknown as { cues: CueMoment[] }).cues;
const cards = (cardsFile as unknown as { cards: QuickCard[] }).cards;
const scripts = (scriptsFile as unknown as { scripts: MachineScript[] }).scripts;
const overviews = (overviewsFile as unknown as { overviews: NonNullable<VaultData["overviews"]> }).overviews;
const machines = buildAcademyMachines(cards, scripts, overviews);
const names = (id: string) => machineName(id) ?? id;

const entities = buildEntityIndex({
  glossary,
  machines,
  clinical: CLINICAL_FLAGS_MATRIX,
  playbooks: PLAYBOOKS,
  modules: ACADEMY_INDEX.modules,
});
const graph = buildVaultGraph({
  index: ACADEMY_INDEX,
  machines,
  glossary,
  cues,
  clinical: CLINICAL_FLAGS_MATRIX,
  playbooks: PLAYBOOKS,
  graphIndex: graphIndexJson as unknown as GraphIndexFile,
  substitutes: EXERCISE_SUBSTITUTES,
  categories: MACHINE_CATEGORY,
});
const quizBank = questionBank({ glossary, cues, scripts, cards, defs: MACHINE_DEFINITIONS, names, playbooks: PLAYBOOKS });

const DATA: VaultData = {
  index: ACADEMY_INDEX,
  machines,
  defs: MACHINE_DEFINITIONS,
  floor: null,
  names,
  glossary,
  cues,
  cards,
  scripts,
  overviews,
  modules: MODULES,
  loadModule: () => {},
  moduleFailed: () => false,
  entities,
  graph,
  playbooks: PLAYBOOKS,
  tracks: TRACKS,
  pillars: PILLARS,
  quizBank,
};

/** "gone" or "loading" for a page route, with where it came from; nothing for a route a design draws itself. */
function landing(route: VaultRoute, from: string): string | null {
  if (route.kind === "map") {
    if (!route.focus) return null;
    return nodeById(graph, route.focus) ? null : `${from}: map focus ${route.focus} is not a node`;
  }
  if (route.kind === "quiz" || route.kind === "track" || route.kind === "home" || route.kind === "catalog" || route.kind === "academy" || route.kind === "queue") {
    if (route.kind === "track" && !TRACKS.some((t) => t.id === route.id)) return `${from}: no track ${route.id}`;
    return null;
  }
  if (!isPageRoute(route)) return `${from}: ${routeKey(route)} is not a page route`;
  const state = pageFor(route, DATA);
  return typeof state === "string" ? `${from}: ${routeKey(route)} is ${state}` : null;
}

describe("the vault's parts fit, on the real corpus", () => {
  it("builds every part", () => {
    expect(machines.length).toBeGreaterThanOrEqual(20);
    expect(entities.byId.size).toBeGreaterThan(100);
    expect(graph.nodes.length).toBeGreaterThan(100);
    expect(quizBank.length).toBeGreaterThan(200);
  });

  it("lands every concept card's Open page on a page that draws", () => {
    const off = [...entities.byId.values()].map((e) => landing(e.route, `entity ${e.id}`)).filter(Boolean);
    expect(off).toEqual([]);
  });

  it("names a concept and its graph node the same, wherever the entity has a node", () => {
    const off: string[] = [];
    for (const e of entities.byId.values()) {
      const nodeId = e.route.kind === "map" ? (e.route.focus ?? null) : nodeIdForRoute(e.route);
      if (!nodeId) continue;
      const node = nodeById(graph, nodeId);
      if (!node && e.kind !== "rule" && e.kind !== "topic") off.push(`${e.id} -> ${nodeId} (no node)`);
    }
    expect(off).toEqual([]);
  });

  it("lands every graph node on a page that draws (or the map)", () => {
    const off = graph.nodes.map((n) => landing(n.route, `node ${n.id}`)).filter(Boolean);
    expect(off).toEqual([]);
    // And a node's route leads back to the same node.
    const loop = graph.nodes
      .filter((n) => n.route.kind !== "map")
      .filter((n) => nodeIdForRoute(n.route) !== n.id)
      .map((n) => `${n.id} -> ${routeKey(n.route)} -> ${nodeIdForRoute(n.route)}`);
    expect(loop).toEqual([]);
  });

  it("lands every reading-path step and every playbook's related page", () => {
    const off: (string | null)[] = [];
    for (const t of TRACKS) for (const s of t.steps) off.push(landing(s.route, `track ${t.id} step "${s.title}"`));
    for (const p of PLAYBOOKS) {
      off.push(landing({ kind: "playbook", id: p.id }, `playbook ${p.id}`));
      for (const r of p.related) off.push(landing(r.route, `playbook ${p.id} related "${r.title}"`));
    }
    expect(off.filter(Boolean)).toEqual([]);
  });

  it("lands every quiz question's Read it", () => {
    const off = quizBank
      .filter((q) => q.source.route)
      .map((q) => landing(q.source.route!, `question ${q.id}`))
      .filter(Boolean);
    expect(off).toEqual([]);
  });

  it("draws every machine, card, script, deep dive, module, topic and playbook page", () => {
    const off = ALL_ROUTES.map((r) => landing(r, "index")).filter(Boolean);
    expect(off).toEqual([]);
  });

  it("gives every page's lines link-safe keys, a Teams link, its own node and related pages that draw", () => {
    const pages = ALL_ROUTES.map((r) => pageFor(r, DATA)).filter((p): p is VaultPage => typeof p !== "string");
    expect(pages.length).toBe(ALL_ROUTES.length);
    const off: string[] = [];
    for (const page of pages) {
      const where = routeKey(page.route);
      for (const s of page.sections) for (const b of s.blocks) if (!isLinkId(b.key)) off.push(`${where}: block key ${b.key}`);
      if (page.target.key !== targetKeyOf(page.target.ref)) off.push(`${where}: target key ${page.target.key}`);
      if (page.target.ref.kind !== "playbook") {
        if (learningLinkPath(page.target.ref) === null) off.push(`${where}: no Teams link`);
      }
      if (page.nodeId && !nodeById(graph, page.nodeId)) off.push(`${where}: node ${page.nodeId} not in the graph`);
      for (const r of page.related) {
        const miss = landing(r.route, `${where} related "${r.title}"`);
        if (miss) off.push(miss);
      }
      if (page.route.kind === "machine" && (page.tiers ?? []).length !== 4) off.push(`${where}: ${page.tiers?.length ?? 0} tiers`);
    }
    expect(off).toEqual([]);
  });

  it("deals a full round from every deck it offers, from the real bank", () => {
    for (const deck of playableDecks(quizBank)) {
      const round = buildRound(quizBank, deck.id, 7);
      expect(round.questions.length, deck.id).toBe(Math.min(10, deck.id === "mixed" ? quizBank.length : quizBank.filter((q) => q.deck === deck.id).length));
    }
  });
});

const ALL_ROUTES: VaultRoute[] = [
  ...machines.map((m) => ({ kind: "machine" as const, id: m.machineId })),
  ...machines.flatMap((m) => [
    ...(m.cardId ? [{ kind: "card" as const, id: m.cardId }] : []),
    ...(m.scriptId ? [{ kind: "script" as const, id: m.scriptId }] : []),
    ...(m.overviewId ? [{ kind: "overview" as const, id: m.overviewId }] : []),
  ]),
  ...ACADEMY_INDEX.modules.flatMap((m) => [
    { kind: "module" as const, moduleId: m.id },
    ...m.topics.map((t) => ({ kind: "topic" as const, moduleId: m.id, topicId: t.id })),
  ]),
  ...PLAYBOOKS.map((p) => ({ kind: "playbook" as const, id: p.id })),
  { kind: "glossary" },
  { kind: "cueing" },
];
