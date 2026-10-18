/**
 * THE USING JOURNEY SHELF STAYS READABLE (AJ, Oct 18 2026: "1a 2a 3b").
 *
 * Every page in docs/using-journey/ is held here to its shape: a header, one
 * question, the screens it covers (which must exist), floor words with no
 * code in them, and a length a trainer reads standing up.
 *
 * What this test deliberately does NOT do (AJ's 3b): fail a round because a
 * screen changed and its page didn't, or because an approved page's words
 * changed since he approved them. Those are reminders, printed by
 * `npx tsx scripts/using-journey-check.ts` at each wrap-up. The app (later)
 * shows only pages whose words are still the ones AJ approved.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MAX_WORDS, MIN_WORDS, codeWords, fingerprint, isApprovedAsWritten, readPage, wordCount } from "./shelf";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SHELF = join(ROOT, "docs", "using-journey");
const files = readdirSync(SHELF).filter((f) => f.endsWith(".md") && f !== "README.md");

describe("readPage", () => {
  const page = (header: string, body = "Some words.") => `---\n${header}\n---\n${body}`;

  it("reads a draft's header and body", () => {
    const { page: p, problems } = readPage(
      page("title: The Wrap-up\nquestion: What do I do while I walk them out?\ncovers: src/components/WrapUpScreen.tsx\nstatus: draft\napproved:"),
    );
    expect(problems).toEqual([]);
    expect(p?.header).toMatchObject({ title: "The Wrap-up", status: "draft", covers: ["src/components/WrapUpScreen.tsx"] });
    expect(p?.body).toBe("Some words.");
  });

  it("reads Windows line ends the same", () => {
    const text = page("title: A\nquestion: B?\ncovers: src\nstatus: draft").replace(/\n/g, "\r\n");
    expect(readPage(text).problems).toEqual([]);
  });

  it("refuses a page with no header, a question with no question mark, or an unknown status", () => {
    expect(readPage("Just words").problems).toEqual(["no header: a page starts with a --- block"]);
    expect(readPage(page("title: A\nquestion: B\ncovers: src\nstatus: draft")).problems).toContain(
      "the question doesn't end with a question mark",
    );
    expect(readPage(page("title: A\nquestion: B?\ncovers: src\nstatus: live")).problems).toContain(
      'status is "live", not draft or approved',
    );
  });

  it("needs a date and a fingerprint for an approved page", () => {
    expect(readPage(page("title: A\nquestion: B?\ncovers: src\nstatus: approved")).problems).toContain(
      "approved, but with no date and fingerprint",
    );
    const ok = readPage(page("title: A\nquestion: B?\ncovers: src\nstatus: approved\napproved: 2026-10-20 · 0a1b2c3d"));
    expect(ok.page?.header).toMatchObject({ approvedOn: "2026-10-20", approvedPrint: "0a1b2c3d" });
  });
});

describe("codeWords", () => {
  it("finds code marks, file names, code-style names and builder words", () => {
    expect(codeWords("Tap `Finish`.")).toContain("`");
    expect(codeWords("See src/features/briefing for more.")).toContain("src/features/briefing");
    expect(codeWords("It lives in WrapUpScreen.tsx.")).toContain("WrapUpScreen.tsx");
    expect(codeWords("The heldSetup keeps it.")).toContain("heldSetup");
    expect(codeWords("A note_category is set.")).toContain("note_category");
    expect(codeWords("It saves to Firestore.")).toContain("Firestore");
  });

  it("leaves floor words alone", () => {
    expect(codeWords("Hand the iPad over. Today / Coming up. Left some in the tank. A Committed package.")).toEqual([]);
  });
});

describe("fingerprint", () => {
  it("ignores line ends and trailing space, and changes with a word", () => {
    expect(fingerprint("One\r\nTwo  \n")).toBe(fingerprint("One\nTwo"));
    expect(fingerprint("One two")).not.toBe(fingerprint("One three"));
    expect(fingerprint("x")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("counts a page as approved only while its words are the approved ones", () => {
    const body = "The words AJ read.";
    const header = { title: "A", question: "B?", covers: ["src"], status: "approved" as const, approvedPrint: fingerprint(body) };
    expect(isApprovedAsWritten({ header, body })).toBe(true);
    expect(isApprovedAsWritten({ header, body: body + " And one more." })).toBe(false);
    expect(isApprovedAsWritten({ header: { ...header, status: "draft" }, body })).toBe(false);
  });
});

describe("the pages on the shelf", () => {
  it("has pages", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  const titles: string[] = [];
  for (const file of files) {
    describe(file, () => {
      const { page, problems } = readPage(readFileSync(join(SHELF, file), "utf8"));
      if (page) titles.push(page.header.title);

      it("has a readable header", () => {
        expect(problems).toEqual([]);
      });

      it("covers screens that exist", () => {
        const missing = (page?.header.covers ?? []).filter((c) => !existsSync(join(ROOT, c)));
        expect(missing, "a page names the folders of the screens it describes; one has moved or gone").toEqual([]);
      });

      it(`runs ${MIN_WORDS} to ${MAX_WORDS} words`, () => {
        const n = wordCount(page?.body ?? "");
        expect(n, "a page is read standing up on the floor").toBeGreaterThanOrEqual(MIN_WORDS);
        expect(n).toBeLessThanOrEqual(MAX_WORDS);
      });

      it("is in floor words, with no code in it", () => {
        expect(codeWords(page?.body ?? ""), "say it the way the screen says it").toEqual([]);
      });
    });
  }

  it("gives every page its own title", () => {
    expect(titles.filter((t, i) => titles.indexOf(t) !== i)).toEqual([]);
  });
});
