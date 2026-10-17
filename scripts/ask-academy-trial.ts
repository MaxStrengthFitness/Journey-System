/**
 * ASK THE ACADEMY — phase 0, the trial. Changes nothing in the app.
 *
 * Round: docs/rounds/2026-10-16-ask-the-academy.md. AJ chose 1a 2a 3a: the
 * answer is the Academy's own sentences with their pages, asked from Learning's
 * search. Before any of that is built, this asks the trial questions
 * (`src/features/ask-academy/trial-questions.ts`) the way the app will:
 * Haiku 5.5 picks the pages, then Opus 5.5 AND Sonnet 5.5 each answer from the
 * same pages. Each question's two answers are labelled A and B at random, so
 * AJ can read them without knowing which model wrote which. The gate is AJ's:
 * nine in ten answers he'd let a new trainer read.
 *
 * Usage (PowerShell, from the project folder):
 *   npx tsx scripts/ask-academy-trial.ts               dry run: calls nothing, prints what it would send
 *   npx tsx scripts/ask-academy-trial.ts --run         asks every question (under $5 for thirty)
 *   npx tsx scripts/ask-academy-trial.ts --run --only q03,q09
 *
 * The key is ANTHROPIC_API_KEY in .env (read here as server.ts reads it); it is
 * never printed. Results go to harness/ask-academy-trial/ (ignored by git).
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { academyFiles } from "../src/features/ask-academy/academy-files";
import { academyPages, pageById, pageListText, type AcademyPage } from "../src/features/ask-academy/pages";
import { pickRequest, readPicks } from "../src/features/ask-academy/pick";
import { answerRequest, documentTitle, readAnswer, type AskAnswer } from "../src/features/ask-academy/answer";
import { ANSWER_MODELS, PICK_MODEL, PRICES, costOf, type AnswerModelKey } from "../src/features/ask-academy/models";
import { TRIAL_QUESTIONS, type TrialQuestion } from "../src/features/ask-academy/trial-questions";

dotenv.config({ quiet: true });

const args = process.argv.slice(2);
const RUN = args.includes("--run");
const onlyArg = args.find((a, i) => args[i - 1] === "--only");
const ONLY = onlyArg ? new Set(onlyArg.split(",").map((s) => s.trim())) : null;
const AT_ONCE = 3;
const OUT_DIR = path.join("harness", "ask-academy-trial");

type AnswerRecord =
  | (AskAnswer & { requestedModel: string; servedBy: string; ms: number; cost: number | null; outputTokens: number })
  | { kind: "error"; requestedModel: string; message: string };

interface QuestionRecord {
  id: string;
  from: TrialQuestion["from"];
  question: string;
  expect: TrialQuestion["expect"];
  pick: { pageIds: string[]; titles: string[]; covered: boolean; hit: boolean | null; ms: number; cost: number | null } | { error: string };
  /** Which model is A and which is B, for the blind reading. */
  blind: { A: AnswerModelKey; B: AnswerModelKey };
  answers: Partial<Record<AnswerModelKey, AnswerRecord>>;
}

/** Did the pick land on a page the question names? Null when the question isn't scored. */
function pickHit(q: TrialQuestion, pageIds: string[], covered: boolean, pages: readonly AcademyPage[]): boolean | null {
  if (q.expect === null) return null;
  if (q.expect === "not_covered") return !covered;
  const expected = new Set(q.expect.map((id) => pageById(pages, id)?.id).filter(Boolean));
  return pageIds.some((id) => expected.has(id));
}

async function askOne(client: Anthropic, model: string, q: TrialQuestion, sent: AcademyPage[]): Promise<AnswerRecord> {
  const started = Date.now();
  try {
    const message = await client.beta.messages.create(answerRequest(q.question, sent, model));
    return {
      ...readAnswer(message, sent),
      requestedModel: model,
      servedBy: message.model,
      ms: Date.now() - started,
      cost: costOf(message.model, message.usage),
      outputTokens: message.usage.output_tokens,
    };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw err;
    const message = err instanceof Anthropic.APIError ? `${err.status ?? "?"} ${err.message}` : String(err);
    return { kind: "error", requestedModel: model, message };
  }
}

async function runQuestion(client: Anthropic, q: TrialQuestion, pages: readonly AcademyPage[]): Promise<QuestionRecord> {
  const blind = Math.random() < 0.5 ? { A: "opus" as const, B: "sonnet" as const } : { A: "sonnet" as const, B: "opus" as const };
  const record: QuestionRecord = { id: q.id, from: q.from, question: q.question, expect: q.expect, pick: { error: "not run" }, blind, answers: {} };

  const started = Date.now();
  let picked: ReturnType<typeof readPicks>;
  let pickCost: number | null = null;
  try {
    const message = await client.beta.messages.create(pickRequest(q.question, pages));
    picked = readPicks(message, pages);
    pickCost = costOf(message.model, message.usage);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw err;
    record.pick = { error: err instanceof Anthropic.APIError ? `${err.status ?? "?"} ${err.message}` : String(err) };
    return record;
  }
  if ("reason" in picked) {
    record.pick = { error: picked.reason };
    return record;
  }
  const sent = picked.pageIds.map((id) => pageById(pages, id)).filter((p): p is AcademyPage => p !== null);
  record.pick = {
    pageIds: picked.pageIds,
    titles: sent.map(documentTitle),
    covered: picked.covered,
    hit: pickHit(q, picked.pageIds, picked.covered, pages),
    ms: Date.now() - started,
    cost: pickCost,
  };
  if (!picked.covered) return record;

  const keys = Object.keys(ANSWER_MODELS) as AnswerModelKey[];
  const answers = await Promise.all(keys.map((k) => askOne(client, ANSWER_MODELS[k], q, sent)));
  keys.forEach((k, i) => (record.answers[k] = answers[i]));
  return record;
}

