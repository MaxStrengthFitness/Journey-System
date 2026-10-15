import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { Client } from "../../../types";
import { CLIENT_PRONOUNS, agree, pronounsFor, type Pronouns } from "./pronouns";

const words = (p: Pronouns) => [p.subject, p.object, p.possessive, p.possessiveAlone, p.reflexive];

describe("pronounsFor: the pronoun follows the gender on the record (AJ, Oct 15 2026)", () => {
  it("is he for Male", () => {
    const p = pronounsFor({ gender: "Male" });
    expect(words(p)).toEqual(["he", "him", "his", "his", "himself"]);
    expect(p.plural).toBe(false);
  });

  it("is she for Female", () => {
    const p = pronounsFor({ gender: "Female" });
    expect(words(p)).toEqual(["she", "her", "her", "hers", "herself"]);
    expect(p.plural).toBe(false);
  });

  it("reads the gender trimmed and in any case, and the single letters", () => {
    for (const g of ["male", "MALE", " Male ", "M", "m", "\tmale\n"]) expect(pronounsFor({ gender: g }).subject, g).toBe("he");
    for (const g of ["female", "FEMALE", " Female ", "F", "f"]) expect(pronounsFor({ gender: g }).subject, g).toBe("she");
  });

  it("is they for anything else: blank, missing, null, Other, Mindbody's None, and words it doesn't know", () => {
    const unknown: unknown[] = [undefined, null, "", "   ", "Other", "Prefer not to say", "None", "Unknown", "Woman", "Man", "Fem", "Males", "M F", 1, true, {}];
    for (const gender of unknown) {
      expect(pronounsFor({ gender }), String(gender)).toBe(CLIENT_PRONOUNS);
    }
    expect(pronounsFor({})).toBe(CLIENT_PRONOUNS);
    expect(pronounsFor(null)).toBe(CLIENT_PRONOUNS);
    expect(pronounsFor(undefined)).toBe(CLIENT_PRONOUNS);
  });

  it("never guesses from a name: the first name is a word a sentence may use, never a gender", () => {
    const mary = { firstName: "Mary", lastName: "Smith", gender: undefined } as Partial<Client>;
    const john = { firstName: "John", gender: "" } as Partial<Client>;
    expect(pronounsFor(mary)).toBe(CLIENT_PRONOUNS);
    expect(pronounsFor(john)).toBe(CLIENT_PRONOUNS);
    // A whole client record is accepted as it is.
    expect(pronounsFor({ ...mary, gender: "Male" } as Partial<Client>).subject).toBe("he");
  });

  it("hands back one of three shared objects, so a memo keyed on it stays put", () => {
    expect(pronounsFor({ gender: "Male" })).toBe(pronounsFor({ gender: " m " }));
    expect(pronounsFor({ gender: "Female" })).toBe(pronounsFor({ gender: "F" }));
    expect(Object.isFrozen(pronounsFor({ gender: "Male" }))).toBe(true);
    expect(Object.isFrozen(pronounsFor({ gender: "Female" }))).toBe(true);
    expect(Object.isFrozen(CLIENT_PRONOUNS)).toBe(true);
  });
});

describe("CLIENT_PRONOUNS: the easier word when the gender isn't Male or Female", () => {
  it("is they, them, their", () => {
    expect(words(CLIENT_PRONOUNS)).toEqual(["they", "them", "their", "theirs", "themselves"]);
    expect(CLIENT_PRONOUNS.plural).toBe(true);
  });
});

describe("agree", () => {
  it("agrees the verb with the pronoun: singular for he and she, plural for they", () => {
    const he = pronounsFor({ gender: "Male" });
    const she = pronounsFor({ gender: "Female" });
    expect(`${CLIENT_PRONOUNS.subject} ${agree(CLIENT_PRONOUNS, "is", "are")}`).toBe("they are");
    expect(`${CLIENT_PRONOUNS.subject} ${agree(CLIENT_PRONOUNS, "says", "say")}`).toBe("they say");
    expect(`${he.subject} ${agree(he, "is", "are")}`).toBe("he is");
    expect(`${she.subject} ${agree(she, "says", "say")}`).toBe("she says");
  });
});

/*
 * ONE place turns a gender into a pronoun. Every other source file asks
 * `pronounsFor`; none holds he, she, him, his, her, hers, himself or herself
 * as a value of its own (a word chosen in code is a pronoun chosen in code).
 * Sentences may still say them through the kit, and comments, test names and
 * typed notes are not code.
 */
describe("the gender is read for a pronoun in one place", () => {
  const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const HOME = "features/client-codex/kit/pronouns.ts";
  /** Each with its reason. */
  const ALLOWED: Record<string, string> = {
    // The Directory's search drops "her" and "his" as filler from what a
    // person types into it: words read, never shown.
    "features/client-directory/tokens.ts": "search filler",
  };
  const GENDERED = /^(she|he|him|his|her|hers|herself|himself)$/i;

  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules") sourceFiles(p, out);
      } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !e.name.endsWith(".d.ts")) out.push(p);
    }
    return out;
  }

  function gendered(file: string): string[] {
    const text = readFileSync(file, "utf8");
    if (!/\b(she|he|him|his|her|hers|herself|himself)\b/i.test(text)) return [];
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const found: string[] = [];
    const visit = (node: ts.Node) => {
      if (
        (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) &&
        GENDERED.test(node.text.trim()) &&
        !ts.isImportDeclaration(node.parent) &&
        !ts.isExportDeclaration(node.parent)
      ) {
        found.push(`${node.text} (line ${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1})`);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return found;
  }

  it("no source file but pronouns.ts picks a gendered pronoun", { timeout: 60_000 }, () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file).replace(/\\/g, "/");
      if (rel === HOME || ALLOWED[rel]) continue;
      for (const hit of gendered(file)) offenders.push(`${rel}: ${hit}`);
    }
    expect(offenders, "ask pronounsFor(client) instead").toEqual([]);
  });

  it("pronouns.ts itself still holds them (the guard is looking at the right place)", () => {
    expect(gendered(join(SRC, HOME)).length).toBeGreaterThan(0);
  });
});
