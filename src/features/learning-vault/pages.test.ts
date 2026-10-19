import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import cuesFile from "../academy/content/cues.json";
import type { AcademyMachine } from "../academy/academy-machines";
import type { AcademyIndex, CueMoment, MachineScript, ModuleContent, QuickCard } from "../academy/types";
import { presetLine, presetOf } from "../machine-codex/format";
import { MACHINE_DEFINITIONS } from "../../data/machine-definitions";
import type { ClinicalSafetyFlag } from "../../types";
import type { PlaybookPage, VaultBlock, VaultPage, VaultPageState, VaultRoute, VaultSection } from "./types";
import type { VaultData } from "./useVaultData";

/*
 * The other parts of the vault (blocks, the codex reader, the graph, links,
 * the rep model, the playbooks) are written by other hands tonight. These
 * tests stand in for each with a small fake that keeps its contract, so they
 * prove what THIS file decides: which page a route is, when it is loading or
 * gone, how a topic breaks into sections, what a page is titled and called.
 */

const fx = vi.hoisted(() => ({ tierCalls: [] as unknown[][] }));

vi.mock("./blocks", () => {
  const blockKeyFor = (text: string) => `k-${text.toLowerCase().replace(/\s+/g, " ").trim()}`;
  return {
    blockKeyFor,
    toVaultBlocks: (blocks: { kind: string; text: string }[], opts?: { source?: string }) =>
      blocks
        .filter((b) => b.text.trim())
        .map((b) => ({
          key: blockKeyFor(b.text),
          kind: b.kind === "body" ? "para" : b.kind,
          text: b.text.trim(),
          ...(opts?.source ? { source: opts.source } : {}),
        })),
    vaultSection: (id: string, title: string, blocks: unknown[], note?: string) =>
      note ? { id, title, blocks, note } : { id, title, blocks },
  };
});

vi.mock("./codex-reader", () => ({
  codexTiers: (...args: unknown[]) => {
    fx.tierCalls.push(args);
    const name = (args[2] as { machineName?: string } | undefined)?.machineName ?? "?";
    const tier = (id: string, n: number, title: string, blocks: unknown[]) => ({
      id,
      n,
      title,
      sections: [{ id: `${id}-s`, title, blocks }],
    });
    return [
      tier("glance", 1, "Floor glance", [{ key: "k-setup", kind: "line", text: `Set up the ${name}` }]),
      tier("script", 2, "Script & cues", []),
      tier("adapt", 3, "Adapt & clinical", []),
      tier("science", 4, "Deep science", []),
    ];
  },
  scriptSections: (script: { beats: { beat: string; lines: { spoken: boolean; text: string }[] }[] }) =>
    script.beats.map((b, i) => ({
      id: `beat-${i}`,
      title: b.beat.toLowerCase(),
      blocks: b.lines.map((l) => ({ key: `k-${l.text}`, kind: l.spoken ? "said" : "do", text: l.text })),
    })),
  workoutWords: (w: string) => (w === "SpineTrunkCore" ? "Spine / Trunk / Core" : w),
  EMPTY_TIER_LINE: "Nothing written for this machine yet.",
}));

vi.mock("./graph", () => ({
  nodeIdForRoute: (r: { kind: string; id?: string; topicId?: string; moduleId?: string; term?: string }) => {
    if (r.kind === "machine") return `machine:${r.id}`;
    if (r.kind === "topic") return `topic:${r.topicId}`;
    if (r.kind === "module") return `module:${r.moduleId}`;
    if (r.kind === "playbook") return `playbook:${r.id}`;
    if (r.kind === "glossary") return r.term ? `term:${r.term.toLowerCase()}` : null;
    return null;
  },
}));

vi.mock("./learning-link", () => ({
  vaultTarget: (ref: { kind: string; id?: string }, title: string) => ({
    ref,
    key: ref.id ? `${ref.kind}:${ref.id}` : ref.kind,
    title,
  }),
}));

vi.mock("./rep-phases", () => ({
  CUE_SOURCE_LABEL: "Academy 9 · Cues and Timing",
  isCuePhrase: (p: string) => {
    const t = p.trim();
    return Boolean(t) && !t.endsWith(":") && !t.startsWith("(") && /[a-z]/.test(t);
  },
}));

vi.mock("./playbooks", () => ({
  playbookSourceLabel: (s: string) => `Label(${s})`,
  playbookSourcesLine: () => "Written from: The floor",
}));

import {
  calmCaps,
  capitaliseFirst,
  clinicalFlagsFor,
  cueMomentLabel,
  floorUnreadableFor,
  overviewSections,
  pageFor,
  scriptLede,
  titleOf,
  topicSections,
  topicSourceLabel,
  withoutLede,
} from "./pages";
import type { CodexTier } from "./types";

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const INDEX: AcademyIndex = {
  generatedFrom: "docs/msf-academy",
  corpusHash: "test",
  totalWords: 1000,
  cardCount: 1,
  overviewCount: 1,
  glossaryCount: 3,
  modules: [
    {
      id: "intro",
      n: 1,
      title: "Introduction",
      blurb: "How to use the manual.",
      topics: [{ id: "intro-glossary", title: "Glossary", readingMinutes: 30, words: 5902 }],
    },
    {
      id: "performance",
      n: 4,
      title: "Exercise Performance",
      blurb: "The mechanics of one repetition.",
      topics: [
        { id: "performance-speed", title: "Speed of Movement", readingMinutes: 3, words: 649 },
        { id: "performance-turn", title: "Turnaround Technique", readingMinutes: 4, words: 849 },
        { id: "performance-sets", title: "Number of Sets", readingMinutes: 1, words: 272 },
      ],
    },
  ],
};

