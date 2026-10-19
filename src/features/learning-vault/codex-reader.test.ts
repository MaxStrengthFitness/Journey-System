import { describe, expect, it } from "vitest";
import cardsFile from "../academy/content/cards.json";
import cuesFile from "../academy/content/cues.json";
import overviewsFile from "../academy/content/overviews.json";
import scriptsFile from "../academy/content/scripts.json";
import type { CueMoment, MachineScript, OverviewsFile, QuickCard } from "../academy/types";
import { MACHINE_DEFINITIONS } from "../../data/machine-definitions";
import type { MachineDefinition } from "../../types/machines";
import { blockKeyFor } from "./blocks";
import {
  EMPTY_TIER_LINE,
  MACHINE_DEFINITION_SOURCE,
  TIER_TITLES,
  beatTitle,
  clinicalSection,
  codexSections,
  codexTiers,
  cueKeysFor,
  deepDiveSection,
  scriptSections,
  substituteLine,
  substituteSection,
  tidyScriptLine,
  workoutWords,
} from "./codex-reader";
import type { CodexTier, VaultSection } from "./types";

const cards = (cardsFile as unknown as { cards: QuickCard[] }).cards;
const cues = (cuesFile as unknown as { cues: CueMoment[] }).cues;
const overviews = (overviewsFile as unknown as OverviewsFile).overviews;
const scripts = (scriptsFile as unknown as { scripts: MachineScript[] }).scripts;

const LP = MACHINE_DEFINITIONS["m-leg-press"];
const academyFor = (machineId: string, overviewId: string | null) => ({
  card: cards.find((c) => c.machineId === machineId) ?? null,
  script: scripts.find((s) => s.machineId === machineId) ?? null,
  overview: overviewId ? (overviews.find((o) => o.id === overviewId) ?? null) : null,
  cues,
});

const tier = (tiers: CodexTier[], id: CodexTier["id"]) => tiers.find((t) => t.id === id)!;
const section = (tiers: CodexTier[], id: string): VaultSection | undefined =>
  tiers.flatMap((t) => t.sections).find((s) => s.id === id);

describe("the four tiers", () => {
  it("are named as the round decided", () => {
    expect(TIER_TITLES).toEqual({
      glance: "Floor glance",
      script: "Script & cues",
      adapt: "Adapt & clinical",
      science: "Deep science",
    });
  });

  it("come glance first, numbered 1 to 4", () => {
    const tiers = codexTiers(LP, academyFor("m-leg-press", "leg-press"));
    expect(tiers.map((t) => [t.id, t.n, t.title])).toEqual([
      ["glance", 1, "Floor glance"],
      ["script", 2, "Script & cues"],
      ["adapt", 3, "Adapt & clinical"],
      ["science", 4, "Deep science"],
    ]);
  });
});

