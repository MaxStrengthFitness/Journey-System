import { describe, expect, it } from "vitest";
import cuesFile from "../academy/content/cues.json";
import scriptsFile from "../academy/content/scripts.json";
import performance from "../academy/content/performance.json";
import continuousTension from "../academy/content/continuous-tension.json";
import mastery from "../academy/content/mastery.json";
import further from "../academy/content/further.json";
import { ACADEMY_INDEX } from "../academy/useAcademyContent";
import type { CueMoment, MachineScript, ModuleContent } from "../academy/types";
import { MACHINE_DEFINITIONS } from "../../data/machine-definitions";
import type { MachineDefinition } from "../../types/machines";
import type { RepPhaseId, RepShape } from "./types";
import {
  CUE_MOMENT_INDEX,
  CUE_TITLES,
  DEFAULT_PACE,
  PHASE_RULES,
  REP_SOURCES,
  REP_WINDOW,
  SHAPE_WORDS,
  WINDOW_LINE,
  clampPace,
  cueExamples,
  cueKeyFor,
  cuesForPhase,
  cycleOf,
  findCueMoment,
  isContinuousTurn,
  isCuePhrase,
  jumpTimes,
  lowerCueKeys,
  namesExample,
  phaseAt,
  phaseJumpTime,
  phaseTiming,
  remapTime,
  repModel,
  repShapeOf,
  routeForRepSource,
  sourceRouteOf,
  type CueKey,
} from "./rep-phases";

const cues = (cuesFile as unknown as { cues: CueMoment[] }).cues;
const scripts = (scriptsFile as unknown as { scripts: MachineScript[] }).scripts;
const MODULES: Record<string, ModuleContent> = Object.fromEntries(
  [performance, continuousTension, mastery, further].map((m) => [(m as ModuleContent).id, m as unknown as ModuleContent]),
);

const SHAPES: RepShape[] = ["endStop", "squeeze", "handoff"];
const PACES = [6, 7, 8, 9, 10];

const def = (execution: Partial<MachineDefinition["execution"]>): Partial<MachineDefinition> =>
  ({ execution: execution as MachineDefinition["execution"] }) as Partial<MachineDefinition>;

describe("the window", () => {
  it("is the Academy's: 6 to 10 seconds each way, a 12 to 20 second cycle, 6 the house default", () => {
    expect(REP_WINDOW).toEqual({ min: 6, max: 10, cycleMin: 12, cycleMax: 20 });
    expect(DEFAULT_PACE).toBe(6);
  });

  it("clamps a pace into the window, whole seconds, the house's 6 when missing", () => {
    expect(clampPace()).toBe(6);
    expect(clampPace(Number.NaN)).toBe(6);
    expect(clampPace(3)).toBe(6);
    expect(clampPace(14)).toBe(10);
    expect(clampPace(7.6)).toBe(8);
    expect(clampPace(9)).toBe(9);
  });

  it("never says a rep IS 20 seconds, anywhere in its words", () => {
    const words = [
      ...Object.values(PHASE_RULES).map((r) => r.rule),
      ...Object.values(SHAPE_WORDS),
      WINDOW_LINE,
      ...SHAPES.flatMap((s) => PACES.map((p) => cycleOf(repModel(s, p)).words)),
    ];
    for (const w of words) {
      expect(w).not.toMatch(/\b20[- ]second rep\b/i);
      expect(w).not.toMatch(/\brep (is|takes|lasts) (about )?20\b/i);
    }
    // The window line says the range, once.
    expect(WINDOW_LINE).toContain("6 to 10 seconds up and 6 to 10 down");
    expect(WINDOW_LINE).toContain("12 to 20 seconds");
  });
});

