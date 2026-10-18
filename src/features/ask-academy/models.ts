/**
 * Which Claude model does what, and what a request cost.
 *
 * Picking runs on Haiku 5.5: it reads a list of titles and returns ids. The
 * answer's model is AJ's choice, made in the trial (phase 0) from Opus 5.5 and
 * Sonnet 5.5 read side by side without knowing which is which.
 *
 * Prices are Anthropic's list prices in dollars per million tokens, as of Oct
 * 2026. Thinking is billed as output. Haiku's cache-read price is an estimate
 * (a tenth of input, as on the other models); it is a fraction of a cent here.
 */

export const PICK_MODEL = "claude-haiku-5-5";

export const ANSWER_MODELS = {
  opus: "claude-opus-5-5",
  sonnet: "claude-sonnet-5-5",
} as const;

export type AnswerModelKey = keyof typeof ANSWER_MODELS;

/**
 * The model that answers in the app. AJ, Oct 18 2026, after grading the blind
 * trial (Sonnet better 8, Opus better 4, the same 28): "the answered ones
 * pass, use Sonnet 5.5". It is also about half the price and faster.
 */
export const ANSWER_MODEL = ANSWER_MODELS.sonnet;

interface Price {
  input: number;
  output: number;
  cacheRead: number;
}

/** Dollars per million tokens. Haiku 5.5's is the price for a prompt under 100K tokens, which every pick is. */
export const PRICES: Record<string, Price> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
};

/** A cache write costs 1.25 times input at the five-minute lifetime. */
export const CACHE_WRITE_FACTOR = 1.25;

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/**
 * What one request cost in dollars, by the model that actually served it (a
 * refusal fallback can hand the request to another model). Null when the model
 * has no price here: an unknown is never shown as free.
 */
export function costOf(model: string, usage: TokenUsage): number | null {
  const price = PRICES[model];
  if (!price) return null;
  const written = usage.cache_creation_input_tokens ?? 0;
  const read = usage.cache_read_input_tokens ?? 0;
  return (
    (usage.input_tokens * price.input +
      written * price.input * CACHE_WRITE_FACTOR +
      read * price.cacheRead +
      usage.output_tokens * price.output) /
    1_000_000
  );
}
