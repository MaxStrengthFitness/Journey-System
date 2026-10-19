// @vitest-environment jsdom
/**
 * THE CONCEPT LAYER, MOUNTED (the Learning vault redesign, Oct 19 2026).
 *
 * The cards do their work in layout effects (they measure the word and place
 * themselves before they paint) and through window listeners, so a green
 * typecheck says nothing about whether they open. This mounts a ConceptLayer
 * around LinkedText with a small index and taps through it the way a trainer
 * would: a word, a word inside the card, the crumbs, Escape.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { buildEntityIndex, type EntityIndex } from "../entities";
import type { VaultRoute } from "../types";
import { ConceptLayer, useConcepts, type ConceptsValue } from "./ConceptLayer";
import { LinkedText } from "./LinkedText";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const index: EntityIndex = buildEntityIndex({
  glossary: [
    { term: "Pace", definition: "refers to the speed of an exercise, steady and even from start to finish. See also Speed." },
    { term: "Speed", definition: "a relative term for how fast an exercise is performed. See also Pace." },
    { term: "Inroad", definition: "the depth of momentary fatigue in a muscle attained due to exercise." },
  ],
  machines: [
    { machineId: "m-leg-press", name: "LEG PRESS", abbr: "LP", cardId: "lp", scriptId: null, overviewId: null, workout: "Lower Body" },
  ],
  clinical: [],
  playbooks: [],
  modules: [],
});

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
  document.querySelectorAll(".vtc__pop").forEach((n) => n.remove());
});

async function mount(node: ReactNode) {
  await act(async () => root.render(node));
}

async function click(el: Element | null | undefined) {
  if (!el) throw new Error("nothing to click");
  await act(async () => (el as HTMLElement).click());
}

function terms(scope: ParentNode = host): HTMLButtonElement[] {
  return [...scope.querySelectorAll<HTMLButtonElement>(".vtc__term")];
}

function termNamed(text: string, scope: ParentNode = host): HTMLButtonElement {
  const hit = terms(scope).find((b) => b.textContent === text);
  if (!hit) throw new Error(`no linked word "${text}"`);
  return hit;
}

const pop = () => document.querySelector<HTMLElement>(".vtc__pop");
const title = () => pop()?.querySelector(".vtc__title")?.textContent ?? null;
const crumbs = () => [...(pop()?.querySelectorAll(".vtc__crumbs li") ?? [])].map((li) => li.textContent);
const buttonNamed = (name: string) =>
  [...(pop()?.querySelectorAll("button") ?? [])].find((b) => b.textContent === name || b.getAttribute("aria-label") === name) ?? null;

function rect(top: number, left = 40, width = 60, height = 18): DOMRect {
  return { top, left, width, height, bottom: top + height, right: left + width, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

function Page(props: { onLine?: () => void; onOpen?: (r: VaultRoute) => void; onPeek?: (r: VaultRoute) => void; text?: string; idx?: EntityIndex | null }) {
  return (
    <ConceptLayer index={props.idx === undefined ? index : props.idx} onOpen={props.onOpen ?? (() => {})} onPeek={props.onPeek}>
      {/* A line that, like ArticleBlocks, selects itself on a click. */}
      <div className="line" role="button" tabIndex={0} onClick={props.onLine}>
        <LinkedText text={props.text ?? "Keep the pace steady on the Leg Press and watch the inroad."} />
      </div>
      <p className="elsewhere">Somewhere else on the page.</p>
    </ConceptLayer>
  );
}

