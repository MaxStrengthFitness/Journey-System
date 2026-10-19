import { describe, expect, it } from "vitest";
import { vaultSection } from "../../learning-vault/blocks";
import type { AcademyIndex } from "../../academy/types";
import type { QuizQuestion, Track, VaultBlock, VaultPage, VaultRoute } from "../../learning-vault/types";
import {
  checkQuestions,
  courseContextOf,
  cueDrillsIn,
  dayIndex,
  drillsForTheDay,
  examplesLine,
  hashOf,
  lessonContextOf,
  orderDrillOf,
  sameLesson,
  scrubberOpeningMoment,
  type CueDrill,
} from "./drills";
import cuesFile from "../../academy/content/cues.json";
import type { CueMoment } from "../../academy/types";

const b = (kind: VaultBlock["kind"], text: string): VaultBlock => ({ key: `k-${text}`, kind, text });

describe("dayIndex", () => {
  it("is the same all day, inside the range, and nothing is stored", () => {
    expect(dayIndex("2026-10-19", 11)).toBe(dayIndex("2026-10-19", 11));
    for (const day of ["2026-10-19", "2026-10-20", "2026-12-31"]) {
      const i = dayIndex(day, 11);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(11);
    }
  });

  it("moves from one day to the next over a week", () => {
    const week = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"];
    expect(new Set(week.map((d) => dayIndex(d, 11))).size).toBeGreaterThan(2);
  });

  it("answers 0 when there is nothing to pick from", () => {
    expect(dayIndex("2026-10-19", 0)).toBe(0);
    expect(dayIndex("2026-10-19", Number.NaN)).toBe(0);
  });

  it("hashOf is a plain 32-bit number", () => {
    expect(hashOf("touch and go")).toBe(hashOf("touch and go"));
    expect(Number.isInteger(hashOf("x"))).toBe(true);
  });
});

describe("cueDrillsIn", () => {
  const sections = [
    vaultSection("moment-0", "Before you start", [b("para", "SEE INDIVIDUAL EXERCISE SCRIPTS")]),
    vaultSection(
      "moment-6",
      "Lower turnaround, where the stack touches",
      [b("para", "Most effective during the eccentric."), b("cue", "Barely touch, barely start"), b("cue", "Crawl out of the bottom")],
      "Lower Turnaround (movements where weight stack touches - ex. leg press, chest press, overhead)",
    ),
    vaultSection("leaf-rep", "The rep", [b("line", "Upper turnaround: click at the end stop.")]),
  ];

  it("keeps the moments with lines to say, their examples and their phrasebook index", () => {
    const drills = cueDrillsIn(sections);
    expect(drills).toHaveLength(1);
    expect(drills[0]).toMatchObject({ section: 1, title: "Lower turnaround, where the stack touches", cues: [1, 2], notes: [0], moment: 6 });
    expect(examplesLine(drills[0].examples)).toBe("Leg press, chest press, overhead");
  });

  it("can ask for more lines before a moment counts", () => {
    expect(cueDrillsIn(sections, { min: 3 })).toEqual([]);
  });
});

describe("orderDrillOf", () => {
  const page = {
    sections: [
      vaultSection("money", "When money is the problem", [
        b("para", "Only when money is truly the problem, and in this order:"),
        b("bullet", "The guarantee."),
        b("bullet", "The lowest rate on the shortest commitment."),
      ]),
    ],
  } as unknown as VaultPage;

  it("reads a lead-in line and its list, in the page's order", () => {
    expect(orderDrillOf(page, "money")).toEqual({ section: 0, lead: 0, steps: [1, 2] });
  });

  it("is null for a section the page does not have, or no page", () => {
    expect(orderDrillOf(page, "guarantee")).toBeNull();
    expect(orderDrillOf(null, "money")).toBeNull();
  });
});

const index = {
  generatedFrom: "test",
  corpusHash: "test",
  totalWords: 0,
  cardCount: 0,
  overviewCount: 0,
  glossaryCount: 0,
  modules: [
    {
      id: "performance",
      n: 4,
      title: "Exercise Performance",
      blurb: "",
      topics: [
        { id: "performance-speed-of-movement", title: "Speed of Movement", readingMinutes: 3, words: 500 },
        { id: "performance-gradual-load-up", title: "Gradual Load-up", readingMinutes: 4, words: 800 },
        { id: "performance-posture", title: "POSTURE", readingMinutes: 2, words: 300 },
      ],
    },
  ],
} as AcademyIndex;

const tracks: Track[] = [
  {
    id: "lt101",
    title: "Life Transformer 101",
    who: "A new Life Transformer",
    steps: [
      { route: { kind: "playbook", id: "the-twenty-minutes" }, title: "The twenty minutes", why: "What a session is." },
      { route: { kind: "topic", moduleId: "performance", topicId: "performance-gradual-load-up" }, title: "Gradual Load-up", why: "How it begins." },
      { route: { kind: "quiz", deck: "mixed" }, title: "Quick ten", why: "Nothing is kept." },
    ],
  },
];
const data = { tracks, index };

