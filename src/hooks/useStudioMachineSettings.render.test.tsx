// @vitest-environment jsdom
/**
 * A studio's Studio setup cards, live (the studio machines round's review,
 * Oct 13 2026). The session and the profile read them now, and the catalog's
 * machines share ids across studios, so one studio's cards must never stand
 * in for another's: the map is emptied when the studio changes, and when a
 * read fails.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Listener = { studioId: unknown; next: (snap: unknown) => void; fail: (e: unknown) => void };
const net = vi.hoisted(() => ({ listeners: [] as Listener[] }));
vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  where: (_f: string, _op: string, value: unknown) => ({ value }),
  query: (_c: unknown, w: { value: unknown }) => ({ studioId: w.value }),
  onSnapshot: (q: { studioId: unknown }, next: Listener["next"], fail: Listener["fail"]) => {
    net.listeners.push({ studioId: q.studioId, next, fail });
    return () => {};
  },
}));
vi.mock("../firebase", () => ({ db: {} }));

import { useStudioMachineSettings } from "./useStudioMachineSettings";

let seen: Record<string, unknown> = {};
function Probe({ studioId }: { studioId: string | null }) {
  seen = useStudioMachineSettings(studioId).settingsByMachineId;
  return null;
}
const answer = (studioId: string, machineId: string) => ({
  docs: [{ id: `${studioId}_${machineId}`, data: () => ({ studioId, machineId, settingOptions: ["Seat"] }) }],
});

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  net.listeners.length = 0;
  vi.restoreAllMocks();
});

describe("useStudioMachineSettings never answers with another studio's cards", () => {
  it("empties the map when the studio changes, before the new studio answers", async () => {
    root = createRoot(document.createElement("div"));
    await act(async () => root!.render(<Probe studioId="strongsville" />));
    await act(async () => net.listeners[0]!.next(answer("strongsville", "m-leg-press")));
    expect(Object.keys(seen)).toEqual(["m-leg-press"]);
    await act(async () => root!.render(<Probe studioId="solon" />));
    expect(seen).toEqual({});
  });

  it("empties the map when the read fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    root = createRoot(document.createElement("div"));
    await act(async () => root!.render(<Probe studioId="strongsville" />));
    await act(async () => net.listeners[0]!.next(answer("strongsville", "m-leg-press")));
    await act(async () => net.listeners[0]!.fail(new Error("refused")));
    expect(seen).toEqual({});
  });
});