const PERFORMANCE: ModuleContent = {
  id: "performance",
  title: "Exercise Performance",
  topics: [
    {
      id: "performance-speed",
      title: "Speed of Movement",
      order: 5,
      source: "docs/msf-academy/Academy 4/Speed of Movement.txt",
      moduleLabel: "LP  pg 1 of 2",
      words: 649,
      readingMinutes: 3,
      blocks: [{ kind: "body", text: "Six to ten seconds each way." }],
    },
    {
      id: "performance-turn",
      title: "Turnaround Technique",
      order: 6,
      source: "docs/msf-academy/Academy 4/Turnaround Technique.txt",
      words: 849,
      readingMinutes: 4,
      blocks: [
        { kind: "body", text: "Proper turnaround performance varies." },
        { kind: "heading", text: "UPPER TURN" },
        { kind: "body", text: "Pass right through the end stop." },
      ],
    },
    {
      id: "performance-sets",
      title: "Number of Sets",
      order: 9,
      source: "docs/msf-academy/Academy 4/Number of Sets.txt",
      words: 272,
      readingMinutes: 1,
      blocks: [{ kind: "body", text: "One set to failure." }],
    },
  ],
};

const LUMBAR_ROW: AcademyMachine = {
  machineId: "m-lumbar",
  name: "LUMBAR",
  abbr: "Lumb",
  cardId: "lumb",
  scriptId: "spinetrunkcore-lumb",
  overviewId: "lumbar-extension-lumbar-lower-back",
  workout: "SpineTrunkCore",
};

const PULLDOWN_ROW: AcademyMachine = {
  machineId: "m-pulldown",
  name: "PULLDOWN",
  abbr: "Pd",
  cardId: "pd",
  scriptId: null,
  overviewId: null,
  workout: "Upper Body",
};

const CARDS: QuickCard[] = [
  {
    id: "lumb",
    abbr: "Lumb",
    machineId: "m-lumbar",
    title: "Lumbar",
    sections: [
      { heading: "Target Muscles", items: ["Erector Spinae – Spinal Extension"] },
      {
        heading: "Execution, Instruction, and Turnarounds",
        items: ["Load Up", "Gradually apply pressure.", "Concentric", "Smooth pace."],
        subheads: [0, 2],
      },
    ],
    words: 12,
  },
  {
    id: "pd",
    abbr: "Pd",
    machineId: "m-pulldown",
    title: "Pd",
    sections: [{ heading: "Target Muscles", items: ["Latissimus Dorsi – Shoulder Adduction", "  "] }],
    words: 4,
  },
];

const SCRIPTS: MachineScript[] = [
  {
    id: "spinetrunkcore-lumb",
    abbr: "Lumb",
    workout: "SpineTrunkCore",
    machineId: "m-lumbar",
    summary: "Lumbar Extension -  – Gap 4 (5 or 6 for back issues) - starts at LT, chest up",
    beats: [
      {
        beat: "SETUP",
        lines: [
          { spoken: false, text: "Set the footplate." },
          { spoken: true, text: "Have a seat." },
        ],
      },
    ],
    lines: 2,
  },
];

const OVERVIEWS: VaultData["overviews"] = [
  {
    id: "lumbar-extension-lumbar-lower-back",
    title: "Lumbar Extension (Lumbar, Lower Back)",
    readingMinutes: 9,
    words: 1800,
    blocks: [
      { kind: "subheading", text: "Erector Spinae - Spinal Extension" },
      { kind: "subheading", text: "Synergists:" },
      { kind: "body", text: "Gluteus Maximus - Hip Extension" },
      { kind: "subheading", text: "Considerations for setup:" },
      { kind: "body", text: "Set the seat first." },
      { kind: "heading", text: "NOTES" },
      { kind: "body", text: "Never to failure." },
    ],
  },
];

const NAMES: Record<string, string> = {
  "m-lumbar": "LUMBAR",
  "m-pulldown": "PULLDOWN",
  "m-hip-abd": "HIP ABDUCTION",
  "m-hip-add": "HIP ADDUCTION",
  "m-leg-press": "LEG PRESS",
};

const PLAYBOOK: PlaybookPage = {
  id: "the-twenty-minutes",
  title: "The twenty minutes",
  lede: "One set to failure on five to eight machines.",
  pillar: "floor",
  status: "draft",
  sections: [
    {
      id: "the-set",
      title: "The set",
      blocks: [
        { kind: "para", text: "The clicker counts reps.", source: "docs/business/the-floor.md:12" },
        { kind: "bullet", text: "  ", source: "docs/business/the-floor.md:13" },
      ],
    },
  ],
  related: [{ route: { kind: "cueing" }, title: "Cueing phrasebook", why: "What to say." }],
};

function makeData(over: Partial<VaultData> = {}): VaultData {
  return {
    index: INDEX,
    machines: [LUMBAR_ROW, PULLDOWN_ROW],
    defs: {
      "m-lumbar": MACHINE_DEFINITIONS["m-lumbar"],
      "m-hip-abd": MACHINE_DEFINITIONS["m-hip-abd"],
      "m-pulldown": MACHINE_DEFINITIONS["m-pulldown"],
    },
    floor: [],
    names: (id) => NAMES[id] ?? id,
    glossary: [],
    cues: [],
    cards: CARDS,
    scripts: SCRIPTS,
    overviews: OVERVIEWS,
    modules: {},
    loadModule: vi.fn(),
    moduleFailed: () => false,
    entities: null,
    graph: null,
    playbooks: [PLAYBOOK],
    tracks: [{ id: "lt-101", title: "Life Transformer 101", who: "A new Life Transformer", steps: [] }],
    pillars: [{ id: "floor", title: "The floor and the protocol", blurb: "The twenty minutes." }],
    quizBank: null,
    ...over,
  };
}

function asPage(state: VaultPageState): VaultPage {
  if (typeof state === "string") throw new Error(`expected a page, got "${state}"`);
  return state;
}

const texts = (s: VaultSection) => s.blocks.map((b: VaultBlock) => b.text);

beforeEach(() => {
  fx.tierCalls.length = 0;
});