describe("the Leg Press, from the seed and the real Academy", () => {
  const tiers = codexTiers(LP, academyFor("m-leg-press", "leg-press"), { machineName: "LEG PRESS" });

  it("puts Stop, Set up, Get set and Begin on the floor glance, as method lines", () => {
    const glance = tier(tiers, "glance");
    expect(glance.sections.map((s) => s.id)).toEqual(["leaf-stop", "leaf-setup", "leaf-getset", "leaf-begin"]);
    expect(glance.sections.map((s) => s.title)).toEqual(["Stop", "Set up", "Get set", "Begin"]);
    const stop = glance.sections[0];
    expect(stop.blocks[0]).toEqual({
      key: blockKeyFor(LP.clinicalWarnings[0]),
      kind: "line",
      label: "Clinical warning",
      text: LP.clinicalWarnings[0],
      source: MACHINE_DEFINITION_SOURCE,
    });
    expect(stop.blocks.some((b) => b.label === "Contraindicated for" && b.text === "Knee Replacement")).toBe(true);
    const begin = glance.sections[3];
    expect(begin.blocks[0].label).toBe("The load-up");
  });

  it("gives the script tier the rep, the spoken script beat by beat, and the moments that fit an end stop", () => {
    const script = tier(tiers, "script");
    const ids = script.sections.map((s) => s.id);
    expect(ids[0]).toBe("leaf-rep");
    expect(ids).toEqual(expect.arrayContaining(["beat-0", "beat-1", "beat-2", "beat-3"]));
    // Load-up, then the end-stop upper turn, then the lower turn where the stack touches (the Leg Press is named there).
    expect(ids.filter((id) => id.startsWith("moment-"))).toEqual(["moment-1", "moment-8", "moment-6"]);
    expect(section(tiers, "beat-1")?.title).toBe("Load up · first concentric");
    const setup = section(tiers, "beat-0")!;
    expect(setup.note).toBe("Academy script · Lower Body");
    expect(setup.blocks[0]).toMatchObject({ kind: "do", source: "Academy script · Lower Body" });
    expect(setup.blocks[1]).toMatchObject({ kind: "said", text: "Have a seat, feet on frame below [point], butt back, lay back in the seat." });
  });

  it("draws the phrasebook's lines as cues and its explanations as paragraphs", () => {
    const loadUp = section(tiers, "moment-1")!;
    expect(loadUp.title).toBe("To begin: the gradual load-up");
    expect(loadUp.note).toBe("Academy 9 · Cues and Timing");
    expect(loadUp.blocks.filter((b) => b.kind === "para")).toHaveLength(2);
    expect(loadUp.blocks.filter((b) => b.kind === "cue").map((b) => b.text)).toContain("Gradually load up.");
    expect(section(tiers, "moment-8")?.note).toBeUndefined();
  });

  it("says each line once on the page: a key cue is not repeated as a phrasebook line", () => {
    const keys = codexSections(tiers).flatMap((s) => s.blocks.map((b) => b.key));
    expect(new Set(keys).size).toBe(keys.length);
    const barely = codexSections(tiers).flatMap((s) => s.blocks).filter((b) => b.text.replace(/\.$/, "") === "Barely touch, barely start");
    expect(barely).toHaveLength(1);
    expect(barely[0].kind).toBe("line");
  });

  it("puts the card's muscles and the deep dive in deep science", () => {
    const science = tier(tiers, "science");
    // The card's four synergists are word for word the definition's, already said under Understand.
    expect(science.sections.map((s) => s.id)).toEqual(["leaf-understand", "card-target", "deep-dive"]);
    expect(section(tiers, "leaf-understand")!.blocks.filter((b) => b.label === "Synergist").map((b) => b.text)).toEqual([
      "Hamstrings",
      "Gastrocnemius",
      "Soleus",
      "Adductor Magnus",
    ]);
    const ext = codexTiers(MACHINE_DEFINITIONS["m-compound-row"], academyFor("m-compound-row", "compound-row"));
    expect(section(ext, "card-synergists")?.blocks.length ?? 0).toBeGreaterThan(0);
    expect(section(tiers, "card-target")!.blocks.map((b) => b.text)).toEqual(["Quadriceps – Knee Extension", "Gluteus Maximus – Hip Extension"]);
    expect(section(tiers, "card-target")!.blocks[0].source).toBe("Quick Reference Guide · LP");
    const dive = section(tiers, "deep-dive")!;
    expect(dive.blocks[0].source).toBe("Academy deep dive · Leg Press");
    // The corpus's capital "NOTES" heading reads in sentence case.
    expect(dive.blocks.some((b) => b.kind === "heading" && b.text === "Notes")).toBe(true);
    expect(dive.blocks.some((b) => b.text === "NOTES")).toBe(false);
  });

  it("makes every block a clean object with its key from its words", () => {
    for (const s of codexSections(tiers)) {
      expect(s.blocks.length, s.id).toBeGreaterThan(0);
      for (const b of s.blocks) {
        expect(b.key).toBe(blockKeyFor(b.text));
        expect(b.key).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
        expect(Object.values(b).every((v) => v !== undefined)).toBe(true);
        expect(b.source, `${s.id}: ${b.text}`).toBeTruthy();
      }
    }
  });
});

describe("a handoff machine", () => {
  const PD = MACHINE_DEFINITIONS["m-pulldown"];
  const tiers = codexTiers(PD, academyFor("m-pulldown", "pulldown-torso-arm"));

  it("begins with the handoff moment, then the lower turn where the stack does not touch, then the squeeze", () => {
    const ids = tier(tiers, "script").sections.map((s) => s.id).filter((id) => id.startsWith("moment-"));
    expect(ids).toEqual(["moment-2", "moment-7", "moment-9"]);
  });

  it("leaves out the phrasebook's lead-in that is not a cue", () => {
    const handoff = section(tiers, "moment-2")!;
    expect(handoff.blocks.some((b) => b.text.endsWith(":"))).toBe(false);
    expect(handoff.blocks.length).toBe(3);
  });

  it("shows the handoff and its transfer cue on the glance tier", () => {
    expect(section(tiers, "leaf-begin")!.blocks.map((b) => b.label)).toEqual(["The load-up", "The handoff", "The transfer cue"]);
  });
});

describe("which moments fit", () => {
  it("shows both lower turns when nothing says which", () => {
    const keys = cueKeysFor(MACHINE_DEFINITIONS["m-lumbar"], cues, "LUMBAR");
    expect(keys).toEqual(["loadUp", "upperSqueeze", "lowerTouch", "lowerNoTouch"]);
  });

  it("follows a recorded lower-turn switch over the name", () => {
    const def = { ...MACHINE_DEFINITIONS["m-leg-press"], switches: { lowerTurn: "jointLimited" as const } };
    expect(cueKeysFor(def, cues, "LEG PRESS")).toEqual(["loadUp", "upperEndStop", "lowerNoTouch"]);
  });

  it("draws no moments without a phrasebook", () => {
    const tiers = codexTiers(LP, { cues: null });
    expect(codexSections(tiers).some((s) => s.id.startsWith("moment-"))).toBe(false);
  });
});

