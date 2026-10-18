/**
 * ONE QUESTION, START TO END — the two requests in order, for the server's
 * route (phase 1).
 *
 * `pickPages` asks Haiku for the pages; `answerFrom` asks the answering model
 * from them (with the clearance page added to a health question). `askAcademy`
 * is the two together, which is what a trainer's question runs. The trial
 * (scripts/ask-academy-trial.ts) builds the same requests from the same pure
 * pieces (pick.ts, answer.ts) but keeps its own loop, because it sends one
 * pick to two models and records more than a trainer sees.
 *
 * The API client is handed in: the server and the trial each make their own
 * from ANTHROPIC_API_KEY, and the test hands in a fake. An API error is
 * thrown to the caller, which says what a trainer sees; everything the model
 * can say comes back as an `AskResult`.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { answerRequest, documentTitle, pagesToSend, readAnswer, type AnswerPoint } from "./answer";
import { ANSWER_MODEL, costOf } from "./models";
import { pageById, type AcademyPage } from "./pages";
import { pickRequest, readPicks } from "./pick";

type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Message = Anthropic.Beta.Messages.BetaMessage;

/** The one call this needs from the SDK client. */
export interface AskClient {
  beta: { messages: { create(params: CreateParams): Promise<Message> } };
}

export interface ShownQuote {
  /** The Academy's words, copied from the page by the API. */
  text: string;
  pageId: string;
  /** Where it sits and its title, as a trainer reads it: "Mastery Series › Breathing". */
  page: string;
  /** The page title alone; for a glossary term, the term (which is how Learning opens it). */
  title: string;
}

export type AskResult =
  | { kind: "answered"; points: { says: string; quotes: ShownQuote[] }[]; health: boolean; clearanceLed?: boolean }
  /** No page could answer it, or the pages sent didn't: it goes to head office's list (phase 3). */
  | { kind: "not_covered" }
  /** The pages disagree: head office decides, never the model. */
  | { kind: "conflicting" }
  /** Nothing the trainer can be shown: a refusal, or a reply with no line the Academy backs. */
  | { kind: "no_answer"; reason: string };

export interface Picked {
  pages: AcademyPage[];
  covered: boolean;
  health: boolean;
  cost: number | null;
}

/** The first request: which pages, and is it a health question. A pick that can't be read is "no_answer". */
export async function pickPages(client: AskClient, question: string, all: readonly AcademyPage[]): Promise<Picked | { kind: "no_answer"; reason: string; cost: number | null }> {
  const message = await client.beta.messages.create(pickRequest(question, all));
  const cost = costOf(message.model, message.usage);
  const picked = readPicks(message, all);
  if ("reason" in picked) return { kind: "no_answer", reason: picked.reason, cost };
  const pages = picked.pageIds.map((id) => pageById(all, id)).filter((p): p is AcademyPage => p !== null);
  return { pages, covered: picked.covered, health: picked.health, cost };
}

const shown = (points: AnswerPoint[], sent: readonly AcademyPage[]) =>
  points.map((p) => ({
    says: p.says,
    quotes: p.quotes.map((q) => {
      const page = sent.find((s) => s.id === q.pageId);
      return { text: q.text, pageId: q.pageId, page: page ? documentTitle(page) : q.pageId, title: page?.title ?? q.pageId };
    }),
  }));

/** The second request, from the picked pages (plus the clearance page for a health question). */
export async function answerFrom(
  client: AskClient,
  question: string,
  picked: Pick<Picked, "pages" | "health">,
  all: readonly AcademyPage[],
  model: string = ANSWER_MODEL,
): Promise<{ result: AskResult; sentIds: string[]; cost: number | null; servedBy: string }> {
  const sent = pagesToSend(picked.pages, picked.health, all);
  const message = await client.beta.messages.create(answerRequest(question, sent, model, picked.health));
  const cost = costOf(message.model, message.usage);
  const answer = readAnswer(message, sent, picked.health);
  const base = { sentIds: sent.map((p) => p.id), cost, servedBy: message.model };
  switch (answer.kind) {
    case "answered":
      return { ...base, result: { kind: "answered", points: shown(answer.points, sent), health: picked.health, ...(picked.health ? { clearanceLed: answer.clearanceLed } : {}) } };
    case "not_covered":
    case "conflicting":
      return { ...base, result: { kind: answer.kind } };
    case "refused":
      return { ...base, result: { kind: "no_answer", reason: `declined${answer.category ? ` (${answer.category})` : ""}` } };
    case "unusable":
      return { ...base, result: { kind: "no_answer", reason: answer.reason } };
  }
}

/** A trainer's question, start to end. */
export async function askAcademy(client: AskClient, question: string, all: readonly AcademyPage[]): Promise<{ result: AskResult; cost: number }> {
  const picked = await pickPages(client, question, all);
  if ("kind" in picked) return { result: { kind: "no_answer", reason: picked.reason }, cost: picked.cost ?? 0 };
  if (!picked.covered) return { result: { kind: "not_covered" }, cost: picked.cost ?? 0 };
  const answered = await answerFrom(client, question, picked, all);
  return { result: answered.result, cost: (picked.cost ?? 0) + (answered.cost ?? 0) };
}