describe("repShapeOf", () => {
  it("reads the codex switches: a handoff, else an end stop, else a squeeze", () => {
    expect(repShapeOf(def({ requiresHandoff: true, upperTurnaround: { style: "pause-squeeze", description: "" } }))).toBe("handoff");
    expect(repShapeOf(def({ requiresHandoff: false, upperTurnaround: { style: "hard-stop", description: "" } }))).toBe("endStop");
    expect(repShapeOf(def({ requiresHandoff: false, upperTurnaround: { style: "touch-and-go", description: "" } }))).toBe("endStop");
    expect(repShapeOf(def({ requiresHandoff: false, upperTurnaround: { style: "pause-squeeze", description: "" } }))).toBe("squeeze");
    expect(repShapeOf({})).toBe("squeeze");
    expect(repShapeOf(null)).toBe("squeeze");
  });

  it("agrees with the Academy's script for every one of the twenty seeded machines", () => {
    const shapeOfScript = (s: MachineScript): RepShape => {
      const beats = s.beats.map((b) => b.beat.trim());
      if (beats.some((b) => b.startsWith("HANDOFF"))) return "handoff";
      return beats.includes("UPPER TURN") ? "endStop" : "squeeze";
    };
    const ids = Object.keys(MACHINE_DEFINITIONS);
    expect(ids).toHaveLength(20);
    for (const id of ids) {
      const script = scripts.find((s) => s.machineId === id);
      expect(script, id).toBeTruthy();
      expect(repShapeOf(MACHINE_DEFINITIONS[id]), id).toBe(shapeOfScript(script!));
    }
    expect(repShapeOf(MACHINE_DEFINITIONS["m-leg-press"])).toBe("endStop");
    expect(repShapeOf(MACHINE_DEFINITIONS["m-pulldown"])).toBe("handoff");
    expect(repShapeOf(MACHINE_DEFINITIONS["m-lumbar"])).toBe("squeeze");
  });
});

describe("repModel", () => {
  it("runs each shape in the order the set does", () => {
    expect(repModel("endStop").phases.map((p) => p.id)).toEqual(["loadup", "concentric", "upper", "eccentric", "lower", "final"]);
    expect(repModel("squeeze").phases.map((p) => p.id)).toEqual(["loadup", "concentric", "upper", "eccentric", "lower", "final"]);
    expect(repModel("handoff").phases.map((p) => p.id)).toEqual(["handoff", "eccentric", "lower", "concentric", "upper", "final"]);
  });

  it("draws each stroke at exactly the pace, for every pace in the window", () => {
    for (const shape of SHAPES) {
      for (const pace of PACES) {
        const m = repModel(shape, pace);
        expect(m.pace).toBe(pace);
        for (const id of ["concentric", "eccentric", "final"] as RepPhaseId[]) {
          const p = m.phases.find((x) => x.id === id)!;
          expect(p.to - p.from, `${shape} ${pace} ${id}`).toBe(pace);
        }
      }
    }
  });

  it("puts a continuous turn as a one-second window over the moment of reversal, and the squeeze as a hold of its own", () => {
    const e = repModel("endStop", 6);
    const up = e.phases.find((p) => p.id === "upper")!;
    expect([up.from, up.to]).toEqual([8.5, 9.5]);
    expect(isContinuousTurn(e, up)).toBe(true);
    const s = repModel("squeeze", 6);
    const sq = s.phases.find((p) => p.id === "upper")!;
    expect([sq.from, sq.to]).toEqual([9, 11]);
    expect(isContinuousTurn(s, sq)).toBe(false);
    expect(isContinuousTurn(s, s.phases.find((p) => p.id === "lower")!)).toBe(true);
  });

  it("totals the start, the cycle and the last rep", () => {
    expect(repModel("endStop", 6).total).toBe(21);
    expect(repModel("squeeze", 6).total).toBe(23);
    expect(repModel("handoff", 6).total).toBe(23);
    expect(repModel("endStop", 10).total).toBe(33);
  });

  it("clamps the pace it is given", () => {
    expect(repModel("endStop", 2).pace).toBe(6);
    expect(repModel("endStop").pace).toBe(6);
  });

  it("gives every phase a rule, a source a reader can open, and a phrasebook moment", () => {
    for (const shape of SHAPES) {
      for (const p of repModel(shape).phases) {
        expect(p.rule.length, `${shape} ${p.id}`).toBeGreaterThan(20);
        const route = sourceRouteOf(p);
        expect(route, `${shape} ${p.id} ${p.source}`).not.toBeNull();
        expect(p.cueMoment).toBe(CUE_MOMENT_INDEX[cueKeyFor(p.id, shape)]);
      }
    }
  });

  it("never states a rep count as a target, a weight or a load", () => {
    for (const r of Object.values(PHASE_RULES)) {
      expect(r.rule).not.toMatch(/\b\d+\s*(lb|lbs|pounds|kg)\b/i);
      expect(r.rule).not.toMatch(/\b\d+\s*to\s*\d+\s*reps\b/i);
    }
  });
});