describe("where a recorded source is shown", () => {
  it("prints the codex's source label instead of the definition", () => {
    const def: Partial<MachineDefinition> = {
      ...LP,
      sources: [
        {
          path: "execution.loadUpProtocol",
          kind: "academy",
          ref: "Academy/Academy 4 - Exercise Performance/Academy - Exercise Performance 3 - Gradual Load-up.txt",
          at: "the load-up",
        },
      ],
    };
    const begin = section(codexTiers(def, {}), "leaf-begin")!;
    expect(begin.blocks[0].source).toBe("Academy - Exercise Performance 3 - Gradual Load-up · the load-up");
  });
});

describe("adapt and clinical", () => {
  it("lists the clinical conditions by name only, once each", () => {
    const s = clinicalSection([
      { id: "bone-osteoporosis", label: "Osteoporosis / Severe Osteopenia" },
      { id: "dup", label: "osteoporosis / severe osteopenia" },
      { id: "x", label: "  " },
    ])!;
    expect(s.title).toBe("When a client has one of these");
    expect(s.blocks.map((b) => [b.kind, b.text, b.source])).toEqual([["bullet", "Osteoporosis / Severe Osteopenia", "Clinical matrix"]]);
    expect(clinicalSection([])).toBeNull();
    expect(clinicalSection(undefined)).toBeNull();
  });

  it("writes each substitute set as one line, reading a machine id as its name", () => {
    const s = substituteSection([["m-ext", "m-hip-abd", "m-lumbar"], ["Leg Extension", "Lumbar"]])!;
    expect(s.blocks.map((b) => b.text)).toEqual([
      "Together: LEG EXTENSION + HIP ABDUCTION + LUMBAR",
      "Together: Leg Extension + Lumbar",
    ]);
    expect(s.blocks[0].source).toBe("Academy 6 · Exercise Substitutes");
    expect(substituteSection([])).toBeNull();
    expect(substituteSection([[]])).toBeNull();
  });

  it("says a set replaces the machine TOGETHER, never one for one; a set of one is the machine alone", () => {
    const s = substituteSection([["Leg Extension", "Leg Curl", "Hip Abduction"], ["Chest Press"]])!;
    expect(s.title).toBe("Can be replaced by");
    expect(s.blocks.map((b) => b.text)).toEqual(["Together: Leg Extension + Leg Curl + Hip Abduction", "Chest Press"]);
    expect(substituteLine(["Dip"])).toBe("Dip");
    expect(substituteLine([])).toBe("");
    // No line or title calls a single machine a substitute "for" the main one.
    expect(JSON.stringify(s)).not.toMatch(/substitutes? for|stands? in/i);
  });

  it("puts them on the adapt tier, after the machine's own adapt lines", () => {
    const tiers = codexTiers(LP, {}, {
      clinical: [{ id: "bone-osteoporosis", label: "Osteoporosis / Severe Osteopenia" }],
      substitutes: [["Leg Extension", "Hip Abduction", "Lumbar"]],
    });
    expect(tier(tiers, "adapt").sections.map((s) => s.id)).toEqual(["leaf-adapt", "clinical", "substitutes"]);
  });
});

describe("an empty machine", () => {
  it("keeps one honest line in every tier, as a note with no line to mark", () => {
    const tiers = codexTiers({}, {});
    expect(tiers).toHaveLength(4);
    for (const t of tiers) {
      expect(t.sections).toEqual([{ id: `${t.id}-empty`, title: TIER_TITLES[t.id], blocks: [], note: EMPTY_TIER_LINE }]);
    }
  });

  it("copes with a missing Academy and missing options", () => {
    const tiers = codexTiers({ name: "Studio machine", clinicalNote: "A press." }, {});
    expect(section(tiers, "leaf-understand")!.blocks[0]).toMatchObject({ kind: "line", label: "Clinical note", text: "A press." });
    expect(tier(tiers, "glance").sections[0].id).toBe("glance-empty");
  });
});

describe("the small pieces", () => {
  it("says a beat's name in sentence case", () => {
    expect(beatTitle("LOAD UP + FIRST CONCENTRIC")).toBe("Load up · first concentric");
    expect(beatTitle("LOWER TURN + FIRST CONCENTRIC + PAUSE/SQUEEZE")).toBe("Lower turn · first concentric · pause/squeeze");
    expect(beatTitle("SETUP")).toBe("Setup");
    expect(beatTitle("")).toBe("");
  });

  it("names the spine workout as the Academy does", () => {
    expect(workoutWords("SpineTrunkCore")).toBe("Spine / Trunk / Core");
    expect(workoutWords("Lower Body")).toBe("Lower Body");
  });

  it("tidies a stray closing quote and doubled spaces, and nothing else", () => {
    expect(tidyScriptLine("parallel to each other.”  (NOTE: wider)")).toBe("parallel to each other. (NOTE: wider)");
    expect(tidyScriptLine("Handoff - “Now pull down…that is yours.")).toBe("Handoff - “Now pull down…that is yours.");
    expect(tidyScriptLine("says “yours”")).toBe("says “yours”");
  });

  it("draws nothing for a missing script or deep dive", () => {
    expect(scriptSections(null)).toEqual([]);
    expect(deepDiveSection(undefined)).toBeNull();
    expect(deepDiveSection({ id: "x", title: "X", blocks: [] })).toBeNull();
  });
});
