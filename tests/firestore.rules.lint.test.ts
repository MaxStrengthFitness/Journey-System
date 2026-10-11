/**
 * A STRUCTURAL LINT FOR `firestore.rules`, WITH NO EMULATOR.
 *
 * `npm run test:rules` is the real check, and it stays the real check. But it
 * needs a JDK and a download from storage.googleapis.com, so it does not run
 * everywhere the rest of the suite runs — which means a rules file can be
 * edited, typechecked, built, committed and pushed without anything once
 * looking at it. This closes the cheapest part of that gap: it cannot tell
 * you a rule is WRONG, only that the file is still a file.
 *
 * Added during the Demo Mode round (Sep 20 2026), after editing six helpers
 * in a 2,700-line security file that no test in reach could compile.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripRulesComments } from "./rules-source";

const SOURCE = readFileSync(resolve(__dirname, "../firestore.rules"), "utf8");

/** The file with comments and string literals removed, for counting. */
function stripped(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const two = text.slice(i, i + 2);
    if (two === "//") {
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }
    if (two === "/*") {
      i += 2;
      while (i < text.length && text.slice(i, i + 2) !== "*/") i += 1;
      i += 2;
      continue;
    }
    const ch = text[i];
    if (ch === "'" || ch === '"') {
      i += 1;
      while (i < text.length && text[i] !== ch) i += text[i] === "\\" ? 2 : 1;
      i += 1;
      out += "''";
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

const CODE = stripped(SOURCE);

/** Everything the rules language gives you for free. */
const BUILT_INS = new Set([
  "exists", "get", "getAfter", "existsAfter", "debug", "int", "float",
  "string", "bool", "duration", "timestamp", "math", "hashing", "latlng",
  "path", "request", "resource", "keys", "values", "size", "hasAll",
  "hasAny", "hasOnly", "matches", "lower", "upper", "trim", "split",
  "toUtf8", "toBase64", "diff", "affectedKeys", "removedKeys", "addedKeys",
  "changedKeys", "unchangedKeys", "toMillis", "date", "time", "year",
  "month", "day", "hours", "minutes", "seconds", "nanos", "dayOfWeek",
  "toSet", "difference", "union", "intersection", "abs", "ceil", "floor",
  "round", "isEqual", "is_string", "value", "replace", "toDate",
]);

/** Language keywords that are followed by "(" and are not calls. */
const KEYWORDS = new Set(["return", "if", "function", "allow", "match"]);

describe("firestore.rules stays syntactically whole", () => {
  it("balances every brace", () => {
    const open = (CODE.match(/\{/g) || []).length;
    const close = (CODE.match(/\}/g) || []).length;
    expect({ open, close }).toEqual({ open: close, close });
  });

  it("balances every parenthesis", () => {
    const open = (CODE.match(/\(/g) || []).length;
    const close = (CODE.match(/\)/g) || []).length;
    expect({ open, close }).toEqual({ open: close, close });
  });

  it("never goes negative on either, which a stray closer would", () => {
    let braces = 0;
    let parens = 0;
    for (const ch of CODE) {
      if (ch === "{") braces += 1;
      else if (ch === "}") braces -= 1;
      else if (ch === "(") parens += 1;
      else if (ch === ")") parens -= 1;
      expect(braces).toBeGreaterThanOrEqual(0);
      expect(parens).toBeGreaterThanOrEqual(0);
    }
  });

  it("calls no function it does not define", () => {
    const defined = new Set(
      [...CODE.matchAll(/function\s+(\w+)\s*\(/g)].map((m) => m[1]),
    );
    const called = new Set(
      [...CODE.matchAll(/(?<![\w.])(\w+)\s*\(/g)].map((m) => m[1]),
    );
    const unknown = [...called].filter(
      (name) => !defined.has(name) && !BUILT_INS.has(name) && !KEYWORDS.has(name),
    );
    expect(unknown).toEqual([]);
  });

  it("opens with the version and the global deny", () => {
    expect(SOURCE.trimStart().startsWith("rules_version = '2';")).toBe(true);
    expect(CODE).toContain("allow read, write: if false;");
  });

  it("names the demo studio exactly where it is meant to", () => {
    // The id is a literal on purpose (a lookup would cost a read on every
    // rule that asks). If somebody renames it, this says so loudly rather
    // than the demo quietly losing its access.
    expect(SOURCE).toContain("function isDemoStudioId(studioId)");
    expect(SOURCE).toContain("function hasRunOfDemo(studioId)");
    expect(SOURCE).toContain("function isDemoTrainerPayload(trainerId, data)");
    expect(SOURCE.match(/'demo-studio'/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});

/**
 * Firebase refuses a rules source over 256 KiB, and a compiled ruleset over
 * 250 KB (which can't be measured here). The file reached 255,229 bytes in the
 * franchise partition; the studio map round (phase 0, Oct 10 2026) moved its
 * long comments into docs/ops/RULES-NOTES.md. These keep it well short of both.
 */
describe("firestore.rules stays under Firebase's size limits", () => {
  it("is at most 240 KiB as written", () => {
    expect(
      Buffer.byteLength(SOURCE),
      "firestore.rules is near Firebase's 256 KiB source limit; move comments to docs/ops/RULES-NOTES.md",
    ).toBeLessThanOrEqual(245_760);
  });

  it("is at most 150,000 bytes of code, comments taken out and strings kept", () => {
    expect(
      Buffer.byteLength(stripRulesComments(SOURCE)),
      "firestore.rules' code (comments taken out) is over 150,000 bytes, heading for Firebase's 250 KB compiled limit; moving comments won't help here, fold repeated conditions into a helper before adding more",
    ).toBeLessThanOrEqual(150_000);
  });

  it("points every moved comment at a note that exists", () => {
    const notes = readFileSync(resolve(__dirname, "../docs/ops/RULES-NOTES.md"), "utf8");
    const anchors = new Set([...notes.matchAll(/<a id="([a-z0-9-]+)"><\/a>/g)].map((m) => m[1]));
    const pointers = [...SOURCE.matchAll(/\/\/ Why: docs\/ops\/RULES-NOTES\.md#([a-z0-9-]+)/g)].map((m) => m[1]);
    expect(pointers.length).toBeGreaterThan(0);
    expect(pointers.filter((a) => !anchors.has(a))).toEqual([]);
  });
});

/**
 * THE STUDIO MAP (Oct 2026): a machine's size, on its model and on its unit.
 * The roster's create and update resolve the caller once (rosterLeaderOnce):
 * the old helper pair ran out of the 1,000-expression budget on real writes
 * (the round's review measured it), so it must not come back into that rule.
 */
describe("the studio map's sizes", () => {
  it("defines the size checks and the once-resolved roster leader", () => {
    for (const mark of ["function sizeMmOk(", "function modelSizeValid(", "function rosterUnitSizeOk(", "function rosterLeaderOnce("]) {
      expect(SOURCE, mark).toContain(mark);
    }
  });

  it("asks the roster's create and update with the once-resolved leader, never the old helper pair", () => {
    const roster = /match \/roster\/\{machineId\} \{([\s\S]*?)\n {6}\}/.exec(SOURCE);
    expect(roster).toBeTruthy();
    const write = /allow create, update:([\s\S]*?);/.exec(stripped(roster![1]));
    expect(write).toBeTruthy();
    expect(write![1]).toContain("rosterUnitSizeOk()");
    expect(write![1]).toContain("rosterLeaderOnce(studioId)");
    expect(write![1]).not.toContain("isStudioOwnerOrHeadTrainer");
    expect(write![1]).not.toContain("isSuperAdmin");
  });

  it("holds a size's lengths to the model editor's limits", async () => {
    const { MODEL_LIMITS } = await import("../src/features/machine-codex/models");
    const body = /function sizeMmOk\(v\) \{\s*return ([^;]+);/.exec(SOURCE);
    expect(body?.[1]).toBe(`v is number && v >= ${MODEL_LIMITS.sizeMinMm} && v <= ${MODEL_LIMITS.sizeMaxMm}`);
    const model = /function modelSizeValid\(s\) \{([\s\S]*?)\n {4}\}/.exec(SOURCE)?.[1] ?? "";
    expect(model).toContain(`s.source.size() <= ${MODEL_LIMITS.sizeSource}`);
    expect(model).toContain(`s.get('note', '').size() <= ${MODEL_LIMITS.sizeNote}`);
  });
});
