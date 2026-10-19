// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CueMoment, MachineScript, ModuleContent, QuickCard } from "../academy/types";
import type { FloorState } from "../catalog/floor-index";
import type { Machine } from "../../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/*
 * The hook's inputs are stood in for: the Academy's chunk hooks answer from
 * `fx` (null until a test says a chunk has "landed"), the floor read answers
 * one of the Catalog's four states, and the three builders (entities, graph,
 * quiz bank, written by other parts tonight) are counted, not run. What is
 * proved is this hook's own promise: nothing built before its inputs land,
 * each build once, the floor unknown until it is known, modules on demand.
 */
const fx = vi.hoisted(() => ({
  glossary: null as { term: string; definition: string }[] | null,
  cues: null as unknown[] | null,
  cards: null as unknown[] | null,
  scripts: null as unknown[] | null,
  overviews: null as unknown[] | null,
  enabled: [] as boolean[],
  floor: "loading" as string,
  floorMachines: [] as { id: string; name: string; rosterStatus?: string; outOfService?: unknown }[],
  /** Relay's care read, as useMachineCare answers it, and every studio it was asked for. */
  care: { byMachineId: {}, loading: true, error: null } as {
    byMachineId: Record<string, { flag: { note: string; by: { id: string; name: string }; at: number } | null }>;
    loading: boolean;
    error: string | null;
  },
  careAsked: [] as (string | null)[],
  cache: {} as Record<string, unknown>,
  load: null as unknown as (id: string) => Promise<unknown>,
  /** The vault's own ask for a reference chunk (loadAcademyReference): never settles unless a test says. */
  loadRef: null as unknown as (name: string) => Promise<unknown>,
}));

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));

vi.mock("../academy/useAcademyContent", () => ({
  ACADEMY_INDEX: {
    generatedFrom: "docs/msf-academy",
    corpusHash: "test",
    totalWords: 10,
    cardCount: 1,
    overviewCount: 1,
    glossaryCount: 1,
    modules: [{ id: "intro", n: 1, title: "Introduction", blurb: "", topics: [] }],
  },
  useAcademyGlossary: (on: boolean) => (fx.enabled.push(on), fx.glossary),
  useAcademyCues: (on: boolean) => (fx.enabled.push(on), fx.cues),
  useAcademyCards: (on: boolean) => (fx.enabled.push(on), fx.cards),
  useAcademyScripts: (on: boolean) => (fx.enabled.push(on), fx.scripts),
  useAcademyOverviews: (on: boolean) => (fx.enabled.push(on), fx.overviews),
  loadAcademyModule: (id: string) => fx.load(id),
  loadAcademyReference: (name: string) => fx.loadRef(name),
  cachedAcademyModule: (id: string) => fx.cache[id] ?? null,
}));

vi.mock("../catalog/useCatalogMachines", () => ({
  useCatalogMachines: () => ({
    machines: fx.floorMachines,
    source: "roster",
    makers: {},
    loading: fx.floor === "loading",
    floor: fx.floor,
  }),
}));

// Relay's own hook, the one care listener: answered from `fx.care`, each ask counted.
vi.mock("../relay/board/machine-care-store", () => ({
  useMachineCare: (studioId: string | null) => {
    fx.careAsked.push(studioId);
    return fx.care;
  },
}));

const builds = vi.hoisted(() => ({
  entities: vi.fn((_input: unknown) => ({ byId: new Map() })),
  graph: vi.fn((_input: unknown) => ({ nodes: [], edges: [] })),
  bank: vi.fn((_input: unknown) => [] as unknown[]),
}));

vi.mock("./entities", () => ({ buildEntityIndex: builds.entities }));
vi.mock("./graph", () => ({ buildVaultGraph: builds.graph }));
vi.mock("./graph-index.json", () => ({ default: { corpusHash: "test", termTopics: {}, machineTopics: {} } }));
vi.mock("./quiz/bank", () => ({ questionBank: builds.bank }));
vi.mock("./playbooks", () => ({
  PILLARS: [{ id: "floor", title: "The floor and the protocol", blurb: "" }],
  PLAYBOOKS: [],
  TRACKS: [],
}));

