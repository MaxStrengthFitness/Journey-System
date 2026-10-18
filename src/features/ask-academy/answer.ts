/**
 * ANSWERING FROM THE PAGES — the second request, and reading what comes back.
 *
 * AJ's pick (1a, Oct 16 2026): the answer is the Academy's own sentences, each
 * with its page, and a short line of Claude's above each. Corporate owns the
 * method, so what a trainer reads as method is the Academy's words.
 *
 * The chosen pages go in as plain-text documents with citations on. The API
 * then splits the reply into text blocks, and a block that rests on the pages
 * carries its citations: `cited_text` is copied from the page by the API, not
 * retyped by the model. `readAnswer` turns each cited block into a point (the
 * line, then the quoted sentences and their pages) and drops every line with no
 * citation behind it. If the pages don't answer the question the reply is the
 * single word NOT_COVERED.
 *
 * No fallback model (Oct 17 2026). The API can hand a declined request to
 * another model; that would put an answer from a model AJ didn't choose in
 * front of a trainer, so it is his call. Until he makes it, a declined
 * question comes back as `refused`, with its category, and the trial counts
 * how often that happens.
 *
 * AJ's rules from the trial's questions (Oct 18 2026):
 *   - Loyal to what we teach: "I don't really just want the AI to just be
 *     searching willy-nilly information." When the pages disagree, the reply is
 *     CONFLICTING and the question goes to the admins to decide, like one the
 *     Academy doesn't answer.
 *   - "We always need to have the Academy's medical clearance line on any pages
 *     that need it." A health question (the pick says so) is also sent the
 *     Academy's line on surgery and clearance (`CLEARANCE_PAGE_ID`), and the
 *     point quoting a clearance line is read out first.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { AcademyPage } from "./pages";

type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Message = Anthropic.Beta.Messages.BetaMessage;

export const NOT_COVERED = "NOT_COVERED";
export const CONFLICTING = "CONFLICTING";

/**
 * The Academy's clearance line for a client back from surgery: "If the client
 * has not yet finished their physical therapy and therefore does not have
 * medical clearance, we WILL NOT TRAIN OR INVOLVE THE AFFECTED AREA."
 */
export const CLEARANCE_PAGE_ID = "topic:variations-timed-static-contraction-tsc";

/** A quote that is the Academy saying a client needs a doctor's clearance first. */
const CLEARANCE_WORDS = /medical(ly)? clear|clearance|physician|doctor|physical therap|contraindicat/i;

const HEALTH_INSTRUCTION =
  "This question is about a client's injury, surgery, pain or condition. Your first point must cite the pages' line on medical clearance or contraindications.";

const ANSWER_INSTRUCTIONS = [
  "You answer questions from trainers at Max Strength Fitness (MSF), using only the attached pages of the MSF Academy, the company's training manual.",
  "The Academy is Max Strength's method, and trainers must read it in its own words. So:",
  "- Back every point with a citation to the attached pages. Leave out anything you cannot cite.",
  "- Make at most four points. Each point is one short, plain sentence a trainer can take in at a glance. The passage you cite is shown in full beneath it, so don't restate it at length.",
  "- Use the Academy's own terms. No headings, lists or markdown.",
  "- Where the pages give a real example (a cue, a demonstration, a client case), cite the example rather than only the definition.",
  "- When asked what could cause a client's pain or discomfort, answer from what the pages say about form, breathing and the machines; that is the Academy's to say. Diagnosing the client is not.",
  "- Never give a weight, a rep count or a next step for a particular client. The Academy guides the trainer; the trainer decides for the client.",
  "- The pages are the method, not the Journey app. Never describe the app's screens or features.",
  `- If the attached pages do not answer the question, reply with exactly ${NOT_COVERED} and nothing else.`,
  `- If the attached pages contradict each other on the answer, reply with exactly ${CONFLICTING} and nothing else. Never choose a side.`,
].join("\n");

/**
 * The pages a question is answered from: the pick's, and for a health question
 * the clearance page too when the pick didn't name it.
 */
