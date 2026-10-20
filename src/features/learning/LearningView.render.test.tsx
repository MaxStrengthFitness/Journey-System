// @vitest-environment jsdom
/**
 * LEARNING'S DOORS ASK FIRST (voice review follow-up review, Sep 27 2026).
 *
 * The review found that picking a result in Learning's one search replaced a
 * machine page without asking about the typing on it. The pick stays inside
 * the Catalog, so the view does not change and the app's guarded screen
 * setter had nothing to ask about; the Catalog then swapped its route in
 * place, and a studio note half-written for one machine could be saved as the
 * next machine's note. The doors between sections (a machine chip on an
 * Academy page) also set their jump BEFORE the question, so a "Keep editing"
 * left a jump behind that fired the next time the Catalog opened.
 *
 * Here LearningView is mounted inside the real unsaved-changes provider, with
 * its screen set through the app's guarded setter as AppContent does, and the
 * three sections stood in for by small screens that behave the way the real
 * ones do: the Catalog honours a jump by swapping its page IN PLACE, and a
 * draft typed on it survives that swap unless "Leave" throws it away.
 *
 * Since Oct 20 2026 Learning opens on the Mix for everyone, and today's
 * pages are behind a Mix page's door (the studio's tools); the first blocks
 * mount on today's pages (`initialToday`), the last ones on the Mix.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));
const studioFx = vi.hoisted(() => ({ isAdmin: false }));
vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudioId: "solon", activeStudio: { id: "solon", name: "Solon" }, isAdmin: studioFx.isAdmin }),
}));
vi.mock("../comments", () => ({
  CommentsProvider: ({ children }: { children: React.ReactNode }) => children,
  mentionablePeople: () => [],
}));

/* The Catalog: one page at a time, swapped in place when a jump arrives, with
   a studio note whose draft survives the swap unless it is thrown away. */
vi.mock("../catalog", async () => {
  const React = await import("react");
  const { useUnsavedChanges } = await import("../unsaved-changes");
  const { useWikiSections } = await import("../wiki/sections");
  function CatalogView({
    openMachineId,
    onOpenedMachine,
  }: {
    openMachineId: string | null;
    onOpenedMachine: () => void;
  }) {
    const [machine, setMachine] = React.useState("");
    const [draft, setDraft] = React.useState("");
    React.useEffect(() => {
      if (!openMachineId) return;
      setMachine(openMachineId);
      onOpenedMachine();
    }, [openMachineId, onOpenedMachine]);
    useUnsavedChanges(draft !== "", `Solon’s notes on ${machine}`, { onDiscard: () => setDraft("") });
    const sections = useWikiSections();
    return (
      <div data-screen="catalog" data-machine={machine}>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="button" data-action="search" onClick={() => sections?.onSearch?.()}>
          Search Learning
        </button>
      </div>
    );
  }
  return { CatalogView };
});

/* The Academy: a page with a comment box and a machine chip. */
vi.mock("../academy/AcademyWikiView", async () => {
  const React = await import("react");
  const { useUnsavedChanges } = await import("../unsaved-changes");
  function AcademyWikiView({ onOpenMachine, jump }: { onOpenMachine?: (id: string) => void; jump?: unknown }) {
    const [draft, setDraft] = React.useState("");
    useUnsavedChanges(draft !== "", "the comment you are writing", { onDiscard: () => setDraft("") });
    return (
      <div data-screen="academy" data-jump={jump ? JSON.stringify(jump) : ""}>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="button" data-action="chip" onClick={() => onOpenMachine?.("m-leg-press")}>
          Leg Press
        </button>
      </div>
    );
  }
  return { AcademyWikiView };
});

/* The Mix (every trainer's Learning since Oct 20 2026): it honours a jump
   the way the real one does (records it, then says so), reaches the
   masthead's search, and has a door of each kind to today's pages. */
