// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { LearningRef } from "../../learning/ref";
import type { LearningViewId } from "../../learning/LearningView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/*
 * Design 2 mounted whole, on the Academy's REAL words: the reference chunks
 * and the module prose are the generated JSON, handed over at once instead
 * of fetched (gaps.md §1), so the entity index, the graph, the pages and the
 * quiz bank are all the real ones. Only the outside world is stood in for:
 * Firebase (nothing here may reach it), the studio's floor (two machines in
 * walking order) and the phone check.
 */

const fx = vi.hoisted(() => ({
  floor: "ready" as "loading" | "ready" | "empty" | "unreadable",
  phone: false,
  /** The reference chunks cannot arrive (offline): the hooks never land and the loader fails. */
  refsFail: false,
}));

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("../../phone/device", () => ({ usePhone: () => fx.phone, isPhoneNow: () => fx.phone }));

vi.mock("../../catalog/useCatalogMachines", () => ({
  useCatalogMachines: () => ({
    machines:
      fx.floor === "ready"
        ? [
            { id: "m-leg-press", name: "Leg Press" },
            { id: "m-chest-press", name: "Chest Press" },
          ]
        : [],
    source: "roster",
    makers: {},
    loading: fx.floor === "loading",
    floor: fx.floor,
  }),
}));

vi.mock("../../academy/useAcademyContent", async () => {
  const actual = await vi.importActual<typeof import("../../academy/useAcademyContent")>("../../academy/useAcademyContent");
  const glossary = (await import("../../academy/content/glossary.json")).default as unknown as { glossary: unknown[] };
  const cues = (await import("../../academy/content/cues.json")).default as unknown as { cues: unknown[] };
  const cards = (await import("../../academy/content/cards.json")).default as unknown as { cards: unknown[] };
  const scripts = (await import("../../academy/content/scripts.json")).default as unknown as { scripts: unknown[] };
  const overviews = (await import("../../academy/content/overviews.json")).default as unknown as { overviews: unknown[] };
  const modules: Record<string, unknown> = {
    "intro": (await import("../../academy/content/intro.json")).default,
    "benefits": (await import("../../academy/content/benefits.json")).default,
    "principles": (await import("../../academy/content/principles.json")).default,
    "performance": (await import("../../academy/content/performance.json")).default,
    "continuous-tension": (await import("../../academy/content/continuous-tension.json")).default,
    "programming": (await import("../../academy/content/programming.json")).default,
    "variations": (await import("../../academy/content/variations.json")).default,
    "equipment": (await import("../../academy/content/equipment.json")).default,
    "instruction": (await import("../../academy/content/instruction.json")).default,
    "mastery": (await import("../../academy/content/mastery.json")).default,
    "consultation": (await import("../../academy/content/consultation.json")).default,
    "further": (await import("../../academy/content/further.json")).default,
    "summary": (await import("../../academy/content/summary.json")).default,
  };
  return {
    ...actual,
    useAcademyGlossary: () => (fx.refsFail ? null : glossary.glossary),
    useAcademyCues: () => (fx.refsFail ? null : cues.cues),
    useAcademyCards: () => (fx.refsFail ? null : cards.cards),
    useAcademyScripts: () => (fx.refsFail ? null : scripts.scripts),
    useAcademyOverviews: () => (fx.refsFail ? null : overviews.overviews),
    loadAcademyReference: (name: Parameters<typeof actual.loadAcademyReference>[0]) =>
      fx.refsFail ? Promise.reject(new Error("offline")) : actual.loadAcademyReference(name),
    loadAcademyModule: (id: string) =>
      modules[id] ? Promise.resolve(modules[id]) : Promise.reject(new Error(`${id} is not in this test`)),
    cachedAcademyModule: (id: string) => modules[id] ?? null,
  };
});

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { UnsavedChangesProvider } from "../../unsaved-changes";
import { WikiSectionsProvider, type WikiSectionsValue } from "../../wiki";
import { createSandboxStore, type MarkupStore } from "../../learning-vault/markup-store";
import { sampleSeed } from "../../learning-vault/sample";
import { VaultProvider } from "../../learning-vault/ui/VaultProvider";
import type { VaultViewer } from "../../learning-vault/types";
import VaultLearning, { peeksOnSheet, rootFor } from "./VaultLearning";
import { startState } from "./RumorMap";
import { CARD_LINKS } from "./map-model";
import { orderedSections } from "./screens";
import { focusedSections } from "./PeekPage";
import { NO_EXPLORE } from "./shell";

