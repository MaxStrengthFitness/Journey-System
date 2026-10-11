/**
 * The comments-only stripper behind the proof that moving the rules' long
 * comments into docs/ops/RULES-NOTES.md moved no rule (the studio map
 * round, phase 0, Oct 10 2026).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { firstCodeDifference, rulesCodeOf, stripRulesComments } from "./rules-source";

describe("stripRulesComments", () => {
  it("takes out a line comment and keeps the code before it", () => {
    expect(stripRulesComments("allow read: if true; // anyone\n")).toBe("allow read: if true; \n");
  });

  it("takes out a block comment and keeps its line breaks", () => {
    expect(stripRulesComments("a\n/* one\n   two */\nb")).toBe("a\n\n\nb");
  });

  it("keeps a // inside a string", () => {
    const src = "return d.url.matches('^https://[a-z]+$'); // a link\n";
    expect(stripRulesComments(src)).toBe("return d.url.matches('^https://[a-z]+$'); \n");
  });

  it("keeps a /* inside a string, and the quotes and escapes as written", () => {
    const src = `return d.note.matches('/*x') && d.s == "a\\"b"; /* gone */`;
    expect(stripRulesComments(src)).toBe(`return d.note.matches('/*x') && d.s == "a\\"b"; `);
  });

  it("ignores a quote inside a comment", () => {
    expect(stripRulesComments("// AJ's rule\nx;")).toBe("\nx;");
  });
});

describe("the proof", () => {
  const before = [
    "    // A long note about why the rule is the way it is,",
    "    // which goes on for a while",
    "    // and then some more.",
    "    function isLeader(r) {",
    "      return r in ['StudioLeader', 'HeadTrainer']; // the two",
    "    }",
  ].join("\n");

  it("finds no difference when only a comment moved", () => {
    const after = before.replace(/^( {4}\/\/.*\n){3}/, "    // Why: docs/ops/RULES-NOTES.md#isleader\n");
    expect(after).not.toBe(before);
    expect(firstCodeDifference(before, after)).toBeNull();
    expect(rulesCodeOf(after)).toBe(rulesCodeOf(before));
  });

  it("fails when a string changes by one character", () => {
    const after = before.replace("'HeadTrainer'", "'HeadTrainr'");
    expect(firstCodeDifference(before, after)).toEqual({
      line: 2,
      before: "      return r in ['StudioLeader', 'HeadTrainer']; ",
      after: "      return r in ['StudioLeader', 'HeadTrainr']; ",
    });
  });

  it("fails when code changes outside a string", () => {
    expect(firstCodeDifference(before, before.replace("isLeader(r)", "isLeader(r, t)"))).not.toBeNull();
  });

  it("reads the real rules file into code with no comment left in it", () => {
    const code = rulesCodeOf(readFileSync(resolve(__dirname, "../firestore.rules"), "utf8"));
    expect(code.startsWith("rules_version = '2';")).toBe(true);
    expect(code).not.toContain("Why: docs/ops/RULES-NOTES.md");
    expect(code.split("\n").every((line) => line.trim() !== "")).toBe(true);
  });
});