describe("phaseAt", () => {
  const m = repModel("endStop", 6);
  it("finds the phase under the thumb, preferring the narrower turn window", () => {
    expect(phaseAt(m, 0).id).toBe("loadup");
    expect(phaseAt(m, 2.9).id).toBe("loadup");
    expect(phaseAt(m, 3).id).toBe("concentric");
    expect(phaseAt(m, 8.4).id).toBe("concentric");
    expect(phaseAt(m, 8.5).id).toBe("upper");
    expect(phaseAt(m, 9).id).toBe("upper");
    expect(phaseAt(m, 9.5).id).toBe("eccentric");
    expect(phaseAt(m, 14.6).id).toBe("lower");
    expect(phaseAt(m, 15.5).id).toBe("final");
  });

  it("is the first phase before the start and the last at or after the end", () => {
    expect(phaseAt(m, -4).id).toBe("loadup");
    expect(phaseAt(m, Number.NaN).id).toBe("loadup");
    expect(phaseAt(m, m.total).id).toBe("final");
    expect(phaseAt(m, 999).id).toBe("final");
  });

  it("covers the whole timeline with no gap", () => {
    for (const shape of SHAPES) {
      const model = repModel(shape, 8);
      for (let t = 0; t <= model.total; t += 0.1) {
        const p = phaseAt(model, t);
        expect(t + 1e-9 >= p.from || p === model.phases[0]).toBe(true);
      }
    }
  });
});

describe("moving the thumb", () => {
  it("a tap on a phase's name lands on that phase, for every shape and pace", () => {
    for (const shape of SHAPES) {
      for (const pace of PACES) {
        const m = repModel(shape, pace);
        for (const p of m.phases) {
          expect(phaseAt(m, phaseJumpTime(m, p.id)).id, `${shape} ${pace} ${p.id}`).toBe(p.id);
        }
      }
    }
  });

  it("a continuous turn is reached at its moment of reversal", () => {
    const m = repModel("endStop", 6);
    expect(phaseJumpTime(m, "upper")).toBe(9);
    expect(phaseJumpTime(m, "eccentric")).toBe(9.5);
  });

  it("lists one jump per phase, in time order", () => {
    const m = repModel("handoff", 6);
    const j = jumpTimes(m);
    expect(j).toHaveLength(6);
    expect([...j].sort((a, b) => a - b)).toEqual(j);
  });

  it("keeps the same phase and the same fraction through it when the pace changes", () => {
    const six = repModel("endStop", 6);
    const ten = repModel("endStop", 10);
    // Halfway through the concentric at 6 is halfway through it at 10.
    expect(remapTime(six, ten, 6)).toBe(8);
    expect(phaseAt(ten, remapTime(six, ten, 12)).id).toBe("eccentric");
  });

  it("carries a load-up across to a handoff when the shape changes", () => {
    const a = repModel("squeeze", 6);
    const b = repModel("handoff", 6);
    expect(phaseAt(b, remapTime(a, b, 1.5)).id).toBe("handoff");
    expect(phaseAt(a, remapTime(b, a, 1.5)).id).toBe("loadup");
  });
});

