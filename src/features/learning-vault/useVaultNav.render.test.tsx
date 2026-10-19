// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/*
 * The leave guard is stubbed for most of these (the test answers each
 * question itself), and real for the last group, which proves the hook keeps
 * the Learning door rule with the app's own gate: asked first, state changed
 * only inside the answer, "Keep editing" leaves everything where it was.
 */
const fx = vi.hoisted(() => ({
  stub: true,
  asked: [] as (() => void)[],
}));

vi.mock("../unsaved-changes", async (importOriginal) => {
  const real = await importOriginal<typeof import("../unsaved-changes")>();
  const stubGuard = (proceed: () => void) => {
    fx.asked.push(proceed);
  };
  return {
    ...real,
    // fx.stub never changes while a component is mounted, so the hook order is stable.
    useLeaveGuard: () => (fx.stub ? stubGuard : real.useLeaveGuard()),
  };
});

import { UnsavedChangesProvider, useUnsavedChanges } from "../unsaved-changes";
import { routeKey } from "./routes";
import type { VaultRoute } from "./types";
import { useVaultNav, type VaultNav } from "./useVaultNav";

let host: HTMLDivElement;
let root: Root;
let nav: VaultNav;

const HOME: VaultRoute = { kind: "home" };
const CARD: VaultRoute = { kind: "card", id: "lp" };
const TOPIC: VaultRoute = { kind: "topic", moduleId: "performance", topicId: "performance-turnaround-technique" };

function Probe({ start = HOME }: { start?: VaultRoute }) {
  nav = useVaultNav(start);
  return <p data-testid="route">{routeKey(nav.route)}</p>;
}

/** A page holding typing, as a strike form under a line would. */
function Typing() {
  const [draft, setDraft] = useState("This unit has no seat belt.");
  useUnsavedChanges(draft !== "", "Solon's reason for crossing out a line", { onDiscard: () => setDraft("") });
  return <textarea data-testid="draft" value={draft} onChange={(e) => setDraft(e.target.value)} />;
}

const shown = () => host.querySelector('[data-testid="route"]')?.textContent;
const keys = () => nav.stack.map(routeKey);

async function mount(ui: React.ReactNode) {
  await act(async () => root.render(ui));
}

async function answer(i = fx.asked.length - 1) {
  await act(async () => fx.asked[i]());
}

