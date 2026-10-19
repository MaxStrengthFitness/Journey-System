// @vitest-environment jsdom
/**
 * HEAD OFFICE'S QUEUE, MOUNTED (the Learning vault redesign, Oct 19 2026).
 *
 * Mounted inside the real VaultProvider over a small store written here (the
 * MarkupStore shape, a few arrays and a listener list), so a decision goes
 * through store.decide and the page re-reads it the way it will in the
 * prototype. The route a page door asks for is stood in for (routes.ts is
 * another part's), so this test holds only what this screen does: the one
 * line of counts, a count with its proof one tap away, the floor's words,
 * and Taken / Not taken with an optional note, only for head office.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { UnsavedChangesProvider, useLeaveGuard } from "../../unsaved-changes";
import type { MarkupStore } from "../markup-store";
import type { LearningSubmission, StudioMarkup, VaultRoute, VaultTargetRef, VaultViewer } from "../types";
import { VaultProvider } from "./VaultProvider";
import { SubmissionQueue, intentLine, possessive, queueLead } from "./SubmissionQueue";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../routes", () => ({
  routeForTargetRef: (ref: VaultTargetRef): VaultRoute =>
    ref.kind === "machine"
      ? { kind: "machine", id: ref.id }
      : ref.kind === "playbook"
        ? { kind: "playbook", id: ref.id }
        : { kind: "academy" },
}));

/* ------------------------------------------------------------------ *
 * Fixtures: practice studios and sample people only
 * ------------------------------------------------------------------ */

const LINE = "Keep the load moving slowly through the turnaround.";

function strikeAt(studioId: string, studioName: string, reason: string, at: string, replacement?: string): StudioMarkup {
  return {
    studioId,
    studioName,
    targetKey: "machine:m-leg-press",
    title: "Leg Press",
    strikes: [
      {
        blockKey: "b-1a2b3c4d",
        originalText: LINE,
        reason,
        ...(replacement ? { replacement } : {}),
        by: { uid: `u-${studioId}`, name: "Sample Leader" },
        at,
      },
    ],
    notes: [],
  };
}

const MARKUP: StudioMarkup[] = [
  strikeAt("practice-north", "Practice Studio North", "Our unit's cam is different.", "2026-10-17T14:00:00.000Z", "We cue a two-count pause."),
  strikeAt("practice-east", "Practice Studio East", "Clients find this confusing.", "2026-10-18T14:00:00.000Z"),
  strikeAt("practice-west", "Practice Studio West", "We say it another way.", "2026-10-16T14:00:00.000Z"),
  {
    studioId: "practice-north",
    studioName: "Practice Studio North",
    targetKey: "academy-topic:mastery-pace",
    title: "Pace",
    strikes: [
      {
        blockKey: "b-00ff00ff",
        originalText: "Six seconds up, six seconds down.",
        reason: "We teach the window, not a number.",
        by: { uid: "u-n", name: "Sample Leader" },
        at: "2026-10-15T14:00:00.000Z",
      },
    ],
    notes: [],
  },
];

const SUBMISSIONS: LearningSubmission[] = [
  {
    id: "sub-1",
    intent: "dispute",
    ref: { kind: "academy-topic", id: "mastery-pace", moduleId: "mastery" },
    targetKey: "academy-topic:mastery-pace",
    targetTitle: "Pace",
    blockKey: "b-00ff00ff",
    quote: "Six seconds up, six seconds down.",
    body: "The Academy gives a window, 6 to 10.",
    proposed: "Six to ten seconds each way.",
    studioId: "practice-east",
    studioName: "Practice Studio East",
    by: { uid: "u-sam", name: "Sam Sample" },
    at: "2026-10-18T15:00:00.000Z",
    status: "pending",
  },
  {
    id: "sub-2",
    intent: "addition",
    ref: { kind: "playbook", id: "the-floor" },
    targetKey: "playbook:the-floor",
    targetTitle: "The twenty minutes",
    body: "Add how we set the iPad down at each machine.",
    studioId: "practice-west",
    studioName: "Practice Studio West",
    by: { uid: "u-jo", name: "Jo Example" },
    at: "2026-10-17T15:00:00.000Z",
    status: "pending",
  },
  {
    id: "sub-3",
    intent: "addition",
    ref: { kind: "machine", id: "m-leg-press" },
    targetKey: "machine:m-leg-press",
    targetTitle: "Leg Press",
    body: "A note on seat height for tall clients.",
    studioId: "practice-north",
    studioName: "Practice Studio North",
    by: { uid: "u-al", name: "Al Sample" },
    at: "2026-10-10T15:00:00.000Z",
    status: "declined",
    decision: { note: "The seat is the studio's own setting.", byName: "Head Office Sample", at: "2026-10-12T15:00:00.000Z" },
  },
];

