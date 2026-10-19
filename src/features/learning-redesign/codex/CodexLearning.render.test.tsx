// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { LearningRef } from "../../learning/ref";
import type { LearningViewId } from "../../learning/LearningView";
import type { VaultViewer } from "../../learning-vault/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/*
 * The Tactical Codex, mounted whole, on the vault built the way useVaultData
 * builds it, from the real corpus (the Academy's JSON, imported here, which
 * a test may do): the real page builders, the real entity index and graph,
 * the real markup sandbox with the sample in it. Only the data hook itself
 * is stood in for (it would fetch the chunks one by one), with the floor
 * read as a short walking order. Nothing touches Firestore.
 */
vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("../../phone/device", () => ({ usePhone: () => false }));

vi.mock("../../learning-vault/useVaultData", async () => {
  const [cardsFile, cuesFile, glossaryFile, overviewsFile, scriptsFile] = await Promise.all([
    import("../../academy/content/cards.json"),
    import("../../academy/content/cues.json"),
    import("../../academy/content/glossary.json"),
    import("../../academy/content/overviews.json"),
    import("../../academy/content/scripts.json"),
  ]);
  const performance = await import("../../academy/content/performance.json");
  const mastery = await import("../../academy/content/mastery.json");
  const { buildAcademyMachines, machineName } = await import("../../academy/academy-machines");
  const { ACADEMY_INDEX } = await import("../../academy/useAcademyContent");
  const { EXERCISE_SUBSTITUTES, MACHINE_CATEGORY } = await import("../../routine-builder/academy");
  const { CLINICAL_FLAGS_MATRIX } = await import("../../../data/clinical-matrix");
  const { MACHINE_DEFINITIONS } = await import("../../../data/machine-definitions");
  const { buildEntityIndex } = await import("../../learning-vault/entities");
  const { buildVaultGraph } = await import("../../learning-vault/graph");
  const graphIndex = await import("../../learning-vault/graph-index.json");
  const { PILLARS, PLAYBOOKS, TRACKS } = await import("../../learning-vault/playbooks");
  const { questionBank } = await import("../../learning-vault/quiz/bank");

  const unwrap = <T,>(m: unknown): T => ((m as { default?: unknown }).default ?? m) as T;
  const glossary = unwrap<{ glossary: { term: string; definition: string }[] }>(glossaryFile).glossary;
  const cues = unwrap<{ cues: never[] }>(cuesFile).cues;
  const cards = unwrap<{ cards: never[] }>(cardsFile).cards;
  const scripts = unwrap<{ scripts: never[] }>(scriptsFile).scripts;
  const overviews = unwrap<{ overviews: never[] }>(overviewsFile).overviews;
  const machines = buildAcademyMachines(cards, scripts, overviews);
  const names = (id: string) => machineName(id) ?? id;
  const entities = buildEntityIndex({
    glossary,
    machines,
    clinical: CLINICAL_FLAGS_MATRIX,
    playbooks: PLAYBOOKS,
    modules: ACADEMY_INDEX.modules,
  });
  const graph = buildVaultGraph({
    index: ACADEMY_INDEX,
    machines,
    glossary,
    cues,
    clinical: CLINICAL_FLAGS_MATRIX,
    playbooks: PLAYBOOKS,
    graphIndex: unwrap(graphIndex),
    substitutes: EXERCISE_SUBSTITUTES,
    categories: MACHINE_CATEGORY,
  });
  const quizBank = questionBank({ glossary, cues, scripts, cards, defs: MACHINE_DEFINITIONS, names, playbooks: PLAYBOOKS });
  const DATA = {
    index: ACADEMY_INDEX,
    machines,
    defs: MACHINE_DEFINITIONS,
    floor: [
      { id: "m-leg-press", name: "Leg Press", code: "LP" },
      { id: "m-chest-press", name: "Chest Press", code: "CP" },
      { id: "m-compound-row", name: "Compound Row", code: "CR" },
    ],
    floorState: "ready",
    names,
    glossary,
    cues,
    cards,
    scripts,
    overviews,
    modules: { performance: unwrap(performance), mastery: unwrap(mastery) },
    loadModule: () => {},
    moduleFailed: () => false,
    retryModule: () => {},
    cachedModule: () => null,
    entities,
    graph,
    playbooks: PLAYBOOKS,
    tracks: TRACKS,
    pillars: PILLARS,
    quizBank,
  };
  return { useVaultData: () => DATA };
});

import CodexLearning from "./CodexLearning";
import { UnsavedChangesProvider } from "../../unsaved-changes";
import { createSandboxStore } from "../../learning-vault/markup-store";
import { sampleSeed } from "../../learning-vault/sample";
import { VaultProvider } from "../../learning-vault/ui/VaultProvider";
import { forgetPersonalMemory } from "../../sign-out/memory";

