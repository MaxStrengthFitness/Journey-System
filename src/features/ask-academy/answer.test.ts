import { describe, expect, it } from "vitest";
import { answerRequest, CLEARANCE_PAGE_ID, CONFLICTING, documentTitle, NOT_COVERED, pagesToSend, readAnswer } from "./answer";
import { ANSWER_MODELS } from "./models";
import type { AcademyPage } from "./pages";

const pain: AcademyPage = {
  id: "topic:programming-considerations-for-training-with-pain",
  kind: "topic",
  shelf: "Programming and Progression",
  title: "Considerations for Training with Pain",
  text: "Our main priority is always to assess tolerance.",
  sameAs: [],
};
const lp: AcademyPage = { id: "overview:leg-press", kind: "overview", shelf: "Machine overviews", title: "Leg Press", text: "Seat text.", sameAs: [] };

const cite = (document_index: number, cited_text: string) => ({
  type: "char_location" as const,
  cited_text,
  document_index,
  document_title: null,
  start_char_index: 0,
  end_char_index: cited_text.length,
  file_id: null,
});
const text = (t: string, citations: ReturnType<typeof cite>[] | null = null) => ({ type: "text" as const, text: t, citations });
const reply = (content: unknown[], stop_reason = "end_turn", stop_details: unknown = null) =>
  ({ content, stop_reason, stop_details }) as Parameters<typeof readAnswer>[0];

describe("answerRequest", () => {
  it("sends each page as a cited plain-text document, then the question", () => {
    const req = answerRequest("knee arthritis, where do I start?", [pain, lp], ANSWER_MODELS.opus);
    const content = req.messages[0].content as { type: string; title?: string; citations?: unknown; text?: string }[];
    expect(content.map((b) => b.type)).toEqual(["document", "document", "text"]);
    expect(content[0].title).toBe(documentTitle(pain));
    expect(content[0].citations).toEqual({ enabled: true });
    expect(content[2].text).toBe("A trainer asks: knee arthritis, where do I start?");
  });

  it("asks for no fallback model: the model that answers is the one chosen", () => {
    for (const model of [ANSWER_MODELS.opus, ANSWER_MODELS.sonnet]) {
      const req = answerRequest("q", [pain], model);
      expect(req.model).toBe(model);
      expect("fallbacks" in req).toBe(false);
      expect("betas" in req).toBe(false);
    }
  });

  it("tells the model the rules it keeps", () => {
    const system = answerRequest("q", [pain], ANSWER_MODELS.opus).system as string;
    expect(system).toContain("Never give a weight, a rep count or a next step for a particular client");
    expect(system).toContain(NOT_COVERED);
    expect(system).toContain(CONFLICTING);
    expect(system).toContain("Never describe the app's screens or features");
    expect(system).not.toContain("medical clearance");
    expect(answerRequest("q", [pain], ANSWER_MODELS.opus, true).system).toContain("medical clearance");
  });
});

describe("pagesToSend", () => {
  const clearance: AcademyPage = { ...pain, id: CLEARANCE_PAGE_ID, title: "TSC" };
  const all = [pain, lp, clearance];

  it("adds the clearance page to a health question, once", () => {
    expect(pagesToSend([lp], true, all).map((p) => p.id)).toEqual([lp.id, CLEARANCE_PAGE_ID]);
    expect(pagesToSend([clearance, lp], true, all).map((p) => p.id)).toEqual([CLEARANCE_PAGE_ID, lp.id]);
  });

  it("leaves any other question as picked", () => {
    expect(pagesToSend([lp], false, all)).toEqual([lp]);
  });
});

describe("readAnswer", () => {
  it("turns each cited line into a point with the Academy's words and its page", () => {
    const answer = readAnswer(reply([text("Here is what the Academy says.\n\n"), text(" Find what the knee tolerates first. ", [cite(0, "Our main priority is always to assess tolerance.")])]), [pain, lp]);
    expect(answer).toEqual({
      kind: "answered",
      dropped: 1,
      points: [{ says: "Find what the knee tolerates first.", quotes: [{ text: "Our main priority is always to assess tolerance.", pageId: pain.id }] }],
    });
  });

  it("counts a quote once, and never one from a page it wasn't sent", () => {
    const answer = readAnswer(reply([text("Seat first.", [cite(1, "Seat text."), cite(1, "Seat text."), cite(7, "elsewhere")])]), [pain, lp]);
    expect(answer.kind === "answered" && answer.points[0].quotes).toEqual([{ text: "Seat text.", pageId: lp.id }]);
  });

  it("doesn't count punctuation between points as a dropped line", () => {
    const answer = readAnswer(reply([text("A.", [cite(0, "x")]), text("\n\n"), text("B.", [cite(1, "y")])]), [pain, lp]);
    expect(answer.kind === "answered" && answer.dropped).toBe(0);
  });

  it("reads NOT_COVERED as not covered", () => {
    expect(readAnswer(reply([text(NOT_COVERED)]), [pain])).toEqual({ kind: "not_covered" });
  });

  it("never shows an answer with nothing behind it", () => {
    expect(readAnswer(reply([text("Use about 40 pounds.")]), [pain])).toEqual({ kind: "unusable", reason: "no line was backed by the Academy" });
    expect(readAnswer(reply([text("Start")], "max_tokens"), [pain])).toEqual({ kind: "unusable", reason: "the answer ran out of room" });
  });

  it("reads CONFLICTING as a question for the admins, never a side picked", () => {
    expect(readAnswer(reply([text(CONFLICTING)]), [pain])).toEqual({ kind: "conflicting" });
  });

  it("on a health question, reads the clearance point first and says whether there was one", () => {
    const clear = "If the client has not yet finished their physical therapy and therefore does not have medical clearance, we WILL NOT TRAIN OR INVOLVE THE AFFECTED AREA.";
    const answer = readAnswer(reply([text("Tolerance first.", [cite(0, "assess tolerance")]), text("Not before clearance.", [cite(1, clear)])]), [pain, lp], true);
    expect(answer.kind === "answered" && answer.points.map((p) => p.says)).toEqual(["Not before clearance.", "Tolerance first."]);
    expect(answer.kind === "answered" && answer.clearanceLed).toBe(true);
    const none = readAnswer(reply([text("Tolerance first.", [cite(0, "assess tolerance")])]), [pain], true);
    expect(none.kind === "answered" && none.clearanceLed).toBe(false);
  });

  it("says when the whole chain refused, with its category", () => {
    expect(readAnswer(reply([], "refusal", { type: "refusal", category: "bio", explanation: null }), [pain])).toEqual({ kind: "refused", category: "bio" });
  });
});
