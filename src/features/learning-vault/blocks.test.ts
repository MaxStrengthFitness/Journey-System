import { describe, expect, it } from "vitest";
import { blockKeyFor, normaliseWords, toVaultBlocks, vaultSection } from "./blocks";

const LINK_ID = /^[A-Za-z0-9_-]{1,64}$/;

describe("normaliseWords", () => {
  it("lower-cases and collapses whitespace", () => {
    expect(normaliseWords("  Barely   touch,\n barely START  ")).toBe("barely touch, barely start");
  });

  it("strips quote marks and punctuation at the ends, never inside", () => {
    expect(normaliseWords("\u201CBarely touch, barely start.\u201D")).toBe("barely touch, barely start");
    expect(normaliseWords('"Seamlessly change direction"')).toBe("seamlessly change direction");
    expect(normaliseWords("*\"ease out... do not speed up\"*")).toBe("ease out... do not speed up");
    expect(normaliseWords("(Mmm-Hmm)")).toBe("mmm-hmm");
  });

  it("straightens curly apostrophes inside the words", () => {
    expect(normaliseWords("Don\u2019t speed up.")).toBe(normaliseWords("Don't speed up"));
  });

  it("treats a non-breaking space as a space", () => {
    expect(normaliseWords("Keep\u00A0the same pace.")).toBe("keep the same pace");
  });

  it("answers empty for nothing", () => {
    expect(normaliseWords("")).toBe("");
    expect(normaliseWords("  ...  ")).toBe("");
    expect(normaliseWords(undefined as unknown as string)).toBe("");
  });
});

describe("blockKeyFor", () => {
  it("is b- and eight lower-case hex digits, and passes the link id check", () => {
    const key = blockKeyFor("Consider doing ABD prior to LP to pre-fatigue glutes and improve sensation of glute engagement.");
    expect(key).toMatch(/^b-[0-9a-f]{8}$/);
    expect(key).toMatch(LINK_ID);
    expect(blockKeyFor("")).toMatch(/^b-[0-9a-f]{8}$/);
  });

  it("is made from the words, so a re-cased or re-punctuated line keeps its key", () => {
    expect(blockKeyFor("Barely touch, barely start")).toBe(blockKeyFor("\u201Cbarely touch, barely start.\u201D"));
    expect(blockKeyFor("Crawl")).toBe(blockKeyFor("  CRAWL "));
  });

  it("changes when the words change", () => {
    expect(blockKeyFor("Barely touch, barely start")).not.toBe(blockKeyFor("Barely touch, then start"));
    expect(blockKeyFor("Crawl")).not.toBe(blockKeyFor("Crawl out of the bottom"));
  });

  it("is the same every run (no randomness)", () => {
    // FNV-1a 32 of "" is its offset basis.
    expect(blockKeyFor("")).toBe("b-811c9dc5");
    expect(blockKeyFor("a")).toBe("b-e40c292c");
  });
});

describe("toVaultBlocks", () => {
  it("maps the corpus's kinds onto the vault's", () => {
    const blocks = toVaultBlocks([
      { kind: "heading", text: "Load Up" },
      { kind: "subheading", text: "Why" },
      { kind: "body", text: "A paragraph." },
      { kind: "para", text: "A studio paragraph." },
      { kind: "bullet", text: "A bullet." },
      { kind: "mystery", text: "Something new." },
    ]);
    expect(blocks.map((b) => b.kind)).toEqual(["heading", "subheading", "para", "para", "bullet", "para"]);
  });

  it("keeps the vault's own kinds", () => {
    const blocks = toVaultBlocks([
      { kind: "cue", text: "Crawl" },
      { kind: "said", text: "Slowly begin" },
      { kind: "do", text: "Click at the end stop." },
      { kind: "line", text: "Knee Replacement" },
    ]);
    expect(blocks.map((b) => b.kind)).toEqual(["cue", "said", "do", "line"]);
  });

  it("keys every block by its words, trims them, and drops a block with none", () => {
    const blocks = toVaultBlocks([
      { kind: "body", text: "  Gradually load up.  " },
      { kind: "body", text: "   " },
      { kind: "body", text: "" },
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({ key: blockKeyFor("Gradually load up."), kind: "para", text: "Gradually load up." });
  });

  it("says where the words come from only when told", () => {
    expect(toVaultBlocks([{ kind: "body", text: "x y z" }])[0]).not.toHaveProperty("source");
    expect(toVaultBlocks([{ kind: "body", text: "x y z" }], { source: "Academy 4.3 Gradual Load-up" })[0].source).toBe(
      "Academy 4.3 Gradual Load-up",
    );
  });
});

describe("vaultSection", () => {
  it("has no note key without a note", () => {
    expect(vaultSection("setup", "Set up", [])).toEqual({ id: "setup", title: "Set up", blocks: [] });
    expect(vaultSection("setup", "Set up", [], "  ")).not.toHaveProperty("note");
    expect(vaultSection("setup", "Set up", [], "Setup guide").note).toBe("Setup guide");
  });
});
