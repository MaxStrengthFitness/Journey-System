import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VaultViewer } from "../learning-vault/types";
import {
  DESIGNS,
  DESIGN_KEY,
  SECTION_LABEL,
  VIEW_AS,
  designById,
  mayPickPrototypes,
  naturalViewAs,
  shownDesign,
  parseDesign,
  parseViewAs,
  rememberDesign,
  rememberedDesign,
  viewerFor,
} from "./design";

/** A localStorage that keeps its words in a Map, or throws on every call. */
function fakeStorage(throws = false) {
  const words = new Map<string, string>();
  const no = () => {
    throw new Error("storage is blocked");
  };
  return {
    words,
    storage: {
      getItem: throws ? no : (k: string) => words.get(k) ?? null,
      setItem: throws ? no : (k: string, v: string) => void words.set(k, v),
      removeItem: throws ? no : (k: string) => void words.delete(k),
      clear: () => words.clear(),
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the designs on the prototype bar", () => {
  it("are the Mix (id still codex), then today's Learning", () => {
    expect(DESIGNS.map((d) => [d.id, d.number, d.label])).toEqual([
      ["codex", null, "Mix"],
      ["current", null, "Current"],
    ]);
  });

  it("each has a full name, and designById finds it", () => {
    for (const d of DESIGNS) {
      expect(d.name.length).toBeGreaterThan(3);
      expect(designById(d.id)).toBe(d);
    }
  });

  it("reads a design id only when it is one", () => {
    expect(parseDesign("codex")).toBe("codex");
    expect(parseDesign("current")).toBe("current");
    // The two designs AJ did not pick: an iPad that remembered one opens on Current.
    expect(parseDesign("vault")).toBeNull();
    expect(parseDesign("course")).toBeNull();
    expect(parseDesign("Codex")).toBeNull();
    expect(parseDesign("")).toBeNull();
    expect(parseDesign(null)).toBeNull();
    expect(parseDesign(2)).toBeNull();
  });
});

describe("the remembered design", () => {
  let fake: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    fake = fakeStorage();
    vi.stubGlobal("localStorage", fake.storage);
  });

  it("is null when nothing was picked on this iPad", () => {
    expect(rememberedDesign()).toBeNull();
  });

  it("comes back as it was picked, under its own key", () => {
    rememberDesign("codex");
    expect(fake.words.get(DESIGN_KEY)).toBe("codex");
    expect(rememberedDesign()).toBe("codex");
    rememberDesign("current");
    expect(rememberedDesign()).toBe("current");
  });

  it("ignores words that are not a design", () => {
    fake.words.set(DESIGN_KEY, "the old one");
    expect(rememberedDesign()).toBeNull();
  });

  it("never throws when storage is blocked: nothing is remembered", () => {
    vi.stubGlobal("localStorage", fakeStorage(true).storage);
    expect(() => rememberDesign("codex")).not.toThrow();
    expect(rememberedDesign()).toBeNull();
  });

  it("never throws when there is no storage at all", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => rememberDesign("codex")).not.toThrow();
    expect(rememberedDesign()).toBeNull();
  });
});

describe("who may pick a prototype (review fix, Oct 19 2026)", () => {
  it("an administrator or the founder, or anyone on a development build; never a trainer on production", () => {
    expect(mayPickPrototypes({ isAdmin: true, dev: false })).toBe(true);
    expect(mayPickPrototypes({ isAdmin: false, dev: true })).toBe(true);
    expect(mayPickPrototypes({ isAdmin: false, dev: false })).toBe(false);
    expect(mayPickPrototypes({ isAdmin: null })).toBe(false);
  });

  it("shows someone who may not today's Learning, whatever was picked or remembered; anyone else their pick", () => {
    expect(shownDesign(false, "codex")).toBe("current");
    expect(shownDesign(true, "codex")).toBe("codex");
    expect(shownDesign(true, "current")).toBe("current");
  });
});

describe("View as", () => {
  const real: VaultViewer = { uid: "uid-sam", name: "Sam Lee", canStrike: false, canNote: true, isHeadOffice: false };

  it("offers a trainer, a leader and head office, in that order", () => {
    expect(VIEW_AS.map((v) => v.label)).toEqual(["Trainer", "Leader", "Head office"]);
    expect(parseViewAs("head-office")).toBe("head-office");
    expect(parseViewAs("admin")).toBeNull();
  });

  it("keeps the real viewer when nobody picked", () => {
    expect(viewerFor(real, null)).toBe(real);
  });

  it("changes only what the viewer may do; the uid and the name stay real", () => {
    const leader = viewerFor(real, "leader");
    expect(leader).toEqual({ uid: "uid-sam", name: "Sam Lee", canStrike: true, canNote: true, isHeadOffice: false });
    const office = viewerFor(real, "head-office");
    expect(office).toEqual({ uid: "uid-sam", name: "Sam Lee", canStrike: true, canNote: true, isHeadOffice: true });
    const trainer = viewerFor({ ...real, canStrike: true, isHeadOffice: true }, "trainer");
    expect(trainer).toEqual({ uid: "uid-sam", name: "Sam Lee", canStrike: false, canNote: true, isHeadOffice: false });
  });

  it("shows the real viewer's own role as picked until someone picks", () => {
    expect(naturalViewAs(real)).toBe("trainer");
    expect(naturalViewAs({ canStrike: true, isHeadOffice: false })).toBe("leader");
    expect(naturalViewAs({ canStrike: true, isHeadOffice: true })).toBe("head-office");
  });
});

describe("the masthead's sections", () => {
  it("names each the way the masthead does", () => {
    expect(SECTION_LABEL).toEqual({ learning: "Overview", "machine-anatomy": "Catalog", academy: "Academy" });
  });
});
