// @vitest-environment jsdom
/**
 * THE DENSE CARD (the phone minimalist round, Oct 19 2026): a phone's list
 * row keeps the name whole, the Critical triangle and the state word, and
 * drops what the row or the peek already says — the time, the number, "New
 * to Journey" and the service. Everything else is HubCard.render.test.tsx's.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HubCard } from "./HubCard";
import { loggedSessions } from "../../lib/booking-state";
import type { Client } from "../../types";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const DAY = "2026-10-19";
const at = (hm: string) => new Date(`${DAY}T${hm}:00-04:00`);
const client = { id: "c1", firstName: "Trisha", lastName: "Patel" } as unknown as Client;
const booking = (hm: string) => ({
  id: `b-${hm}`,
  clientId: "c1",
  clientName: "Trisha Patel",
  trainerId: "t1",
  studioId: "solon",
  startTime: at(hm),
  endTime: new Date(at(hm).getTime() + 30 * 60_000),
  status: "Scheduled",
  serviceName: "Consultation",
});

function mount(dense: boolean, hm = "15:00", now = at("12:00")) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <StrictMode>
        <HubCard
          booking={booking(hm)}
          client={client}
          entry={null}
          sessionNumber={264}
          newToJourney
          usualService="Training Session"
          logged={loggedSessions([])}
          now={now}
          dense={dense}
          onOpen={() => {}}
        />
      </StrictMode>,
    ),
  );
  return host.querySelector<HTMLElement>(".hs-card")!;
}

describe("the dense card", () => {
  it("keeps the name whole and drops the time, the number, New to Journey and the service", () => {
    const full = mount(false);
    expect(full.textContent).toContain("3:00");
    expect(full.textContent).toContain("#264");
    expect(full.textContent).toContain("Consultation");
    act(() => root!.unmount());
    host!.remove();

    const card = mount(true);
    expect(card.getAttribute("data-dense")).toBe("true");
    expect(card.querySelector(".hs-card-name")?.textContent).toBe("Trisha Patel");
    expect(card.textContent).not.toContain("3:00");
    expect(card.textContent).not.toContain("#");
    expect(card.textContent).not.toContain("New to Journey");
    expect(card.textContent).not.toContain("Consultation");
    expect(card.querySelector(".hs-card-when")?.textContent).toBe("");
  });

  it("still says what happened: Not logged on a slot nobody logged", () => {
    const card = mount(true, "07:00", at("12:00"));
    expect(card.textContent).toContain("Not logged");
    expect(card.textContent).not.toContain("7:00");
  });
});
