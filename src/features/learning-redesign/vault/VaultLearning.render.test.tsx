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
    useAcademyGlossary: () => glossary.glossary,
    useAcademyCues: () => cues.cues,
    useAcademyCards: () => cards.cards,
    useAcademyScripts: () => scripts.scripts,
    useAcademyOverviews: () => overviews.overviews,
    loadAcademyModule: (id: string) =>
      modules[id] ? Promise.resolve(modules[id]) : Promise.reject(new Error(`${id} is not in this test`)),
    cachedAcademyModule: (id: string) => modules[id] ?? null,
  };
});

import { UnsavedChangesProvider } from "../../unsaved-changes";
import { WikiSectionsProvider, type WikiSectionsValue } from "../../wiki";
import { createSandboxStore } from "../../learning-vault/markup-store";
import { VaultProvider } from "../../learning-vault/ui/VaultProvider";
import type { VaultViewer } from "../../learning-vault/types";
import VaultLearning, { rootFor } from "./VaultLearning";
import { orderedSections } from "./screens";
import { focusedSections } from "./PeekPage";

const VIEWER: VaultViewer = { uid: "u-sam", name: "Sam Lee", canStrike: true, canNote: true, isHeadOffice: false };

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  fx.floor = "ready";
  fx.phone = false;
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
        <VaultProvider store={createSandboxStore()} studio={{ id: "solon", name: "Solon" }} viewer={VIEWER}>
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

  it("draws the version switch in the page on a phone", async () => {
    fx.phone = true;
    await mount("machine-anatomy", { kind: "machine", id: "m-leg-press" });
    expect(host.querySelector(".vm__toggle-row")?.textContent).toContain("MSF original");
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
