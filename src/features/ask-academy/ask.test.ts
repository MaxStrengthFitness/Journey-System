import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { askAcademy, type AskClient } from "./ask";
import { CLEARANCE_PAGE_ID } from "./answer";
import { ANSWER_MODEL, PICK_MODEL } from "./models";
import type { AcademyPage } from "./pages";

type Message = Anthropic.Beta.Messages.BetaMessage;
type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

const page = (id: string, text: string): AcademyPage => ({ id, kind: "topic", shelf: "Shelf", title: id, text, sameAs: [] });
const breathing = page("topic:mastery-breathing", "Breathe freely throughout the set.");
const clearance = page(CLEARANCE_PAGE_ID, "If the client has not yet finished their physical therapy and therefore does not have medical clearance, we WILL NOT TRAIN OR INVOLVE THE AFFECTED AREA.");
const all = [breathing, clearance];

const usage = { input_tokens: 1000, output_tokens: 100 };
const msg = (model: string, content: unknown[], stop_reason = "end_turn") =>
  ({ model, usage, content, stop_reason, stop_details: null }) as unknown as Message;
const pickReply = (json: object) => msg(PICK_MODEL, [{ type: "text", text: JSON.stringify(json), citations: null }]);
const cite = (document_index: number, cited_text: string) => ({ type: "char_location", cited_text, document_index, document_title: null, start_char_index: 0, end_char_index: 1, file_id: null });

/** A client that answers each request in turn and keeps what it was sent. */
function fake(...replies: Message[]): AskClient & { sent: Params[] } {
  const sent: Params[] = [];
  return { sent, beta: { messages: { create: async (p: Params) => (sent.push(p), replies.shift()!) } } };
}

describe("askAcademy", () => {
  it("picks, then answers on Sonnet from the picked pages, with each quote's page named", async () => {
    const client = fake(
      pickReply({ pages: ["topic:mastery-breathing"], covered: true, health: false }),
      msg(ANSWER_MODEL, [{ type: "text", text: "Keep them breathing.", citations: [cite(0, "Breathe freely throughout the set.")] }]),
    );
    const { result, cost } = await askAcademy(client, "My client holds their breath", all);
    expect(client.sent.map((p) => p.model)).toEqual([PICK_MODEL, ANSWER_MODEL]);
    expect(result).toEqual({
      kind: "answered",
      health: false,
      points: [{ says: "Keep them breathing.", quotes: [{ text: "Breathe freely throughout the set.", pageId: breathing.id, page: "Shelf › topic:mastery-breathing" }] }],
    });
    expect(cost).toBeGreaterThan(0);
  });

  it("sends a health question the clearance page too, and says whether it led", async () => {
    const client = fake(
      pickReply({ pages: ["topic:mastery-breathing"], covered: true, health: true }),
      msg(ANSWER_MODEL, [{ type: "text", text: "Not before clearance.", citations: [cite(1, clearance.text)] }]),
    );
    const { result } = await askAcademy(client, "Client just had a knee replacement", all);
    const docs = (client.sent[1].messages[0].content as { type: string }[]).filter((b) => b.type === "document");
    expect(docs).toHaveLength(2);
    expect(result).toMatchObject({ kind: "answered", health: true, clearanceLed: true });
  });

  it("asks nothing more when no page fits", async () => {
    const client = fake(pickReply({ pages: [], covered: false, health: false }));
    expect((await askAcademy(client, "What is Demo Mode for?", all)).result).toEqual({ kind: "not_covered" });
    expect(client.sent).toHaveLength(1);
  });

  it("passes on the pages disagreeing, and never shows an answer nothing backs", async () => {
    const conflict = fake(pickReply({ pages: ["topic:mastery-breathing"], covered: true, health: false }), msg(ANSWER_MODEL, [{ type: "text", text: "CONFLICTING", citations: null }]));
    expect((await askAcademy(conflict, "q", all)).result).toEqual({ kind: "conflicting" });
    const bare = fake(pickReply({ pages: ["topic:mastery-breathing"], covered: true, health: false }), msg(ANSWER_MODEL, [{ type: "text", text: "Use 40 pounds.", citations: null }]));
    expect((await askAcademy(bare, "q", all)).result).toEqual({ kind: "no_answer", reason: "no line was backed by the Academy" });
  });
});