/* ------------------------------------------------------------------ *
 * Words
 * ------------------------------------------------------------------ */

describe("words", () => {
  it("calms shouting capitals and keeps machine codes", () => {
    expect(calmCaps("LOAD UP + FIRST CONCENTRIC")).toBe("Load up + first concentric");
    expect(calmCaps("LE + LC + ABD")).toBe("LE + LC + ABD");
    expect(calmCaps("THE THREE RULES OF THE LOWER TURNAROUND")).toBe("The three rules of the lower turnaround");
    expect(calmCaps("Already calm")).toBe("Already calm");
    expect(calmCaps("MSF + IMAGINE STRENGTH EQUIPMENT LOADING GUIDELINES")).toBe(
      "MSF + Imagine Strength equipment loading guidelines",
    );
  });

  it("capitalises the first letter, past an opening quote", () => {
    expect(capitaliseFirst("the positive phase")).toBe("The positive phase");
    expect(capitaliseFirst("“slowly begin”")).toBe("“Slowly begin”");
    expect(capitaliseFirst("Already")).toBe("Already");
  });

  it("says where a topic's lines come from", () => {
    expect(topicSourceLabel(4, { order: 6, title: "Turnaround Technique" })).toBe("Academy 4.6 Turnaround Technique");
    expect(topicSourceLabel(10, { order: 999, title: "FAQ" })).toBe("Academy 10 · FAQ");
  });

  it("opens a script on its gap and starting position", () => {
    expect(scriptLede("Leg Curl - Gap 3 for most – starts at LT, chest up")).toBe("Gap 3 for most – starts at LT, chest up");
    expect(scriptLede("Lumbar Extension -  – Gap 4 (5 or 6 for back issues) - starts at LT, chest up")).toBe(
      "Gap 4 (5 or 6 for back issues) – starts at LT, chest up",
    );
    expect(scriptLede("ABDuction - no gap – starts at LT")).toBe("No gap – starts at LT");
    expect(scriptLede("Leg Press")).toBeNull();
    expect(scriptLede(undefined)).toBeNull();
  });
});

describe("cue moment labels", () => {
  const cues = (cuesFile as unknown as { cues: CueMoment[] }).cues;

  it("gives every moment in the real phrasebook a short, distinct title", () => {
    const labels = cues.map((c) => cueMomentLabel(c.moment));
    expect(new Set(labels).size).toBe(cues.length);
    for (const l of labels) {
      expect(l.length).toBeLessThanOrEqual(52);
      expect(l).toMatch(/^[A-Z]/);
    }
  });

  it("says the turnarounds and beginnings the way the machine page does", () => {
    const by = (prefix: RegExp) => cueMomentLabel(cues.find((c) => prefix.test(c.moment))!.moment);
    expect(by(/^Lower Turnaround.*stack touches/)).toBe("Before a lower turn where the stack touches");
    expect(by(/^Lower Turnaround.*does not touch/)).toBe("Before a lower turn where the stack does not touch");
    expect(by(/^Upper Turnaround.*with an end stop/)).toBe("Upper turnaround at the end stop");
    expect(by(/^Upper Turnaround.*include a squeeze/)).toBe("Upper turnaround with a squeeze");
    expect(by(/^To begin.*pushing/)).toBe("To begin: a pushing movement");
    expect(by(/^To begin.*pulling/)).toBe("To begin: a pulling movement");
    expect(by(/^Speed of Motion/)).toBe("Speed of motion");
    expect(by(/apparent task failure/)).toBe("At apparent task failure");
    expect(by(/^Before you start/)).toBe("Before you start");
  });
});

/* ------------------------------------------------------------------ *
 * Topic and deep-dive sections
 * ------------------------------------------------------------------ */

describe("topicSections", () => {
  it("breaks at headings, calms them, and drops page markers", () => {
    const s = topicSections(
      [
        { kind: "body", text: "Set back pad." },
        { kind: "heading", text: "SETUP" },
        { kind: "body", text: "Have a seat." },
        { kind: "subheading", text: "LP pg 2 of 2" },
        { kind: "body", text: "Feet on the platform." },
        { kind: "heading", text: "LOAD UP + FIRST CONCENTRIC" },
        { kind: "body", text: "Gradually load up." },
      ],
      "Academy 9 · Lower Body",
    );
    expect(s.map((x) => x.title)).toEqual(["", "Setup", "Load up + first concentric"]);
    expect(s.map((x) => x.id)).toEqual(["opening", "setup", "load-up-first-concentric"]);
    expect(texts(s[1])).toEqual(["Have a seat.", "Feet on the platform."]);
    expect(s[0].blocks[0].source).toBe("Academy 9 · Lower Body");
  });

  it("keeps a heading with nothing under it as a line, not an empty section", () => {
    const s = topicSections([
      { kind: "heading", text: "SOME CONTEXT TO CONSIDER:" },
      { kind: "heading", text: "LE + LC + ABD" },
      { kind: "body", text: "Together they replace the Leg Press." },
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].title).toBe("Some context to consider");
    expect(texts(s[0])).toEqual(["LE + LC + ABD", "Together they replace the Leg Press."]);
  });

  it("breaks at subheadings that head prose, and keeps a lead-in as a line", () => {
    const s = topicSections([
      { kind: "body", text: "MSF helps busy adults." },
      { kind: "subheading", text: "Time efficiency" },
      { kind: "body", text: "Results with minimal time." },
      { kind: "subheading", text: "Key myokines include:" },
      { kind: "body", text: "Irisin." },
      { kind: "subheading", text: "Professional delivery" },
      { kind: "body", text: "Trained practitioners." },
    ]);
    expect(s.map((x) => x.title)).toEqual(["", "Time efficiency", "Professional delivery"]);
    expect(texts(s[1])).toEqual(["Results with minimal time.", "Key myokines include:", "Irisin."]);
    expect(s[1].blocks[1].kind).toBe("subheading");
  });

  it("leaves a topic whole when its subheadings are mostly a misread list", () => {
    const s = topicSections([
      { kind: "subheading", text: "Purpose of the Academy" },
      { kind: "body", text: "The technical foundation." },
      { kind: "subheading", text: "A strong grasp allows trainers to:" },
      { kind: "subheading", text: "Apply the protocol" },
      { kind: "subheading", text: "Make better decisions" },
      { kind: "subheading", text: "Communicate clearly" },
      { kind: "subheading", text: "Becoming a practitioner" },
      { kind: "body", text: "Mastery takes practice." },
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].title).toBe("");
    expect(s[0].blocks).toHaveLength(8);
  });

  it("does not split on a single heading-like subheading", () => {
    const s = topicSections([
      { kind: "body", text: "Intro." },
      { kind: "subheading", text: "Supporting research" },
      { kind: "body", text: "Pedersen (2012)." },
    ]);
    expect(s).toHaveLength(1);
  });

  it("gives repeated headings distinct ids", () => {
    const s = topicSections([
      { kind: "heading", text: "SETUP" },
      { kind: "body", text: "Leg Press." },
      { kind: "heading", text: "SETUP" },
      { kind: "body", text: "Leg Curl." },
    ]);
    expect(s.map((x) => x.id)).toEqual(["setup", "setup-2"]);
  });
});