const STUDIO = { id: "studio-solon", name: "Solon" };
const LEADER: VaultViewer = { uid: "u-1", name: "Sam Lee", canStrike: true, canNote: true, isHeadOffice: false };

let host: HTMLDivElement;
let root: Root;
const handled = vi.fn();
const sectionChanges = vi.fn();

function app(props: { section: LearningViewId; jump?: LearningRef | null; viewer?: VaultViewer; resetSignal?: number }) {
  const store = createSandboxStore(sampleSeed(STUDIO, new Date("2026-10-19T12:00:00Z")));
  return (
    <UnsavedChangesProvider>
      <VaultProvider store={store} studio={STUDIO} viewer={props.viewer ?? LEADER}>
        <CodexLearning
          section={props.section}
          onSection={sectionChanges}
          machines={[]}
          studioId={STUDIO.id}
          studioName={STUDIO.name}
          jump={props.jump ?? null}
          onJumpHandled={handled}
          resetSignal={props.resetSignal}
        />
      </VaultProvider>
    </UnsavedChangesProvider>
  );
}

async function mount(props: Parameters<typeof app>[0]) {
  await act(async () => root.render(app(props)));
  // The trail's first push (a jump) lands in an effect.
  await act(async () => {});
}

const text = () => host.textContent ?? "";
const title = () => host.querySelector(".cdx__title")?.textContent ?? "";
const all = <T extends Element = HTMLElement>(sel: string) => Array.from(host.querySelectorAll<T>(sel)) as T[];

async function click(el: Element | null | undefined) {
  if (!el) throw new Error("nothing to click");
  await act(async () => (el as HTMLElement).click());
}

function button(words: string, scope: ParentNode = host): HTMLButtonElement | undefined {
  return Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find((b) => (b.textContent ?? "").trim() === words);
}

function crumb(words: string): HTMLButtonElement | undefined {
  return all<HTMLButtonElement>(".wk__crumb").find((b) => b.textContent === words);
}