const fx = vi.hoisted(() => ({ jumps: [] as { jump: unknown; section: string }[], mounts: 0 }));
vi.mock("../learning-redesign/LearningRedesign", async () => {
  const React = await import("react");
  const { useWikiSections } = await import("../wiki/sections");
  const { useUnsavedChanges } = await import("../unsaved-changes");
  function LearningRedesign({
    section,
    jump,
    onJumpHandled,
    resetSignal,
    onOpenToday,
  }: {
    section: string;
    jump: unknown;
    onJumpHandled: () => void;
    resetSignal?: number;
    onOpenToday?: (door: unknown) => void;
  }) {
    const sections = useWikiSections();
    const [draft, setDraft] = React.useState("");
    useUnsavedChanges(draft !== "", "the Mix's note", { onDiscard: () => setDraft("") });
    React.useEffect(() => {
      fx.mounts += 1;
    }, []);
    React.useEffect(() => {
      if (!jump) return;
      fx.jumps.push({ jump, section });
      onJumpHandled();
    }, [jump, section, onJumpHandled]);
    return (
      <div data-screen="redesign" data-section={section} data-reset={String(resetSignal ?? "none")}>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="button" data-action="redesign-search" onClick={() => sections?.onSearch?.()}>
          Search Learning
        </button>
        <button type="button" data-action="door-machine" onClick={() => onOpenToday?.({ kind: "machine", id: "m-chest-press" })}>
          Floor notes, set-up and history
        </button>
        <button type="button" data-action="door-academy" onClick={() => onOpenToday?.({ kind: "academy" })}>
          Studio pages
        </button>
        <button
          type="button"
          data-action="door-topic"
          onClick={() => onOpenToday?.({ kind: "academy-topic", id: "performance-speed-of-movement" })}
        >
          Comments
        </button>
        <button type="button" data-action="title" onClick={() => sections?.onHome?.()}>
          Learning
        </button>
        <button type="button" data-action="same-section" onClick={() => sections?.onSelect(section)}>
          This section again
        </button>
        <button type="button" data-action="to-academy" onClick={() => sections?.onSelect("academy")}>
          Academy
        </button>
      </div>
    );
  }
  return { LearningRedesign };
});

vi.mock("./LearningHome", () => ({ LearningHome: () => <div data-screen="overview" /> }));
vi.mock("./LearningSearch", () => ({
  LearningSearch: ({ onOpen }: { onOpen: (ref: { kind: "machine"; id: string }) => void }) => (
    <div data-screen="search">
      <button type="button" data-action="pick" onClick={() => onOpen({ kind: "machine", id: "m-leg-press" })}>
        Leg Press
      </button>
    </div>
  ),
}));

import { UnsavedChangesProvider, useGuardedSetter, useLeaveGuard } from "../unsaved-changes";
import { LearningView, type LearningViewId } from "./LearningView";
import type { LearningRef } from "./ref";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  studioFx.isAdmin = false;
  fx.jumps.length = 0;
  fx.mounts = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllEnvs();
});

/** AppContent, as far as Learning sees it: a guarded screen and the outside door. */
function App({
  start,
  startJump,
  initialToday,
}: {
  start: LearningViewId;
  startJump: LearningRef | null;
  initialToday?: boolean;
}) {
  const [view, setView] = useState<LearningViewId>(start);
  const setCurrentView = useGuardedSetter(view, setView);
  const [jump, setJump] = useState<LearningRef | null>(startJump);
  const guardLeave = useLeaveGuard();
  return (
    <>
      <button type="button" data-action="bottom-bar-catalog" onClick={() => setCurrentView("machine-anatomy")}>
        Catalog
      </button>
      {/* AppContent's openLearning: one question, THEN the jump. */}
      <button
        type="button"
        data-action="bell"
        onClick={() => guardLeave(() => setJump({ kind: "machine", id: "m-leg-press" }))}
      >
        A Learning link from the bell
      </button>
      <LearningView
        view={view}
        onViewChange={setCurrentView}
        machines={[]}
        authTrainer={null}
        jump={jump}
        onJumpHandled={() => setJump(null)}
        initialToday={initialToday}
      />
    </>
  );
}

/** Learning as a trainer opens it: the Mix. */
async function mountMix(start: LearningViewId, startJump: LearningRef | null = null) {
  await act(async () => {
    root.render(
      <UnsavedChangesProvider>
        <App start={start} startJump={startJump} />
      </UnsavedChangesProvider>,
    );
  });
}

/**
 * Today's pages (behind a Mix page's door). With a machine, today's Catalog
 * at that machine the way a trainer reaches it: the Mix's machine page, and
 * its door (a jump from outside opens the Mix since Oct 20 2026).
 */