import { useVaultData, type VaultData } from "./useVaultData";

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const GLOSSARY = [{ term: "Concentric", definition: "the positive phase." }];
const CUES: CueMoment[] = [{ moment: "Speed of Motion", phrases: ["Slow and controlled"], notes: [] }];
const CARDS: QuickCard[] = [
  { id: "lp", abbr: "LP", machineId: "m-leg-press", title: "LP - Quick Reference Guide", sections: [], words: 0 },
];
const SCRIPTS: MachineScript[] = [
  {
    id: "lower-body-lp",
    abbr: "LP",
    workout: "Lower Body",
    machineId: "m-leg-press",
    summary: "Leg Press - Custom gap",
    beats: [],
    lines: 0,
  },
];
const OVERVIEWS = [{ id: "leg-press", title: "Leg Press", readingMinutes: 9, words: 1800, blocks: [] }];
const INTRO: ModuleContent = { id: "intro", title: "Introduction", topics: [] };

const CATALOG = [{ id: "m-leg-press", name: "LEG PRESS (HOIST)" }] as unknown as Machine[];

function landAll() {
  fx.glossary = GLOSSARY;
  fx.cues = CUES;
  fx.cards = CARDS;
  fx.scripts = SCRIPTS;
  fx.overviews = OVERVIEWS;
}

/* ------------------------------------------------------------------ *
 * Mounting
 * ------------------------------------------------------------------ */

let host: HTMLDivElement;
let root: Root;
let data: VaultData;

function Probe({ machines, studioId = "solon", ask }: { machines: Machine[]; studioId?: string | null; ask?: string }) {
  data = useVaultData({ studioId, machines });
  // A page asking for its module WHILE it draws, as pageFor does.
  if (ask) data.loadModule(ask);
  return null;
}

async function render(props: { machines?: Machine[]; ask?: string } = {}) {
  await act(async () => root.render(<Probe machines={props.machines ?? CATALOG} ask={props.ask} />));
}