const VIEWER: VaultViewer = { uid: "u-sam", name: "Sam Lee", canStrike: true, canNote: true, isHeadOffice: false };

let host: HTMLDivElement;
let root: Root;
/** The store the next mount uses: empty, unless a test seeds it. */
let store: MarkupStore;

beforeEach(() => {
  fx.floor = "ready";
  fx.phone = false;
  fx.refsFail = false;
  store = createSandboxStore();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

function Shell({ section, children }: { section: LearningViewId; children: ReactNode }) {
  const sections: WikiSectionsValue = {
    title: "Learning",
    sections: [
      { id: "learning", label: "Overview" },
      { id: "machine-anatomy", label: "Catalog" },
      { id: "academy", label: "Academy" },
    ],
    active: section,
    onSelect: () => {},
  };
  return (
    <UnsavedChangesProvider>
      <WikiSectionsProvider value={sections}>
        <VaultProvider store={store} studio={{ id: "solon", name: "Solon" }} viewer={VIEWER}>
          {children}
        </VaultProvider>
      </WikiSectionsProvider>
    </UnsavedChangesProvider>
  );
}

async function mount(section: LearningViewId, jump: LearningRef | null = null, onJumpHandled = () => {}, resetSignal?: number) {
  await act(async () => {
    root.render(
      <Shell section={section}>
        <VaultLearning
          section={section}
          onSection={() => {}}
          machines={[]}
          studioId="solon"
          studioName="Solon"
          jump={jump}
          onJumpHandled={onJumpHandled}
          resetSignal={resetSignal}
        />
      </Shell>,
    );
  });
  await settle();
}

/** Lets the module promises and the effects they set off finish. */
async function settle() {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function tap(el: Element | null | undefined) {
  expect(el, "something to tap").toBeTruthy();
  await act(async () => (el as HTMLElement).click());
  await settle();
}

function button(words: string | RegExp): HTMLButtonElement | null {
  const all = [...document.querySelectorAll("button")];
  return (
    all.find((b) => (typeof words === "string" ? b.textContent?.trim() === words || b.getAttribute("aria-label") === words : words.test(b.textContent ?? ""))) ??
    null
  ) as HTMLButtonElement | null;
}

const title = () => host.querySelector("h1")?.textContent ?? "";

describe("the Living Vault", () => {
  it("opens the Overview on the map, with its ways in beneath", async () => {
    await mount("learning");
    expect(host.querySelectorAll(".vm__node").length).toBeGreaterThan(20);
    // Every map has a list: the switch is there, and the list names the same stars.
    await tap(button("List"));
    expect(host.querySelectorAll(".vm__list-row").length).toBeGreaterThan(100);
    expect(host.textContent).toContain("Reading paths");
    expect(button("Quick ten")).toBeTruthy();
    // Head office's door is head office's alone.
    expect(button("Open the list")).toBeNull();
  });

  it("walks home → a star → its machine page → a topic it peeks → back", async () => {
    await mount("learning");
    const start = host.querySelector(".vm__start .vm__pill");
    const name = start?.textContent?.trim() ?? "";
    await tap(start);
    // The card under the map: the star, why things connect to it, the doors.
    const card = host.querySelector(".vm__focus");
    expect(card?.textContent).toContain(name);
    expect(card?.querySelectorAll(".vm__why").length).toBeGreaterThan(0);

    await tap(button(/Open page/));
    expect(title()).toBe(name);
    expect(host.querySelector('[data-annotate="gutter"]')).toBeTruthy();
    // The page's own constellation: real buttons, each saying why.
    const topicLink = [...host.querySelectorAll(".vm__mini-node")].find((b) => /Academy topic/.test(b.getAttribute("aria-label") ?? ""));
    expect(topicLink).toBeTruthy();

    // A cross-link peeks: the machine page stays.
    await tap(topicLink);
    const peekTitle = document.querySelector(".vtp__title")?.textContent ?? "";
    expect(peekTitle).not.toBe("");
    expect(document.querySelector(".vtp [data-vta-line]")).toBeTruthy();
    expect(title()).toBe(name);

    // Open full page: the topic, on top of the trail.
    await tap(button(/Open full page/));
    expect(document.querySelector(".vtp")).toBeNull();
    expect(title()).toBe(peekTitle);

    // Back, and back again.
    await tap(host.querySelector(`button[aria-label="Back to ${name}"]`));
    expect(title()).toBe(name);
    await tap(host.querySelector('button[aria-label="Back to Overview"]'));
    expect(host.querySelector(".vm__explore")).toBeTruthy();
  });

  it("opens a page from outside (a jump) on top of its section, and hands it back", async () => {
    const handled = vi.fn();
    await mount("academy", { kind: "academy-topic", id: "performance-gradual-load-up" }, handled);
    expect(handled).toHaveBeenCalledTimes(1);
    expect(title()).toMatch(/Gradual load/i);
    // The Academy's own crumb is the way back.
    expect(host.querySelector('button[aria-label="Back to Academy"]')).toBeTruthy();
    // The version switch rides the masthead's second row.
    expect(button("MSF original")).toBeTruthy();
  });

  it("goes back to the section's front page when the reset signal changes, the peek let go", async () => {
    const stay = () => {};
    await mount("learning", null, stay, 0);
    const start = host.querySelector(".vm__start .vm__pill");
    const name = start?.textContent?.trim() ?? "";
    await tap(start);
    await tap(button(/Open page/));
    expect(title()).toBe(name);
    const link = host.querySelector(".vm__mini-node");
    await tap(link);
    expect(document.querySelector(".vtp")).toBeTruthy();
    // The same value again asks for nothing.
    await mount("learning", null, stay, 0);
    expect(title()).toBe(name);
    await mount("learning", null, stay, 1);
    expect(host.querySelector(".vm__explore")).toBeTruthy();
    expect(document.querySelector(".vtp")).toBeNull();
  });

  it("says a page has moved, calmly, with a way back", async () => {
    await mount("machine-anatomy", { kind: "machine", id: "m-not-a-machine" });
    expect(host.textContent).toContain("This page has moved.");
    await tap(button("Back to Catalog"));
    expect(title()).toBe("Solon's floor");
  });

  it("puts the studio's floor first in the Catalog, the map one tap away", async () => {
    await mount("machine-anatomy");
    expect(title()).toBe("Solon's floor");
    const rows = [...host.querySelectorAll(".vm__floor:not(.vm__floor--quiet) .vm__floor-name")].map((n) => n.textContent);
    expect(rows).toEqual(["Leg Press", "Chest Press"]);
    expect(host.textContent).toContain("Not on Solon's floor");
    await tap(button("Map"));
    expect(host.querySelectorAll(".vm__node").length).toBeGreaterThan(5);
    // Not on the floor: drawn hollow.
    expect(host.querySelectorAll('.vm__node[data-hollow]').length).toBeGreaterThan(0);
  });

  it("says when the floor cannot be read, and still lists every MSF machine", async () => {
    fx.floor = "unreadable";
    await mount("machine-anatomy");
    expect(host.textContent).toContain("Can't read Solon's floor right now.");
    expect(host.querySelectorAll(".vm__floor--quiet .vm__floor-row").length).toBeGreaterThan(10);
  });

  it("lists the Academy's modules and opens the quiz from it", async () => {
    await mount("academy");
    expect(host.querySelectorAll(".vm__module").length).toBe(13);
    expect(host.textContent).toContain("Life Transformer playbooks");
    await tap(button(/Every deck/));
    expect(document.querySelector(".qz, [class^='qz__']")).toBeTruthy();
  });

  it("draws the version switch in the page on a phone, and the body without a gutter", async () => {
    fx.phone = true;
    await mount("machine-anatomy", { kind: "machine", id: "m-leg-press" });
    expect(host.querySelector(".vm__toggle-row")?.textContent).toContain("MSF original");
    expect(host.querySelector('.vm__body[data-annotate="inline"] .vta[data-annotate="inline"]')).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ *
 * The review's fixes (Oct 19 2026)
 * ------------------------------------------------------------------ */

const texts = (selector: string, within: ParentNode = document) =>
  [...within.querySelectorAll(selector)].map((n) => n.textContent?.trim() ?? "");

describe("the Living Vault, after the review", () => {
  it("names on the map only the stars its card lists", async () => {
    await mount("learning");
    await tap(host.querySelector(".vm__start .vm__pill"));
    const pills = new Set(texts(".vm__focus .vm__pill-label"));
    expect(pills.size).toBeGreaterThan(0);
    const named = texts(".vm__label:not([data-big]) .vm__label-text", host);
    expect(named.length).toBeGreaterThan(0);
    expect(named.length).toBeLessThanOrEqual(CARD_LINKS);
    for (const n of named) expect(pills.has(n), `"${n}" is named on the map but not in the card`).toBe(true);
  });

  it("puts a keyboard reader's place on Start with when the card closes, not back at the top", async () => {
    await mount("learning");
    await tap(host.querySelector(".vm__start .vm__pill"));
    const close = button("Close the card");
    close?.focus();
    await tap(close);
    expect(host.querySelector(".vm__focus")).toBeNull();
    expect(document.activeElement?.textContent).toBe("Start with");
  });

  it("opens a phone on the list, the map one tap away", async () => {
    fx.phone = true;
    await mount("learning");
    expect(host.querySelectorAll(".vm__list-row").length).toBeGreaterThan(100);
    expect(host.querySelector(".vm__node")).toBeNull();
    await tap(button("Map"));
    expect(host.querySelectorAll(".vm__node").length).toBeGreaterThan(5);
  });

  it("starts where the reader left it, else on a map page's focus, else the list on a phone", () => {
    const left = { ...NO_EXPLORE, mode: "map" as const, focus: "machine:m-leg-press" };
    expect(startState(left, { initialFocus: null, phone: true })).toBe(left);
    expect(startState(NO_EXPLORE, { initialFocus: "cue:3", phone: true })).toEqual({ ...NO_EXPLORE, focus: "cue:3" });
    expect(startState(NO_EXPLORE, { initialFocus: null, phone: true }).mode).toBe("list");
    expect(startState(NO_EXPLORE, { initialFocus: null, phone: false })).toBe(NO_EXPLORE);
  });

  it("tags each machine on the floor in its own category's colour, not the push orange", async () => {
    await mount("machine-anatomy");
    const tags = [...host.querySelectorAll<HTMLElement>(".vm__floor:not(.vm__floor--quiet) .vm__code")].map((t) =>
      t.style.getPropertyValue("--wk-accent-fill"),
    );
    expect(tags).toHaveLength(2);
    for (const t of tags) expect(t).not.toBe("");
    // Leg Press (legs) and Chest Press (push) are not the same colour.
    expect(tags[0]).not.toBe(tags[1]);
  });

  it("draws the orbit's Map door the same on every page, never in the page's colour", async () => {
    await mount("machine-anatomy", { kind: "machine", id: "m-leg-press" });
    const centre = host.querySelector<HTMLElement>(".vm__mini-centre");
    expect(centre).toBeTruthy();
    expect(centre?.style.getPropertyValue("--vm-text")).toBe("");
    expect(centre?.style.getPropertyValue("--vm-c")).toBe("");
  });

  it("says each link once on a machine page: Linked here leaves out what the orbit draws", async () => {
    await mount("machine-anatomy", { kind: "machine", id: "m-leg-press" });
    const orbit = new Set(texts(".vm__mini-name", host));
    expect(orbit.size).toBeGreaterThan(0);
    for (const t of texts(".vm__backlinks .vm__row-title", host)) expect(orbit.has(t), `"${t}" is in the orbit and in Linked here`).toBe(false);
  });

  it("leaves a machine's spoken script and deep dive to their peeks", async () => {
    await mount("machine-anatomy", { kind: "machine", id: "m-leg-press" });
    const body = host.querySelector(".vm__body") as HTMLElement;
    const heads = texts("h2, h3", body);
    expect(heads).toContain("Stop");
    expect(heads).not.toContain("Deep dive");
    const alongside = texts(".vm__related .vm__row-title", host);
    expect(alongside).toEqual(expect.arrayContaining(["Full spoken script", "Deep dive"]));
    // They peek: the machine page stays.
    await tap(button(/Deep dive/));
    expect(document.querySelector(".vtp")).toBeTruthy();
    expect(title()).toBe("LEG PRESS");
  });

  it("draws the gutter only on the studio's version; the MSF original reads at the page's edge", async () => {
    await mount("machine-anatomy", { kind: "machine", id: "m-leg-press" });
    expect(host.querySelector('.vm__body[data-annotate="gutter"] .vta[data-annotate="gutter"]')).toBeTruthy();
    await tap(button("MSF original"));
    expect(host.querySelector('.vm__body[data-annotate="inline"] .vta[data-annotate="inline"]')).toBeTruthy();
    expect(host.querySelector('[data-annotate="gutter"]')).toBeNull();
  });

  it("gives the glossary a row of letters that jump inside the page's one scroller", async () => {
    const scrolled = vi.fn();
    const was = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = scrolled as unknown as typeof HTMLElement.prototype.scrollTo;
    try {
      await mount("academy", { kind: "academy-glossary" });
      const letters = [...host.querySelectorAll(".vm__letter-btn")];
      expect(letters.length).toBeGreaterThan(10);
      expect(letters[0].textContent).toBe("A");
      await tap(button("Words under P"));
      expect(scrolled).toHaveBeenCalled();
    } finally {
      HTMLElement.prototype.scrollTo = was;
    }
  });

  it("does not say a path's who twice", async () => {
    await mount("learning");
    const card = [...host.querySelectorAll(".vm__track")].find((b) => b.querySelector(".vm__track-title")?.textContent === "For a head trainer");
    expect(card).toBeTruthy();
    expect(card?.querySelector(".vm__track-who")).toBeNull();
    const first = [...host.querySelectorAll(".vm__track")].find((b) => b.querySelector(".vm__track-title")?.textContent === "Life Transformer 101");
    expect(first?.querySelector(".vm__track-who")?.textContent).toBe("A new Life Transformer");
    await tap(card);
    expect(title()).toBe("For a head trainer");
    expect(host.querySelector(".wk__lede")).toBeNull();
  });

  it("opens a quiz from Read alongside as the quiz, never a peek that says the page moved", async () => {
    await mount("academy", { kind: "academy-cueing" });
    await tap(button(/What would you say\?/));
    expect(host.textContent).not.toContain("This page has moved");
    expect(document.querySelector(".vtp")).toBeNull();
    expect(document.querySelector("[class^='qz__']")).toBeTruthy();
  });

  it("peeks pages, paths and a focused map; opens anything else", () => {
    expect(peeksOnSheet({ kind: "machine", id: "m-leg-press" })).toBe(true);
    expect(peeksOnSheet({ kind: "track", id: "lt-101" })).toBe(true);
    expect(peeksOnSheet({ kind: "map", focus: "cue:3" })).toBe(true);
    expect(peeksOnSheet({ kind: "map" })).toBe(false);
    expect(peeksOnSheet({ kind: "quiz", deck: "cues" })).toBe(false);
    expect(peeksOnSheet({ kind: "home" })).toBe(false);
  });

  it("peeks one cue moment without calling the studio's other marks on the phrasebook lines that changed", async () => {
    store = createSandboxStore(sampleSeed({ id: "solon", name: "Solon" }, new Date("2026-10-19T12:00:00Z")));
    await mount("machine-anatomy", { kind: "machine", id: "m-leg-press" });
    const moment = [...host.querySelectorAll(".vm__mini-node")].find((b) => /cue moment/.test(b.getAttribute("aria-label") ?? ""));
    expect(moment).toBeTruthy();
    await tap(moment);
    const peek = document.querySelector(".vtp");
    expect(peek).toBeTruthy();
    expect(peek?.querySelector("[data-vta-line]")).toBeTruthy();
    // Solon's "Stoic" strike is on another moment: it is not a line that changed.
    expect(peek?.querySelector('[data-testid="orphan-mark"]')).toBeNull();
    expect(peek?.textContent).not.toContain("Lines that changed");
  });

  it("says a reference chunk that cannot arrive didn't load, with Try again, on the map, a page and the quiz", async () => {
    fx.refsFail = true;
    await mount("learning");
    expect(host.textContent).toContain("This part of the Academy didn't load.");
    expect(button("Try again")).toBeTruthy();
    expect(host.textContent).not.toContain("Drawing the map");

    await mount("machine-anatomy", { kind: "machine", id: "m-leg-press" });
    expect(host.textContent).toContain("This part of the Academy didn't load.");

    // The reader's tap asks again; once the chunks arrive, the page draws.
    fx.refsFail = false;
    await tap(button("Try again"));
    expect(title()).toBe("LEG PRESS");
  });

  it("says when one of the studio's own machines can't open because the floor can't be read", async () => {
    fx.floor = "unreadable";
    await mount("machine-anatomy", { kind: "machine", id: "sm-solon-hip-sled" });
    expect(host.textContent).toContain("Can't read Solon's floor right now.");
    expect(host.querySelector(".vm__gone")).toBeTruthy();
    await tap(button("Back to Catalog"));
    expect(title()).toBe("Solon's floor");
  });

  it("keeps the peek when the reader keeps editing the page under it", async () => {
    await mount("machine-anatomy", { kind: "machine", id: "m-leg-press" });
    // Typing on the page: a note under its first line.
    await tap(host.querySelector(".vm__body [data-vta-line]"));
    await tap(button(/^Note for Solon/));
    const box = host.querySelector(".vm__body textarea") as HTMLTextAreaElement | null;
    expect(box).toBeTruthy();
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      set?.call(box, "Our stack is loud.");
      box!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
    // A peek, then Open full page: the question, and Keep editing keeps both.
    await tap(host.querySelector(".vm__mini-node"));
    const peekTitle = document.querySelector(".vtp__title")?.textContent ?? "";
    expect(peekTitle).not.toBe("");
    await tap(button(/Open full page/));
    const keep = button(/Keep editing/);
    expect(keep, "the leave question").toBeTruthy();
    await tap(keep);
    expect(title()).toBe("LEG PRESS");
    expect(document.querySelector(".vtp__title")?.textContent).toBe(peekTitle);
    expect((host.querySelector(".vm__body textarea") as HTMLTextAreaElement | null)?.value).toBe("Our stack is loud.");
  });
});

describe("the Vault's stylesheet, after the review", () => {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "vault-map.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = (selector: string) => {
    const at = css.split("}").find((r) => r.split("{")[0].split(",").map((s) => s.trim()).includes(selector));
    return at ? at.split("{")[1] : "";
  };

  it("draws every stop on a path the same (no filled first stop that reads as progress)", () => {
    expect(css).not.toMatch(/\.vm__track-dot:first-child/);
    expect(css).not.toMatch(/\.vm__path-step:first-child/);
  });

  it("balances the lines of every map and orbit label", () => {
    for (const s of [".vm__label", ".vm__label-sub", ".vm__mini-name", ".vm__mini-why"]) {
      expect(rule(s), s).toMatch(/text-wrap:\s*balance/);
    }
  });

  it("colours a code tag by its category and the orbit's door blue", () => {
    expect(rule(".vm__code")).toMatch(/background:\s*var\(--wk-accent-fill/);
    expect(rule(".vm__code")).not.toMatch(/cat-push/);
    expect(rule(".vm__mini-centre")).toMatch(/color:\s*var\(--wk-live-text\)/);
  });

  it("lays the playbooks' pillars in one column on an upright iPad", () => {
    expect(rule(".vm__pillars")).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
  });
});

describe("where a term's page starts", () => {
  const sections = [
    { id: "letter-a", title: "A", blocks: [{ key: "b-1", kind: "line" as const, text: "the first", label: "Add-ons" }] },
    {
      id: "letter-p",
      title: "P",
      blocks: [
        { key: "b-2", kind: "line" as const, text: "speed of a rep", label: "Pace" },
        { key: "b-3", kind: "line" as const, text: "why", label: "Purpose" },
      ],
    },
  ];

  it("puts the term's own line first and keeps every other line once", () => {
    const out = orderedSections({ kind: "glossary", term: "pace" }, sections);
    expect(out[0].blocks.map((b) => b.key)).toEqual(["b-2"]);
    expect(out[0].blocks[0].label).toBeUndefined();
    expect(out.flatMap((s) => s.blocks.map((b) => b.key)).sort()).toEqual(["b-1", "b-2", "b-3"]);
  });

  it("leaves the glossary as it is with no term, or a term it does not have", () => {
    expect(orderedSections({ kind: "glossary" }, sections)).toBe(sections);
    expect(orderedSections({ kind: "glossary", term: "nope" }, sections)).toBe(sections);
  });

  it("peeks one term, not the whole glossary", () => {
    expect(focusedSections({ kind: "glossary", term: "Purpose" }, { sections }).flatMap((s) => s.blocks.map((b) => b.key))).toEqual(["b-3"]);
  });

  it("starts each section at its own root", () => {
    expect(rootFor("learning")).toEqual({ kind: "home" });
    expect(rootFor("machine-anatomy")).toEqual({ kind: "catalog" });
    expect(rootFor("academy")).toEqual({ kind: "academy" });
  });
});