/** Run `work` over `items`, `limit` at a time, keeping their order. */
async function inBatches<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await work(items[i]);
    }
  });
  await Promise.all(lanes);
  return results;
}

const dollars = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;

async function main() {
  const pages = academyPages(academyFiles());
  const questions = TRIAL_QUESTIONS.filter((q) => !ONLY || ONLY.has(q.id));
  const listChars = pageListText(pages).length;
  const words = pages.reduce((n, p) => n + p.text.split(/\s+/).length, 0);
  const merged = pages.reduce((n, p) => n + p.sameAs.length, 0);

  console.log(`Ask the Academy trial: ${questions.length} question(s), ${pages.length} pages (${words.toLocaleString()} words; ${merged} duplicate page(s) folded in).`);
  console.log(`The page list Haiku picks from is ${listChars.toLocaleString()} characters, about ${Math.round(listChars / 4).toLocaleString()} tokens.`);

  if (!RUN) {
    // Rough: a pick reads the list (cached after the first); an answer reads about 12K tokens of pages and writes about 2K (thinking included).
    const perQuestion =
      ((listChars / 4) * PRICES[PICK_MODEL].cacheRead + 200 * PRICES[PICK_MODEL].output) / 1e6 +
      (12_000 * PRICES[ANSWER_MODELS.opus].input + 2_000 * PRICES[ANSWER_MODELS.opus].output) / 1e6 +
      (12_000 * PRICES[ANSWER_MODELS.sonnet].input + 2_000 * PRICES[ANSWER_MODELS.sonnet].output) / 1e6;
    console.log(`\nDry run: nothing was sent. Asking these would cost roughly ${dollars(perQuestion * questions.length)} (both models answer every question).`);
    for (const q of questions) console.log(`  ${q.id}  ${q.question}`);
    console.log(`\nTo ask them: npx tsx scripts/ask-academy-trial.ts --run`);
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("\nNo ANTHROPIC_API_KEY in .env. Make one at platform.claude.com → API keys, add the line ANTHROPIC_API_KEY=<the key> to .env, save, and run this again.");
    process.exit(1);
  }

  const client = new Anthropic();
  const started = Date.now();
  let done = 0;
  const records = await inBatches(questions, AT_ONCE, async (q) => {
    const r = await runQuestion(client, q, pages);
    done++;
    console.log(`  ${String(done).padStart(2)}/${questions.length}  ${q.id}  ${"error" in r.pick ? `pick failed: ${r.pick.error}` : r.pick.covered ? `${r.pick.pageIds.length} page(s)` : "not covered"}`);
    return r;
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(OUT_DIR, `trial-${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ ranAt: new Date().toISOString(), pickModel: PICK_MODEL, answerModels: ANSWER_MODELS, pages: pages.length, records }, null, 2));

  // The summary: what the pick found, and what each model did.
  const scored = records.filter((r) => !("error" in r.pick) && r.pick.hit !== null);
  const hits = scored.filter((r) => !("error" in r.pick) && r.pick.hit).length;
  console.log(`\nPicks that named an expected page: ${hits} of ${scored.length}.`);
  const misses = scored.filter((r) => !("error" in r.pick) && !r.pick.hit);
  for (const r of misses) if (!("error" in r.pick)) console.log(`  ${r.id} picked: ${r.pick.titles.join(" · ") || "nothing"}`);

  let total = 0;
  for (const r of records) if (!("error" in r.pick)) total += r.pick.cost ?? 0;
  for (const key of Object.keys(ANSWER_MODELS) as AnswerModelKey[]) {
    const rows = records.map((r) => r.answers[key]).filter((a): a is AnswerRecord => a !== undefined);
    const count = (kind: string) => rows.filter((a) => a.kind === kind).length;
    const priced = rows.filter((a): a is Extract<AnswerRecord, { cost: number | null }> => "cost" in a);
    const cost = priced.reduce((n, a) => n + (a.cost ?? 0), 0);
    const seconds = priced.length ? priced.reduce((n, a) => n + a.ms, 0) / priced.length / 1000 : 0;
    const fellBack = priced.filter((a) => a.servedBy !== a.requestedModel).length;
    total += cost;
    console.log(`${ANSWER_MODELS[key]}: ${count("answered")} answered, ${count("not_covered")} not covered, ${count("refused")} refused, ${count("unusable")} unusable, ${count("error")} errors; ${dollars(cost)}; ${seconds.toFixed(1)} s on average${fellBack ? `; ${fellBack} served by a fallback model` : ""}.`);
  }
  console.log(`Total ${dollars(total)} in ${((Date.now() - started) / 1000).toFixed(0)} s. Results: ${outFile}`);
}

main().catch((err) => {
  if (err instanceof Anthropic.AuthenticationError) {
    console.error("\nThe key in .env was refused. Check it was copied whole, or make a new one at platform.claude.com → API keys.");
  } else {
    console.error(err);
  }
  process.exit(1);
});
