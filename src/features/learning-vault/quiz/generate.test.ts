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
  neverLinesOf,
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
    // A blank and its own blanked acronym read as one blank.
    expect(maskTerm("A Timed Static Contraction (TSC) is static.", "Timed Static Contraction (TSC)")).toBe(
      "A ____ is static.",
    );
    expect(maskTerm("Pace and pacemaker.", "Pace")).toBe("____ and pacemaker.");
    // An acronym left after a blank would give the initials away.
    expect(maskTerm("Not as conservative, is the Static Hold (SH).", "Static Hold")).toBe("Not as conservative, is the ____.");
    // The term's first word with its one-word other name is a name too.
    expect(maskTerm("Bone remodeling is a dynamic process.", "Bone Density (Remodeling)")).toBe("____ is a dynamic process.");
  });

  it("picks the same wrong answers for the same question, every time", () => {
    const list = ["a", "b", "c", "d", "e", "f", "g"];
    expect(pickDistinct(list, 3, "x")).toEqual(pickDistinct(list, 3, "x"));
    expect(new Set(pickDistinct(list, 3, "x")).size).toBe(3);
    expect(pickDistinct(["a", "b"], 3, "x")).toEqual(["a", "b"]);
  });

  it("tidies a cue's stage directions away, but keeps the machines a cue is for", () => {
    // Without its machines, "Bend your elbows faster" reads as a cue for every
    // machine, against "Don't speed up" (Cues and Timing).
    expect(cleanCue("Bend your elbows faster (row or pulldown)")).toBe("Bend your elbows faster (row or pulldown)");
    expect(cleanCue("Stay on it…(quietly observe), keep breathing (again, observe, let them work)…, use whatever is left…")).toBe(
      "Stay on it… keep breathing… use whatever is left…",
    );
    expect(cleanCue("Slowly let the movement arm forward (or up or down).")).toBe("Slowly let the movement arm forward.");
    expect(cleanCue("We’re looking for a slow, smooth drag (pulling movement)")).toBe("We’re looking for a slow, smooth drag");
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
      // Nor half of it beside the blank ("Bone ____"), nor its initials ("____ (SH)").
      const first = answer.split(/\s+/)[0].toLowerCase();
      if (answer.includes(" ")) expect(q.prompt.toLowerCase(), q.id).not.toContain(`${first} ____`);
      expect(q.prompt, q.id).not.toMatch(/____\s*\(/);
    }
    const bone = qs.find((q) => q.id === "g-bone-density-remodeling");
    expect(bone?.prompt).toContain("“____ is a dynamic process");
    expect(qs.find((q) => q.id === "g-static-hold")?.prompt).not.toContain("(SH)");
    expect(qs.find((q) => q.id === "g-timed-static-contraction-tsc")?.prompt).toContain("a ____ is an approach");
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

  it("opens the very moment that holds the phrase, the second lower or upper turnaround included", () => {
    const momentOf = (q: (typeof qs)[number]) => (q.source.route?.kind === "cueing" ? (q.source.route.moment ?? -1) : -1);
    const holds = (moment: number, phrase: string) => (cues[moment]?.phrases ?? []).some((p) => cleanCue(p) === phrase);
    for (const q of qs.filter((x) => x.id.startsWith("c-"))) {
      const phrase = /“(.*)”$/.exec(q.prompt)?.[1] ?? "";
      expect(holds(momentOf(q), phrase), `${q.id} -> moment ${momentOf(q)}`).toBe(true);
    }
    for (const q of qs.filter((x) => x.id.startsWith("cr-"))) {
      expect(holds(momentOf(q), q.options[q.answer]), `${q.id} -> moment ${momentOf(q)}`).toBe(true);
    }
    // The no-touch lower turnaround and the squeeze's upper turnaround are moments 7 and 9.
    expect(momentOf(qs.find((q) => q.id === "c-lower-seamless") as (typeof qs)[number])).toBe(7);
    expect(momentOf(qs.find((q) => q.id === "c-upper-squeeze-click-unsqueeze-ease-out") as (typeof qs)[number])).toBe(9);
  });

  it("keeps apart the moments whose cues a trainer could fairly file under either", () => {
    const label = (id: string) => CUE_GROUPS.find((g) => g.id === id)?.label as string;
    const APART: [string, string][] = [
      ["upper", "failure"], // the last rep held at the top while the trainer counts down
      ["speed", "final"], // "do not speed up"
      ["upper", "final"], // "Ease out, DO NOT speed up"
      ["handoff", "lower"], // slow lowerings, on the row and the pulldown
      ["handoff", "final"],
      ["load", "upper"], // "Build your force, increase your respirations"
    ];
    const groupOfOption = new Map(CUE_GROUPS.map((g) => [g.label, g.id]));
    for (const q of qs.filter((x) => x.id.startsWith("c-"))) {
      const mine = groupOfOption.get(q.options[q.answer]);
      for (const [a, b] of APART) {
        if (mine === a) expect(q.options, q.id).not.toContain(label(b));
        if (mine === b) expect(q.options, q.id).not.toContain(label(a));
      }
    }
    // The other way round too: no wrong cue from a moment kept apart.
    const groupOfPhrase = (phrase: string) =>
      cues.filter((c) => c.phrases.some((p) => cleanCue(p) === phrase)).map((c) => cueGroupOf(c.moment)?.id);
    for (const q of qs.filter((x) => x.id.startsWith("cr-"))) {
      const mine = q.id.replace("cr-", "");
      q.options.forEach((o, i) => {
        if (i === q.answer) return;
        for (const g of groupOfPhrase(o)) {
          for (const [a, b] of APART) expect(mine === a && g === b, `${q.id}: ${o}`).toBe(false);
          for (const [a, b] of APART) expect(mine === b && g === a, `${q.id}: ${o}`).toBe(false);
        }
      });
    }
  });

  it("leaves out a cue that fits almost any moment, and keeps a cue's machines", () => {
    const text = qs.map((q) => `${q.prompt} ${q.options.join(" ")}`).join(" ");
    expect(text).not.toContain("“Keep it moving”");
    expect(qs.some((q) => q.options.includes("Keep it moving"))).toBe(false);
    const elbows = qs.find((q) => q.prompt.includes("Bend your elbows faster"));
    expect(elbows?.prompt).toContain("“Bend your elbows faster (row or pulldown)”");
  });

  it("names each moment for what its list holds, and explains without contradicting its own cues", () => {
    const g = (id: string) => CUE_GROUPS.find((x) => x.id === id);
    // The face list holds "Stay calm" and "Stoic" too.
    expect(g("face")?.label).toBe("A calm, relaxed face");
    expect(g("face")?.ask).toBe("Which of these would you say for a calm, relaxed face?");
    // The speed list holds "Slightly faster"; the end stop is clicked too.
    expect(cues[3].phrases).toContain("Slightly faster");
    expect(g("speed")?.explain).not.toMatch(/no speeding up/);
    expect(cues[8].phrases).toContain("Pass through my click at the top.");
    expect(g("upper")?.explain).toMatch(/through the click at an end stop/);
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
    // The reason travels with the rule (the-floor.md:27: an unexplained
    // prohibition gets ignored): the Cervical card's next two lines say why.
    expect(qs.find((q) => q.id === "m-never-m-neck")?.explain).toBe(
      "Its Quick Reference card says: “NEVER train to failure. Stop the set before technical failure. Prioritize control and safety over intensity.”",
    );
    expect(qs.find((q) => q.id === "m-never-m-lumbar")?.explain).toMatch(/extra precaution with new subjects/);
    const cx = cards.find((c) => c.id === "cx");
    for (const line of neverLinesOf(cx)) expect(cx?.sections.flatMap((s) => s.items)).toContain(line);
    expect(neverLinesOf(null)).toEqual([]);
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