describe("the words under the phase", () => {
  it("say a stroke's own seconds, never a total for the rep", () => {
    const m = repModel("endStop", 6);
    const con = m.phases.find((p) => p.id === "concentric")!;
    expect(phaseTiming(m, con, 5.4)).toBe("2.4 of 6 s");
    expect(phaseTiming(m, m.phases.find((p) => p.id === "lower")!, 15)).toBe("No pause");
    expect(phaseTiming(m, m.phases[0], 1)).toBe("3 or more seconds");
    expect(phaseTiming(repModel("squeeze"), repModel("squeeze").phases.find((p) => p.id === "upper")!, 10)).toMatch(/2 to 3 s squeeze/);
  });

  it("bracket the cycle as its strokes, in the order they happen", () => {
    expect(cycleOf(repModel("endStop", 6))).toEqual({ from: 3, to: 15, words: "A rep's cycle: up 6 s, down 6 s" });
    expect(cycleOf(repModel("endStop", 10))).toEqual({ from: 3, to: 23, words: "A rep's cycle: up 10 s, down 10 s" });
    expect(cycleOf(repModel("squeeze", 6)).words).toBe("A rep's cycle: up 6 s, squeeze, down 6 s");
    expect(cycleOf(repModel("handoff", 6)).words).toBe("A rep's cycle: down 6 s, up 6 s, squeeze");
  });

  it("the end-stop cycle is the Academy's 12 to 20 seconds, exactly, across the window", () => {
    expect(cycleOf(repModel("endStop", 6)).to - cycleOf(repModel("endStop", 6)).from).toBe(REP_WINDOW.cycleMin);
    expect(cycleOf(repModel("endStop", 10)).to - cycleOf(repModel("endStop", 10)).from).toBe(REP_WINDOW.cycleMax);
  });
});

describe("the sources (proved against the Academy JSON)", () => {
  const topicText = (moduleId: string, topicId: string): string => {
    const mod = MODULES[moduleId];
    expect(mod, moduleId).toBeTruthy();
    const topic = mod.topics.find((t) => t.id === topicId);
    expect(topic, topicId).toBeTruthy();
    return topic!.blocks.map((b) => b.text).join("\n");
  };

  it("every quoted phrase is word for word in the topic it names", () => {
    for (const [id, s] of Object.entries(REP_SOURCES)) {
      const text = topicText(s.moduleId, s.topicId);
      expect(s.quotes.length, id).toBeGreaterThan(0);
      for (const q of s.quotes) expect(text, `${id}: ${q}`).toContain(q);
    }
  });

  it("every source is a topic the Academy index lists under that module", () => {
    for (const [id, s] of Object.entries(REP_SOURCES) as [keyof typeof REP_SOURCES, (typeof REP_SOURCES)[keyof typeof REP_SOURCES]][]) {
      const mod = ACADEMY_INDEX.modules.find((m) => m.id === s.moduleId);
      expect(mod?.topics.some((t) => t.id === s.topicId), s.topicId).toBe(true);
      expect(routeForRepSource(id)).toEqual({ kind: "topic", moduleId: s.moduleId, topicId: s.topicId });
    }
  });

  it("an unknown source label has no route", () => {
    expect(sourceRouteOf({ source: "Somewhere else" })).toBeNull();
  });
});

