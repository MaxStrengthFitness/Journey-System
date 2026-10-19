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
/** A test that wants a phone, or the vault in a state other than all-here, says so on the global (reset before each test). */
type TestKnobs = { __codexPhone?: boolean; __codexData?: Record<string, unknown> | null };
const knobs = globalThis as TestKnobs;
vi.mock("../../phone/device", () => ({ usePhone: () => Boolean((globalThis as TestKnobs).__codexPhone) }));

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
  // One object per override, so a page's memo of the data holds between renders.
  let merged: unknown = DATA;
  let mergedFor: unknown = null;
  return {
    useVaultData: () => {
      const over = (globalThis as TestKnobs).__codexData ?? null;
      if (over !== mergedFor) {
        mergedFor = over;
        merged = over ? { ...DATA, ...over } : DATA;
      }
      return merged;
    },
  };
});

import CodexLearning from "./CodexLearning";
import { UnsavedChangesProvider } from "../../unsaved-changes";
import { createSandboxStore } from "../../learning-vault/markup-store";
import { sampleSeed } from "../../learning-vault/sample";
import { VaultProvider } from "../../learning-vault/ui/VaultProvider";
import { forgetPersonalMemory } from "../../sign-out/memory";
import { LINE_HINT_KEY, resetLineHint } from "../../learning-vault/ui/line-hint";

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
  knobs.__codexPhone = false;
  knobs.__codexData = null;
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
    // Numbered by place on the bar: never 1 · 2 · 4.
    expect(topicTabs.map((t) => t?.charAt(0))).toEqual(topicTabs.map((_, i) => String(i + 1)));
    expect(topicTabs[topicTabs.length - 1]).toBe(`${topicTabs.length}Full text`);
    await click(all('[role="tab"]').find((t) => t.textContent?.endsWith("Full text")));
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

  it("shows head office its queue's door, and the queue, saying the same counts in the same words", async () => {
    await mount({ section: "learning", viewer: { ...LEADER, isHeadOffice: true } });
    const door = host.querySelector(".cdx__ho");
    expect(door?.textContent).toContain("Waiting for review");
    const said = host.querySelector(".cdx__ho-sub")?.textContent ?? "";
    expect(said).not.toBe("");
    await click(door);
    expect(text()).toContain("Lines studios cross out");
    // One tap later the queue's own first line is the door's line, word for word.
    expect(host.querySelector(".vtq__lead")?.textContent).toBe(said);
    expect(title()).toBe("Waiting for review");
  });

  it("names a machine's quick card by the piece, in the peek, the trail and the page", async () => {
    await mount({ section: "machine-anatomy", jump: { kind: "machine", id: "m-leg-press" } });
    await click(button("Quick card"));
    expect(document.querySelector(".vtp__title")?.textContent).toBe("Quick card · LEG PRESS");
    // The peek's head says which piece of which machine: no eyebrow saying it again.
    expect(document.querySelector(".vtp .cdx__peek-eyebrow")).toBeNull();
    await click(button("Open full page"));
    expect(title()).toBe("Quick card");
    // Right after its machine in the trail, the crumb is the piece alone.
    expect(all(".wk__crumb").map((c) => c.textContent)).toEqual(["Catalog", "LEG PRESS", "Quick card"]);
    expect(host.querySelector(".cdx__head .cdx__eyebrow--machine")?.textContent).toBe("LPLEG PRESS");
  });

  it("says the bento's facts once, and the substitutes one way only: what stands in if this machine can't be used", async () => {
    await mount({ section: "machine-anatomy", jump: { kind: "machine", id: "m-leg-press" } });
    // "Lower Body" is the eyebrow: the facts do not say "Workout: Lower Body" again.
    expect(host.querySelector('[data-fact="Workout"]')).toBeNull();
    expect(host.querySelector('[data-fact="Begins with"]')?.textContent).toContain("A gradual load-up");
    // Connected answers the floor's question only: never the sets the Leg Press helps replace another.
    const heads = all(".cdx__tile--links .vtg__head").map((h) => h.textContent);
    expect(heads).toContain("In sets that replace it");
    expect(heads.some((h) => /^(Can replace|Part of a set)/.test(h ?? ""))).toBe(false);
    // No singular "it can replace this one" over another set's cards.
    expect(text()).not.toContain("it can replace this one");
    // A reason Read next's links share names their whole set, and the cards under it say none of their own.
    for (const why of all(".cdx__next-why")) {
      expect(why.textContent).toMatch(/^If LEG PRESS can't be used: .+ \+ .+\.$/);
      expect(why.closest(".cdx__next-group")?.querySelectorAll(".cdx__link-why").length).toBe(0);
    }
    // Tier 3 says the sets under the same question.
    await click(all<HTMLButtonElement>('[role="tab"]')[2]);
    expect(text()).toContain("If LEG PRESS can't be used");
  });

  it("opens the floor glance on the set-up, with the Stop well straight after it, and Connected after the layers on an iPad", async () => {
    await mount({ section: "machine-anatomy", jump: { kind: "machine", id: "m-leg-press" } });
    const heads = all(".cdx__tierpanel h2").map((h) => h.textContent);
    expect(heads.slice(0, 2)).toEqual(["Set up", "Stop"]);
    expect(heads.indexOf("Begin")).toBeGreaterThan(1);
    // The bento is the body, the facts and the dials; what it connects to follows the tiers.
    expect(host.querySelector(".cdx__bento .cdx__tile--links")).toBeNull();
    const links = host.querySelector(".cdx__layers .cdx__tile--links");
    const panel = host.querySelector(".cdx__tierpanel");
    expect(links && panel && panel.compareDocumentPosition(links) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("says Out of service and Flagged on the floor's rows, the Overview's tiles and the machine's page, and nothing when unknown", async () => {
    knobs.__codexData = {
      care: {
        "m-leg-press": {
          outOfService: false,
          flag: { text: "Left pad sticks at the bottom", by: "Jess Moreno", at: "2026-10-18T09:36:00Z" },
        },
        "m-chest-press": {
          outOfService: true,
          outOfServiceWhy: { text: "A new cable is on order", by: "Sam Lee", at: "2026-10-17T12:52:00Z" },
        },
      },
    };
    await mount({ section: "machine-anatomy" });
    const rows = all(".cdx__entries .cdx__entry");
    expect(rows[0].textContent).toContain("Flagged");
    expect(rows[0].textContent).not.toContain("Out of service");
    expect(rows[1].textContent).toContain("Out of service");
    expect(rows[1].textContent).toContain("A new cable is on order");
    expect(rows[2].querySelector("[data-floor-status]")).toBeNull();

    // The machine's page says the flag in full under the title, before the bento.
    await click(rows[0]);
    expect(title()).toBe("LEG PRESS");
    const banner = host.querySelector(".cdx__head [data-floor-status='banner']");
    expect(banner?.textContent).toContain("Flagged by Jess");
    expect(banner?.textContent).toContain("Left pad sticks at the bottom");
    await act(async () => root.unmount());
    root = createRoot(host);

    // The Overview's floor tiles carry the chips, without the reason.
    await mount({ section: "learning" });
    const tiles = all(".cdx__mtile");
    expect(tiles[1].textContent).toContain("Out of service");
    expect(tiles[1].textContent).not.toContain("A new cable is on order");
    await act(async () => root.unmount());
    root = createRoot(host);

    // Unknown (still reading, or a failed read) says nothing, never "in service".
    knobs.__codexData = { care: null };
    await mount({ section: "machine-anatomy" });
    expect(host.querySelector("[data-floor-status]")).toBeNull();
  });

  it("keeps the version switch in one place when the reader taps MSF original", async () => {
    const was = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 820 });
    try {
      // A trainer (no cross-out of their own) on a medium trail, on a page Solon crossed a line out on.
      await mount({ section: "learning", viewer: { ...LEADER, canStrike: false } });
      await click(host.querySelector('[aria-label="Start Life Transformer 101"]'));
      await click(all(".cdx__step").find((s) => /leg press/i.test(s.textContent ?? "")));
      expect(title()).toBe("LEG PRESS");
      const under = () => Boolean(host.querySelector(".cdx__head .cdx__version"));
      const before = under();
      // Overview › Life Transformer 101 › LEG PRESS and a crossed-out line: too long for the row at 820.
      expect(before).toBe(true);
      await click(button("MSF original"));
      expect(under()).toBe(before);
      await click(button("Solon's version"));
      expect(under()).toBe(before);
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: was });
    }
  });

  it("says 'Tap a line…' once, above the lines, never inside the Stop well", async () => {
    try {
      localStorage.removeItem(LINE_HINT_KEY);
    } catch {
      /* no storage in this run */
    }
    resetLineHint();
    await mount({ section: "machine-anatomy", jump: { kind: "machine", id: "m-leg-press" } });
    const hints = all(".cdx__tap-hint");
    expect(hints).toHaveLength(1);
    expect(hints[0].textContent).toContain("Tap a line to");
    expect(hints[0].closest("[data-tone]")).toBeNull();
    // The body's own hint, under its first line, is not drawn here.
    expect(host.querySelector(".vta__tap-hint")).toBeNull();
    // Above the first section's title.
    const first = host.querySelector(".cdx__tierpanel h2");
    expect(first && hints[0].compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Gone for good once a line is chosen.
    await click(host.querySelector(".cdx__tierpanel [data-vta-line]"));
    expect(all(".cdx__tap-hint")).toHaveLength(0);
  });

  it("never says who a path is for twice on the Academy's index", async () => {
    await mount({ section: "academy" });
    const subs = all(".cdx__row-sub").map((s) => s.textContent);
    expect(subs).not.toContain("A head trainer");
    expect(subs).not.toContain("A studio leader");
  });

  it("lists every MSF machine in the Catalog when the floor cannot be read", async () => {
    knobs.__codexData = { floor: null, floorState: "unreadable" };
    await mount({ section: "machine-anatomy" });
    expect(text()).toContain("Can't read Solon's floor right now. Every MSF machine is below.");
    expect(text()).toContain("Every MSF machine");
    expect(text()).not.toContain("Not on Solon's floor");
    const names = all(".cdx__entries--quiet .cdx__entry-name").map((n) => n.textContent);
    expect(names.length).toBeGreaterThan(10);
    // Every one, the machines the floor would have had among them.
    expect(names).toContain("LEG PRESS");
    expect(names).toContain("CHEST PRESS");
  });

  it("says a studio's own machine needs a floor that cannot be read, with the way back, never a spinner", async () => {
    knobs.__codexData = { floor: null, floorState: "unreadable" };
    await mount({ section: "machine-anatomy", jump: { kind: "machine", id: "sm-our-own" } });
    expect(text()).toContain("Can't read Solon's floor right now");
    expect(host.querySelector(".lm-area")).toBeNull();
    await click(button("Back"));
    expect(title()).toBe("Solon's floor");
  });

  it("says a page whose reference chunk failed did not load, and tries again on a tap", async () => {
    const retryReference = vi.fn();
    knobs.__codexData = { cards: null, quizBank: null, referenceFailed: true, retryReference };
    await mount({ section: "machine-anatomy", jump: { kind: "machine", id: "m-leg-press" } });
    expect(text()).toContain("This part of the Academy didn't load");
    await click(button("Try again"));
    expect(retryReference).toHaveBeenCalledTimes(1);
  });

  it("says a peeked topic whose module failed did not load, with Try again, never spinning", async () => {
    const retryModule = vi.fn();
    knobs.__codexData = { modules: {}, moduleFailed: () => true, retryModule };
    await mount({ section: "machine-anatomy", jump: { kind: "machine", id: "m-leg-press" } });
    const topicPill = all<HTMLButtonElement>(".cdx__tile--links button").find((b) => /AB Routines/.test(b.textContent ?? ""));
    await click(topicPill);
    const peek = document.querySelector(".vtp");
    expect(peek?.textContent).toContain("This part of the Academy didn't load.");
    await click(button("Try again", peek ?? document));
    expect(retryModule).toHaveBeenCalledTimes(1);
    expect(typeof retryModule.mock.calls[0][0]).toBe("string");
  });

  it("keeps the version switch on the trail's row when it fits, and under the title when the trail is too long", async () => {
    const was = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 820 });
    try {
      await mount({ section: "machine-anatomy", jump: { kind: "machine", id: "m-leg-press" } });
      // Catalog › LEG PRESS: room beside the crumbs.
      expect(host.querySelector(".cdx__head .cdx__version")).toBeNull();
      expect(button("MSF original")).toBeTruthy();
      await act(async () => root.unmount());
      root = createRoot(host);

      // Academy › Cueing phrasebook › a long moment: the row would cut "Academy" mid-word.
      await mount({ section: "academy", jump: { kind: "academy-cueing" } });
      const moment = all<HTMLButtonElement>(".cdx__chapter").find((c) => /where the stack does not touch/.test(c.textContent ?? ""));
      await click(moment);
      expect(host.querySelector(".cdx__head .cdx__version")).toBeTruthy();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: was });
    }
  });

  it("puts a machine's connections after its layers on a phone, so the floor glance comes first", async () => {
    knobs.__codexPhone = true;
    await mount({ section: "machine-anatomy", jump: { kind: "machine", id: "m-leg-press" } });
    expect(host.querySelector(".cdx__bento .cdx__tile--links")).toBeNull();
    const after = host.querySelector(".cdx__layers .cdx__tile--links");
    expect(after).toBeTruthy();
    // After the tier bar, in the page's order.
    const bar = host.querySelector(".cdx__tierbar");
    expect(bar && after && bar.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
