// @vitest-environment jsdom
/**
 * The vault's context, mounted: the lens it starts on, and the hooks that
 * re-render when the sandbox store changes (useSyncExternalStore reads the
 * store's snapshots by identity, so this is where a mutation would show up
 * as a screen that never updates).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { toVaultBlocks } from "../blocks";
import { makeNote, makeStrike } from "../markup";
import { createSandboxStore, type MarkupStore } from "../markup-store";
import type { LearningSubmission, VaultViewer } from "../types";
import {
  VaultProvider,
  useAllMarkup,
  useOptionalVault,
  useStudioMarkup,
  useSubmissions,
  useVault,
  versionLabel,
} from "./VaultProvider";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VIEWER: VaultViewer = { uid: "uid-sam", name: "Sam Lee", canStrike: true, canNote: true, isHeadOffice: false };
const SAM = { uid: "uid-sam", name: "Sam Lee" };
const AT = "2026-10-19T14:00:00.000Z";
const BASE = { studioId: "solon", studioName: "Solon", targetKey: "machine:m-leg-press", title: "Leg Press" };
const [abd] = toVaultBlocks([{ kind: "line", text: "Consider doing ABD prior to LP to pre-fatigue glutes and improve sensation of glute engagement." }]);

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
});

const text = (sel: string) => host.querySelector(sel)?.textContent ?? null;

let renders: Record<string, number> = {};
function count(name: string) {
  renders[name] = (renders[name] ?? 0) + 1;
}

function Lens() {
  const v = useVault();
  return (
    <p data-t="lens">
      {v.lens} {String(v.showCrossed)} {v.studio.name} {v.newId("note")}
    </p>
  );
}
function LegPress() {
  count("legPress");
  const m = useStudioMarkup("machine:m-leg-press");
  return <p data-t="legpress">{m ? m.strikes.map((s) => s.reason).join("|") : "none"}</p>;
}
function Cueing() {
  count("cueing");
  const m = useStudioMarkup("academy-cueing");
  return <p data-t="cueing">{m ? String(m.notes.length) : "none"}</p>;
}
function Queue() {
  const subs = useSubmissions();
  const all = useAllMarkup();
  return (
    <p data-t="queue">
      {subs.length} {all.length}
    </p>
  );
}

async function mount(store: MarkupStore, studio: { id: string | null; name: string }, extra?: { initialLens?: "studio" | "original" }) {
  await act(async () => {
    root.render(
      <VaultProvider markup store={store} studio={studio} viewer={VIEWER} initialLens={extra?.initialLens} newId={(p) => `${p}-1`}>
        <Lens />
        <LegPress />
        <Cueing />
        <Queue />
      </VaultProvider>,
    );
  });
}

describe("VaultProvider", () => {
  beforeEach(() => {
    renders = {};
  });

  it("opens on the studio's version, crossed-out lines showing, when a studio is open", async () => {
    await mount(createSandboxStore(), { id: "solon", name: "Solon" });
    expect(text('[data-t="lens"]')).toBe("studio true Solon note-1");
  });

  it("opens on the MSF original with no studio, and stays there", async () => {
    await mount(createSandboxStore(), { id: null, name: "" }, { initialLens: "studio" });
    expect(text('[data-t="lens"]')).toBe("original true This studio note-1");
    expect(text('[data-t="legpress"]')).toBe("none");
  });

  it("re-renders a page when its markup changes, and leaves the others alone", async () => {
    const store = createSandboxStore();
    await mount(store, { id: "solon", name: "Solon" });
    expect(text('[data-t="legpress"]')).toBe("none");
    const cueingBefore = renders.cueing;

    await act(async () => store.strike(BASE, makeStrike(abd, { reason: "No Abduction here." }, SAM, AT)));
    expect(text('[data-t="legpress"]')).toBe("No Abduction here.");
    expect(text('[data-t="queue"]')).toBe("0 1");
    expect(renders.cueing).toBe(cueingBefore);

    await act(async () => store.addNote({ ...BASE, targetKey: "academy-cueing", title: "Cueing phrasebook" }, makeNote(abd, "N.", SAM, AT, "n1")));
    expect(text('[data-t="cueing"]')).toBe("1");

    await act(async () => store.unstrike("solon", "machine:m-leg-press", abd.key));
    expect(text('[data-t="legpress"]')).toBe("none");
  });

  it("reads only the open studio's markup", async () => {
    const store = createSandboxStore();
    store.strike({ ...BASE, studioId: "westlake", studioName: "westlake" }, makeStrike(abd, { reason: "Theirs." }, SAM, AT));
    await mount(store, { id: "solon", name: "Solon" });
    expect(text('[data-t="legpress"]')).toBe("none");
    expect(text('[data-t="queue"]')).toBe("0 1");
  });

  it("re-renders the queue when a submission arrives or is decided", async () => {
    const store = createSandboxStore();
    await mount(store, { id: "solon", name: "Solon" });
    const s: LearningSubmission = {
      id: "s1",
      intent: "addition",
      ref: { kind: "academy-cueing" },
      targetKey: "academy-cueing",
      targetTitle: "Cueing phrasebook",
      body: "Add a cue.",
      studioId: "solon",
      studioName: "Solon",
      by: SAM,
      at: AT,
      status: "pending",
    };
    await act(async () => store.submit(s));
    expect(text('[data-t="queue"]')).toBe("1 0");
  });
});

describe("the hooks outside a provider", () => {
  it("useVault says what is missing; the others answer nothing", async () => {
    let caught: unknown = null;
    function Throws() {
      try {
        useVault();
      } catch (err) {
        caught = err;
      }
      return null;
    }
    function Quiet() {
      const v = useOptionalVault();
      const m = useStudioMarkup("machine:m-leg-press");
      const subs = useSubmissions();
      const all = useAllMarkup();
      return <p data-t="quiet">{`${v === null} ${m === null} ${subs.length} ${all.length}`}</p>;
    }
    await act(async () => {
      root.render(
        <>
          <Throws />
          <Quiet />
        </>,
      );
    });
    expect(String(caught)).toMatch(/VaultProvider/);
    expect(text('[data-t="quiet"]')).toBe("true true 0 0");
  });
});

describe("versionLabel", () => {
  it("says the studio's version in its own name", () => {
    expect(versionLabel("Solon")).toBe("Solon's version");
    expect(versionLabel("westlake")).toBe("westlake's version");
    expect(versionLabel("James")).toBe("James' version");
    expect(versionLabel("  ")).toBe("This studio's version");
  });
});