describe("the phrasebook", () => {
  it("finds every moment at the index the routes use, by its heading's words", () => {
    for (const [key, index] of Object.entries(CUE_MOMENT_INDEX)) {
      expect(findCueMoment(cues, key as CueKey), key).toBe(index);
    }
  });

  it("has a short title for each moment", () => {
    for (const k of Object.keys(CUE_MOMENT_INDEX)) expect(CUE_TITLES[k as CueKey].length).toBeLessThan(60);
  });

  it("finds nothing in an empty or missing phrasebook", () => {
    expect(findCueMoment(null, "speed")).toBe(-1);
    expect(findCueMoment([], "speed")).toBe(-1);
  });

  it("keeps only lines a trainer would say", () => {
    expect(isCuePhrase("SEE INDIVIDUAL EXERCISE SCRIPTS FOR MORE SPECIFIC EXAMPLES")).toBe(false);
    expect(isCuePhrase("After the loading transfer near contracted position (i.e. “handoff”):")).toBe(false);
    expect(isCuePhrase("(Change vocal tone, excited but not loud, almost whisper, accentuate key words)")).toBe(false);
    expect(isCuePhrase("  ")).toBe(false);
    expect(isCuePhrase("Barely touch, barely start")).toBe(true);
    // The three the survey names are the only non-cues in the file.
    const dropped = cues.flatMap((c) => c.phrases).filter((p) => !isCuePhrase(p));
    expect(dropped).toHaveLength(3);
  });

  it("reads the machines a moment names as examples", () => {
    expect(cueExamples(cues[6].moment)).toEqual(["leg press", "chest press", "overhead"]);
    expect(cueExamples(cues[7].moment)).toEqual(["pulldown", "row"]);
    expect(cueExamples("Speed of Motion")).toEqual([]);
  });

  it("matches a machine's name on whole words", () => {
    expect(namesExample("COMPOUND ROW", "row")).toBe(true);
    expect(namesExample("TORSO ROTATION", "row")).toBe(false);
    expect(namesExample("OVERHEAD PRESS", "overhead")).toBe(true);
    expect(namesExample("", "row")).toBe(false);
  });

  it("picks the lower turn from the switch, else the machine's name, else both", () => {
    expect(lowerCueKeys("stackTouch", cues)).toEqual(["lowerTouch"]);
    expect(lowerCueKeys("jointLimited", cues)).toEqual(["lowerNoTouch"]);
    expect(lowerCueKeys("flexLimited", cues)).toEqual(["lowerNoTouch"]);
    expect(lowerCueKeys(undefined, cues, "LEG PRESS")).toEqual(["lowerTouch"]);
    expect(lowerCueKeys(undefined, cues, "PULLDOWN")).toEqual(["lowerNoTouch"]);
    expect(lowerCueKeys(undefined, cues, "LUMBAR")).toEqual(["lowerTouch", "lowerNoTouch"]);
    expect(lowerCueKeys(undefined, null, "LEG PRESS")).toEqual(["lowerTouch", "lowerNoTouch"]);
  });

  it("gives the thumb's phase the lines of its moment", () => {
    const m = repModel("squeeze");
    const upper = m.phases.find((p) => p.id === "upper")!;
    const c = cuesForPhase(cues, upper, "squeeze");
    expect(c?.index).toBe(9);
    expect(c?.phrases).toContain("Squeeze, [click] unsqueeze, ease out");
    const h = repModel("handoff");
    const start = cuesForPhase(cues, h.phases[0], "handoff");
    expect(start?.index).toBe(2);
    expect(start?.phrases.some((p) => p.endsWith(":"))).toBe(false);
  });

  it("lets a machine's name choose the lower turn's lines", () => {
    const m = repModel("squeeze");
    const lower = m.phases.find((p) => p.id === "lower")!;
    expect(cuesForPhase(cues, lower, "squeeze")?.index).toBe(6);
    expect(cuesForPhase(cues, lower, "squeeze", "SIMPLE ROW")?.index).toBe(7);
  });

  it("falls back to the recorded index when the headings do not match, and to nothing when there is nothing", () => {
    const fixture: CueMoment[] = [
      { moment: "A", phrases: ["one"], notes: [] },
      { moment: "B", phrases: ["two"], notes: [] },
    ];
    expect(cuesForPhase(fixture, { id: "concentric", cueMoment: 1 }, "endStop")?.phrases).toEqual(["two"]);
    expect(cuesForPhase(fixture, { id: "concentric", cueMoment: 7 }, "endStop")).toBeNull();
    expect(cuesForPhase(null, { id: "concentric", cueMoment: 3 }, "endStop")).toBeNull();
  });
});