describe("overviewSections", () => {
  it("opens on the target muscles and breaks at each labelled part", () => {
    const s = overviewSections(OVERVIEWS![0].blocks, "Academy deep dive · Lumbar");
    expect(s.map((x) => x.title)).toEqual(["Target muscles", "Synergists", "Considerations for setup", "Notes"]);
    expect(s[0].blocks.map((b) => b.kind)).toEqual(["bullet"]);
    expect(s[1].blocks.map((b) => b.kind)).toEqual(["bullet"]);
    expect(s[2].blocks.map((b) => b.kind)).toEqual(["para"]);
    expect(s[0].id).toBe("target-muscles");
  });

  it("spaces a slash in a label the way the cards write it", () => {
    const s = overviewSections([
      { kind: "subheading", text: "Quadriceps - Knee Extension" },
      { kind: "subheading", text: "Posture/Get Set:" },
      { kind: "body", text: "Chest up." },
    ]);
    expect(s[1].title).toBe("Posture / Get Set");
  });
});

/* ------------------------------------------------------------------ *
 * Clinical flags
 * ------------------------------------------------------------------ */

describe("clinicalFlagsFor", () => {
  const flag = (id: string, ids: string[], label?: string): ClinicalSafetyFlag => ({
    id,
    category: "Test",
    conditionName: `Condition ${id}`,
    ...(label ? { label } : {}),
    severity: "High Risk",
    protocolHandling: [{ instruction: "Never shown on a page.", affectedMachineIds: ids }],
  });

  it("reads the matrix's database keys as catalog ids, labels only", () => {
    const matrix = [flag("a", ["leg_press"]), flag("b", ["4_way_neck"], "Neck pain"), flag("c", ["m-lumbar"])];
    expect(clinicalFlagsFor("m-leg-press", matrix)).toEqual([{ id: "a", label: "Condition a" }]);
    expect(clinicalFlagsFor("m-neck", matrix)).toEqual([{ id: "b", label: "Neck pain" }]);
    expect(clinicalFlagsFor("m-lumbar", matrix)).toEqual([{ id: "c", label: "Condition c" }]);
    expect(clinicalFlagsFor("m-ext", matrix)).toEqual([]);
  });

  it("finds the real matrix's flags for the Lumbar", () => {
    const flags = clinicalFlagsFor("m-lumbar");
    expect(flags.length).toBeGreaterThan(0);
    for (const f of flags) expect(f.label).not.toMatch(/must|should/i);
  });
});

/* ------------------------------------------------------------------ *
 * pageFor, one route kind at a time
 * ------------------------------------------------------------------ */

