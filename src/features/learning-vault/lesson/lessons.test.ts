import { describe, expect, it } from "vitest";
import type { AcademyIndex } from "../../academy/types";
import type { QuizQuestion, Track, VaultRoute } from "../types";
import { checkQuestions, courseContextOf, lessonContextOf, lessonPlace, lessonsOf, moduleLessons, nextLessonOf, sameLesson } from "./lessons";

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

describe("a course's lessons, and where one sits", () => {
  it("reads a track's steps and a module's topics as lessons; nothing for a page that is not a course", () => {
    expect(lessonsOf({ kind: "track", id: "lt101" }, data)?.lessons.map((l) => l.title)).toEqual(["The twenty minutes", "Gradual Load-up", "Quick ten"]);
    expect(lessonsOf({ kind: "module", moduleId: "performance" }, data)?.title).toBe("Exercise Performance");
    expect(lessonsOf({ kind: "track", id: "gone" }, data)).toBeNull();
    expect(lessonsOf({ kind: "glossary" }, data)).toBeNull();
    expect(moduleLessons(index, "performance").map((l) => l.route)).toEqual([
      { kind: "topic", moduleId: "performance", topicId: "performance-speed-of-movement" },
      { kind: "topic", moduleId: "performance", topicId: "performance-gradual-load-up" },
      { kind: "topic", moduleId: "performance", topicId: "performance-posture" },
    ]);
    expect(moduleLessons(index, "gone")).toEqual([]);
  });

  it("says the place as a position, never progress, and knows the next lesson", () => {
    const stack: VaultRoute[] = [{ kind: "track", id: "lt101" }, { kind: "topic", moduleId: "performance", topicId: "performance-gradual-load-up" }];
    const ctx = courseContextOf(stack, data);
    expect(lessonPlace(ctx!)).toBe("Lesson 2 of 3");
    expect(nextLessonOf(ctx)?.title).toBe("Quick ten");
    expect(nextLessonOf({ ...ctx!, at: 2 })).toBeNull();
    expect(nextLessonOf(null)).toBeNull();
  });
});