async function mount(start: LearningViewId, startPage: LearningRef | null = null) {
  if (startPage) {
    if (startPage.kind !== "machine" || startPage.id !== "m-chest-press") throw new Error("the Mix's door opens m-chest-press");
    await mountMix(start);
    await click('[data-action="door-machine"]');
    return;
  }
  await act(async () => {
    root.render(
      <UnsavedChangesProvider>
        <App start={start} startJump={null} initialToday />
      </UnsavedChangesProvider>,
    );
  });
}

function setValue(el: Element | null, value: string) {
  if (!el) throw new Error("field not found");
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
/** What is on screen: the Mix waits hidden (.lv__stash) under today's pages, and search hides the page. */
const onScreen = <T extends Element>(sel: string) => ([...host.querySelectorAll<T>(sel)].find((el) => !el.closest(".lv__stash")) ?? null);
const type = (value: string) => act(async () => setValue(onScreen("textarea"), value));
const click = (selector: string) =>
  act(async () => {
    const el = document.querySelector(selector) as HTMLElement | null;
    if (!el) throw new Error(`${selector} not found`);
    el.click();
  });

const screen = (name: string) => host.querySelector(`[data-screen="${name}"]`);
const machineOnScreen = () => screen("catalog")?.getAttribute("data-machine");
const draft = () => (onScreen<HTMLTextAreaElement>("textarea") as HTMLTextAreaElement).value;
const question = () => document.querySelector('[role="alertdialog"]');
const answer = (a: "keep-editing" | "leave") => click(`[data-testid="leave-confirm"] [data-action="${a}"]`);

const chestPress: LearningRef = { kind: "machine", id: "m-chest-press" };

describe("Learning's one search", () => {
  it("opens the picked machine straight away when nothing is typed", async () => {
    await mount("machine-anatomy", chestPress);
    expect(machineOnScreen()).toBe("m-chest-press");
    await click('[data-action="search"]');
    await click('[data-action="pick"]');
    expect(question()).toBeNull();
    expect(screen("search")).toBeNull();
    expect(machineOnScreen()).toBe("m-leg-press");
  });

  it("asks before a pick replaces a page with a note typed on it, and Keep editing keeps both", async () => {
    await mount("machine-anatomy", chestPress);
    await type("Left pad sticks.");
    await click('[data-action="search"]');
    await click('[data-action="pick"]');
    expect(question()!.textContent).toContain("Solon’s notes on m-chest-press");
    // Search is already closed, so the answer lands back on the page.
    expect(screen("search")).toBeNull();
    await answer("keep-editing");
    expect(question()).toBeNull();
    expect(machineOnScreen()).toBe("m-chest-press");
    expect(draft()).toBe("Left pad sticks.");
  });

  it("Leave throws the draft away BEFORE the next machine opens, so it is never that machine's note", async () => {
    await mount("machine-anatomy", chestPress);
    await type("Left pad sticks.");
    await click('[data-action="search"]');
    await click('[data-action="pick"]');
    await answer("leave");
    expect(question()).toBeNull();
    expect(machineOnScreen()).toBe("m-leg-press");
    expect(draft()).toBe("");
  });
});

describe("the doors between sections", () => {
  it("asks before a machine chip on an Academy page takes the typing away", async () => {
    await mount("academy");
    await type("Worth a look");
    await click('[data-action="chip"]');
    expect(question()!.textContent).toContain("the comment you are writing");
    await answer("keep-editing");
    expect(screen("academy")).not.toBeNull();
    expect(draft()).toBe("Worth a look");
  });

  it("leaves no jump behind after Keep editing: the Catalog opens later at its index", async () => {
    await mount("academy");
    await type("Worth a look");
    await click('[data-action="chip"]');
    await answer("keep-editing");
    // Later, the bottom bar's Catalog: asked again, and this time left.
    await click('[data-action="bottom-bar-catalog"]');
    await answer("leave");
    expect(screen("catalog")).not.toBeNull();
    expect(machineOnScreen()).toBe("");
  });

  it("opens the machine once Leave is chosen", async () => {
    await mount("academy");
    await type("Worth a look");
    await click('[data-action="chip"]');
    await answer("leave");
    expect(machineOnScreen()).toBe("m-leg-press");
  });
});

describe("a Learning link from outside the tab", () => {
  it("is asked about once, by the app, and not a second time by Learning; it opens the Mix", async () => {
    await mount("machine-anatomy", chestPress);
    await type("Left pad sticks.");
    fx.jumps.length = 0;
    await click('[data-action="bell"]');
    expect(question()).not.toBeNull();
    await answer("leave");
    expect(question()).toBeNull();
    // From outside, always the Mix (Oct 20 2026), even from today's pages.
    expect(screen("catalog")).toBeNull();
    expect(host.querySelector(".lv__today")).toBeNull();
    expect(fx.jumps).toEqual([{ jump: { kind: "machine", id: "m-leg-press" }, section: "machine-anatomy" }]);
  });
});


/* The Mix for everyone, and its doors to today's pages (Oct 20 2026). AJ:
   "Switch everyone to the Mix now, with a door on each page to today's
   Learning for the studio tools, and move them in later." */
/** The Mix, when it is the page on screen (it waits mounted but hidden under today's pages). */
const mix = () => onScreen("[data-screen=\"redesign\"]");
const mixWaiting = () => Boolean(host.querySelector("[data-mix=\"waiting\"] [data-screen=\"redesign\"]"));
const strip = () => host.querySelector(".lv__today");
const back = () => click(".lv__today-back");

describe("Learning is the Mix, for everyone", () => {
  it("a trainer on a production build opens on the Mix, with no picker and no strip", async () => {
    vi.stubEnv("DEV", false);
    await mountMix("machine-anatomy");
    expect(mix()?.getAttribute("data-section")).toBe("machine-anatomy");
    expect(screen("catalog")).toBeNull();
    expect(host.querySelector(".ld")).toBeNull();
    expect(host.textContent).not.toContain("Prototype");
    expect(host.textContent).not.toContain("View as");
    expect(strip()).toBeNull();
  });

  it("an iPad that remembered the old prototype pick opens on the Mix all the same", async () => {
    localStorage.setItem("journey.learning.design.v1", "current");
    await mountMix("learning");
    expect(mix()).not.toBeNull();
    expect(screen("overview")).toBeNull();
  });

  it("a pick in search goes to the Mix as its jump, and the masthead moves to its section", async () => {
    await mountMix("learning");
    await click('[data-action="redesign-search"]');
    expect(screen("search")).not.toBeNull();
    await click('[data-action="pick"]');
    expect(screen("search")).toBeNull();
    expect(fx.jumps).toEqual([{ jump: { kind: "machine", id: "m-leg-press" }, section: "machine-anatomy" }]);
    expect(mix()?.getAttribute("data-section")).toBe("machine-anatomy");
  });

  it("a jump from outside reaches the Mix once", async () => {
    await mountMix("academy", chestPress);
    expect(fx.jumps).toEqual([{ jump: chestPress, section: "machine-anatomy" }]);
  });

  it("a studio's own page, from outside, opens today's Academy: only it draws one", async () => {
    const page: LearningRef = { kind: "studio-page", id: "p-1", studioId: "solon" };
    await mountMix("learning", page);
    expect(mix()).toBeNull();
    expect(screen("academy")?.getAttribute("data-jump")).toBe(JSON.stringify({ ref: page }));
    expect(strip()).not.toBeNull();
  });
});

describe("a Mix page's door to today's page", () => {
  it("a machine's door opens today's machine page under the strip; Back to Learning finds the Mix exactly as it was left", async () => {
    await mountMix("machine-anatomy");
    await click('[data-action="door-machine"]');
    expect(question()).toBeNull();
    expect(mix()).toBeNull();
    // The Mix waits, mounted and hidden, on its section (review, Oct 20 2026).
    expect(mixWaiting()).toBe(true);
    expect(machineOnScreen()).toBe("m-chest-press");
    expect(strip()?.textContent).toContain("Back to Learning");
    expect(strip()?.textContent).toContain("Studio tools");
    // The strip sits above the page.
    expect(strip()!.compareDocumentPosition(screen("catalog")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await back();
    expect(strip()).toBeNull();
    expect(screen("catalog")).toBeNull();
    expect(mix()?.getAttribute("data-section")).toBe("machine-anatomy");
    // Never remounted and never asked for a page again: it is as it was.
    expect(fx.mounts).toBe(1);
    expect(fx.jumps).toEqual([]);
  });

  it("the Mix waits on the section it was on, whatever today's pages do, and Back takes the masthead there", async () => {
    await mountMix("machine-anatomy");
    await click('[data-action="door-academy"]');
    expect(screen("academy")).not.toBeNull();
    expect(host.querySelector('[data-mix="waiting"] [data-screen="redesign"]')?.getAttribute("data-section")).toBe("machine-anatomy");
    await back();
    expect(mix()?.getAttribute("data-section")).toBe("machine-anatomy");
    expect(fx.mounts).toBe(1);
  });

  it("the Academy's door opens today's Academy at its front; Back goes to the Mix's Academy, no page asked for", async () => {
    await mountMix("academy");
    await click('[data-action="door-academy"]');
    expect(screen("academy")?.getAttribute("data-jump")).toBe("");
    await back();
    expect(mix()?.getAttribute("data-section")).toBe("academy");
    expect(fx.jumps).toEqual([]);
    expect(fx.mounts).toBe(1);
  });

  it("a topic's door opens that topic on today's Academy, where its comments are", async () => {
    await mountMix("academy");
    await click('[data-action="door-topic"]');
    expect(screen("academy")?.getAttribute("data-jump")).toBe(
      JSON.stringify({ ref: { kind: "academy-topic", id: "performance-speed-of-movement" } }),
    );
    await back();
    expect(mix()?.getAttribute("data-section")).toBe("academy");
    expect(fx.jumps).toEqual([]);
    expect(fx.mounts).toBe(1);
  });

  it("a door asks over the Mix's typing first, and Keep editing stays on the Mix", async () => {
    await mountMix("machine-anatomy");
    await type("Half a thought");
    await click('[data-action="door-machine"]');
    expect(question()!.textContent).toContain("the Mix's note");
    await answer("keep-editing");
    expect(mix()).not.toBeNull();
    expect(draft()).toBe("Half a thought");
    expect(strip()).toBeNull();
  });

  it("Back to Learning asks over typing on today's page first", async () => {
    await mountMix("machine-anatomy");
    await click('[data-action="door-machine"]');
    await type("Left pad sticks.");
    await back();
    expect(question()!.textContent).toContain("Solon’s notes on m-chest-press");
    await answer("keep-editing");
    expect(machineOnScreen()).toBe("m-chest-press");
    expect(draft()).toBe("Left pad sticks.");
    await back();
    await answer("leave");
    expect(mix()).not.toBeNull();
    expect(strip()).toBeNull();
  });

  it("moving between today's sections stays on today's pages until Back", async () => {
    await mountMix("academy");
    await click('[data-action="door-academy"]');
    // A machine chip on today's Academy page: today's Catalog, still under the strip.
    await click('[data-action="chip"]');
    expect(machineOnScreen()).toBe("m-leg-press");
    expect(strip()).not.toBeNull();
    expect(mix()).toBeNull();
  });
});

/* Back to a section's front page (the Learning vault redesign, Oct 19 2026). */
describe("the Mix asked back to its section's front page", () => {
  const reset = () => mix()?.getAttribute("data-reset");
  const section = () => mix()?.getAttribute("data-section");

  it("the title on the Overview, and the section already on, each send the Mix one reset", async () => {
    await mountMix("learning");
    expect(reset()).toBe("0");
    await click('[data-action="title"]');
    expect(question()).toBeNull();
    expect(reset()).toBe("1");
    expect(section()).toBe("learning");
    await click('[data-action="same-section"]');
    expect(reset()).toBe("2");
  });

  it("another section, or the title from another section, moves the masthead and resets nothing", async () => {
    await mountMix("machine-anatomy");
    await click('[data-action="to-academy"]');
    expect(section()).toBe("academy");
    expect(reset()).toBe("0");
    await click('[data-action="title"]');
    expect(section()).toBe("learning");
    expect(reset()).toBe("0");
  });

  it("asks over typing first: Keep editing resets nothing, Leave resets once", async () => {
    await mountMix("learning");
    await type("Half a thought");
    await click('[data-action="title"]');
    expect(question()!.textContent).toContain("the Mix's note");
    await answer("keep-editing");
    expect(reset()).toBe("0");
    expect(draft()).toBe("Half a thought");
    await click('[data-action="same-section"]');
    await answer("leave");
    expect(reset()).toBe("1");
    expect(draft()).toBe("");
  });

  it("opened on today's pages, today's Overview draws and the Mix waits hidden", async () => {
    await mount("learning");
    expect(screen("overview")).not.toBeNull();
    expect(mix()).toBeNull();
    expect(mixWaiting()).toBe(true);
  });
});