describe("ConceptLayer + LinkedText", () => {
  it("opens a card at the word, pushes a nested card, shows the crumbs, and Escape closes it", async () => {
    const onLine = vi.fn();
    await mount(<Page onLine={onLine} />);

    expect(terms().map((t) => t.textContent)).toEqual(["pace", "Leg Press", "inroad"]);
    expect(pop()).toBeNull();

    const pace = termNamed("pace");
    await click(pace);
    expect(pop()).not.toBeNull();
    expect(pop()!.getAttribute("role")).toBe("dialog");
    expect(title()).toBe("Pace");
    // The definition's first sentence, with its capital back, and its source.
    expect(pop()!.querySelector(".vtc__summary")!.textContent).toBe(
      "Refers to the speed of an exercise, steady and even from start to finish.",
    );
    expect(pop()!.querySelector(".vtc__source")!.textContent).toBe("Academy glossary");
    // The tap was the word's, not the line's.
    expect(onLine).not.toHaveBeenCalled();
    // The card took the focus.
    expect(document.activeElement).toBe(pop()!.querySelector(".vtc__title"));
    // One card, no crumbs yet.
    expect(crumbs()).toEqual([]);

    // A word inside the card pushes the next one.
    await click(termNamed("speed", pop()!));
    expect(title()).toBe("Speed");
    expect(crumbs()).toEqual(["Pace", "Speed"]);
    expect(onLine).not.toHaveBeenCalled();

    // Escape closes the whole stack and gives the word its focus back.
    await act(async () => {
      document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(pop()).toBeNull();
    expect(document.activeElement).toBe(pace);
  });

  it("goes back by a crumb, and a connection already in the stack trims back to it", async () => {
    await mount(<Page />);
    await click(termNamed("pace"));
    await click(termNamed("speed", pop()!));
    expect(crumbs()).toEqual(["Pace", "Speed"]);

    // The crumb for the first card takes you back to it.
    await click([...pop()!.querySelectorAll(".vtc__crumbs button")].find((b) => b.textContent === "Pace"));
    expect(title()).toBe("Pace");
    expect(crumbs()).toEqual([]);

    // Speed's card offers Pace (its See also) as a connection; Pace is
    // already in the stack, so it trims back rather than going deeper.
    await click(termNamed("speed", pop()!));
    const chip = [...pop()!.querySelectorAll(".vtc__chip")].find((c) => c.textContent === "Pace");
    expect(chip).toBeTruthy();
    await click(chip);
    expect(title()).toBe("Pace");
    expect(crumbs()).toEqual([]);
  });

  it("places the card under the word, or above it when there is no room below", async () => {
    await mount(<Page />);
    const pace = termNamed("pace");
    pace.getBoundingClientRect = () => rect(100);
    await click(pace);
    expect(pop()!.style.top).toBe("126px");
    expect(pop()!.dataset.side).toBe("below");
    expect(pop()!.style.visibility).toBe("");

    await act(async () => {
      document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    pace.getBoundingClientRect = () => rect(window.innerHeight - 20);
    await click(pace);
    expect(pop()!.dataset.side).toBe("above");
  });

  it("closes on a tap elsewhere and on a scroll, unless it is pinned", async () => {
    await mount(<Page />);
    const pace = termNamed("pace");
    pace.getBoundingClientRect = () => rect(100);

    // A tap elsewhere: gone.
    await click(pace);
    await act(async () => {
      host.querySelector(".elsewhere")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(pop()).toBeNull();

    // A scroll that carries the word away: gone. A nudge: it stays.
    await click(pace);
    pace.getBoundingClientRect = () => rect(110);
    await act(async () => {
      document.dispatchEvent(new Event("scroll"));
    });
    expect(pop()).not.toBeNull();
    pace.getBoundingClientRect = () => rect(300);
    await act(async () => {
      document.dispatchEvent(new Event("scroll"));
    });
    expect(pop()).toBeNull();

    // Pinned: it stays through both, and Close puts it away.
    pace.getBoundingClientRect = () => rect(100);
    await click(pace);
    const pin = buttonNamed("Pin")!;
    await click(pin);
    expect(pin.getAttribute("aria-pressed")).toBe("true");
    expect(pop()!.dataset.pinned).toBe("true");
    await act(async () => {
      host.querySelector(".elsewhere")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    pace.getBoundingClientRect = () => rect(400);
    await act(async () => {
      document.dispatchEvent(new Event("scroll"));
    });
    expect(pop()).not.toBeNull();
    await click(buttonNamed("Close"));
    expect(pop()).toBeNull();
    expect(document.activeElement).toBe(pace);
  });

  it("a second tap on the same word puts its card away", async () => {
    await mount(<Page />);
    const pace = termNamed("pace");
    await click(pace);
    expect(pop()).not.toBeNull();
    await click(pace);
    expect(pop()).toBeNull();
  });

  it("Open page and Peek hand the route over and close the card", async () => {
    const onOpen = vi.fn();
    const onPeek = vi.fn();
    await mount(<Page onOpen={onOpen} onPeek={onPeek} />);
    await click(termNamed("Leg Press"));
    expect(title()).toBe("LEG PRESS");
    // The machine's own line, and the word in it links on.
    expect(pop()!.querySelector(".vtc__summary")!.textContent).toContain("quad and glute inroad");
    expect(terms(pop()!).map((t) => t.textContent)).toContain("inroad");
    await click(buttonNamed("Peek"));
    expect(onPeek).toHaveBeenCalledWith({ kind: "machine", id: "m-leg-press" });
    expect(pop()).toBeNull();

    await click(termNamed("inroad"));
    await click(buttonNamed("Open page"));
    expect(onOpen).toHaveBeenCalledWith({ kind: "glossary", term: "Inroad" });
    expect(pop()).toBeNull();
  });

  it("opens a clinical flag on the map, its machines as its links", async () => {
    const onOpen = vi.fn();
    const withFlag = buildEntityIndex({
      glossary: null,
      machines: [
        { machineId: "m-leg-press", name: "LEG PRESS", abbr: "LP", cardId: "lp", scriptId: null, overviewId: null, workout: "Lower Body" },
      ],
      clinical: [
        {
          id: "bone-osteoporosis",
          category: "Bone Density & Aging",
          conditionName: "Osteoporosis / Severe Osteopenia",
          severity: "High Risk",
          protocolHandling: [{ instruction: "Not for the card.", affectedMachineIds: ["leg_press"] }],
        },
      ],
      playbooks: [],
      modules: [],
    });
    await mount(<Page idx={withFlag} onOpen={onOpen} text="Is it safe with osteoporosis?" />);
    await click(termNamed("osteoporosis"));
    expect(title()).toBe("Osteoporosis / Severe Osteopenia");
    expect(pop()!.textContent).not.toContain("Not for the card.");
    expect([...pop()!.querySelectorAll(".vtc__chip")].map((c) => c.textContent)).toEqual(["LEG PRESS"]);
    // "Open", never "Show on the map": the Course draws no map (recheck fix).
    expect(buttonNamed("Show on the map")).toBeNull();
    await click(buttonNamed("Open"));
    expect(onOpen).toHaveBeenCalledWith({ kind: "map", focus: "clinical:bone-osteoporosis" });
  });

  it("offers no Peek when the design has no peek sheet", async () => {
    await mount(<Page />);
    await click(termNamed("pace"));
    expect(buttonNamed("Peek")).toBeNull();
    expect(buttonNamed("Open page")).not.toBeNull();
  });

  it("lets the card go when the word's page goes away under it", async () => {
    await mount(<Page />);
    await click(termNamed("pace"));
    expect(pop()).not.toBeNull();
    await mount(<Page text="A different page with nothing linked in it at all." />);
    expect(pop()).toBeNull();
  });

  it("is plain words without a layer or before the index lands", async () => {
    await mount(
      <p>
        <LinkedText text="Keep the pace steady on the Leg Press." />
      </p>,
    );
    expect(host.textContent).toBe("Keep the pace steady on the Leg Press.");
    expect(terms()).toEqual([]);

    await mount(<Page idx={null} />);
    expect(terms()).toEqual([]);
    expect(host.querySelector(".line")!.textContent).toBe("Keep the pace steady on the Leg Press and watch the inroad.");
  });

  it("gives a design the doors through useConcepts", async () => {
    const grab: { doors: ConceptsValue | null } = { doors: null };
    function Grab() {
      grab.doors = useConcepts();
      return <button className="door">Open</button>;
    }
    await mount(
      <ConceptLayer index={index} onOpen={() => {}}>
        <Grab />
      </ConceptLayer>,
    );
    const doors = grab.doors;
    if (!doors) throw new Error("no doors");
    expect(doors.index).toBe(index);
    const door = host.querySelector<HTMLButtonElement>(".door")!;
    await act(async () => doors.open("machine:m-leg-press", door));
    expect(title()).toBe("LEG PRESS");
    await act(async () => doors.close());
    expect(pop()).toBeNull();
    expect(document.activeElement).toBe(door);
    // An id the index does not know opens nothing.
    await act(async () => doors.open("term:nothing", door));
    expect(pop()).toBeNull();
  });
});

describe("review fixes (Oct 19 2026)", () => {
  it("a linked word is a span that wraps like prose, still a control: focusable, Enter and Space open it", async () => {
    const onLine = vi.fn();
    await mount(<Page onLine={onLine} />);
    const pace = termNamed("pace");
    expect(pace.tagName).toBe("SPAN");
    expect(pace.getAttribute("role")).toBe("button");
    expect(pace.tabIndex).toBe(0);
    expect(pace.getAttribute("aria-haspopup")).toBe("dialog");
    expect(document.querySelector("button.vtc__term")).toBeNull();

    await act(async () => {
      pace.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    expect(title()).toBe("Pace");
    expect(onLine).not.toHaveBeenCalled();
    // The card's own words are spans too, and Space pushes the next card.
    const speed = termNamed("speed", pop()!);
    expect(speed.tagName).toBe("SPAN");
    await act(async () => {
      speed.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    });
    expect(title()).toBe("Speed");
  });

  it("a pinned card goes when its word is hidden (search stashes the page), and leaves search its Escape", async () => {
    await mount(<Page />);
    const pace = termNamed("pace") as HTMLElement & { checkVisibility?: () => boolean };
    await click(pace);
    await click(buttonNamed("Pin"));
    expect(pop()!.dataset.pinned).toBe("true");

    // Search opens: the page is stashed (display: none), the word still in the document.
    pace.checkVisibility = () => false;
    let reached = false;
    const onDoc = (e: KeyboardEvent) => {
      if (e.key === "Escape") reached = true;
    };
    document.addEventListener("keydown", onDoc);
    try {
      // One Escape, as search's box would get it: the card's window listener
      // hears it first (capture) and must not swallow it.
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      expect(reached).toBe(true);
      expect(pop()).toBeNull();
    } finally {
      document.removeEventListener("keydown", onDoc);
    }
  });

  it("a pinned card goes on the render that hides its word, with no key or scroll needed", async () => {
    await mount(<Page />);
    const pace = termNamed("pace") as HTMLElement & { checkVisibility?: () => boolean };
    await click(pace);
    await click(buttonNamed("Pin"));
    pace.checkVisibility = () => false;
    await mount(<Page />);
    expect(pop()).toBeNull();
  });
});