beforeEach(() => {
  fx.stub = true;
  fx.asked = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("useVaultNav — through a stubbed leave guard", () => {
  it("starts on its root with nowhere to go back to", async () => {
    await mount(<Probe />);
    expect(shown()).toBe("home");
    expect(nav.stack).toEqual([HOME]);
    expect(nav.canBack).toBe(false);
  });

  it("asks before a push and moves only inside the answer", async () => {
    await mount(<Probe />);
    await act(async () => nav.push(CARD));
    expect(fx.asked).toHaveLength(1);
    expect(shown()).toBe("home");

    await answer();
    expect(shown()).toBe("card:lp");
    expect(keys()).toEqual(["home", "card:lp"]);
    expect(nav.canBack).toBe(true);
  });

  it("stays put when the question is never answered (Keep editing)", async () => {
    await mount(<Probe />);
    await act(async () => nav.push(CARD));
    await act(async () => nav.push(TOPIC));
    expect(fx.asked).toHaveLength(2);
    expect(shown()).toBe("home");
    expect(nav.stack).toEqual([HOME]);
  });

  it("asks nothing for a push of the page already on top", async () => {
    await mount(<Probe />);
    await act(async () => nav.push(CARD));
    await answer();
    await act(async () => nav.push({ kind: "card", id: "lp" }));
    expect(fx.asked).toHaveLength(1);
    expect(keys()).toEqual(["home", "card:lp"]);
  });

  it("goes back one page after asking, and asks nothing on the root", async () => {
    await mount(<Probe />);
    await act(async () => nav.back());
    expect(fx.asked).toHaveLength(0);

    await act(async () => nav.push(CARD));
    await answer();
    await act(async () => nav.push(TOPIC));
    await answer();
    expect(keys()).toEqual(["home", "card:lp", routeKey(TOPIC)]);

    await act(async () => nav.back());
    expect(shown()).toBe(routeKey(TOPIC));
    await answer();
    expect(shown()).toBe("card:lp");
    expect(keys()).toEqual(["home", "card:lp"]);
  });

  it("replaces the page on top after asking (a machine's tier)", async () => {
    await mount(<Probe start={{ kind: "machine", id: "m-leg-press" }} />);
    await act(async () => nav.replace({ kind: "machine", id: "m-leg-press", tier: "adapt" }));
    expect(shown()).toBe("machine:m-leg-press");
    await answer();
    expect(shown()).toBe("machine:m-leg-press#adapt");
    expect(nav.stack).toHaveLength(1);

    await act(async () => nav.replace({ kind: "machine", id: "m-leg-press", tier: "adapt" }));
    expect(fx.asked).toHaveLength(1);
  });

  it("cuts the trail back to a page re-opened from further down", async () => {
    await mount(<Probe />);
    await act(async () => nav.push(CARD));
    await answer();
    await act(async () => nav.push(TOPIC));
    await answer();
    await act(async () => nav.push(HOME));
    await answer();
    expect(keys()).toEqual(["home"]);
    expect(nav.canBack).toBe(false);
  });

  it("resets to a new root after asking, and asks nothing to reset to where it is", async () => {
    await mount(<Probe />);
    await act(async () => nav.reset(HOME));
    expect(fx.asked).toHaveLength(0);

    await act(async () => nav.push(CARD));
    await answer();
    await act(async () => nav.reset({ kind: "academy" }));
    expect(keys()).toEqual(["home", "card:lp"]);
    await answer();
    expect(keys()).toEqual(["academy"]);
  });

  it("keeps the trail when the parent hands a different root on a re-render", async () => {
    await mount(<Probe />);
    await act(async () => nav.push(CARD));
    await answer();
    await mount(<Probe start={{ kind: "catalog" }} />);
    expect(keys()).toEqual(["home", "card:lp"]);
  });
});

describe("useVaultNav — with the app's own gate", () => {
  beforeEach(() => {
    fx.stub = false;
  });

  const question = () => document.querySelector('[data-testid="leave-confirm"]');
  const press = async (action: "keep-editing" | "leave") => {
    const button = document.querySelector(`[data-testid="leave-confirm"] [data-action="${action}"]`) as HTMLElement | null;
    expect(button).not.toBeNull();
    await act(async () => button!.click());
  };

  it("moves at once when nothing is typed", async () => {
    await mount(
      <UnsavedChangesProvider>
        <Probe />
      </UnsavedChangesProvider>,
    );
    await act(async () => nav.push(CARD));
    expect(question()).toBeNull();
    expect(shown()).toBe("card:lp");
  });

  it("asks over typing; Keep editing keeps the page and the words", async () => {
    await mount(
      <UnsavedChangesProvider>
        <Probe />
        <Typing />
      </UnsavedChangesProvider>,
    );
    await act(async () => nav.push(CARD));
    expect(question()).not.toBeNull();
    expect(shown()).toBe("home");

    await press("keep-editing");
    expect(question()).toBeNull();
    expect(shown()).toBe("home");
    expect((host.querySelector('[data-testid="draft"]') as HTMLTextAreaElement).value).toBe(
      "This unit has no seat belt.",
    );
  });

  it("asks over typing; Leave lets the words go and then moves", async () => {
    await mount(
      <UnsavedChangesProvider>
        <Probe />
        <Typing />
      </UnsavedChangesProvider>,
    );
    await act(async () => nav.push(CARD));
    await press("leave");
    expect(shown()).toBe("card:lp");
    expect((host.querySelector('[data-testid="draft"]') as HTMLTextAreaElement).value).toBe("");
  });
});
