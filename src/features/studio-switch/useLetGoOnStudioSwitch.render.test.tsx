// @vitest-environment jsdom
/**
 * THE HOOK, MOUNTED: a studio switch lets go of the client before anything is
 * drawn (Oct 12 2026; AJ: "switching a studio with a client pulled up keeps
 * the client loaded, switching studios should clear whoever youre holding").
 *
 * It sets state during render, which only a mounted test can check: the
 * screen below never sees the new studio with the old client, not even for
 * one render, and a client's own screen goes to the Hub.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { View } from "../../types";
import { useLetGoOnStudioSwitch } from "./useLetGoOnStudioSwitch";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; host: HTMLElement }[] = [];
afterEach(() => {
  for (const { root, host } of mounted) {
    act(() => root.unmount());
    host.remove();
  }
  mounted = [];
});

/** What the screen below was drawn with, render by render. */
let drawn: string[] = [];
let pickClient: (id: string | null) => void = () => {};

function Screen({ studio, client, view }: { studio: string | null; client: string | null; view: View }) {
  drawn.push(`${studio}|${client ?? "-"}|${view}`);
  return null;
}

function Shell({ studio, startView }: { studio: string | null; startView: View }) {
  const [client, setClient] = useState<string | null>(null);
  const [view, setView] = useState<View>(startView);
  pickClient = setClient;
  useLetGoOnStudioSwitch(studio, view, ({ toHub }) => {
    setClient(null);
    if (toHub) setView("clients");
  });
  return <Screen studio={studio} client={client} view={view} />;
}

function mount(studio: string | null, startView: View) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<Shell studio={studio} startView={startView} />));
  mounted.push({ root, host });
  return (next: string | null) => act(() => root.render(<Shell studio={next} startView={startView} />));
}

describe("useLetGoOnStudioSwitch", () => {
  it("lets go of the client on a switch, and the new studio never draws her", () => {
    drawn = [];
    const switchTo = mount("westlake", "profile");
    act(() => pickClient("c1"));
    expect(drawn.at(-1)).toBe("westlake|c1|profile");
    drawn = [];
    switchTo("solon");
    // Her profile went to the Hub, with nobody held.
    expect(drawn.at(-1)).toBe("solon|-|clients");
    // And no render at Solon ever carried her.
    expect(drawn.filter((d) => d.startsWith("solon|c1"))).toEqual([]);
  });

  it("keeps the screen when it is not a client's own", () => {
    drawn = [];
    const switchTo = mount("westlake", "client-directory");
    act(() => pickClient("c1"));
    switchTo("solon");
    expect(drawn.at(-1)).toBe("solon|-|client-directory");
  });

  it("holds on through a render on the same studio, and lets nobody go entering a studio from none", () => {
    drawn = [];
    const switchTo = mount(null, "clients");
    switchTo("westlake");
    act(() => pickClient("c1"));
    switchTo("westlake");
    expect(drawn.at(-1)).toBe("westlake|c1|clients");
  });
});