describe("pageFor — a machine", () => {
  it("builds the four tiers from the definition and the Academy's pieces", () => {
    const page = asPage(pageFor({ kind: "machine", id: "m-lumbar", tier: "adapt" }, makeData()));
    const def = MACHINE_DEFINITIONS["m-lumbar"];

    expect(page.title).toBe("LUMBAR");
    expect(page.target).toEqual({ ref: { kind: "machine", id: "m-lumbar" }, key: "machine:m-lumbar", title: "LUMBAR" });
    expect(page.route).toEqual({ kind: "machine", id: "m-lumbar", tier: "adapt" });
    expect(page.nodeId).toBe("machine:m-lumbar");
    expect(page.lede).toBe(def.clinicalNote);
    expect(page.eyebrow).toContain("Trunk / Spine / Core");
    expect(page.tiers?.map((t) => t.id)).toEqual(["glance", "script", "adapt", "science"]);
    expect(page.sections).toEqual(page.tiers!.flatMap((t) => t.sections));

    const facts = Object.fromEntries(page.facts.map((f) => [f.label, f.value]));
    expect(facts.Code).toBeTruthy();
    expect(facts.Category).toBe("Trunk / Spine / Core");
    expect(facts.Workout).toBe("Spine / Trunk / Core");
    expect(facts["Begins with"]).toBe("A gradual load-up");
    expect(facts.Failure).toBe("Never to failure");
    expect(facts.Preset).toBe(presetLine(presetOf(def)));
    expect(facts["In the Academy"]).toBe("Card · Script · Deep dive");

    // What the codex reader was handed: the definition, each Academy piece, the
    // clinical conditions by label, and the Catalog's name.
    const [givenDef, academy, opts] = fx.tierCalls[0] as [
      unknown,
      { card: QuickCard | null; script: MachineScript | null; overview: { id: string } | null; cues: unknown },
      { clinical: { id: string; label: string }[]; machineName: string; substitutes: string[][] },
    ];
    expect(givenDef).toBe(def);
    expect(academy.card?.id).toBe("lumb");
    expect(academy.script?.id).toBe("spinetrunkcore-lumb");
    expect(academy.overview?.id).toBe("lumbar-extension-lumbar-lower-back");
    expect(academy.cues).toEqual([]);
    expect(opts.machineName).toBe("LUMBAR");
    expect(opts.clinical.length).toBeGreaterThan(0);

    expect(page.related.slice(0, 3).map((r) => r.route)).toEqual([
      { kind: "card", id: "lumb" },
      { kind: "script", id: "spinetrunkcore-lumb" },
      { kind: "overview", id: "lumbar-extension-lumbar-lower-back" },
    ]);
  });

  it("hands over the substitutes by name and links them with the reason", () => {
    const page = asPage(pageFor({ kind: "machine", id: "m-hip-abd" }, makeData()));
    const opts = fx.tierCalls[0][2] as { substitutes: string[][] };
    expect(opts.substitutes).toEqual([["LEG PRESS"]]);
    const lp = page.related.find((r) => r.route.kind === "machine" && r.route.id === "m-leg-press");
    // Leg Press replaces Hip Abduction alone (a set of one): said as one for one, truthfully.
    expect(lp?.why).toBe("On its own, it can replace this one.");
    const add = page.related.find((r) => r.route.kind === "machine" && r.route.id === "m-hip-add");
    expect(add?.why).toBe("Also Hips.");
    expect(page.facts.find((f) => f.label === "Failure")).toBeUndefined();
    expect(page.facts.find((f) => f.label === "In the Academy")).toBeUndefined();
  });

  it("waits for the Academy's chunks before it draws", () => {
    for (const missing of ["cards", "scripts", "overviews", "cues"] as const) {
      expect(pageFor({ kind: "machine", id: "m-lumbar" }, makeData({ [missing]: null }))).toBe("loading");
    }
  });

  it("is gone for an id no one has, and waits while the floor is unknown", () => {
    expect(pageFor({ kind: "machine", id: "m-nope" }, makeData({ floor: [] }))).toBe("gone");
    expect(pageFor({ kind: "machine", id: "sm-solon-x" }, makeData({ floor: null }))).toBe("loading");
  });

  it("draws a studio's own machine from the floor, with no Academy pieces", () => {
    const page = asPage(
      pageFor(
        { kind: "machine", id: "sm-solon-hack" },
        makeData({ floor: [{ id: "sm-solon-hack", name: "HACK SQUAT", code: null }], cards: null }),
      ),
    );
    expect(page.title).toBe("HACK SQUAT");
    expect(page.eyebrow).toBe("This studio's own machine");
    expect(page.related).toEqual([]);
    expect(page.tiers).toHaveLength(4);
  });
});

describe("pageFor — a module", () => {
  it("lists its topics in teaching order and asks for its prose ahead", () => {
    const data = makeData();
    const page = asPage(pageFor({ kind: "module", moduleId: "performance" }, data));
    expect(page.title).toBe("Exercise Performance");
    expect(page.eyebrow).toBe("Academy module 4");
    expect(page.lede).toBe("The mechanics of one repetition.");
    expect(page.related.map((r) => r.title)).toEqual(["Speed of Movement", "Turnaround Technique", "Number of Sets"]);
    expect(page.related[0]).toEqual({
      route: { kind: "topic", moduleId: "performance", topicId: "performance-speed" },
      title: "Speed of Movement",
      why: "3 min",
    });
    expect(page.facts).toEqual([
      { label: "Topics", value: "3" },
      { label: "Read", value: "8 min" },
    ]);
    expect(page.target.key).toBe("academy-module:performance");
    expect(page.nodeId).toBe("module:performance");
    expect(data.loadModule).toHaveBeenCalledWith("performance");
  });

  it("does not ask again for prose it has, and is gone for an unknown module", () => {
    const data = makeData({ modules: { performance: PERFORMANCE } });
    pageFor({ kind: "module", moduleId: "performance" }, data);
    expect(data.loadModule).not.toHaveBeenCalled();
    expect(pageFor({ kind: "module", moduleId: "nope" }, data)).toBe("gone");
  });
});

