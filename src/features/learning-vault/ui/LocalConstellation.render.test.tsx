// @vitest-environment jsdom
/**
 * A PAGE'S LOCAL CONSTELLATION, MOUNTED (Learning vault redesign, Oct 19
 * 2026). Checks what a reader gets: the links grouped by why they connect,
 * each a pill with its domain's mark that opens its page; the orbit drawn
 * for a finger with the same links listed for everyone else; the loading
 * mark while the graph is on its way; nothing at all for a page that is not
 * a node; one quiet line for a node with no links. The graph is a small
 * fixture made here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { LocalConstellation, categoryNodeStyle } from "./LocalConstellation";
import type { GraphEdge, GraphNode, VaultGraph, VaultRoute } from "../types";

const n = (id: string, label: string, domain: GraphNode["domain"], route: VaultRoute): GraphNode => ({
  id,
  label,
  domain,
  route,
  weight: 0,
});

const NODES: GraphNode[] = [
  n("machine:m-leg-press", "LEG PRESS", "machine", { kind: "machine", id: "m-leg-press" }),
  n("machine:m-ext", "LEG EXTENSION", "machine", { kind: "machine", id: "m-ext" }),
  n("machine:m-leg-curl", "LEG CURL", "machine", { kind: "machine", id: "m-leg-curl" }),
  n("clinical:bone-osteoporosis", "Osteoporosis / Severe Osteopenia", "clinical", { kind: "map", focus: "clinical:bone-osteoporosis" }),
  n("topic:mastery-pace", "PACE", "topic", { kind: "topic", moduleId: "mastery", topicId: "mastery-pace" }),
  n(
    "topic:programming-exercise-selection-template",
    "Exercise Selection Template · Programming and Progression",
    "topic",
    { kind: "topic", moduleId: "programming", topicId: "programming-exercise-selection-template" },
  ),
  n("cue:6", "Lower Turnaround: weight stack touches", "cue", { kind: "cueing", moment: 6 }),
  n("term:gap", "Gap", "equipment", { kind: "glossary", term: "Gap" }),
];
const e = (from: string, to: string, kind: GraphEdge["kind"], label: string): GraphEdge => ({ from, to, kind, label });
const EDGES: GraphEdge[] = [
  e("machine:m-ext", "machine:m-leg-press", "substitutes", "is part of a set that replaces"),
  e("machine:m-leg-press", "machine:m-leg-curl", "same-category", "is in the same family as"),
  e("clinical:bone-osteoporosis", "machine:m-leg-press", "affects", "affects"),
  e("topic:mastery-pace", "machine:m-leg-press", "mentions", "talks about"),
  e("topic:programming-exercise-selection-template", "machine:m-leg-press", "mentions", "talks about"),
  e("machine:m-leg-press", "cue:6", "cued-at", "is cued at"),
];
const GRAPH: VaultGraph = { nodes: NODES, edges: EDGES };

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

async function mount(ui: React.ReactNode) {
  await act(async () => root.render(ui));
}

const headings = () => Array.from(host.querySelectorAll(".vtg__head")).map((h) => h.textContent);
const pills = () => Array.from(host.querySelectorAll<HTMLButtonElement>(".vtg__pill"));

describe("the pills", () => {
  it("group the links by why they connect, strongest reason first", async () => {
    await mount(<LocalConstellation graph={GRAPH} nodeId="machine:m-leg-press" onOpen={() => {}} />);
    expect(headings()).toEqual(["In sets that replace it", "Cue moments", "Clinical flags", "Same family", "Comes up in"]);
    expect(pills().map((p) => p.querySelector(".vtg__pill-label")?.textContent)).toEqual([
      "LEG EXTENSION",
      "Lower Turnaround: weight stack touches",
      "Osteoporosis / Severe Osteopenia",
      "LEG CURL",
      "PACE",
      "Exercise Selection Template · Programming and Progression",
    ]);
    expect(host.querySelector("section.vtg")?.getAttribute("aria-label")).toBe("What connects to LEG PRESS");
  });

  it("open the page a pill names", async () => {
    const opened: VaultRoute[] = [];
    await mount(<LocalConstellation graph={GRAPH} nodeId="machine:m-leg-press" onOpen={(r) => opened.push(r)} />);
    const pace = pills().find((p) => p.textContent === "PACE")!;
    await act(async () => pace.click());
    expect(opened).toEqual([{ kind: "topic", moduleId: "mastery", topicId: "mastery-pace" }]);
  });

  it("say their domain to a screen reader and wear its colour and its glyph", async () => {
    await mount(<LocalConstellation graph={GRAPH} nodeId="machine:m-leg-press" onOpen={() => {}} />);
    const flag = pills().find((p) => p.textContent?.includes("Osteoporosis"))!;
    expect(flag.getAttribute("aria-label")).toBe("Osteoporosis / Severe Osteopenia, clinical flag");
    expect(flag.style.getPropertyValue("--vtg-c")).toBe("var(--wk-warn)");
    expect(flag.querySelector(".vtg__mark svg")).not.toBeNull();
    const machine = pills().find((p) => p.textContent === "LEG EXTENSION")!;
    expect(machine.style.getPropertyValue("--vtg-text")).toBe("var(--wk-cat-push-text)");
  });

  it("wear the host's colours where its language is the category (review fix): a machine in its own, the rest in their domain's", async () => {
    await mount(<LocalConstellation graph={GRAPH} nodeId="machine:m-leg-press" onOpen={() => {}} nodeStyle={categoryNodeStyle} />);
    const ext = pills().find((p) => p.textContent === "LEG EXTENSION")!;
    expect(ext.style.getPropertyValue("--vtg-c")).toBe("var(--wk-cat-legs)");
    expect(ext.style.getPropertyValue("--vtg-text")).toBe("var(--wk-cat-legs-text)");
    const flag = pills().find((p) => p.textContent?.includes("Osteoporosis"))!;
    expect(flag.style.getPropertyValue("--vtg-c")).toBe("var(--wk-warn)");

    await mount(
      <LocalConstellation graph={GRAPH} nodeId="machine:m-leg-press" onOpen={() => {}} variant="orbit" nodeStyle={categoryNodeStyle} />,
    );
    const node = [...host.querySelectorAll<HTMLElement>(".vtg__node")].find((b) => b.textContent === "LEG EXTENSION")!;
    expect(node.style.getPropertyValue("--vtg-c")).toBe("var(--wk-cat-legs)");
    expect(host.querySelector<HTMLElement>(".vtg__centre")!.style.getPropertyValue("--vtg-c")).toBe("var(--wk-cat-legs)");
  });

  it("show no more than they are asked to, every kind keeping a place", async () => {
    await mount(<LocalConstellation graph={GRAPH} nodeId="machine:m-leg-press" onOpen={() => {}} max={3} />);
    expect(pills()).toHaveLength(3);
    expect(headings()).toEqual(["In sets that replace it", "Cue moments", "Clinical flags"]);
  });

  it("stack by default, and sit side by side as columns when asked", async () => {
    await mount(<LocalConstellation graph={GRAPH} nodeId="machine:m-leg-press" onOpen={() => {}} />);
    expect(host.querySelector("section.vtg")?.classList.contains("vtg--columns")).toBe(false);
    await mount(<LocalConstellation graph={GRAPH} nodeId="machine:m-leg-press" onOpen={() => {}} layout="columns" />);
    expect(host.querySelector("section.vtg")?.classList.contains("vtg--columns")).toBe(true);
    expect(headings()).toHaveLength(5);
  });

  it("are the same from the other end, said the other way", async () => {
    await mount(<LocalConstellation graph={GRAPH} nodeId="machine:m-ext" onOpen={() => {}} />);
    expect(headings()).toEqual(["Part of a set that replaces"]);
  });
});

describe("what it says when it has nothing", () => {
  it("draws nothing without a node, or for a node the graph does not have", async () => {
    await mount(<LocalConstellation graph={GRAPH} nodeId={null} onOpen={() => {}} />);
    expect(host.innerHTML).toBe("");
    await mount(<LocalConstellation graph={GRAPH} nodeId="card:lp" onOpen={() => {}} />);
    expect(host.innerHTML).toBe("");
  });

  it("shows the loading mark while the graph is on its way", async () => {
    await mount(<LocalConstellation graph={null} nodeId="machine:m-leg-press" onOpen={() => {}} />);
    expect(host.querySelector('[role="status"]')?.getAttribute("aria-label")).toBe("Finding what connects…");
  });

  it("says so, quietly, for a node nothing connects to", async () => {
    const lonely: VaultGraph = { nodes: [n("term:x", "X", "method", { kind: "glossary", term: "X" })], edges: [] };
    await mount(<LocalConstellation graph={lonely} nodeId="term:x" onOpen={() => {}} />);
    expect(host.querySelector(".vtg__empty")?.textContent).toBe("Nothing else in Learning connects here yet.");
    expect(pills()).toHaveLength(0);
  });
});

describe("the orbit", () => {
  it("draws the centre, a line and a 44px node per link, and the same links as the list", async () => {
    await mount(<LocalConstellation graph={GRAPH} nodeId="machine:m-leg-press" onOpen={() => {}} variant="orbit" />);
    const orbit = host.querySelector(".vtg__orbit")!;
    expect(orbit.getAttribute("aria-hidden")).toBe("true");
    expect(orbit.querySelector(".vtg__centre")?.textContent).toBe("LEG PRESS");
    expect(orbit.querySelectorAll(".vtg__line")).toHaveLength(6);
    const nodes = Array.from(orbit.querySelectorAll<HTMLButtonElement>(".vtg__node"));
    expect(nodes).toHaveLength(6);
    // A picture for a finger: out of the tab order, the list is the way in.
    for (const b of nodes) expect(b.tabIndex).toBe(-1);
    expect(pills()).toHaveLength(6);
    // Half down the right, half back up the left.
    expect(nodes.filter((b) => b.classList.contains("vtg__node--right"))).toHaveLength(3);
    expect(nodes.filter((b) => b.classList.contains("vtg__node--left"))).toHaveLength(3);
    const box = orbit.querySelector<HTMLElement>(".vtg__orbit-in")!;
    expect(parseFloat(box.style.height)).toBeGreaterThan(0);
  });

  it("opens a node's page from the drawing too", async () => {
    const opened: VaultRoute[] = [];
    await mount(<LocalConstellation graph={GRAPH} nodeId="machine:m-leg-press" onOpen={(r) => opened.push(r)} variant="orbit" />);
    const gap = Array.from(host.querySelectorAll<HTMLButtonElement>(".vtg__node")).find((b) =>
      b.textContent?.includes("LEG CURL"),
    )!;
    await act(async () => gap.click());
    expect(opened).toEqual([{ kind: "machine", id: "m-leg-curl" }]);
  });

  it("lays itself out for the width it is given", async () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(640);
    await mount(<LocalConstellation graph={GRAPH} nodeId="machine:m-leg-press" onOpen={() => {}} variant="orbit" />);
    expect(host.querySelector(".vtg__lines")?.getAttribute("width")).toBe("640");
    const label = host.querySelector<HTMLElement>(".vtg__node--right .vtg__node-label")!;
    expect(parseFloat(label.style.maxWidth)).toBeGreaterThan(56);
  });

  it("drawn alone (list={false}), its nodes are the way in: focusable, each named with why it connects", async () => {
    const opened: VaultRoute[] = [];
    await mount(
      <LocalConstellation graph={GRAPH} nodeId="machine:m-leg-press" onOpen={(r) => opened.push(r)} variant="orbit" list={false} />,
    );
    expect(pills()).toHaveLength(0);
    expect(headings()).toEqual([]);
    const orbit = host.querySelector(".vtg__orbit")!;
    expect(orbit.getAttribute("aria-hidden")).toBeNull();
    expect(host.querySelector("section.vtg")?.getAttribute("aria-label")).toBe("What connects to LEG PRESS");
    const nodes = Array.from(orbit.querySelectorAll<HTMLButtonElement>(".vtg__node"));
    expect(nodes).toHaveLength(6);
    for (const b of nodes) expect(b.tabIndex).toBe(0);
    const flag = nodes.find((b) => b.textContent?.includes("Osteoporosis"))!;
    expect(flag.getAttribute("aria-label")).toBe("Osteoporosis / Severe Osteopenia, clinical flag. Clinical flags.");
    // The drawing's lines and its centre say nothing a reader needs twice.
    expect(orbit.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(orbit.querySelector(".vtg__centre")?.getAttribute("aria-hidden")).toBe("true");
    await act(async () => flag.click());
    expect(opened).toEqual([{ kind: "map", focus: "clinical:bone-osteoporosis" }]);
  });

  it("names the centre in capitals only where its words fit whole (never \"PRES S\")", async () => {
    // 340px: the middle has 44px for words. The old small-letter guess let
    // "PRESS" in, and the browser broke it; measured as capitals it does not fit.
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(340);
    await mount(<LocalConstellation graph={GRAPH} nodeId="machine:m-leg-press" onOpen={() => {}} variant="orbit" />);
    const centre = host.querySelector(".vtg__centre")!;
    expect(centre.classList.contains("vtg__centre--mark")).toBe(true);
    expect(centre.querySelector(".vtg__centre-label")).toBeNull();
  });

  it("is just the list when there is nothing to orbit", async () => {
    const lonely: VaultGraph = { nodes: [n("term:x", "X", "method", { kind: "glossary", term: "X" })], edges: [] };
    await mount(<LocalConstellation graph={lonely} nodeId="term:x" onOpen={() => {}} variant="orbit" />);
    expect(host.querySelector(".vtg__orbit")).toBeNull();
  });
});