describe("the lesson around a page", () => {
  it("finds the course under the page in the trail, and the page's place in it", () => {
    const stack: VaultRoute[] = [{ kind: "home" }, { kind: "track", id: "lt101" }, { kind: "topic", moduleId: "", topicId: "performance-gradual-load-up" }];
    const ctx = courseContextOf(stack, data);
    expect(ctx?.title).toBe("Life Transformer 101");
    expect(ctx?.at).toBe(1);
    expect(ctx?.lessons).toHaveLength(3);
  });

  it("is null when the reader wandered off the course's pages", () => {
    const stack: VaultRoute[] = [{ kind: "track", id: "lt101" }, { kind: "machine", id: "m-leg-press" }];
    expect(courseContextOf(stack, data)).toBeNull();
    expect(courseContextOf([{ kind: "home" }], data)).toBeNull();
  });

  it("reads a module's topics as its lessons, their titles calmed", () => {
    const stack: VaultRoute[] = [{ kind: "module", moduleId: "performance" }, { kind: "topic", moduleId: "performance", topicId: "performance-posture" }];
    const ctx = courseContextOf(stack, data);
    expect(ctx?.at).toBe(2);
    expect(ctx?.lessons[2].title).toBe("Posture");
  });

  it("puts a topic opened on its own in its module", () => {
    const stack: VaultRoute[] = [{ kind: "academy" }, { kind: "topic", moduleId: "performance", topicId: "performance-speed-of-movement" }];
    const ctx = lessonContextOf(stack, data);
    expect(ctx?.course).toEqual({ kind: "module", moduleId: "performance" });
    expect(ctx?.at).toBe(0);
    expect(lessonContextOf([{ kind: "academy" }, { kind: "glossary" }], data)).toBeNull();
  });

  it("knows a topic by its id, whatever module a link carried", () => {
    expect(
      sameLesson({ kind: "topic", moduleId: "old", topicId: "t-1" }, { kind: "topic", moduleId: "performance", topicId: "t-1" }),
    ).toBe(true);
    expect(sameLesson({ kind: "glossary", term: "Gap" }, { kind: "glossary" })).toBe(true);
    expect(sameLesson({ kind: "machine", id: "a" }, { kind: "machine", id: "b" })).toBe(false);
  });
});

describe("checkQuestions", () => {
  const route: VaultRoute = { kind: "topic", moduleId: "performance", topicId: "performance-gradual-load-up" };
  const q = (id: string, kind: QuizQuestion["kind"], r: VaultRoute | null): QuizQuestion => ({
    id,
    deck: "rep",
    kind,
    prompt: `Question ${id}?`,
    options: ["A", "B", "C", "D"],
    answer: kind === "order" ? -1 : 0,
    explain: "Because.",
    source: { label: "Academy", route: r },
  });
  const bank = [
    q("1", "choice", route),
    q("2", "truefalse", { ...route, moduleId: "elsewhere" }),
    q("3", "order", route),
    q("4", "choice", { kind: "topic", moduleId: "performance", topicId: "performance-posture" }),
    q("5", "choice", route),
    q("6", "choice", route),
    q("7", "choice", null),
  ];

  it("asks up to three of this page's questions, never an order one", () => {
    const picked = checkQuestions(bank, route);
    expect(picked).toHaveLength(3);
    for (const p of picked) {
      expect(p.kind).not.toBe("order");
      expect(["1", "2", "5", "6"]).toContain(p.id);
    }
  });

  it("deals the same questions the same way every time, the right answer following its option", () => {
    const a = checkQuestions(bank, route);
    const b2 = checkQuestions(bank, route);
    expect(a.map((x) => [x.id, x.options.join("|"), x.answer])).toEqual(b2.map((x) => [x.id, x.options.join("|"), x.answer]));
    for (const x of a) if (x.kind === "choice") expect(x.options[x.answer]).toBe("A");
  });

  it("asks nothing with no bank, or a page no question comes from", () => {
    expect(checkQuestions(null, route)).toEqual([]);
    expect(checkQuestions(bank, { kind: "glossary" })).toEqual([]);
  });
});

describe("the drill of the day and the scrubber beside it", () => {
  const cues = (cuesFile as unknown as { cues: CueMoment[] }).cues;

  it("knows the moment the Overview's scrubber opens on: the gradual load-up", () => {
    const at = scrubberOpeningMoment(cues, "endStop");
    expect(at).not.toBeNull();
    expect(cues[at!].moment).toMatch(/^to begin the exercise/i);
    expect(scrubberOpeningMoment(null, "endStop")).toBeNull();
    expect(scrubberOpeningMoment([], "squeeze")).toBeNull();
  });

  it("leaves that moment out of the day's drills, never all of them", () => {
    const d = (moment: number | null): CueDrill => ({ section: moment ?? 99, title: `m${moment}`, examples: [], cues: [0, 1, 2], notes: [], moment });
    const drills = [d(1), d(2), d(3), d(null)];
    expect(drillsForTheDay(drills, 2).map((x) => x.moment)).toEqual([1, 3, null]);
    expect(drillsForTheDay(drills, null)).toBe(drills);
    expect(drillsForTheDay([d(2)], 2).map((x) => x.moment)).toEqual([2]);
  });
});