/** The MarkupStore shape over plain arrays: enough for a queue to read and decide. */
function fixtureStore(markup: StudioMarkup[], subs: LearningSubmission[]): MarkupStore & { decide: ReturnType<typeof vi.fn> } {
  const all = [...markup];
  let list = [...subs];
  let v = 0;
  const listeners = new Set<() => void>();
  const changed = () => {
    v += 1;
    for (const l of listeners) l();
  };
  const decide = vi.fn((id: string, status: "taken" | "declined", decision: { note?: string; byName: string; at: string }) => {
    list = list.map((s) => (s.id === id ? { ...s, status, decision } : s));
    changed();
  });
  return {
    markupFor: (studioId, targetKey) => all.find((m) => m.studioId === studioId && m.targetKey === targetKey) ?? null,
    allMarkup: () => all,
    submissions: () => list,
    strike: () => {},
    unstrike: () => {},
    addNote: () => {},
    removeNote: () => {},
    submit: (s) => {
      list = [...list, s];
      changed();
    },
    decide,
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    version: () => v,
  };
}

const HEAD_OFFICE: VaultViewer = { uid: "u-ho", name: "Head Office Sample", canStrike: false, canNote: false, isHeadOffice: true };
const TRAINER: VaultViewer = { uid: "u-t", name: "Trainer Sample", canStrike: false, canNote: true, isHeadOffice: false };
const NOW = new Date("2026-10-19T13:00:00.000Z");

/* ------------------------------------------------------------------ *
 * Mounting
 * ------------------------------------------------------------------ */

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function Door({ onLeft }: { onLeft: () => void }) {
  const leave = useLeaveGuard();
  return (
    <button type="button" data-testid="door" onClick={() => leave(onLeft)}>
      Elsewhere
    </button>
  );
}

async function mount(opts: {
  store?: MarkupStore;
  viewer?: VaultViewer;
  totalStudios?: number;
  onOpen?: (r: VaultRoute) => void;
  onLeft?: () => void;
} = {}) {
  const store = opts.store ?? fixtureStore(MARKUP, SUBMISSIONS);
  const onOpen = opts.onOpen ?? vi.fn();
  await act(async () => {
    root.render(
      <UnsavedChangesProvider>
        <Door onLeft={opts.onLeft ?? (() => {})} />
        <VaultProvider store={store} studio={{ id: null, name: "Head office" }} viewer={opts.viewer ?? HEAD_OFFICE} now={() => NOW}>
          <SubmissionQueue onOpen={onOpen} totalStudios={opts.totalStudios} />
        </VaultProvider>
      </UnsavedChangesProvider>,
    );
  });
  return { store, onOpen };
}

const text = () => host.textContent ?? "";
const lead = () => host.querySelector(".vtq__lead")?.textContent ?? "";
const buttons = (name: string, within: ParentNode = host) =>
  [...within.querySelectorAll("button")].filter((b) => (b.textContent ?? "").trim() === name);
const press = (el: Element | null | undefined) =>
  act(async () => {
    if (!el) throw new Error("button not found");
    (el as HTMLElement).click();
  });
const cardFor = (words: string) =>
  [...host.querySelectorAll(".vtq__card")].find((c) => (c.textContent ?? "").includes(words)) ?? null;