beforeEach(() => {
  forgetPersonalMemory();
  handled.mockReset();
  sectionChanges.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("the Tactical Codex", () => {
  it("walks home, a machine in its tiers, a topic in its tiers, and back", async () => {
    await mount({ section: "learning" });

    // Home: paths first, the floor in walking order, the method, play.
    expect(text()).toContain("Life Transformer 101");
    expect(all(".cdx__mtile").map((t) => t.textContent)).toEqual(["01LPLeg Press", "02CPChest Press", "03CRCompound Row"]);
    expect(all(".cdx__chapter")).toHaveLength(13);
    expect(button("Quick ten")).toBeTruthy();
    // Not head office: no queue's door.
    expect(text()).not.toContain("Waiting for review");

    // A machine from the floor.
    await click(all(".cdx__mtile")[0]);
    expect(title()).toBe("LEG PRESS");
    const tabs = all<HTMLButtonElement>('[role="tab"]');
    expect(tabs.map((t) => t.textContent)).toEqual(["1Floor glance", "2Script & cues", "3Adapt & clinical", "4Deep science"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    // The bento: facts, the Academy's pieces as doors, the dials.
    expect(text()).toContain("A gradual load-up");
    expect(button("Quick card")).toBeTruthy();
    // The sample's crossed-out line shows, crossed out, with its reason (decision 2).
    expect(text()).toContain("Our Abduction comes after the Leg Press");

    // Tier 2: the script and the rep scrubber.
    await click(tabs[1]);
    expect(all<HTMLButtonElement>('[role="tab"]')[1].getAttribute("aria-selected")).toBe("true");
    expect(host.querySelector(".cdx__rep")).toBeTruthy();

    // The door one layer deeper.
    await click(host.querySelector(".cdx__deeper"));
    expect(all<HTMLButtonElement>('[role="tab"]')[2].getAttribute("aria-selected")).toBe("true");

    // Peek the quick card: the machine stays under it.
    await click(button("Quick card"));
    expect(document.querySelector(".vtp")).toBeTruthy();
    expect(title()).toBe("LEG PRESS");
    await click(document.querySelector('[aria-label="Close the peek"]'));
    expect(document.querySelector(".vtp")).toBeNull();

    // Back to the Overview by its crumb, then the method's chapter 4.
    await click(crumb("Overview"));
    expect(text()).toContain("Life Transformer 101");
    const chapter4 = all(".cdx__chapter").find((c) => c.textContent?.includes("Exercise Performance"));
    await click(chapter4);
    expect(title()).toBe("Exercise Performance");

    // A topic, in its layers.
    const topic = all(".cdx__chapter").find((c) => c.textContent?.includes("Gradual Load-up"));
    await click(topic);
    expect(title()).toBe("Gradual Load-up");
    const topicTabs = all<HTMLButtonElement>('[role="tab"]').map((t) => t.textContent);
    expect(topicTabs[0]).toBe("1In one minute");
    expect(topicTabs[topicTabs.length - 1]).toBe("4Full text");
    await click(all('[role="tab"]').find((t) => t.textContent === "4Full text"));
    expect(text()).toContain("To illustrate this gradual load-up");

    // And back, one level at a time.
    await click(host.querySelector('[aria-label^="Back to"]'));
    expect(title()).toBe("Exercise Performance");
    await click(crumb("Overview"));
    expect(text()).toContain("Paths");
  });

  it("opens a page asked for from outside, and says it was handled", async () => {
    await mount({ section: "machine-anatomy", jump: { kind: "machine", id: "m-leg-press" } });
    expect(handled).toHaveBeenCalled();
    expect(title()).toBe("LEG PRESS");
    expect(crumb("Catalog")).toBeTruthy();
  });

  it("puts the Catalog's floor first, in walking order", async () => {
    await mount({ section: "machine-anatomy" });
    expect(title()).toBe("Solon's floor");
    const names = all(".cdx__entries .cdx__entry-name").map((n) => n.textContent);
    expect(names.slice(0, 3)).toEqual(["Leg Press", "Chest Press", "Compound Row"]);
    expect(text()).toContain("Not on Solon's floor");
  });

  it("opens a glossary word as its own entry, and the whole list from it", async () => {
    await mount({ section: "academy", jump: { kind: "academy-glossary", id: "Concentric" } });
    expect(title()).toBe("Concentric");
    await click(button("Every word in the glossary"));
    expect(title()).toBe("Glossary");
    expect(all(".cdx__word").length).toBeGreaterThan(40);
  });

  it("tells a reader calmly when a page has moved", async () => {
    await mount({ section: "academy", jump: { kind: "academy-topic", id: "no-such-topic" } });
    expect(text()).toContain("This page has moved");
    await click(button("Back"));
    expect(title()).toBe("The method");
  });

  it("shows head office its queue's door, and the queue", async () => {
    await mount({ section: "learning", viewer: { ...LEADER, isHeadOffice: true } });
    const door = host.querySelector(".cdx__ho");
    expect(door?.textContent).toContain("Waiting for review");
    await click(door);
    expect(text()).toContain("Lines studios cross out");
  });

  it("asks before a tier switch takes a half-written note away", async () => {
    await mount({ section: "machine-anatomy", jump: { kind: "machine", id: "m-leg-press" } });
    const tabs = () => all<HTMLButtonElement>('[role="tab"]');
    // A line in tier 1, its note form open, a few words typed.
    await click(host.querySelector(".cdx__tierpanel [data-vta-line]"));
    await click(button("Note for Solon"));
    const area = host.querySelector<HTMLTextAreaElement>(".cdx__tierpanel textarea");
    expect(area).toBeTruthy();
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      set?.call(area, "Say this before the plates touch.");
      area?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Tier 2 asks first; "Keep editing" leaves everything where it was.
    await click(tabs()[1]);
    expect(document.querySelector('[role="alertdialog"]')).toBeTruthy();
    await click(document.querySelector('[data-action="keep-editing"]'));
    expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
    expect(host.querySelector<HTMLTextAreaElement>(".cdx__tierpanel textarea")?.value).toBe("Say this before the plates touch.");

    // Asked again and left: tier 2.
    await click(tabs()[1]);
    await click(document.querySelector('[data-action="leave"]'));
    expect(tabs()[1].getAttribute("aria-selected")).toBe("true");
  });

  it("goes back to the section's front page when the reset signal changes (the title, the section again)", async () => {
    await mount({ section: "learning", resetSignal: 0 });
    await click(all(".cdx__mtile")[1]);
    expect(title()).toBe("CHEST PRESS");
    // The same value again asks for nothing.
    await act(async () => root.render(app({ section: "learning", resetSignal: 0 })));
    expect(title()).toBe("CHEST PRESS");
    await act(async () => root.render(app({ section: "learning", resetSignal: 1 })));
    expect(all(".cdx__mtile")).toHaveLength(3);
    expect(text()).toContain("Life Transformer 101");
  });

  it("starts a new trail when the masthead changes section", async () => {
    await mount({ section: "learning" });
    await click(all(".cdx__mtile")[1]);
    expect(title()).toBe("CHEST PRESS");
    await act(async () => root.render(app({ section: "academy" })));
    expect(title()).toBe("The method");
  });
});
