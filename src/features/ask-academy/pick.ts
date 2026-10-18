/**
 * PICKING THE PAGES — the first of Ask the Academy's two requests.
 *
 * The Academy is about 180,000 words: too much to send with every question.
 * So Haiku 5.5 first reads the question and one line per page (`pageListText`)
 * and names the pages most likely to answer it, best first, at most five. Only
 * those are sent, whole, to the answering model (`answer.ts`).
 *
 * The page list is the same for every question, so it sits in the system
 * prompt behind a cache mark: after the first question it is read from the
 * cache at a tenth of the price. The answer comes back as JSON checked against
 * PICK_SCHEMA; ids are then checked against the real pages, so a made-up id is
 * dropped, never sent.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { PICK_MODEL } from "./models";
import { pageById, pageListText, type AcademyPage } from "./pages";

type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Message = Anthropic.Beta.Messages.BetaMessage;

/** At most this many pages are sent to be answered from. */
export const MAX_PAGES = 5;

export const PICK_SCHEMA = {
  type: "object",
  properties: {
    pages: { type: "array", items: { type: "string" } },
    covered: { type: "boolean" },
    health: { type: "boolean" },
  },
  required: ["pages", "covered", "health"],
  additionalProperties: false,
} as const;

const PICK_INSTRUCTIONS = [
  "You find pages in the Max Strength Fitness (MSF) Academy, the training manual for MSF trainers.",
  "A trainer has asked a question. Below is every page of the Academy, one per line: its id, where it sits, and its title.",
  `Choose the pages most likely to answer the question, best first, at most ${MAX_PAGES}. Choose fewer when fewer fit. Use the ids exactly as written.`,
  "A question about one machine usually needs that machine's overview, quick reference card or script; a question about the method usually needs a topic.",
  "A question about pain, a headache or discomfort during or after a workout also needs the pages on what in a client's form or breathing could cause it: breathing, EIH, posture, and the machines involved.",
  "If no page could answer it (it is not about the training method, the machines, or working with a client in a session), return no pages and covered false.",
  "The Academy is the method only. A question about using the Journey app or Mindbody, a studio's prices, fees or policies, marketing, or fixing a machine is not covered.",
  "Set health true when the question is about a client's injury, surgery, pain or medical condition; otherwise false.",
].join("\n");

/** The picking request for one question. */
export function pickRequest(question: string, pages: readonly AcademyPage[]): CreateParams {
  return {
    model: PICK_MODEL,
    max_tokens: 2000,
    system: [
      { type: "text", text: PICK_INSTRUCTIONS },
      { type: "text", text: `The Academy's pages:\n${pageListText(pages)}`, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: question }],
    output_config: { effort: "low", format: { type: "json_schema", schema: PICK_SCHEMA } },
  };
}

export type PickResult =
  | { ok: true; pageIds: string[]; covered: boolean; /** About an injury, surgery, pain or a condition: the answer leads with clearance. */ health: boolean }
  | { ok: false; reason: string };

/**
 * The pages a pick named, as real page ids (a `sameAs` id becomes its page's
 * id), each once, at most MAX_PAGES. Covered is false when no real page is left.
 */
export function readPicks(message: Pick<Message, "content" | "stop_reason">, pages: readonly AcademyPage[]): PickResult {
  if (message.stop_reason === "refusal") return { ok: false, reason: "refused" };
  const text = message.content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "the pick was not JSON" };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, reason: "the pick was not an object" };
  const { pages: named, covered, health } = parsed as { pages?: unknown; covered?: unknown; health?: unknown };
  if (!Array.isArray(named) || typeof covered !== "boolean") return { ok: false, reason: "the pick had the wrong shape" };

  const pageIds: string[] = [];
  for (const id of named) {
    if (typeof id !== "string") continue;
    const page = pageById(pages, id.trim());
    if (page && !pageIds.includes(page.id)) pageIds.push(page.id);
    if (pageIds.length === MAX_PAGES) break;
  }
  return { ok: true, pageIds, covered: covered && pageIds.length > 0, health: health === true };
}