describe("pageFor — a topic", () => {
  it("asks for its module and says loading until the prose is here", () => {
    const data = makeData();
    expect(pageFor({ kind: "topic", moduleId: "performance", topicId: "performance-turn" }, data)).toBe("loading");
    expect(data.loadModule).toHaveBeenCalledWith("performance");
  });

  it("stays loading when the chunk failed: the design reads moduleFailed and says so", () => {
    const data = makeData({ moduleFailed: (id) => id === "performance" });
    expect(pageFor({ kind: "topic", moduleId: "performance", topicId: "performance-turn" }, data)).toBe("loading");
  });

  it("draws the topic under its module's title, never the file's first line", () => {
    const data = makeData({ modules: { performance: PERFORMANCE } });
    const page = asPage(pageFor({ kind: "topic", moduleId: "performance", topicId: "performance-speed" }, data));
    expect(page.eyebrow).toBe("Exercise Performance");
    expect(page.title).toBe("Speed of Movement");
    expect(page.source).toBe("docs/msf-academy/Academy 4/Speed of Movement.txt");
    expect(page.target).toEqual({
      ref: { kind: "academy-topic", id: "performance-speed", moduleId: "performance" },
      key: "academy-topic:performance-speed",
      title: "Speed of Movement",
    });
    expect(page.nodeId).toBe("topic:performance-speed");
    expect(page.sections[0].blocks[0].source).toBe("Academy 4.5 Speed of Movement");
    expect(page.facts).toEqual([
      { label: "Module", value: "4 · Exercise Performance" },
      { label: "Read", value: "3 min" },
    ]);
    expect(page.related.map((r) => r.why)).toEqual(["Next in Exercise Performance."]);
    expect(data.loadModule).not.toHaveBeenCalled();
  });

  it("splits at the topic's headings and links the topics either side", () => {
    const data = makeData({ modules: { performance: PERFORMANCE } });
    const page = asPage(pageFor({ kind: "topic", moduleId: "performance", topicId: "performance-turn" }, data));
    expect(page.sections.map((s) => s.title)).toEqual(["", "Upper turn"]);
    expect(page.related.map((r) => r.title)).toEqual(["Number of Sets", "Speed of Movement"]);
  });

  it("uses a module the session already holds without waiting a render", () => {
    const data = makeData({ cachedModule: (id) => (id === "performance" ? PERFORMANCE : null) });
    expect(typeof pageFor({ kind: "topic", moduleId: "performance", topicId: "performance-sets" }, data)).toBe("object");
    expect(data.loadModule).not.toHaveBeenCalled();
  });

  it("finds a topic whose stored module is stale, and says where it really lives", () => {
    const data = makeData({ modules: { performance: PERFORMANCE } });
    const page = asPage(pageFor({ kind: "topic", moduleId: "intro", topicId: "performance-sets" }, data));
    expect(page.route).toEqual({ kind: "topic", moduleId: "performance", topicId: "performance-sets" });
  });

  it("calms a topic title the corpus wrote in capitals", () => {
    const index: AcademyIndex = {
      ...INDEX,
      modules: [
        ...INDEX.modules,
        {
          id: "mastery",
          n: 10,
          title: "Mastery Series",
          blurb: "The short pieces.",
          topics: [{ id: "mastery-posture", title: "POSTURE", readingMinutes: 3, words: 601 }],
        },
      ],
    };
    const mastery: ModuleContent = {
      id: "mastery",
      title: "Mastery Series",
      topics: [
        {
          id: "mastery-posture",
          title: "POSTURE",
          order: 1,
          source: "docs/msf-academy/Academy 2/MSF Mastery Series - Issue 1 - Posture.txt",
          words: 601,
          readingMinutes: 3,
          blocks: [{ kind: "body", text: "Chest up." }],
        },
      ],
    };
    const data = makeData({ index, modules: { mastery } });
    const route: VaultRoute = { kind: "topic", moduleId: "mastery", topicId: "mastery-posture" };
    const page = asPage(pageFor(route, data));
    expect(page.title).toBe("Posture");
    expect(page.target.title).toBe("Posture");
    expect(titleOf(route, data)).toBe("Posture");
    const mod = asPage(pageFor({ kind: "module", moduleId: "mastery" }, data));
    expect(mod.related[0].title).toBe("Posture");
  });

  it("is gone for a topic the index or the module no longer has", () => {
    const data = makeData({ modules: { performance: { ...PERFORMANCE, topics: PERFORMANCE.topics.slice(0, 1) } } });
    expect(pageFor({ kind: "topic", moduleId: "performance", topicId: "renamed" }, data)).toBe("gone");
    expect(pageFor({ kind: "topic", moduleId: "", topicId: "renamed" }, data)).toBe("gone");
    expect(pageFor({ kind: "topic", moduleId: "performance", topicId: "performance-sets" }, data)).toBe("gone");
  });
});

describe("pageFor — a quick card", () => {
  it("is titled by its machine, never by the card's own title", () => {
    const page = asPage(pageFor({ kind: "card", id: "pd" }, makeData()));
    expect(page.title).toBe("PULLDOWN");
    expect(page.eyebrow).toBe("Pd · Quick reference card");
    expect(texts(page.sections[0])).toEqual(["Latissimus Dorsi – Shoulder Adduction"]);
    expect(page.nodeId).toBe("machine:m-pulldown");
    expect(page.related[0].route).toEqual({ kind: "machine", id: "m-pulldown" });
  });

  it("keeps the card's own sections and marks its part-headings", () => {
    const page = asPage(pageFor({ kind: "card", id: "lumb" }, makeData()));
    expect(page.sections.map((s) => s.title)).toEqual(["Target Muscles", "Execution, Instruction, and Turnarounds"]);
    expect(page.sections[1].blocks.map((b) => b.kind)).toEqual(["subheading", "bullet", "subheading", "bullet"]);
    expect(page.sections[1].blocks[0].source).toBe("Quick Reference Guide · Lumb");
    expect(page.related.map((r) => r.route.kind)).toEqual(["machine", "script", "overview"]);
  });

  it("is loading before the cards chunk and gone for an unknown card", () => {
    expect(pageFor({ kind: "card", id: "lumb" }, makeData({ cards: null }))).toBe("loading");
    expect(pageFor({ kind: "card", id: "zz" }, makeData())).toBe("gone");
  });
});

describe("pageFor — a spoken script", () => {
  it("draws the codex reader's beats, under the machine's name", () => {
    const page = asPage(pageFor({ kind: "script", id: "spinetrunkcore-lumb" }, makeData()));
    expect(page.title).toBe("LUMBAR");
    expect(page.eyebrow).toBe("Spine / Trunk / Core · Spoken script");
    expect(page.lede).toBe("Gap 4 (5 or 6 for back issues) – starts at LT, chest up");
    expect(page.sections[0].blocks.map((b) => b.kind)).toEqual(["do", "said"]);
    expect(page.nodeId).toBe("machine:m-lumbar");
    expect(page.related.map((r) => r.route.kind)).toEqual(["machine", "card", "overview", "cueing"]);
  });

  it("is loading or gone like every page", () => {
    expect(pageFor({ kind: "script", id: "x" }, makeData({ scripts: null }))).toBe("loading");
    expect(pageFor({ kind: "script", id: "x" }, makeData())).toBe("gone");
  });
});

