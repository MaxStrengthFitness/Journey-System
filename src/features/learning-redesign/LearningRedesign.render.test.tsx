// @vitest-environment jsdom
/**
 * THE ROOT OF EVERY PROTOTYPE (the Learning vault redesign, Oct 19 2026):
 * who is reading (the real rules, then "View as"), and ONE sandbox per
 * studio that survives a switch between designs and starts again when the
 * studio changes. The design itself is stood in for by a screen that reads
 * the vault the way the real ones do.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fx = vi.hoisted(() => ({
  isAdmin: false,
  seen: [] as { design: string; props: Record<string, unknown>; vault: unknown }[],
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
  function LazyDesign({ design, ...props }: { design: string } & Record<string, unknown>) {
    const vault = useVault();
    fx.seen.push({ design, props, vault });
    return <div data-screen="design" data-design={design} data-lens={vault.lens} />;
  }
  return { LazyDesign };
});

import type { Trainer } from "../../types";
import { createSandboxStore } from "../learning-vault/markup-store";
import type { VaultContextValue } from "../learning-vault/ui/VaultProvider";
import { LearningRedesign } from "./LearningRedesign";
import type { ViewAs } from "./design";
import type { RedesignId } from "./lazy";

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
  design?: RedesignId;
  viewAs?: ViewAs | null;
  who?: Trainer | null;
  studioId?: string | null;
  studioName?: string;
}) {
  await act(async () => {
    root.render(
      <LearningRedesign
        design={opts.design ?? "codex"}
        viewAs={opts.viewAs ?? null}
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

  it("View as changes what they may do, never who they are", async () => {
    await draw({ who: trainer, viewAs: "head-office" });
    expect(vault().viewer).toEqual({ uid: "uid-sam", name: "Sam Lee", canStrike: true, canNote: true, isHeadOffice: true });
    await draw({ who: leader, viewAs: "trainer" });
    expect(vault().viewer).toEqual({ uid: "uid-sam", name: "Sam Lee", canStrike: false, canNote: true, isHeadOffice: false });
  });

  it("nobody signed in reads the original, and may do nothing", async () => {
    await draw({ who: null, studioId: null, studioName: "This studio" });
    expect(vault().viewer).toMatchObject({ name: "", canStrike: false, canNote: false });
    expect(vault().lens).toBe("original");
  });
});

describe("the sandbox", () => {
  it("is made once and seeded with the sample, so a fresh prototype shows markup", async () => {
    await draw({});
    expect(createSandboxStore).toHaveBeenCalledTimes(1);
    expect(vault().store.allMarkup().some((m) => m.studioId === "solon")).toBe(true);
  });

  it("survives a switch between the designs: the same store, every mark kept", async () => {
    await draw({ design: "codex" });
    const first = vault().store;
    await draw({ design: "vault" });
    expect(host.querySelector('[data-screen="design"]')?.getAttribute("data-design")).toBe("vault");
    await draw({ design: "course", viewAs: "trainer" });
    expect(vault().store).toBe(first);
    expect(createSandboxStore).toHaveBeenCalledTimes(1);
  });

  it("starts again when the studio changes", async () => {
    await draw({ studioId: "solon", studioName: "Solon" });
    const solon = vault().store;
    await draw({ studioId: "willoughby", studioName: "Willoughby" });
    expect(vault().store).not.toBe(solon);
    expect(vault().studio).toEqual({ id: "willoughby", name: "Willoughby" });
    expect(vault().store.allMarkup().some((m) => m.studioId === "willoughby")).toBe(true);
    expect(createSandboxStore).toHaveBeenCalledTimes(2);
  });
});

describe("what the design is given", () => {
  it("the design props, and nothing of the bar's own", async () => {
    await draw({ design: "course", viewAs: "leader" });
    expect(last().design).toBe("course");
    expect(Object.keys(last().props).sort()).toEqual(
      ["jump", "machines", "onJumpHandled", "onSection", "section", "studioId", "studioName"].sort(),
    );
    expect(last().props.jump).toEqual({ kind: "machine", id: "m-leg-press" });
  });
});
