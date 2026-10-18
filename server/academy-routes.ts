/**
 * Ask the Academy's one route:
 *   POST /api/academy/ask  { question }  →  { result }   (an AskResult)
 *
 * Round: Ask the Academy, phase 1 (Oct 18 2026; docs/rounds/2026-10-16-ask-the-academy.md).
 * A trainer's question is answered in the Academy's own words: Haiku picks the
 * pages, Sonnet 5.5 answers from them with citations (AJ's pick from the blind
 * trial), and every line the Academy doesn't back is dropped
 * (src/features/ask-academy/ask.ts). The key, ANTHROPIC_API_KEY, lives only
 * here, on the server.
 *
 * Every request passes, in this order, as the Gemini routes do
 * (server/gemini-routes.ts):
 *   1. the staff sign-in (server/auth.ts), before a byte of the body is read;
 *   2. a per-person limit (src/lib/request-limit.ts): one question at a time,
 *      twenty in fifteen minutes. A question costs about 5 cents, so one
 *      person can't spend more than a dollar in a quarter hour, and the
 *      Console's monthly limit is the ceiling over everyone;
 *   3. a small body (4 KB) and a question of 3 to 300 characters.
 * server.ts's shared body parser skips /api/academy so step 3 comes after 1.
 *
 * The answer carries no client: the question is the trainer's own words, and
 * nothing here reads or stores a client record. Nothing is kept: the question
 * goes to head office's list only in phase 3, written by the app.
 *
 * The ask function is passed in, so server/academy-routes.test.ts can mount
 * the route on a bare Express app without a key.
 */

import express, { type Express, type RequestHandler } from "express";
import { createRequestLimiter, type RequestLimiter, type RequestLimitOptions } from "../src/lib/request-limit.ts";
import type { AskResult } from "../src/features/ask-academy/ask.ts";

export const ACADEMY_LIMITS: RequestLimitOptions = {
  maxInFlight: 1,
  maxPerWindow: 20,
  windowMs: 15 * 60 * 1000,
  messages: {
    busy: "Your last question is still being answered. Wait for it, then ask again.",
    tooMany: (minutes) => `That's a lot of questions in a short time. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
  },
};

export const QUESTION_MIN = 3;
export const QUESTION_MAX = 300;
const BODY_LIMIT = "4kb";

/** What a trainer reads when the route can't answer. */
export const ACADEMY_ERRORS = {
  notSetUp: "Ask the Academy isn't switched on yet.",
  failed: "The Academy couldn't be asked just now. Try again in a minute.",
  tooShort: "Type a question first.",
  tooLong: `Keep the question under ${QUESTION_MAX} characters.`,
} as const;

/** Paths server.ts's shared body parser leaves alone: this route reads its own body, after the sign-in. */
export function isAcademyPath(path: string): boolean {
  return /^\/api\/academy(\/|$)/i.test(path);
}

export interface AcademyRouteDeps {
  /** The staff sign-in check: requireStaff() from server/auth.ts. */
  requireSignIn: RequestHandler;
  /** Null when there is no key: the route says it isn't switched on. */
  ask: ((question: string) => Promise<{ result: AskResult; cost: number }>) | null;
  /** Defaults to one built from ACADEMY_LIMITS. */
  limiter?: RequestLimiter;
}

function perCallerLimit(limiter: RequestLimiter): RequestHandler {
  return (_req, res, next) => {
    const uid = res.locals.caller?.uid;
    if (typeof uid !== "string" || uid === "") {
      res.status(401).json({ error: "Please sign in again — this request carried no sign-in." });
      return;
    }
    const decision = limiter.acquire(uid);
    if (!decision.ok) {
      res.set("Retry-After", String(decision.retryAfterSeconds));
      res.status(429).json({ error: decision.error });
      return;
    }
    res.on("finish", decision.release);
    res.on("close", decision.release);
    next();
  };
}

function smallBody(): RequestHandler {
  const parse = express.json({ limit: BODY_LIMIT });
  return (req, res, next) =>
    parse(req, res, (err?: any) => {
      if (!err) return next();
      res.status(err.type === "entity.too.large" ? 413 : 400).json({ error: ACADEMY_ERRORS.tooLong });
    });
}

export function registerAcademyRoutes(app: Express, deps: AcademyRouteDeps): void {
  const limiter = deps.limiter ?? createRequestLimiter(ACADEMY_LIMITS);
  app.post("/api/academy/ask", deps.requireSignIn, perCallerLimit(limiter), smallBody(), async (req, res) => {
    const raw = req.body?.question;
    const question = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
    if (question.length < QUESTION_MIN) return res.status(400).json({ error: ACADEMY_ERRORS.tooShort });
    if (question.length > QUESTION_MAX) return res.status(400).json({ error: ACADEMY_ERRORS.tooLong });
    if (!deps.ask) return res.status(503).json({ error: ACADEMY_ERRORS.notSetUp });
    const started = Date.now();
    try {
      const { result, cost } = await deps.ask(question);
      // No question text in the log: it is the trainer's own words.
      console.log(`[academy] ${result.kind} in ${Date.now() - started} ms, $${cost.toFixed(4)}`);
      res.json({ result });
    } catch (e: any) {
      console.error(`[academy] failed after ${Date.now() - started} ms:`, e?.status ?? "", e?.message ?? e);
      res.status(502).json({ error: ACADEMY_ERRORS.failed });
    }
  });
}