describe("pageFor — a deep dive", () => {
  it("is titled by its machine and breaks at its labelled parts", () => {
    const page = asPage(pageFor({ kind: "overview", id: "lumbar-extension-lumbar-lower-back" }, makeData()));
    expect(page.title).toBe("LUMBAR");
    expect(page.eyebrow).toBe("Lumb · Deep dive");
    expect(page.sections.map((s) => s.title)).toEqual([
      "Target muscles",
      "Synergists",
      "Considerations for setup",
      "Notes",
    ]);
    expect(page.facts).toEqual([{ label: "Read", value: "9 min" }]);
    expect(page.nodeId).toBe("machine:m-lumbar");
  });

  it("falls back to the Academy's title for a deep dive no machine claims", () => {
    const page = asPage(pageFor({ kind: "overview", id: "lumbar-extension-lumbar-lower-back" }, makeData({ machines: [] })));
    expect(page.title).toBe("Lumbar Extension (Lumbar, Lower Back)");
    expect(page.nodeId).toBeUndefined();
  });
});

describe("pageFor — the glossary", () => {
  it("has one section per letter, a line per term, definitions capitalised", () => {
    const data = makeData({
      glossary: [
        { term: "Eccentric", definition: "the negative or lowering phase." },
        { term: "Concentric", definition: "the positive or lifting phase." },
        { term: "Contract(ion)", definition: "a muscle shortening." },
        { term: "Force", definition: "Mass times acceleration." },
      ],
    });
    const page = asPage(pageFor({ kind: "glossary", term: "Concentric" }, data));
    expect(page.sections.map((s) => s.title)).toEqual(["C", "E", "F"]);
    expect(page.sections.map((s) => s.id)).toEqual(["letter-c", "letter-e", "letter-f"]);
    const c = page.sections[0].blocks;
    expect(c.map((b) => b.label)).toEqual(["Concentric", "Contract(ion)"]);
    expect(c[0].text).toBe("The positive or lifting phase.");
    expect(c[0].kind).toBe("line");
    expect(page.target.key).toBe("academy-glossary");
    expect(page.nodeId).toBe("term:concentric");
    expect(page.related[0].route).toEqual({ kind: "topic", moduleId: "intro", topicId: "intro-glossary" });
  });

  it("marks the equipment terms (the file's second run, from index 40)", () => {
    const glossary = Array.from({ length: 40 }, (_v, i) => ({ term: `Term ${String(i).padStart(2, "0")}`, definition: "x." }));
    glossary.push({ term: "Gap", definition: "the distance the movement arm is advanced." });
    const page = asPage(pageFor({ kind: "glossary" }, makeData({ glossary })));
    const gap = page.sections.flatMap((s) => s.blocks).find((b) => b.label === "Gap");
    expect(gap?.source).toBe("Academy glossary · Equipment");
    const t0 = page.sections.flatMap((s) => s.blocks).find((b) => b.label === "Term 00");
    expect(t0?.source).toBe("Academy glossary");
  });

  it("is loading before the glossary chunk", () => {
    expect(pageFor({ kind: "glossary" }, makeData({ glossary: null }))).toBe("loading");
  });
});

describe("pageFor — the cueing phrasebook", () => {
  const cues: CueMoment[] = [
    { moment: "Before you start", phrases: ["SEE INDIVIDUAL EXERCISE SCRIPTS FOR MORE SPECIFIC EXAMPLES"], notes: [] },
    {
      moment:
        "Upper Turnaround (movements without an end stop and include a squeeze - ex. row, chest flye) - instructor will need to stop the client",
      phrases: ["Squeeze!", "(Change vocal tone)", "After the loading transfer:"],
      notes: ["Time the click."],
    },
  ];

  it("has a section per moment, its cues as cues and its other lines as plain lines", () => {
    const page = asPage(pageFor({ kind: "cueing", moment: 1 }, makeData({ cues })));
    expect(page.sections.map((s) => s.id)).toEqual(["moment-0", "moment-1"]);
    expect(page.sections[0].title).toBe("Before you start");
    expect(page.sections[0].note).toBeUndefined();
    expect(page.sections[0].blocks).toMatchObject([
      { kind: "para", text: "See individual exercise scripts for more specific examples" },
    ]);
    expect(page.sections[1].title).toBe("Upper turnaround with a squeeze");
    expect(page.sections[1].note).toBe(cues[1].moment);
    expect(page.sections[1].blocks.map((b) => [b.kind, b.text])).toEqual([
      ["para", "Time the click."],
      ["cue", "Squeeze!"],
      ["para", "(Change vocal tone)"],
      ["para", "After the loading transfer:"],
    ]);
    expect(page.sections[1].blocks[1].source).toBe("Academy 9 · Cues and Timing");
    expect(page.target.key).toBe("academy-cueing");
    expect(page.related.some((r) => r.route.kind === "quiz")).toBe(true);
  });

  it("is loading before the cues chunk", () => {
    expect(pageFor({ kind: "cueing" }, makeData({ cues: null }))).toBe("loading");
  });
});

describe("pageFor — a playbook", () => {
  it("is a draft, under its pillar, every line saying where it comes from", () => {
    const page = asPage(pageFor({ kind: "playbook", id: "the-twenty-minutes" }, makeData()));
    expect(page.draft).toBe(true);
    expect(page.eyebrow).toBe("The floor and the protocol");
    expect(page.lede).toBe("One set to failure on five to eight machines.");
    expect(page.sections[0].blocks).toHaveLength(1);
    expect(page.sections[0].blocks[0].source).toBe("Label(docs/business/the-floor.md:12)");
    expect(page.source).toBe("Written from: The floor");
    expect(page.related).toEqual(PLAYBOOK.related);
    expect(page.target.key).toBe("playbook:the-twenty-minutes");
    expect(page.nodeId).toBe("playbook:the-twenty-minutes");
  });

  it("is gone for an unknown playbook", () => {
    expect(pageFor({ kind: "playbook", id: "nope" }, makeData())).toBe("gone");
  });
});

