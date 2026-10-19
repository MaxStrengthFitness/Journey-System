/**
 * THE BUILT QUESTIONS, held against the real Academy corpus: a glossary stem
 * never gives its own term away, a cue is filed under the moment it really
 * belongs to and never offered a moment it shares words with, the first-rep
 * order is the scripts' own, and the machine facts are the seed's and the
 * cards' own. Every file a question cites is in the repo.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import cardsFile from "../../academy/content/cards.json";
import cuesFile from "../../academy/content/cues.json";
import glossaryFile from "../../academy/content/glossary.json";
import scriptsFile from "../../academy/content/scripts.json";
import type { CueMoment, MachineScript, QuickCard } from "../../academy/types";
import { MACHINE_DEFINITIONS } from "../../../data/machine-definitions";
import type { MachineDefinition } from "../../../types/machines";
import {
  BEAT_LABEL,
  CARD_FILES,
  CATEGORIES_PATH,
  CUES_PATH,
  CUE_GROUPS,
  GLOSSARY_PATH,
  GLOSSARY_SKIP,
  SCRIPT_FILES,
  cleanCue,
  cueGroupOf,
  cueQuestions,
  displayTerm,
  firstSentence,
  glossaryQuestions,
  machineQuestions,
  maskTerm,
  pickDistinct,
  scriptQuestions,
  secondSentence,
} from "./generate";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const HERE = dirname(fileURLToPath(import.meta.url));

const glossary = (glossaryFile as { glossary: { term: string; definition: string }[] }).glossary;
const cues = (cuesFile as unknown as { cues: CueMoment[] }).cues;
const scripts = (scriptsFile as unknown as { scripts: MachineScript[] }).scripts;
const cards = (cardsFile as unknown as { cards: QuickCard[] }).cards;
const defs = MACHINE_DEFINITIONS as unknown as Record<string, Partial<MachineDefinition>>;
const names = (id: string) => (defs[id]?.name as string | undefined) ?? id;

describe("small helpers", () => {
  it("reads a term the way a reader would", () => {
    expect(displayTerm("Contract(ion)")).toBe("Contraction");
    expect(displayTerm("Timed Static Contraction (TSC)")).toBe("Timed Static Contraction (TSC)");
    expect(displayTerm("Bushing (oil impregnated bronze bushing)")).toBe("Bushing");
    expect(displayTerm("Tension (also Mechanical Tension or Muscular Tension)")).toBe("Tension");
    expect(displayTerm("Intent (Purpose)")).toBe("Intent (Purpose)");
    expect(displayTerm("Gap")).toBe("Gap");
  });

  it("takes the first sentence without cutting at i.e.", () => {
    expect(firstSentence("the positive or lifting phase (i.e. the actual lifting). During this phase, more.")).toBe(
      "The positive or lifting phase (i.e. the actual lifting).",
    );
  });

  it("turns the card over to the next sentence, not the stem again", () => {
    expect(secondSentence("the distance the arm is advanced. The gap is set to customize the lower turnaround.")).toBe(
      "The gap is set to customize the lower turnaround.",
    );
    expect(secondSentence("only one sentence here.")).toBeNull();
    expect(secondSentence("a term defined. See also another term here please.")).toBeNull();
    const gap = glossaryQuestions(glossary).find((q) => q.id === "g-gap");
    expect(gap?.explain).toBe("Gap: The gap is set to customize the lower turnaround on an exercise.");
  });

  it("masks the term, its acronym and its other names, whole words only", () => {
    expect(maskTerm("A Timed Static Contraction (TSC) is static.", "Timed Static Contraction (TSC)")).toBe(
      "A ____ (____) is static.",
    );
    expect(maskTerm("Pace and pacemaker.", "Pace")).toBe("____ and pacemaker.");
  });

  it("picks the same wrong answers for the same question, every time", () => {
    const list = ["a", "b", "c", "d", "e", "f", "g"];
    expect(pickDistinct(list, 3, "x")).toEqual(pickDistinct(list, 3, "x"));
    expect(new Set(pickDistinct(list, 3, "x")).size).toBe(3);
    expect(pickDistinct(["a", "b"], 3, "x")).toEqual(["a", "b"]);
  });

  it("tidies a cue's stage directions away", () => {
    expect(cleanCue("Bend your elbows faster (row or pulldown)")).toBe("Bend your elbows faster");
    expect(cleanCue("Stay on it…(quietly observe), keep breathing (again, observe, let them work)…, use whatever is left…")).toBe(
      "Stay on it… keep breathing… use whatever is left…",
    );
  });
});

describe("the glossary deck", () => {
  const qs = glossaryQuestions(glossary);

  it("asks most terms, and leaves out the four that don't define themselves", () => {
    expect(qs.filter((q) => q.id.startsWith("g-")).length).toBeGreaterThanOrEqual(40);
    for (const t of GLOSSARY_SKIP) expect(qs.some((q) => q.explain.startsWith(`${displayTerm(t)}:`))).toBe(false);
  });

  it("never gives the term away in its own stem", () => {
    for (const q of qs.filter((x) => x.id.startsWith("g-"))) {
      const answer = q.options[q.answer].replace(/\s*\([^)]*\)\s*$/, "");
      const stem = ` ${q.prompt.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
      expect(stem).not.toContain(` ${answer.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `);
    }
  });

  it("never offers a term's twin as a wrong answer", () => {
    const concentric = qs.find((q) => q.id === "g-concentric");
    expect(concentric?.options).not.toContain("Positive");
    const positive = qs.find((q) => q.id === "g-positive");
    expect(positive?.options).not.toContain("Concentric");
    const momentary = qs.find((q) => q.id === "g-momentary-muscular-failure");
    expect(momentary?.options).not.toContain("True Muscular Failure");
  });

  it("asks the equipment words against method words", () => {
    const eq = qs.filter((q) => q.id.startsWith("ge-"));
    expect(eq.length).toBeGreaterThanOrEqual(8);
    const equipment = new Set(glossary.slice(40).map((g) => displayTerm(g.term)));
    for (const q of eq) {
      expect(equipment.has(q.options[q.answer])).toBe(true);
      expect(q.options.filter((o) => equipment.has(o))).toHaveLength(1);
    }
  });

  it("opens the glossary at the term", () => {
    for (const q of qs) {
      expect(q.source.route?.kind).toBe("glossary");
      expect(q.source.path).toBe(GLOSSARY_PATH);
    }
  });

  it("builds nothing from nothing", () => {
    expect(glossaryQuestions(null)).toEqual([]);
  });
});

describe("the cue deck", () => {
  const qs = cueQuestions(cues);

  it("leaves the three non-cues out", () => {
    const text = qs.map((q) => q.prompt + q.options.join(" ")).join(" ");
    expect(text).not.toContain("SEE INDIVIDUAL");
    expect(text).not.toContain("loading transfer");
    expect(text).not.toContain("Change vocal tone");
  });

  it("files every cue under the moment that holds it", () => {
    const forward = qs.filter((q) => q.id.startsWith("c-"));
    expect(forward.length).toBeGreaterThanOrEqual(90);
    for (const q of forward) {
      const phrase = /“(.*)”$/.exec(q.prompt)?.[1] ?? "";
      const holders = cues.filter((c) => c.phrases.some((p) => cleanCue(p) === phrase));
      expect(holders.length).toBeGreaterThan(0);
      const labels = new Set(holders.map((c) => cueGroupOf(c.moment)?.label));
      expect(labels.has(q.options[q.answer])).toBe(true);
    }
  });

  it("never offers a moment that shares its words, nor the other lower or upper turn", () => {
    const label = (id: string) => CUE_GROUPS.find((g) => g.id === id)?.label as string;
    for (const q of qs.filter((x) => x.id.startsWith("c-lower-"))) {
      expect(q.options).not.toContain(label("upper"));
      expect(q.options).not.toContain(label("speed"));
    }
    for (const q of qs.filter((x) => x.id.startsWith("c-motivation-"))) {
      expect(q.options).not.toContain(label("failure"));
    }
  });

  it("asks each moment once the other way round", () => {
    const reverse = qs.filter((q) => q.id.startsWith("cr-"));
    expect(reverse).toHaveLength(CUE_GROUPS.length);
    for (const q of reverse) expect(new Set(q.options).size).toBe(4);
  });

  it("opens the phrasebook at the moment", () => {
    for (const q of qs) {
      expect(q.source.route?.kind).toBe("cueing");
      expect(q.source.path).toBe(CUES_PATH);
    }
  });
});

describe("the first rep, from the scripts", () => {
  const qs = scriptQuestions(scripts, names);

  it("asks the three shapes, each in the scripts' own order", () => {
    expect(qs).toHaveLength(3);
    for (const q of qs) {
      expect(q.kind).toBe("order");
      expect(q.deck).toBe("rep");
      const script = scripts.find((s) => q.source.route?.kind === "script" && s.id === q.source.route.id);
      expect(script).toBeTruthy();
      expect(q.options).toEqual(script?.beats.map((b) => BEAT_LABEL[b.beat]));
    }
    const handoff = qs.find((q) => q.id.startsWith("s-handoff"));
    expect(handoff?.options[1]).toBe(BEAT_LABEL["HANDOFF + FIRST ECCENTRIC"]);
  });
});

describe("the machine deck", () => {
  const qs = machineQuestions(defs, cards, names);

  it("knows the five handoff machines from the seed", () => {
    const answers = qs.filter((q) => q.id.startsWith("m-handoff")).map((q) => q.source.route);
    expect(answers.map((r) => (r?.kind === "machine" ? r.id : "")).sort()).toEqual(
      ["m-abs", "m-compound-row", "m-neck", "m-pulldown", "m-pullover"].sort(),
    );
    for (const q of qs.filter((x) => x.id.startsWith("m-handoff"))) {
      const wrong = q.options.filter((_, i) => i !== q.answer);
      for (const w of wrong) {
        const id = Object.keys(defs).find((k) => names(k) === w) as string;
        expect(defs[id]?.execution?.requiresHandoff).toBe(false);
      }
    }
  });

  it("knows the two never-to-failure machines, and quotes their cards", () => {
    const never = qs.filter((q) => q.id.startsWith("m-never"));
    expect(never.map((q) => q.options[q.answer]).sort()).toEqual([names("m-lumbar"), names("m-neck")].sort());
    for (const q of never) {
      expect(q.options.filter((o) => o === names("m-lumbar") || o === names("m-neck"))).toHaveLength(1);
      expect(q.explain).toMatch(/never/i);
    }
  });

  it("asks the six cards with one target muscle, and never offers a machine that also names it", () => {
    const target = qs.filter((q) => q.id.startsWith("m-target"));
    expect(target.map((q) => q.id.replace("m-target-", "")).sort()).toEqual(["abd", "abs", "bi", "cf", "le", "po"]);
    const po = target.find((q) => q.id === "m-target-po");
    expect(po?.options).not.toContain(names("m-pulldown"));
    expect(po?.options).not.toContain(names("m-compound-row"));
  });
});

describe("every file a built question cites is in the repo", () => {
  it("finds each path", () => {
    const paths = [GLOSSARY_PATH, CUES_PATH, CATEGORIES_PATH, ...Object.values(SCRIPT_FILES), ...Object.values(CARD_FILES)];
    for (const p of paths) expect(existsSync(join(ROOT, p)), p).toBe(true);
    for (const c of cards) expect(CARD_FILES[c.id], c.id).toBeTruthy();
    for (const s of scripts) expect(SCRIPT_FILES[s.workout], s.workout).toBeTruthy();
  });
});

describe("no regex lookbehind in the quiz (older iPadOS Safari cannot parse one)", () => {
  it("holds for every source file in this folder and the screen", () => {
    const files = readdirSync(HERE)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => join(HERE, f));
    const screen = join(HERE, "../ui/QuizMode.tsx");
    if (existsSync(screen)) files.push(screen);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      expect(/\(\?<[=!]/.test(text), f).toBe(false);
    }
  });
});
