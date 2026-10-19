/**
 * THE WRITTEN QUESTIONS, proven: every Academy question's quote is in its
 * topic's text word for word, every floor question's quote is in its file,
 * and none of them asks a price, a gendered pronoun, or anything from a
 * source the round ruled out (quiz-sources.md §2.5, §5).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import index from "../../academy/content/index.json";
import type { ModuleContent } from "../../academy/types";
import { ACADEMY_QUESTIONS, FLOOR_QUESTIONS, QUOTED_TOPICS } from "./authored";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

/** Spacing and markdown emphasis are not words: compare without them. */
const flat = (s: string) => s.replace(/\*+/g, "").replace(/\s+/g, " ").trim();

const modules = new Map<string, ModuleContent>();
function moduleOf(id: string): ModuleContent {
  const hit = modules.get(id);
  if (hit) return hit;
  const m = JSON.parse(read(`src/features/academy/content/${id}.json`)) as ModuleContent;
  modules.set(id, m);
  return m;
}

function topicText(topicId: string): string {
  const meta = QUOTED_TOPICS[topicId];
  const topic = moduleOf(meta.moduleId).topics.find((t) => t.id === topicId);
  return flat((topic?.blocks ?? []).map((b) => b.text).join("\n"));
}

/** Rough sentence count: an end mark followed by a space and a capital, or the end. */
function sentences(text: string): number {
  return (text.match(/[.!?](?=\s+[A-Z“"]|\s*$)/g) ?? []).length || 1;
}

const ALL = [...ACADEMY_QUESTIONS, ...FLOOR_QUESTIONS];

describe("the Academy questions", () => {
  it("are at least forty, with unique ids", () => {
    expect(ACADEMY_QUESTIONS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(ACADEMY_QUESTIONS.map((q) => q.id)).size).toBe(ACADEMY_QUESTIONS.length);
  });

  it("each quote is in its topic, word for word", () => {
    for (const q of ACADEMY_QUESTIONS) {
      expect(QUOTED_TOPICS[q.support.topicId], q.id).toBeTruthy();
      expect(topicText(q.support.topicId), `${q.id}: "${q.support.quote}"`).toContain(flat(q.support.quote));
    }
  });

  it("names each topic's module, title and file as the corpus does", () => {
    const byId = new Map(
      (index as { modules: { id: string; topics: { id: string; title: string }[] }[] }).modules.flatMap((m) =>
        m.topics.map((t) => [t.id, { moduleId: m.id, title: t.title }] as const),
      ),
    );
    for (const [topicId, meta] of Object.entries(QUOTED_TOPICS)) {
      expect(byId.get(topicId), topicId).toEqual({ moduleId: meta.moduleId, title: meta.title });
      const topic = moduleOf(meta.moduleId).topics.find((t) => t.id === topicId);
      expect(topic?.source, topicId).toBe(meta.path);
      expect(existsSync(join(ROOT, meta.path)), meta.path).toBe(true);
    }
  });

  it("open the topic they quote", () => {
    for (const q of ACADEMY_QUESTIONS) {
      expect(q.source.route).toEqual({
        kind: "topic",
        moduleId: QUOTED_TOPICS[q.support.topicId].moduleId,
        topicId: q.support.topicId,
      });
    }
  });

  it("never quote a source the round ruled out", () => {
    const banned = /consultation|starting-weights|msf-overview|further-research|programming-faq/;
    for (const q of ACADEMY_QUESTIONS) expect(q.support.topicId, q.id).not.toMatch(banned);
  });

  it("never teach a lift straight after a handoff (after one, the first movement is a lowering)", () => {
    for (const q of ACADEMY_QUESTIONS.filter((x) => x.kind === "order")) {
      q.options.forEach((o, i) => {
        if (/handoff/i.test(o)) expect(q.options[i + 1] ?? "", `${q.id}: ${o}`).not.toMatch(/concentric|lift/i);
      });
    }
    const phases = ACADEMY_QUESTIONS.find((q) => q.id === "a-five-phases");
    expect(phases?.prompt).toMatch(/starts with a gradual load up/);
    expect(phases?.options[0]).toBe("Initiation: a gradual load up");
    // One branch of the Summary's own "either a gradual load up or a handoff".
    expect(topicText("summary-exercise-performance")).toContain("Exercise initiation through either a gradual load up or a handoff");
  });

  it("name the case when a wrong answer is right somewhere else in the Academy", () => {
    // "No pause at all" is right on the end-stop presses (Exercise Categories).
    expect(ACADEMY_QUESTIONS.find((q) => q.id === "a-pause-length")?.prompt).toMatch(/^On a machine with a pause or squeeze at the top/);
    expect(topicText("mastery-exercise-categories-postureexecutiongaps")).toContain("Continuous movement with no pause or squeeze");
    // "In all cases described above": the kinds of exercise the topic covers.
    expect(ACADEMY_QUESTIONS.find((q) => q.id === "a-common-attribute")?.prompt).toMatch(/Turnaround Technique topic covers several kinds of exercise/);
    expect(topicText("performance-turnaround-technique")).toContain("In all cases described above, there is one common attribute");
    // Path and pace are also called lifelong elsewhere; Purpose is the Mastery Series' answer.
    const purpose = ACADEMY_QUESTIONS.find((q) => q.id === "a-purpose-lifetime");
    expect(purpose?.prompt).toMatch(/^The Mastery Series says three of the Four P's could be mastered in a handful of workouts/);
    expect(purpose?.prompt).not.toMatch(/Series 4/);
    expect(topicText("mastery-purpose")).toContain("in a matter of a handful of workouts");
  });

  it("never ask the order of the four P's (the sources disagree)", () => {
    for (const q of ALL) {
      if (q.kind !== "order") continue;
      const ps = q.options.filter((o) => /^(posture|pace|path|purpose)$/i.test(o.trim()));
      expect(ps.length, q.id).toBe(0);
    }
  });
});

describe("the floor questions (the playbooks deck)", () => {
  it("are at least twelve, all in the playbooks deck", () => {
    expect(FLOOR_QUESTIONS.length).toBeGreaterThanOrEqual(12);
    for (const q of FLOOR_QUESTIONS) expect(q.deck).toBe("playbooks");
  });

  it("each quote is in its file", () => {
    for (const q of FLOOR_QUESTIONS) {
      expect(existsSync(join(ROOT, q.support.path)), q.support.path).toBe(true);
      expect(flat(read(q.support.path)), `${q.id}: "${q.support.quote}"`).toContain(flat(q.support.quote));
      expect(q.source.path).toBe(q.support.path);
    }
  });

  it("each quote is on the line it names (Read it opens the page that cites that line)", () => {
    for (const q of FLOOR_QUESTIONS) {
      const { line, toLine, quote, path } = q.support;
      const lines = read(path).split("\n");
      const to = toLine ?? line;
      expect(line, q.id).toBeGreaterThanOrEqual(1);
      expect(to, q.id).toBeGreaterThanOrEqual(line);
      expect(to - line, q.id).toBeLessThanOrEqual(1);
      expect(flat(lines.slice(line - 1, to).join(" ")), `${q.id}: ${path}:${line}-${to}`).toContain(flat(quote));
      // And no shorter: a quote on one line names only that line.
      if (toLine !== undefined) expect(flat(lines[line - 1]), q.id).not.toContain(flat(quote));
    }
  });

  it("asks the accolades as the README writes them: at most three, and an empty one never prints", () => {
    const q = FLOOR_QUESTIONS.find((x) => x.id === "f-three-accolades");
    expect(q?.prompt).toMatch(/^At most/);
    expect(q?.options[q.answer]).toBe("Three, and an empty one never prints");
    const readme = flat(read("src/features/progress-report/README.md"));
    expect(readme).toContain("Nothing empty prints.");
    expect(readme).toContain("Never more than three, never the same accolade twice");
  });

  it("only draw on the business notes, FORD and the progress report", () => {
    const allowed = [
      "docs/business/the-floor.md",
      "docs/business/renewals.md",
      "docs/business/packages-and-pricing.md",
      "src/features/ford/README.md",
      "src/features/progress-report/README.md",
    ];
    for (const q of FLOOR_QUESTIONS) expect(allowed).toContain(q.support.path);
  });
});

describe("every written question", () => {
  it("has a sound shape", () => {
    for (const q of ALL) {
      if (q.kind === "choice") {
        expect(q.options.length, q.id).toBe(4);
        expect(q.answer, q.id).toBe(0);
      } else if (q.kind === "truefalse") {
        expect(q.options).toEqual(["True", "False"]);
        expect([0, 1]).toContain(q.answer);
      } else {
        expect(q.answer).toBe(-1);
        expect(q.options.length, q.id).toBeGreaterThanOrEqual(3);
      }
      expect(new Set(q.options).size, q.id).toBe(q.options.length);
    }
  });

  it("explains in one or two sentences", () => {
    for (const q of ALL) expect(sentences(q.explain), `${q.id}: ${q.explain}`).toBeLessThanOrEqual(2);
  });

  it("never names a price", () => {
    for (const q of ALL) {
      const words = [q.prompt, q.explain, ...q.options].join(" ");
      expect(words, q.id).not.toContain("$");
    }
  });

  it("never says he or she about a client", () => {
    for (const q of ALL) {
      const words = [q.prompt, q.explain, ...q.options].join(" ");
      expect(/\b(he|she|his|her|him|hers)\b/i.test(words), `${q.id}: ${words}`).toBe(false);
    }
  });

  it("never treats a rep count as a rule", () => {
    for (const q of ALL) {
      const words = [q.prompt, ...q.options].join(" ");
      expect(/must (reach|fail|hit).*\breps?\b/i.test(words), q.id).toBe(false);
    }
  });
});
