import { describe, expect, it } from "vitest";
import { ANSWER_MODEL, costOf } from "./models";

describe("costOf", () => {
  it("prices input and output per million tokens", () => {
    expect(costOf("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(4);
    expect(costOf("claude-sonnet-5-5", { input_tokens: 10_000, output_tokens: 2_000 })).toBeCloseTo(0.04);
  });

  it("charges a cache write at 1.25 times input and a cache read at its own price", () => {
    expect(costOf("claude-haiku-5-5", { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000 })).toBeCloseTo(0.125);
    expect(costOf("claude-opus-5-5", { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 })).toBeCloseTo(0.2);
  });

  it("never calls an unknown model free", () => {
    expect(costOf("claude-opus-4-8", { input_tokens: 10, output_tokens: 10 })).toBeNull();
  });
});

describe("the answer model", () => {
  it("is Sonnet 5.5, AJ's pick from the blind trial", () => {
    expect(ANSWER_MODEL).toBe("claude-sonnet-5-5");
  });
});
