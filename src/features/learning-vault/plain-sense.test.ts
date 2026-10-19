import { describe, expect, it } from "vitest";
import { isPlainSense, PLAIN_SENSE_WORDS } from "./plain-sense";

/** True when the first `word` in `text` is read in its everyday sense. */
function plain(text: string, word: string): boolean {
  const at = text.toLowerCase().indexOf(word.toLowerCase());
  expect(at, `${word} in "${text}"`).toBeGreaterThanOrEqual(0);
  return isPlainSense(text.slice(at, at + word.length), text, at);
}

describe("plain sense: when a method word is just a word", () => {
  it("governs the six common words and nothing else", () => {
    expect([...PLAIN_SENSE_WORDS].sort()).toEqual(["continuous", "intent", "negative", "path", "positive", "purpose"]);
    expect(isPlainSense("Pace", "Pace feedback", 0)).toBe(false);
    expect(isPlainSense("End Stop", "End Stop benefits", 0)).toBe(false);
  });

  it("positive and negative: feedback and consequences are plain; a phase is the method's", () => {
    expect(plain("Positive feedback optional if done correctly.", "Positive")).toBe(true);
    expect(plain("offer simple positive reinforcement if correct", "positive")).toBe(true);
    expect(plain("influence human health in a positive way", "positive")).toBe(true);
    expect(plain("a host of potential negative consequences", "negative")).toBe(true);
    expect(plain("exercise is actually a negative because it threatens", "negative")).toBe(true);
    expect(plain("Target 6-second positive, 6-second negative reps", "positive")).toBe(false);
    expect(plain("the positive or concentric phase", "positive")).toBe(false);
    expect(plain("Slowly begin the negative.", "negative")).toBe(false);
    expect(plain("their positive effort", "positive")).toBe(false);
  });

  it("purpose: the 4th P has a capital; lower case, or a heading's \"Purpose of\", is plain", () => {
    expect(plain("For our purposes, force can be explained", "purposes")).toBe(true);
    expect(plain("The purpose of an end stop is to either prevent", "purpose")).toBe(true);
    expect(plain("Purpose of This Module", "Purpose")).toBe(true);
    expect(plain("The 4th and final P in our MSF Instructor cheat sheet is Purpose.", "Purpose")).toBe(false);
    expect(plain("Purpose is essentially addressing the question", "Purpose")).toBe(false);
    expect(plain("Intent (Purpose)", "Purpose")).toBe(false);
    // In a list of the P's it is always the method's, whatever its case.
    expect(plain("pieces on posture, pace, path, purpose, breathing and effort", "purpose")).toBe(false);
  });

  it("intent: \"the intent behind\", \"intent on\", \"with intent\" are plain; the trainee's intent is the method's", () => {
    expect(plain("The intent behind this strategy is", "intent")).toBe(true);
    expect(plain("through the studio doors intent on having a laser-like focus", "intent")).toBe(true);
    expect(plain("be able to listen with intent", "intent")).toBe(true);
    expect(plain("Our intent was to introduce one topic", "intent")).toBe(true);
    expect(plain("the trainee’s intent to move faster", "intent")).toBe(false);
    expect(plain("It doesn’t matter if you get the rep, that is not the intent.", "intent")).toBe(false);
    expect(plain("coach effort, intent, and execution", "intent")).toBe(false);
  });

  it("continuous: renewal and improvement are plain; a continuous turn or pace is the method's", () => {
    expect(plain("the continuous renewal of bone tissue", "continuous")).toBe(true);
    expect(plain("promoting continuous improvement", "continuous")).toBe(true);
    expect(plain("Be continuous at the bottom", "continuous")).toBe(false);
    expect(plain("One continuous pace throughout", "continuous")).toBe(false);
  });

  it("path: a career path, or a path to something, is plain; an arm's path is the method's", () => {
    expect(plain("creating meaningful career paths", "paths")).toBe(true);
    expect(plain("the most fruitful path to becoming a top level", "path")).toBe(true);
    expect(plain("execute the movements on a path toward mastery", "path")).toBe(true);
    expect(plain("consistent arm path throughout set", "path")).toBe(false);
    expect(plain("stay in the path of the machine", "path")).toBe(false);
    expect(plain("the path of least resistance", "path")).toBe(false);
  });

  it("only reads a neighbour across spaces, never across punctuation or a line", () => {
    expect(plain("Slowly begin the positive.\nFeedback comes later", "positive")).toBe(false);
    expect(plain("the positive, feedback", "positive")).toBe(false);
  });
});
