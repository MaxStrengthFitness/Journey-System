/**
 * The app's call to Ask the Academy's route (server/academy-routes.ts).
 *
 * Signed in through authedFetch, as every server route is. One flat shape
 * back, never a union: this project compiles without strictNullChecks, where
 * `if (!r.ok)` doesn't narrow. A refusal from the server carries its own
 * sentence; anything else reads as one plain sentence.
 */
import { authedFetch } from "../../lib/authed-fetch";
import type { AskResult } from "./ask";

export const ASK_FAILED = "The Academy couldn't be asked just now. Try again in a minute.";

export interface AskReply {
  /** Null when the question couldn't be answered; `error` then says why. */
  result: AskResult | null;
  error: string;
}

export async function askTheAcademy(question: string, signal?: AbortSignal): Promise<AskReply> {
  let res: Response;
  try {
    res = await authedFetch("/api/academy/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
      signal,
    });
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") throw e;
    return { result: null, error: ASK_FAILED };
  }
  let body: { result?: AskResult; error?: string } | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (res.ok && body?.result) return { result: body.result, error: "" };
  return { result: null, error: typeof body?.error === "string" && body.error ? body.error : ASK_FAILED };
}