describe("pageFor — places that are not pages, and never a throw", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it("answers gone for the home, the indexes, the quiz, the map, the queue and a track", () => {
    const places: VaultRoute[] = [
      { kind: "home" },
      { kind: "catalog" },
      { kind: "academy" },
      { kind: "quiz" },
      { kind: "map" },
      { kind: "queue" },
      { kind: "track", id: "lt-101" },
    ];
    for (const r of places) expect(pageFor(r, makeData())).toBe("gone");
  });

  it("turns a malformed corpus entry into gone instead of a crash", () => {
    const broken = [{ ...CARDS[0], sections: undefined }] as unknown as QuickCard[];
    expect(pageFor({ kind: "card", id: "lumb" }, makeData({ cards: broken }))).toBe("gone");
    expect(warn).toHaveBeenCalled();
  });
});

describe("titleOf", () => {
  const data = makeData({ cues: [{ moment: "Speed of Motion", phrases: [], notes: [] }] });

  it("names every kind of place without loading anything", () => {
    const cases: [VaultRoute, string][] = [
      [{ kind: "home" }, "Overview"],
      [{ kind: "catalog" }, "Catalog"],
      [{ kind: "academy" }, "Academy"],
      [{ kind: "machine", id: "m-lumbar" }, "LUMBAR"],
      [{ kind: "module", moduleId: "performance" }, "Exercise Performance"],
      [{ kind: "module", moduleId: "nope" }, "Academy module"],
      [{ kind: "topic", moduleId: "", topicId: "performance-turn" }, "Turnaround Technique"],
      [{ kind: "topic", moduleId: "x", topicId: "nope" }, "Academy topic"],
      [{ kind: "card", id: "pd" }, "PULLDOWN"],
      [{ kind: "card", id: "zz" }, "Quick reference card"],
      [{ kind: "script", id: "spinetrunkcore-lumb" }, "LUMBAR"],
      [{ kind: "overview", id: "lumbar-extension-lumbar-lower-back" }, "LUMBAR"],
      [{ kind: "glossary" }, "Glossary"],
      [{ kind: "glossary", term: "Gap" }, "Gap"],
      [{ kind: "cueing" }, "Cueing phrasebook"],
      [{ kind: "cueing", moment: 0 }, "Speed of motion"],
      [{ kind: "playbook", id: "the-twenty-minutes" }, "The twenty minutes"],
      [{ kind: "track", id: "lt-101" }, "Life Transformer 101"],
      [{ kind: "quiz", deck: "rep" }, "Quiz"],
      [{ kind: "map" }, "Map"],
      [{ kind: "queue" }, "Waiting for review"],
    ];
    for (const [r, title] of cases) expect(titleOf(r, data)).toBe(title);
  });

  it("names a card from the cards chunk when the joined rows are not built yet", () => {
    expect(titleOf({ kind: "card", id: "pd" }, makeData({ machines: [] }))).toBe("PULLDOWN");
  });
});

describe("a machine's lede is said once (review fix, Oct 19 2026)", () => {
  const LEDE = "Multi-joint lower-body push.";
  const tiers = (): CodexTier[] => [
    { id: "glance", n: 1, title: "Floor glance", sections: [{ id: "leaf-setup", title: "Set up", blocks: [{ key: "a", kind: "line", text: "Seat at 4." }] }] },
    {
      id: "science",
      n: 4,
      title: "Deep science",
      sections: [
        { id: "leaf-understand", title: "Understand", blocks: [{ key: "b", kind: "line", text: ` ${LEDE} `, label: "Clinical note" }] },
        { id: "card-target", title: "Target muscles", blocks: [{ key: "c", kind: "bullet", text: "Quadriceps" }] },
      ],
    },
  ];

  it("leaves out the line that only repeats the lede, and the section it emptied", () => {
    const t = tiers();
    const out = withoutLede(t, LEDE);
    expect(out[1].sections.map((s) => s.id)).toEqual(["card-target"]);
    // A tier it did not touch is the same object.
    expect(out[0]).toBe(t[0]);
  });

  it("keeps the tier's honest empty line when nothing is left", () => {
    const only: CodexTier[] = [
      { id: "science", n: 4, title: "Deep science", sections: [{ id: "leaf-understand", title: "Understand", blocks: [{ key: "b", kind: "line", text: LEDE }] }] },
    ];
    expect(withoutLede(only, LEDE)[0].sections).toEqual([
      { id: "science-empty", title: "Deep science", blocks: [], note: "Nothing written for this machine yet." },
    ]);
  });

  it("changes nothing without a lede", () => {
    const t = tiers();
    expect(withoutLede(t, "  ")).toBe(t);
  });

  it("the machine page drops the clinical note from its tiers and keeps it as the lede", () => {
    const def = MACHINE_DEFINITIONS["m-lumbar"];
    const page = pageFor({ kind: "machine", id: "m-lumbar" }, makeData());
    if (typeof page === "string") throw new Error(page);
    expect(page.lede).toBe(def.clinicalNote);
    expect(page.sections.flatMap((s) => s.blocks).some((b) => b.text.trim() === (def.clinicalNote ?? "").trim())).toBe(false);
  });
});

describe("a studio's own machine on a floor that cannot be read (review fix, Oct 19 2026)", () => {
  it("is said to be unreadable, not loading forever, only when the floor's read is final", () => {
    const route = { kind: "machine" as const, id: "sm-solon-x" };
    expect(floorUnreadableFor(route, makeData({ floor: null, floorState: "unreadable" }))).toBe(true);
    expect(floorUnreadableFor(route, makeData({ floor: null, floorState: "loading" }))).toBe(false);
    // A standard machine never waits on the floor.
    expect(floorUnreadableFor({ kind: "machine", id: "m-lumbar" }, makeData({ floor: null, floorState: "unreadable" }))).toBe(false);
    expect(floorUnreadableFor({ kind: "glossary" }, makeData({ floor: null, floorState: "unreadable" }))).toBe(false);
  });
});