export function pagesToSend(picked: readonly AcademyPage[], health: boolean, all: readonly AcademyPage[]): AcademyPage[] {
  if (!health || picked.some((p) => p.id === CLEARANCE_PAGE_ID)) return [...picked];
  const clearance = all.find((p) => p.id === CLEARANCE_PAGE_ID || p.sameAs.includes(CLEARANCE_PAGE_ID));
  return clearance && !picked.includes(clearance) ? [...picked, clearance] : [...picked];
}

/** The page title a document carries, which is also what the trainer is shown. */
export function documentTitle(page: AcademyPage): string {
  return `${page.shelf} › ${page.title}`;
}

/** The answering request: the pages in the order picked, then the question. */
export function answerRequest(question: string, pages: readonly AcademyPage[], model: string, health = false): CreateParams {
  return {
    model,
    max_tokens: 8000,
    system: health ? `${ANSWER_INSTRUCTIONS}\n${HEALTH_INSTRUCTION}` : ANSWER_INSTRUCTIONS,
    output_config: { effort: "medium" },
    messages: [
      {
        role: "user",
        content: [
          ...pages.map((p) => ({
            type: "document" as const,
            source: { type: "text" as const, media_type: "text/plain" as const, data: p.text },
            title: documentTitle(p),
            citations: { enabled: true },
          })),
          { type: "text" as const, text: `A trainer asks: ${question}` },
        ],
      },
    ],
  };
}

export interface AnswerQuote {
  /** The Academy's words, exactly as the API copied them from the page. */
  text: string;
  pageId: string;
}

export interface AnswerPoint {
  /** Claude's short line. */
  says: string;
  quotes: AnswerQuote[];
}

export type AskAnswer =
  | {
      kind: "answered";
      points: AnswerPoint[];
      /** Lines with no citation, left out. */ dropped: number;
      /** A health question only: did a clearance line lead? */ clearanceLed?: boolean;
    }
  | { kind: "not_covered" }
  | { kind: "conflicting" }
  | { kind: "refused"; category: string | null }
  | { kind: "unusable"; reason: string };

/** What an answer says, from the reply and the pages it was sent (in the order sent). */
export function readAnswer(
  message: Pick<Message, "content" | "stop_reason" | "stop_details">,
  pagesSent: readonly AcademyPage[],
  health = false,
): AskAnswer {
  if (message.stop_reason === "refusal") {
    return { kind: "refused", category: message.stop_details?.category ?? null };
  }
  const points: AnswerPoint[] = [];
  let dropped = 0;
  let plain = "";
  for (const block of message.content) {
    if (block.type !== "text") continue;
    const quotes: AnswerQuote[] = [];
    for (const c of block.citations ?? []) {
      if (c.type !== "char_location") continue;
      const page = pagesSent[c.document_index];
      const text = c.cited_text.trim();
      if (!page || !text) continue;
      if (!quotes.some((q) => q.text === text && q.pageId === page.id)) quotes.push({ text, pageId: page.id });
    }
    if (quotes.length === 0) {
      plain += block.text;
      if (/[a-z]/i.test(block.text) && !block.text.includes(NOT_COVERED)) dropped++;
      continue;
    }
    points.push({ says: block.text.replace(/\s+/g, " ").trim(), quotes });
  }
  if (points.length > 0) {
    if (!health) return { kind: "answered", points, dropped };
    const at = points.findIndex((p) => p.quotes.some((q) => CLEARANCE_WORDS.test(q.text)));
    if (at > 0) points.unshift(...points.splice(at, 1));
    return { kind: "answered", points, dropped, clearanceLed: at >= 0 };
  }
  if (plain.includes(CONFLICTING)) return { kind: "conflicting" };
  if (plain.includes(NOT_COVERED)) return { kind: "not_covered" };
  if (message.stop_reason === "max_tokens") return { kind: "unusable", reason: "the answer ran out of room" };
  return { kind: "unusable", reason: "no line was backed by the Academy" };
}