function setValue(el: Element | null, value: string) {
  if (!el) throw new Error("field not found");
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

describe("SubmissionQueue", () => {
  it("leads with one line of counts, then the two parts", async () => {
    await mount();
    expect(lead()).toBe("2 waiting from the floor · 2 lines crossed out");
    const heads = [...host.querySelectorAll(".vtq__h2")].map((h) => h.textContent);
    expect(heads).toEqual(["Lines studios cross out", "From the floor"]);
  });

  it("says how many studios crossed out a line, and keeps their reasons one tap away", async () => {
    await mount();
    const card = cardFor(LINE)!;
    expect(card.querySelector(".vtq__count")?.textContent).toBe("Crossed out at 3 studios");
    const reasons = card.querySelector(".vtq__reasons") as HTMLElement;
    expect(reasons.hidden).toBe(true);

    const toggle = buttons("See each studio's reason", card)[0];
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBe(reasons.id);
    await press(toggle);
    expect(reasons.hidden).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toBe("Hide the reasons");
    const names = [...reasons.querySelectorAll(".vtq__studio")].map((n) => n.textContent);
    expect(names).toEqual(["Practice Studio East", "Practice Studio North", "Practice Studio West"]);
    expect(reasons.textContent).toContain("Why: Our unit's cam is different.");
    expect(reasons.textContent).toContain("Does instead: We cue a two-count pause.");
    expect(reasons.textContent).toContain("Oct 17, 2026");
  });

  it("says the count against every studio when it knows how many there are", async () => {
    await mount({ totalStudios: 4 });
    expect(cardFor(LINE)!.querySelector(".vtq__count")?.textContent).toBe("Crossed out at 3 of 4 studios");
  });

  it("names the one studio when only one crossed a line out", async () => {
    await mount();
    const card = cardFor("Six seconds up, six seconds down.")!;
    expect(card.querySelector(".vtq__count")?.textContent).toBe("Crossed out at 1 studio");
    expect(buttons("See Practice Studio North's reason", card)).toHaveLength(1);
  });

  it("opens the page a line or a submission is about", async () => {
    const { onOpen } = await mount();
    await press(cardFor(LINE)!.querySelector(".vtq__open"));
    expect(onOpen).toHaveBeenLastCalledWith({ kind: "machine", id: "m-leg-press" });
    const playbookHead = [...host.querySelectorAll(".vtq__h3 .vtq__open")].find((b) =>
      (b.textContent ?? "").includes("The twenty minutes"),
    );
    await press(playbookHead);
    expect(onOpen).toHaveBeenLastCalledWith({ kind: "playbook", id: "the-floor" });
  });

  it("shows the floor's words: what it is, the line, the words, the proposed wording, who and where", async () => {
    await mount();
    const card = cardFor("The Academy gives a window, 6 to 10.")!;
    expect(card.querySelector(".vtq__kind")?.textContent).toBe("Disputes this line");
    expect(card.querySelector(".vtq__quote")?.textContent).toBe("Six seconds up, six seconds down.");
    expect(card.querySelector(".vtq__proposed-text")?.textContent).toBe("Six to ten seconds each way.");
    expect(card.querySelector(".vtq__by")?.textContent).toBe("Sam Sample at Practice Studio East · Oct 18, 2026");
    expect(cardFor("Add how we set the iPad down")!.querySelector(".vtq__kind")?.textContent).toBe("Adds to this page");
  });

  it("puts a page with something waiting before a page whose submissions are decided", async () => {
    await mount();
    const titles = [...host.querySelectorAll(".vtq__h3")].map((h) => h.textContent);
    expect(titles).toEqual(["Pace", "The twenty minutes", "Leg Press"]);
  });

  it("shows a decision already made, with its note, never as a score", async () => {
    await mount();
    const card = cardFor("A note on seat height")!;
    expect(card.querySelector(".vtq__verdict")?.textContent).toBe("Not taken · Head Office Sample · Oct 12, 2026");
    expect(card.querySelector(".vtq__verdict--taken")).toBeNull();
    expect(card.querySelector(".vtq__note")?.textContent).toBe("The seat is the studio's own setting.");
    expect(buttons("Taken", card)).toHaveLength(0);
  });

  it("head office marks one Taken with a note back; the page re-reads it", async () => {
    const { store } = await mount();
    const card = () => cardFor("The Academy gives a window, 6 to 10.")!;
    const taken = buttons("Taken", card())[0];
    await press(taken);
    expect(taken.getAttribute("aria-pressed")).toBe("true");
    expect(card().querySelector("label")?.textContent).toBe("A note back to Practice Studio East");
    await act(async () => setValue(card().querySelector("textarea"), "  Changed in the next Academy build.  "));
    await press(buttons("Mark taken", card())[0]);

    expect(store.decide).toHaveBeenCalledWith("sub-1", "taken", {
      note: "Changed in the next Academy build.",
      byName: "Head Office Sample",
      at: NOW.toISOString(),
    });
    expect(card().querySelector(".vtq__verdict--taken")?.textContent).toBe("Taken · Head Office Sample · Oct 19, 2026");
    expect(card().querySelector(".vtq__note")?.textContent).toBe("Changed in the next Academy build.");
    expect(lead()).toBe("1 waiting from the floor · 2 lines crossed out");
  });

  it("a note sent with the decision is never asked about again (review fix, Oct 19 2026)", async () => {
    const onLeft = vi.fn();
    await mount({ onLeft });
    const card = () => cardFor("The Academy gives a window, 6 to 10.")!;
    await press(buttons("Taken", card())[0]);
    await act(async () => setValue(card().querySelector("textarea"), "Changed in the next build."));
    await press(buttons("Mark taken", card())[0]);
    expect(card().querySelector(".vtq__verdict--taken")).not.toBeNull();

    // The very next door goes straight through: no question about words already sent.
    await press(document.querySelector('[data-testid="door"]'));
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it("Not taken with no note sends no note", async () => {
    const { store } = await mount();
    const card = () => cardFor("Add how we set the iPad down")!;
    await press(buttons("Not taken", card())[0]);
    await press(buttons("Mark not taken", card())[0]);
    expect(store.decide).toHaveBeenCalledWith("sub-2", "declined", { byName: "Head Office Sample", at: NOW.toISOString() });
    expect(card().querySelector(".vtq__verdict")?.textContent).toContain("Not taken");
  });

  it("a note half-written is typing: a door asks first, and Back asks too", async () => {
    const onLeft = vi.fn();
    await mount({ onLeft });
    const card = () => cardFor("The Academy gives a window, 6 to 10.")!;
    await press(buttons("Not taken", card())[0]);
    await act(async () => setValue(card().querySelector("textarea"), "Half a note"));

    await press(document.querySelector('[data-testid="door"]'));
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    await press(document.querySelector('[data-testid="leave-confirm"] [data-action="keep-editing"]'));
    expect(onLeft).not.toHaveBeenCalled();
    expect((card().querySelector("textarea") as HTMLTextAreaElement).value).toBe("Half a note");

    await press(buttons("Back", card())[0]);
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    await press(document.querySelector('[data-testid="leave-confirm"] [data-action="leave"]'));
    expect(card().querySelector("textarea")).toBeNull();
  });

  it("anyone else reads the same list, and only head office decides", async () => {
    await mount({ viewer: TRAINER });
    expect(text()).toContain("Head office decides these. This is the list they see.");
    expect(buttons("Taken")).toHaveLength(0);
    expect(buttons("Not taken")).toHaveLength(0);
    expect(cardFor("The Academy gives a window, 6 to 10.")!.textContent).toContain("Waiting for head office.");
  });

  it("with nothing at all says All clear once, and draws no empty parts", async () => {
    await mount({ store: fixtureStore([], []) });
    expect(lead()).toBe("All clear: nothing from the floor, and no studio has crossed out a line.");
    expect(host.querySelectorAll(".vtq__part")).toHaveLength(0);
  });

  it("an empty part is said in the lead instead of a section of its own", async () => {
    await mount({ store: fixtureStore([], SUBMISSIONS) });
    expect(lead()).toBe("2 waiting from the floor · no lines crossed out");
    expect([...host.querySelectorAll(".vtq__h2")].map((h) => h.textContent)).toEqual(["From the floor"]);
  });

  it("every control is a real button", async () => {
    await mount();
    for (const b of host.querySelectorAll(".vtq button")) expect(b.getAttribute("type")).toBe("button");
  });
});

describe("the queue's words", () => {
  it("says the counts once", () => {
    expect(queueLead(0, 0, 0)).toBe("All clear: nothing from the floor, and no studio has crossed out a line.");
    expect(queueLead(0, 2, 1)).toBe("Nothing waiting from the floor · 1 line crossed out");
    expect(queueLead(3, 0, 0)).toBe("3 waiting from the floor · no lines crossed out");
  });

  it("says what a submission is", () => {
    expect(intentLine({ intent: "dispute", quote: "x" })).toBe("Disputes this line");
    expect(intentLine({ intent: "dispute" })).toBe("Disputes this page");
    expect(intentLine({ intent: "addition", blockKey: "b-1" })).toBe("Adds to this line");
    expect(intentLine({ intent: "addition" })).toBe("Adds to this page");
  });

  it("owns a studio's name the way the version toggle does", () => {
    expect(possessive("Solon")).toBe("Solon's");
    expect(possessive("St. James")).toBe("St. James'");
  });
});
