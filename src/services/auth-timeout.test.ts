/**
 * The staff sign-in check's reads have a time limit (server/auth.ts, the
 * speed round's review, Oct 5 2026). Every /api/mindbody/* and /api/gemini/*
 * request waits on this check first; a Firestore read that never answered
 * used to hold the request for ever. Now it is UNKNOWN after the limit: the
 * request is answered 503 "Couldn't confirm your account just now", never as
 * signed out and never as not staff. Firebase's token check and Firestore are
 * stubbed; nothing leaves this machine.
 */

import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase-admin/app", () => ({
  getApps: () => [],
  initializeApp: () => ({}),
}));
vi.mock("firebase-admin/auth", () => ({
  // The token names the uid (the original case's "some-token" is
  // "trainer-1"), so each case has its own entry in the profile cache.
  getAuth: () => ({
    verifyIdToken: async (token: string) => ({ uid: token === "some-token" ? "trainer-1" : token }),
  }),
}));

import { AUTH_READ_TIMEOUT_MS, requireStaff, restGet } from "../../server/auth";

const realFetch = globalThis.fetch;
const saved: Record<string, string | undefined> = {};
const servers: { close: () => void }[] = [];

/** Firestore never answers, and the request rejects only when its signal fires (as fetch does). Everything else is real. */
function firestoreHangs() {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input: any, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input?.url ?? input);
    if (!url.includes("firestore.googleapis.com")) return realFetch(input, init);
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
    });
  });
}

beforeEach(() => {
  for (const k of ["AUTH_READ_TIMEOUT_MS", "VITE_FIREBASE_PROJECT_ID"]) saved[k] = process.env[k];
  process.env.AUTH_READ_TIMEOUT_MS = "40";
  process.env.VITE_FIREBASE_PROJECT_ID = "test-project";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  while (servers.length) servers.pop()!.close();
});

describe("restGet's time limit", () => {
  it("is fifteen seconds", () => {
    expect(AUTH_READ_TIMEOUT_MS).toBe(15_000);
  });

  it("gives up on a read that never answers, as a 504 with a reason, never as an empty document", async () => {
    const fetchSpy = firestoreHangs();
    const read = await restGet("https://firestore.googleapis.com/v1/projects/p/databases/d/documents/trainers/u", "token");
    expect(read.status).toBe(504);
    expect(read.body.error.message).toMatch(/didn't answer within/);
    expect(fetchSpy.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("answers a quick read as before", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ fields: { name: { stringValue: "AJ" } } }), { status: 200 }),
    );
    const read = await restGet("https://firestore.googleapis.com/v1/x", "token");
    expect(read).toEqual({ status: 200, body: { fields: { name: { stringValue: "AJ" } } } });
  });
});

describe("requireStaff when Firestore doesn't answer", () => {
  it("answers 503 'Couldn't confirm your account', never signed out or not staff, and never reaches the route", async () => {
    firestoreHangs();
    const route = vi.fn((_req: express.Request, res: express.Response) => res.json({ ok: true }));
    const app = express();
    app.use(express.json());
    app.post("/api/mindbody/anything", requireStaff(), route);
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    servers.push(server);

    const res = await realFetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/mindbody/anything`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer some-token" },
      body: JSON.stringify({ siteId: "29068" }),
    });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/Couldn't confirm your account just now \(could not read your staff profile \(HTTP 504: Firestore didn't answer within/);
    expect(route).not.toHaveBeenCalled();
  });
});

/**
 * The cross-train allowance only on routes that look up one client (the
 * franchise partition, second review, high). A Solon trainer asks about a
 * client they may open whose home is westlake, on site 29068: the route that
 * looks up that client lets it through, a route that serves the whole site
 * does not, and a client homed at Demo Mode's studio never vouches for a site.
 */
describe("requireStaff's cross-train allowance", () => {
  const rest = (fields: Record<string, unknown>) =>
    new Response(JSON.stringify({ fields }), { status: 200 });

  function firestoreAnswers(clientHome: string, clientMbId: string = "100000123") {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input?.url ?? input);
      if (!url.includes("firestore.googleapis.com")) return realFetch(input, init);
      const path = decodeURIComponent(url.split("/documents/")[1] ?? "").split("?")[0];
      if (path.startsWith("trainers/")) {
        return rest({ role: { stringValue: "LifeTransformer" }, primaryHomeStudioId: { stringValue: "solon" } });
      }
      if (path === "studios/solon") return rest({ mindbodySiteId: { stringValue: "5746957" } });
      if (path === "studios/westlake") return rest({ mindbodySiteId: { stringValue: "29068" } });
      if (path === "studios/demo-studio") return rest({ mindbodySiteId: { stringValue: "29068" } });
      if (path === "clients/100000123") {
        return rest({ homeStudioId: { stringValue: clientHome }, mindbodyClientId: { stringValue: clientMbId } });
      }
      return new Response(JSON.stringify({ error: { message: "not found" } }), { status: 404 });
    });
  }

  async function ask(middleware: express.RequestHandler, token: string) {
    const route = vi.fn((_req: express.Request, res: express.Response) => res.json({ ok: true }));
    const app = express();
    app.use(express.json());
    app.post("/api/mindbody/route", middleware, route);
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    servers.push(server);
    const res = await realFetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/mindbody/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ siteId: "29068", mindbodyClientId: "100000123" }),
    });
    return { status: res.status, reached: route.mock.calls.length > 0 };
  }

  it("refuses a route that serves the whole site, even with a readable client named", async () => {
    firestoreAnswers("westlake");
    const r = await ask(requireStaff(), "scope-whole-site");
    expect(r.status).toBe(403);
    expect(r.reached).toBe(false);
  });

  it("lets a route that looks up that one client through", async () => {
    firestoreAnswers("westlake");
    const r = await ask(requireStaff({ clientLookup: true }), "scope-client-lookup");
    expect(r.status).toBe(200);
    expect(r.reached).toBe(true);
  });

  it("never lets a record whose mindbodyClientId names someone else vouch for the client asked about (attack review, Oct 10 2026)", async () => {
    firestoreAnswers("westlake", "100000999");
    const r = await ask(requireStaff({ clientLookup: true }), "scope-other-person");
    expect(r.status).toBe(403);
    expect(r.reached).toBe(false);
  });

  it("never lets a client homed at Demo Mode's studio vouch for a site", async () => {
    firestoreAnswers("demo-studio");
    const r = await ask(requireStaff({ clientLookup: true }), "scope-demo");
    expect(r.status).toBe(403);
    expect(r.reached).toBe(false);
  });
});
