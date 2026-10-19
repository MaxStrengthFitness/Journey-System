// @vitest-environment jsdom
/**
 * The floor's status, mounted: the Catalog's plum "Out of service" and
 * "Flagged" badges on a row, and at the top of a machine page who, when
 * and what, in today's words; nothing at all when there is nothing to say
 * or the status is unknown.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MachineFloorCare } from "../floor-care";
import { FloorStatus } from "./FloorStatus";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const AT = new Date(Date.UTC(2026, 9, 18, 12, 52)).toISOString();

const FLAGGED: MachineFloorCare = {
  outOfService: false,
  flag: { text: "Left pad sticks at the bottom", by: "Jess Moreno", at: AT },
};
const OUT: MachineFloorCare = {
  outOfService: true,
  outOfServiceWhy: { text: "A new cable is on order", by: "Glorfindel Hale", at: AT },
};

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

async function draw(node: ReactNode) {
  await act(async () => root.render(node));
}

const badges = () => [...host.querySelectorAll(".wk__badge")].map((b) => `${b.textContent}|${b.className}`);

describe("FloorStatus — nothing to say", () => {
  it("draws nothing for an unknown status, a machine with nothing to say, in either form", async () => {
    for (const status of [null, undefined, { outOfService: false }]) {
      await draw(<FloorStatus status={status} variant="chip" />);
      expect(host.innerHTML).toBe("");
      await draw(<FloorStatus status={status} variant="banner" />);
      expect(host.innerHTML).toBe("");
    }
  });
});

describe("FloorStatus — on a catalog row (chip)", () => {
  it("is the Catalog's caution badges, plum, never crimson", async () => {
    await draw(<FloorStatus status={{ ...OUT, flag: FLAGGED.flag }} variant="chip" />);
    expect(badges()).toEqual(["Out of service|wk__badge wk__badge--warn", "Flagged|wk__badge wk__badge--warn"]);
    expect(host.querySelector(".wk__badge--alert")).toBeNull();
    // Inside a row's button: phrasing content only, and nothing to tap.
    expect(host.querySelector("p, div, button, a")).toBeNull();
  });

  it("says why it is out of service under the badges, as today's row does, unless told not to", async () => {
    await draw(<FloorStatus status={OUT} variant="chip" />);
    expect(host.querySelector(".vtf__why")?.textContent).toBe("A new cable is on order · Glorfindel");
    await draw(<FloorStatus status={OUT} variant="chip" why={false} />);
    expect(host.querySelector(".vtf__why")).toBeNull();
    await draw(<FloorStatus status={FLAGGED} variant="chip" />);
    expect(badges()).toEqual(["Flagged|wk__badge wk__badge--warn"]);
    expect(host.querySelector(".vtf__why")).toBeNull();
  });
});

describe("FloorStatus — at the top of a machine page (banner)", () => {
  it("says the flag's words, who flagged it and when, and where it is cleared", async () => {
    await draw(<FloorStatus status={FLAGGED} variant="banner" tz="America/New_York" />);
    const notes = [...host.querySelectorAll(".vtf__note")];
    expect(notes).toHaveLength(1);
    expect(notes[0].getAttribute("role")).toBe("status");
    const who = notes[0].querySelector(".vtf__who")!.textContent!;
    expect(who).toMatch(/^Flagged by Jess · Oct 18, 8:52\sAM$/);
    expect(notes[0].querySelector(".vtf__text")?.textContent).toBe("Left pad sticks at the bottom");
    expect(notes[0].querySelector(".vtf__where")?.textContent).toBe("Cleared on My Studio → Relay.");
  });

  it("says out of service, who and when, the reason, and where it goes back in", async () => {
    await draw(<FloorStatus status={OUT} variant="banner" tz="America/New_York" />);
    const note = host.querySelector(".vtf__note")!;
    expect(note.querySelector(".vtf__who")!.textContent).toMatch(/^Out of service · Glorfindel · Oct 18, 8:52\sAM$/);
    expect(note.querySelector(".vtf__text")?.textContent).toBe("A new cable is on order");
    expect(note.querySelector(".vtf__where")?.textContent).toBe("Back in service is on My Studio → Machines.");
  });

  it("says both when both are true, out of service first; an older entry with no reason says the words alone", async () => {
    await draw(<FloorStatus status={{ outOfService: true, flag: { text: "" } }} variant="banner" />);
    const notes = [...host.querySelectorAll(".vtf__note")];
    expect(notes.map((n) => n.querySelector(".vtf__who")!.textContent)).toEqual(["Out of service", "Flagged by a trainer"]);
    // Nothing guessed: no reason line, no note line, no time.
    expect(host.querySelectorAll(".vtf__text")).toHaveLength(0);
  });
});
