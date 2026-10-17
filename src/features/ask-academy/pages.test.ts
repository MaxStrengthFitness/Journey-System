import { describe, expect, it } from "vitest";
import { cardTitle, scriptTitle } from "../academy/academy-machines";
import { academyFiles } from "./academy-files";
import {
  academyCardName,
  academyPages,
  academyScriptName,
  blocksText,
  GLOSSARY_TOPIC_ID,
  pageById,
  pageListText,
  termSlug,
  type AcademyFiles,
} from "./pages";

const files = academyFiles();
const pages = academyPages(files);

describe("academyPages: the real Academy", () => {
  it("gives every page a unique id and some text", () => {
    const ids = pages.flatMap((p) => [p.id, ...p.sameAs]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of pages) expect(p.text.length).toBeGreaterThan(0);
  });

  it("reads every module, overview, script, card and glossary term", () => {
    const count = (kind: string) => pages.filter((p) => p.kind === kind).length;
    expect(count("overview")).toBe(files.overviews.overviews.length);
    expect(count("script")).toBe(files.scripts.scripts.length);
    expect(count("card")).toBe(files.cards.cards.length);
    expect(count("term")).toBe(files.glossary.glossary.length);
    expect(count("cues")).toBe(1);
    const topicIds = files.modules.flatMap((m) => m.topics.map((t) => `topic:${t.id}`)).filter((id) => id !== `topic:${GLOSSARY_TOPIC_ID}`);
    for (const id of topicIds) expect(pageById(pages, id), id).not.toBeNull();
  });

  it("still has the glossary topic it reads term by term instead", () => {
    // If the generator renames it, the glossary would be read twice; this fails first.
    expect(files.modules.some((m) => m.topics.some((t) => t.id === GLOSSARY_TOPIC_ID))).toBe(true);
    expect(pageById(pages, `topic:${GLOSSARY_TOPIC_ID}`)).toBeNull();
  });

  it("keeps a file filed under three modules once", () => {
    const substitutes = pages.filter((p) => p.title === "Exercise Substitutes");
    expect(substitutes).toHaveLength(1);
    expect(substitutes[0].sameAs.length).toBeGreaterThanOrEqual(1);
  });

  it("names machines by the same rules as Learning's Academy (academy-machines.ts)", () => {
    for (const s of files.scripts.scripts) expect(academyScriptName(s)).toBe(scriptTitle(s));
    for (const c of files.cards.cards) expect(academyCardName(c)).toBe(cardTitle(c));
  });

  it("names a script and a card by the Academy's name for the machine, never its abbreviation", () => {
    expect(pageById(pages, "script:lower-body-lp")?.title).toBe("Leg Press script");
    expect(pageById(pages, "card:lp")?.title).toBe("Leg Press quick reference");
    expect(pageById(pages, "card:pd")?.title).not.toMatch(/^Pd /);
  });

  it("lists each page on one line for picking", () => {
    const list = pageListText(pages).split("\n");
    expect(list).toHaveLength(pages.length);
    expect(list).toContain("topic:programming-considerations-for-training-with-pain — Programming and Progression › Considerations for Training with Pain");
  });
});

describe("academyPages: the rules on a small Academy", () => {
  const tiny: AcademyFiles = {
    modules: [
      { id: "a", title: "Module A", topics: [{ id: "a-one", title: "One", order: 1, source: "", words: 3, readingMinutes: 1, blocks: [{ kind: "heading", text: "Head" }, { kind: "bullet", text: "point" }, { kind: "body", text: "Body." }] }] },
      { id: "b", title: "Module B", topics: [{ id: "b-one", title: "One again", order: 1, source: "", words: 3, readingMinutes: 1, blocks: [{ kind: "heading", text: "Head" }, { kind: "bullet", text: "point" }, { kind: "body", text: "Body." }] }] },
    ],
    overviews: { overviews: [] },
    scripts: { scripts: [] },
    cards: { cards: [] },
    cues: { cues: [] },
    glossary: { glossary: [{ term: "TUL", definition: "time under load" }, { term: "TUL", definition: "said again" }] },
  };
  const small = academyPages(tiny);

  it("joins blocks a line each, bullets marked", () => {
    expect(blocksText(tiny.modules[0].topics[0].blocks)).toBe("Head\n• point\nBody.");
  });

  it("keeps the first of two identical texts and names the second", () => {
    const one = pageById(small, "topic:b-one");
    expect(one?.id).toBe("topic:a-one");
    expect(one?.sameAs).toEqual(["topic:b-one"]);
  });

  it("gives two terms with one name two ids", () => {
    expect(small.filter((p) => p.kind === "term").map((p) => p.id)).toEqual(["term:tul", "term:tul-2"]);
  });

  it("skips an empty page", () => {
    expect(small.some((p) => p.kind === "cues")).toBe(false);
  });

  it("slugs a term", () => {
    expect(termSlug("Assumed vs. Real Objective (of exercise)")).toBe("assumed-vs-real-objective-of-exercise");
  });
});
