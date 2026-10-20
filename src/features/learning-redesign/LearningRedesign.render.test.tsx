// @vitest-environment jsdom
/**
 * THE MIX'S ROOT (the Learning vault redesign, Oct 19 2026; everyone's
 * Learning since Oct 20 2026): who is reading (the real rules), marking off,
 * and ONE store per studio that starts empty and starts again when the
 * studio changes. The Mix itself is stood in for by a screen that reads the
 * vault the way the real one does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fx = vi.hoisted(() => ({
  isAdmin: false,
  seen: [] as { props: Record<string, unknown>; vault: unknown }[],
}));

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-sam" } } }));
vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudioId: "solon", activeStudio: { id: "solon", name: "Solon" }, isAdmin: fx.isAdmin }),
}));
vi.mock("../learning-vault/markup-store", async (importOriginal) => {
  const real = await importOriginal<typeof import("../learning-vault/markup-store")>();
  return { ...real, createSandboxStore: vi.fn(real.createSandboxStore) };
});
vi.mock("./lazy", async () => {
  const { useVault } = await import("../learning-vault/ui/VaultProvider");
  function LazyMix(props: Record<string, unknown>) {
    const vault = useVault();
    fx.seen.push({ props, vault });
    return <div data-screen="design" data-lens={vault.lens} />;
  }
  return { LazyMix };
});

import type { Trainer } from "../../types";
import { createSandboxStore } from "../learning-vault/markup-store";
import type { VaultContextValue } from "../learning-vault/ui/VaultProvider";
import { LearningRedesign } from "./LearningRedesign";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  fx.isAdmin = false;
  fx.seen.length = 0;
  vi.mocked(createSandboxStore).mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const person = (role: string) =>
  ({ id: "t-sam", fullName: "Sam Lee", role, primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"] }) as unknown as Trainer;
const leader = person("StudioLeader");
const trainer = person("LifeTransformer");

const onSection = () => {};
const onJumpHandled = () => {};

async function draw(opts: {
  who?: Trainer | null;
  studioId?: string | null;
  studioName?: string;
}) {
  await act(async () => {
    root.render(
      <LearningRedesign
        authTrainer={opts.who === undefined ? leader : opts.who}
        section="machine-anatomy"
        onSection={onSection}
        machines={[]}
        studioId={opts.studioId === undefined ? "solon" : opts.studioId}
        studioName={opts.studioName ?? "Solon"}
        jump={{ kind: "machine", id: "m-leg-press" }}
        onJumpHandled={onJumpHandled}
      />,
    );
  });
}

const last = () => fx.seen[fx.seen.length - 1];
const vault = () => last().vault as VaultContextValue;

describe("who is reading", () => {
  it("a leader at the studio crosses out and notes, with the Auth uid and their own name", async () => {
    await draw({ who: leader });
    expect(vault().viewer).toEqual({ uid: "uid-sam", name: "Sam Lee", canStrike: true, canNote: true, isHeadOffice: false });
    expect(vault().studio).toEqual({ id: "solon", name: "Solon" });
    expect(host.querySelector('[data-screen="design"]')?.getAttribute("data-lens")).toBe("studio");
  });

  it("a trainer notes but does not cross out", async () => {
    await draw({ who: trainer });
    expect(vault().viewer).toMatchObject({ canStrike: false, canNote: true, isHeadOffice: false });
  });

  it("an administrator is head office", async () => {
    fx.isAdmin = true;
    await draw({ who: trainer });
    expect(vault().viewer.isHeadOffice).toBe(true);
  });

  it("nobody signed in reads the original, and may do nothing", async () => {
    await draw({ who: null, studioId: null, studioName: "This studio" });
    expect(vault().viewer).toMatchObject({ name: "", canStrike: false, canNote: false });
    expect(vault().lens).toBe("original");
  });
});

describe("the store", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("starts EMPTY on a production build and on a development one: no sample marks while marking is off", async () => {
    vi.stubEnv("DEV", false);
    await draw({});
    vi.stubEnv("DEV", true);
    await draw({ studioId: "willoughby", studioName: "Willoughby" });
    expect(createSandboxStore).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(createSandboxStore).mock.calls) expect(call[0]).toBeUndefined();
    expect(vault().store.allMarkup()).toEqual([]);
    expect(vault().store.submissions()).toEqual([]);
  });

  it("tells the Mix that lines cannot be marked (AJ, Oct 20 2026: markup hidden until its Firestore round)", async () => {
    await draw({});
    expect(vault().markup).toBe(false);
  });

  it("is made once while the studio stays, and again when it changes", async () => {
    await draw({ studioId: "solon", studioName: "Solon" });
    const solon = vault().store;
    await draw({ studioId: "solon", studioName: "Solon", who: trainer });
    expect(vault().store).toBe(solon);
    await draw({ studioId: "willoughby", studioName: "Willoughby" });
    expect(vault().store).not.toBe(solon);
    expect(vault().studio).toEqual({ id: "willoughby", name: "Willoughby" });
    expect(createSandboxStore).toHaveBeenCalledTimes(2);
  });
});

describe("what the Mix is given", () => {
  it("LearningView's props, passed on whole, and nothing of a picker's", async () => {
    await draw({});
    expect(Object.keys(last().props).sort()).toEqual(
      ["jump", "machines", "onJumpHandled", "onSection", "section", "studioId", "studioName"].sort(),
    );
    expect(last().props.jump).toEqual({ kind: "machine", id: "m-leg-press" });
  });
});
