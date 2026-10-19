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
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudioId: "solon", activeStudio: { id: "solon", name: "Solon" } }),
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
  function AcademyWikiView({ onOpenMachine }: { onOpenMachine?: (id: string) => void }) {
    const [draft, setDraft] = React.useState("");
    useUnsavedChanges(draft !== "", "the comment you are writing", { onDiscard: () => setDraft("") });
    return (
      <div data-screen="academy">
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="button" data-action="chip" onClick={() => onOpenMachine?.("m-leg-press")}>
          Leg Press
        </button>
      </div>
    );
  }
  return { AcademyWikiView };
});

/* A prototype design (the Learning vault redesign, Oct 19 2026): it shows
   which design and role it was given, honours a jump the way the real ones
   do (records it, then says so), and reaches the masthead's search. */
const fx = vi.hoisted(() => ({ jumps: [] as { design: string; jump: unknown; section: string }[] }));
vi.mock("../learning-redesign/LearningRedesign", async () => {
  const React = await import("react");
  const { useWikiSections } = await import("../wiki/sections");
  const { useUnsavedChanges } = await import("../unsaved-changes");
  function LearningRedesign({
    design,
    viewAs,
    section,
    jump,
    onJumpHandled,
    resetSignal,
  }: {
    design: string;
    viewAs: string | null;
    section: string;
    jump: unknown;
    onJumpHandled: () => void;
    resetSignal?: number;
  }) {
    const sections = useWikiSections();
    const [draft, setDraft] = React.useState("");
    useUnsavedChanges(draft !== "", "the prototype's note", { onDiscard: () => setDraft("") });
    React.useEffect(() => {
      if (!jump) return;
      fx.jumps.push({ design, jump, section });
      onJumpHandled();
    }, [design, jump, section, onJumpHandled]);
    return (
      <div
        data-screen="redesign"
        data-design={design}
        data-view-as={viewAs ?? ""}
        data-section={section}
        data-reset={String(resetSignal ?? "none")}
      >
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="button" data-action="redesign-search" onClick={() => sections?.onSearch?.()}>
          Search Learning
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
import type { LearningDesign } from "../learning-vault/types";
import { DESIGN_KEY } from "../learning-redesign/design";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  // The prototype bar remembers its pick on this iPad: every test starts on Current.
  localStorage.clear();
  fx.jumps.length = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

/** AppContent, as far as Learning sees it: a guarded screen and the outside door. */
function App({
  start,
  startJump,
  initialDesign,
}: {
  start: LearningViewId;
  startJump: LearningRef | null;
  initialDesign?: LearningDesign;
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
        initialDesign={initialDesign}
      />
    </>
  );
}

async function mount(start: LearningViewId, startJump: LearningRef | null = null, initialDesign?: LearningDesign) {
  await act(async () => {
    root.render(
      <UnsavedChangesProvider>
        <App start={start} startJump={startJump} initialDesign={initialDesign} />
      </UnsavedChangesProvider>,
    );
  });
}

function setValue(el: Element | null, value: string) {
  if (!el) throw new Error("field not found");
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
const type = (value: string) => act(async () => setValue(host.querySelector("textarea"), value));
const click = (selector: string) =>
  act(async () => {
    const el = document.querySelector(selector) as HTMLElement | null;
    if (!el) throw new Error(`${selector} not found`);
    el.click();
  });

const screen = (name: string) => host.querySelector(`[data-screen="${name}"]`);
const machineOnScreen = () => screen("catalog")?.getAttribute("data-machine");
const draft = () => (host.querySelector("textarea") as HTMLTextAreaElement).value;
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
  it("is asked about once, by the app, and not a second time by Learning", async () => {
    await mount("machine-anatomy", chestPress);
    await type("Left pad sticks.");
    await click('[data-action="bell"]');
    expect(question()).not.toBeNull();
    await answer("leave");
    expect(question()).toBeNull();
    expect(machineOnScreen()).toBe("m-leg-press");
    expect(draft()).toBe("");
  });
});

/* The prototype bar (the Learning vault redesign, Oct 19 2026). */
const onBar = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>(".ld button")].find(
    (x) => x.getAttribute("aria-label") === label || x.textContent === label,
  ) ?? null;
const pressed = (label: string) => onBar(label)?.getAttribute("aria-pressed") ?? null;
const bar = (label: string) =>
  act(async () => {
    const b = onBar(label);
    if (!b) throw new Error(`${label} is not on the bar`);
    b.click();
  });
const redesign = () => screen("redesign");

describe("the prototype bar", () => {
  it("sits above Learning with Current picked, and today's sections under it", async () => {
    await mount("machine-anatomy");
    const strip = host.querySelector(".ld");
    expect(strip).not.toBeNull();
    expect(pressed("Current")).toBe("true");
    expect(pressed("1 Codex")).toBe("false");
    expect(screen("catalog")).not.toBeNull();
    expect(redesign()).toBeNull();
    expect(strip!.compareDocumentPosition(screen("catalog")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // No View as while today's Learning is on.
    expect(host.textContent).not.toContain("View as");
  });

  it("picking Codex draws the prototype in place of the sections, and remembers it", async () => {
    await mount("machine-anatomy");
    await bar("1 Codex");
    expect(question()).toBeNull();
    expect(redesign()?.getAttribute("data-design")).toBe("codex");
    expect(redesign()?.getAttribute("data-section")).toBe("machine-anatomy");
    expect(screen("catalog")).toBeNull();
    expect(pressed("1 Codex")).toBe("true");
    expect(host.textContent).toContain("View as");
    expect(localStorage.getItem(DESIGN_KEY)).toBe("codex");
    await bar("Current");
    expect(redesign()).toBeNull();
    expect(screen("catalog")).not.toBeNull();
  });

  it("asks before a pick takes typing away; Keep editing keeps today's Learning and the draft", async () => {
    await mount("machine-anatomy", chestPress);
    await type("Left pad sticks.");
    await bar("2 Vault map");
    expect(question()!.textContent).toContain("Solon’s notes on m-chest-press");
    await answer("keep-editing");
    expect(redesign()).toBeNull();
    expect(draft()).toBe("Left pad sticks.");
    expect(pressed("Current")).toBe("true");
    await bar("2 Vault map");
    await answer("leave");
    expect(redesign()?.getAttribute("data-design")).toBe("vault");
  });

  it("opens on the prototype last picked on this iPad", async () => {
    localStorage.setItem(DESIGN_KEY, "course");
    await mount("learning");
    expect(redesign()?.getAttribute("data-design")).toBe("course");
  });

  it("View as reaches the prototype; the real viewer's own role is picked until then", async () => {
    await mount("learning", null, "codex");
    expect(redesign()?.getAttribute("data-view-as")).toBe("");
    // authTrainer is null here: the real viewer reads as a trainer.
    expect(pressed("Trainer")).toBe("true");
    await bar("Head office");
    expect(redesign()?.getAttribute("data-view-as")).toBe("head-office");
    expect(pressed("Head office")).toBe("true");
  });

  it("a pick in search goes to the prototype as its jump, and the masthead moves to its section", async () => {
    await mount("learning", null, "codex");
    await click('[data-action="redesign-search"]');
    expect(screen("search")).not.toBeNull();
    await click('[data-action="pick"]');
    expect(screen("search")).toBeNull();
    expect(fx.jumps).toEqual([{ design: "codex", jump: { kind: "machine", id: "m-leg-press" }, section: "machine-anatomy" }]);
    expect(redesign()?.getAttribute("data-section")).toBe("machine-anatomy");
  });

  it("a jump from outside reaches the prototype once, never today's Catalog", async () => {
    await mount("academy", chestPress, "course");
    expect(fx.jumps).toEqual([{ design: "course", jump: chestPress, section: "machine-anatomy" }]);
    // Back to Current: no jump was left behind for the Catalog.
    await bar("Current");
    expect(machineOnScreen()).toBe("");
  });
});

/* Back to a section's front page (the Learning vault redesign, Oct 19 2026). */
describe("a prototype asked back to its section's front page", () => {
  const reset = () => redesign()?.getAttribute("data-reset");
  const section = () => redesign()?.getAttribute("data-section");

  it("the title on the Overview, and the section already on, each send the design one reset", async () => {
    await mount("learning", null, "codex");
    expect(reset()).toBe("0");
    await click('[data-action="title"]');
    expect(question()).toBeNull();
    expect(reset()).toBe("1");
    expect(section()).toBe("learning");
    await click('[data-action="same-section"]');
    expect(reset()).toBe("2");
  });

  it("another section, or the title from another section, moves the masthead and resets nothing", async () => {
    await mount("machine-anatomy", null, "vault");
    await click('[data-action="to-academy"]');
    expect(section()).toBe("academy");
    expect(reset()).toBe("0");
    await click('[data-action="title"]');
    expect(section()).toBe("learning");
    expect(reset()).toBe("0");
  });

  it("asks over typing first: Keep editing resets nothing, Leave resets once", async () => {
    await mount("learning", null, "course");
    await type("Half a thought");
    await click('[data-action="title"]');
    expect(question()!.textContent).toContain("the prototype's note");
    await answer("keep-editing");
    expect(reset()).toBe("0");
    expect(draft()).toBe("Half a thought");
    await click('[data-action="same-section"]');
    await answer("leave");
    expect(reset()).toBe("1");
    expect(draft()).toBe("");
  });

  it("today's Learning is unchanged: the title on the Overview stays on the Overview", async () => {
    await mount("learning");
    expect(screen("overview")).not.toBeNull();
    expect(redesign()).toBeNull();
  });
});