/** A promise the test resolves or rejects by hand. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fx.glossary = fx.cues = fx.cards = fx.scripts = fx.overviews = null;
  fx.enabled = [];
  fx.floor = "loading";
  fx.floorMachines = [];
  fx.care = { byMachineId: {}, loading: true, error: null };
  fx.careAsked = [];
  fx.cache = {};
  fx.load = vi.fn(() => Promise.resolve(INTRO));
  fx.loadRef = vi.fn(() => new Promise<unknown>(() => {}));
  builds.entities.mockClear();
  builds.graph.mockClear();
  builds.bank.mockClear();
  errors = vi.spyOn(console, "error");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
});

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

describe("useVaultData — before anything has landed", () => {
  it("asks for the five reference chunks once mounted, and builds nothing yet", async () => {
    await render();
    expect(fx.enabled.length).toBeGreaterThanOrEqual(5);
    expect(fx.enabled.every(Boolean)).toBe(true);
    expect(data.entities).toBeNull();
    expect(data.graph).toBeNull();
    expect(data.quizBank).toBeNull();
    expect(data.machines).toEqual([]);
    expect(builds.entities).not.toHaveBeenCalled();
    expect(builds.graph).not.toHaveBeenCalled();
    expect(builds.bank).not.toHaveBeenCalled();
  });

  it("hands over the static pieces straight away", async () => {
    await render();
    expect(data.index.modules[0].id).toBe("intro");
    expect(data.defs["m-leg-press"]?.name).toBeTruthy();
    expect(data.pillars).toHaveLength(1);
    expect(data.modules).toEqual({});
  });
});

describe("useVaultData — the builds", () => {
  it("builds the entity index, the graph and the quiz bank once each, when their inputs land", async () => {
    await render();
    landAll();
    await render();
    await render();
    expect(builds.entities).toHaveBeenCalledTimes(1);
    expect(builds.graph).toHaveBeenCalledTimes(1);
    expect(builds.bank).toHaveBeenCalledTimes(1);
    expect(data.entities).not.toBeNull();
    expect(data.graph).toEqual({ nodes: [], edges: [] });
    expect(data.quizBank).toEqual([]);

    const entityInput = builds.entities.mock.calls[0][0] as { glossary: unknown; machines: { machineId: string }[] };
    expect(entityInput.glossary).toBe(GLOSSARY);
    expect(entityInput.machines.map((m) => m.machineId)).toEqual(["m-leg-press"]);
    const graphInput = builds.graph.mock.calls[0][0] as { cues: unknown; substitutes: Record<string, unknown> };
    expect(graphInput.cues).toBe(CUES);
    expect(graphInput.substitutes["m-leg-press"]).toBeTruthy();
  });

  it("joins the Academy's machines under the Catalog's names", async () => {
    landAll();
    await render();
    expect(data.machines).toEqual([
      {
        machineId: "m-leg-press",
        name: "LEG PRESS (HOIST)",
        abbr: "LP",
        cardId: "lp",
        scriptId: "lower-body-lp",
        overviewId: "leg-press",
        workout: "Lower Body",
      },
    ]);
    expect(data.names("m-leg-press")).toBe("LEG PRESS (HOIST)");
  });

  it("waits for the glossary and every machine chunk before the entity index", async () => {
    fx.glossary = GLOSSARY;
    fx.cards = CARDS;
    fx.scripts = SCRIPTS;
    await render();
    expect(data.entities).toBeNull();
    fx.overviews = OVERVIEWS;
    await render();
    expect(data.entities).not.toBeNull();
    expect(data.graph).toBeNull();
    expect(data.quizBank).toBeNull();
    expect(builds.entities).toHaveBeenCalledTimes(1);
  });

  it("does not rebuild the quiz bank when the floor arrives", async () => {
    landAll();
    await render();
    fx.floor = "ready";
    fx.floorMachines = [{ id: "sm-solon-hack", name: "HACK SQUAT" }];
    await render();
    expect(builds.bank).toHaveBeenCalledTimes(1);
    expect(builds.entities).toHaveBeenCalledTimes(1);
    expect(data.names("sm-solon-hack")).toBe("HACK SQUAT");
  });

  it("rebuilds nothing when the parent hands a new array of the same machines", async () => {
    landAll();
    await render();
    await render({ machines: [{ id: "m-leg-press", name: "LEG PRESS (HOIST)" }] as unknown as Machine[] });
    expect(builds.entities).toHaveBeenCalledTimes(1);
    expect(builds.graph).toHaveBeenCalledTimes(1);
    expect(builds.bank).toHaveBeenCalledTimes(1);

    await render({ machines: [{ id: "m-leg-press", name: "LEG PRESS" }] as unknown as Machine[] });
    expect(builds.entities).toHaveBeenCalledTimes(2);
    expect(data.names("m-leg-press")).toBe("LEG PRESS");
  });
});

describe("useVaultData — the floor", () => {
  it("is unknown while loading and when it could not be read, never empty", async () => {
    await render();
    expect(data.floor).toBeNull();
    expect(data.floorState).toBe("loading");
    fx.floor = "unreadable" satisfies FloorState;
    await render();
    expect(data.floor).toBeNull();
    expect(data.floorState).toBe("unreadable");
  });

  it("is an empty list only when the roster was read and holds nothing", async () => {
    fx.floor = "empty";
    fx.floorMachines = [{ id: "m-chest-press", name: "CHEST PRESS" }];
    await render();
    expect(data.floor).toEqual([]);
  });

  it("is the studio's machines in walking order, with the Catalog's codes", async () => {
    fx.floor = "ready";
    fx.floorMachines = [
      { id: "m-leg-press", name: "LEG PRESS" },
      { id: "sm-solon-hack", name: "HACK SQUAT" },
    ];
    await render();
    expect(data.floor?.map((f) => f.id)).toEqual(["m-leg-press", "sm-solon-hack"]);
    expect(data.floor?.[0].code).toBe("LP");
    expect(data.floor?.[1]).toEqual({ id: "sm-solon-hack", name: "HACK SQUAT", code: null });
    expect(data.names("sm-solon-hack")).toBe("HACK SQUAT");
    expect(data.names("sm-unknown")).toBe("sm-unknown");
  });
});

describe("useVaultData — the floor's status (judges' fix, Oct 19 2026)", () => {
  const JESS = { id: "t-jess", name: "Jess Moreno" };
  const AT = Date.UTC(2026, 9, 18, 12, 52);

  it("asks Relay's one care hook for this studio, once a render", async () => {
    await render();
    expect(fx.careAsked).toEqual(["solon"]);
  });

  it("is unknown while the floor or the care record is loading, and when either failed", async () => {
    await render();
    expect(data.care).toBeNull();
    fx.floor = "ready";
    fx.floorMachines = [{ id: "m-neck", name: "NECK", rosterStatus: "maintenance" }];
    await render();
    expect(data.care).toBeNull(); // the care record is still loading
    fx.care = { byMachineId: {}, loading: false, error: "Couldn't load the floor's care record." };
    await render();
    expect(data.care).toBeNull(); // a failed read is unknown, never "not flagged"
    fx.care = { byMachineId: {}, loading: false, error: null };
    fx.floor = "unreadable";
    await render();
    expect(data.care).toBeNull();
  });

  it("says Out of service from the roster and Flagged from Relay, and nothing for the rest", async () => {
    fx.floor = "ready";
    fx.floorMachines = [
      { id: "m-leg-press", name: "LEG PRESS", rosterStatus: "active" },
      { id: "m-neck", name: "NECK", rosterStatus: "maintenance" },
      { id: "m-abs", name: "ABS", rosterStatus: "active" },
    ];
    fx.care = {
      byMachineId: { "m-leg-press": { flag: { note: "Left pad sticks at the bottom", by: JESS, at: AT } }, "m-abs": { flag: null } },
      loading: false,
      error: null,
    };
    await render();
    expect(data.care).toEqual({
      "m-neck": { outOfService: true },
      "m-leg-press": {
        outOfService: false,
        flag: { text: "Left pad sticks at the bottom", by: "Jess Moreno", at: new Date(AT).toISOString() },
      },
    });
  });
});

describe("useVaultData — modules on demand", () => {
  it("loads a module once, even when asked while a page draws", async () => {
    await render({ ask: "intro" });
    await render({ ask: "intro" });
    await act(async () => undefined);
    expect(fx.load).toHaveBeenCalledTimes(1);
    expect(data.modules.intro).toBe(INTRO);
    expect(data.moduleFailed("intro")).toBe(false);
    await render({ ask: "intro" });
    expect(fx.load).toHaveBeenCalledTimes(1);
  });

  it("says a failed module failed, never retries by itself, and retries on the reader's tap", async () => {
    const first = deferred<ModuleContent>();
    fx.load = vi.fn(() => first.promise);
    await render({ ask: "intro" });
    await act(async () => {
      first.reject(new Error("offline"));
      await first.promise.catch(() => undefined);
    });
    expect(data.moduleFailed("intro")).toBe(true);
    expect(data.modules.intro).toBeUndefined();

    await render({ ask: "intro" });
    expect(fx.load).toHaveBeenCalledTimes(1);

    fx.load = vi.fn(() => Promise.resolve(INTRO));
    await act(async () => data.retryModule!("intro"));
    await act(async () => undefined);
    expect(fx.load).toHaveBeenCalledTimes(1);
    expect(data.moduleFailed("intro")).toBe(false);
    expect(data.modules.intro).toBe(INTRO);
  });

  it("does not set state after it is gone", async () => {
    const late = deferred<ModuleContent>();
    fx.load = vi.fn(() => late.promise);
    await render({ ask: "intro" });
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => {
      late.resolve(INTRO);
      await late.promise;
    });
  });

  it("offers the session's own cache to a page without waiting", async () => {
    fx.cache = { intro: INTRO };
    await render();
    expect(data.cachedModule?.("intro")).toBe(INTRO);
    expect(data.cachedModule?.("mastery")).toBeNull();
  });
});

describe("useVaultData — a reference chunk that cannot arrive (review fix, Oct 19 2026)", () => {
  it("says so instead of loading forever, and asks again only on the reader's tap", async () => {
    const tries: Record<string, number> = {};
    let fail = true;
    fx.loadRef = vi.fn((name: string) => {
      tries[name] = (tries[name] ?? 0) + 1;
      if (name === "cards" && fail) return Promise.reject(new Error("chunk gone"));
      return new Promise<unknown>(() => {});
    });
    await render();
    await act(async () => {});
    expect(data.referenceFailed).toBe(true);
    expect(tries.cards).toBe(1);

    // Nothing retries by itself.
    await render();
    await act(async () => {});
    expect(tries.cards).toBe(1);

    fail = false;
    fx.loadRef = vi.fn((name: string) => {
      tries[name] = (tries[name] ?? 0) + 1;
      return name === "cards" ? Promise.resolve(CARDS) : new Promise<unknown>(() => {});
    });
    await act(async () => data.retryReference?.());
    await act(async () => {});
    expect(tries.cards).toBe(2);
    expect(data.referenceFailed).toBe(false);
    expect(data.cards).toBe(CARDS);
  });

  it("asks for nothing the Academy's hooks already brought", async () => {
    landAll();
    await render();
    await act(async () => {});
    expect(fx.loadRef).not.toHaveBeenCalled();
    expect(data.referenceFailed).toBe(false);
  });

  it("a failure the hooks then answer anyway is not a failure", async () => {
    fx.loadRef = vi.fn((name: string) => (name === "glossary" ? Promise.reject(new Error("blip")) : new Promise<unknown>(() => {})));
    await render();
    await act(async () => {});
    expect(data.referenceFailed).toBe(true);
    fx.glossary = GLOSSARY;
    await render();
    expect(data.referenceFailed).toBe(false);
    expect(data.glossary).toBe(GLOSSARY);
  });
});
