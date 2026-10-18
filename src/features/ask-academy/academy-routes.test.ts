/**
 * Ask the Academy's route (server/academy-routes.ts), mounted on a bare
 * Express app and called over HTTP, with the ask function swapped for a fake
 * so no key or model is needed. What it pins down: no sign-in, no question
 * and no key each stop the request before the model; one question at a time
 * per person; the answer goes back as the ask function made it; a failure
 * reads as one plain sentence.
 */
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express, { type RequestHandler } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requireStaff } from "../../../server/auth";
import { ACADEMY_ERRORS, ACADEMY_LIMITS, QUESTION_MAX, registerAcademyRoutes } from "../../../server/academy-routes";
import { createRequestLimiter } from "../../lib/request-limit";
import type { AskResult } from "./ask";

const HERE = dirname(fileURLToPath(import.meta.url));
const servers: { close: () => void }[] = [];
afterEach(() => {
  while (servers.length) servers.pop()!.close();
});

const signedInAs = (uid: string): RequestHandler => (_req, res, next) => {
  res.locals.caller = { uid, role: "LifeTransformer" };
  next();
};

const ANSWER: AskResult = { kind: "answered", health: false, points: [{ says: "Keep them breathing.", quotes: [{ text: "Breathe freely.", pageId: "topic:mastery-breathing", page: "Mastery Series › Breathing" }] }] };

async function mount(opts: { requireSignIn: RequestHandler; ask?: ((q: string) => Promise<{ result: AskResult; cost: number }>) | null }) {
  const ask = opts.ask === null ? null : vi.fn(opts.ask ?? (async () => ({ result: ANSWER, cost: 0.05 })));
  const app = express();
  registerAcademyRoutes(app, { requireSignIn: opts.requireSignIn, ask, limiter: createRequestLimiter(ACADEMY_LIMITS) });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (body: unknown, path = "/api/academy/ask") =>
    fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
  return { post, ask };
}

describe("with the real staff sign-in", () => {
  it("refuses a caller with no sign-in before reading the body or asking", async () => {
    const api = await mount({ requireSignIn: requireStaff() });
    for (const path of ["/api/academy/ask", "/API/Academy/ASK/"]) expect((await api.post("{not json", path)).status).toBe(401);
    expect(api.ask).not.toHaveBeenCalled();
  });
});

describe("server.ts", () => {
  const source = readFileSync(join(HERE, "../../../server.ts"), "utf8");

  it("mounts the route with the staff sign-in, and its body is skipped by the shared parser", () => {
    expect(source).toMatch(/registerAcademyRoutes\(app,\s*\{\s*requireSignIn:\s*requireStaff\(\)/);
    expect(source).toMatch(/isAcademyPath\(req\.path\)/);
    expect(source).not.toMatch(/app\.(post|get|put|patch|delete|all|use)\(\s*["'`]\/api\/academy/i);
  });
});

describe("signed in", () => {
  it("answers with what the ask function made, from the question tidied", async () => {
    const api = await mount({ requireSignIn: signedInAs("aj") });
    const res = await api.post({ question: "  How do I   help them breathe? " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: ANSWER });
    expect(api.ask).toHaveBeenCalledWith("How do I help them breathe?");
  });

  it("wants a question of a sensible length", async () => {
    const api = await mount({ requireSignIn: signedInAs("aj") });
    expect(await (await api.post({ question: " " })).json()).toEqual({ error: ACADEMY_ERRORS.tooShort });
    expect(await (await api.post({ question: 42 })).json()).toEqual({ error: ACADEMY_ERRORS.tooShort });
    expect(await (await api.post({ question: "x".repeat(QUESTION_MAX + 1) })).json()).toEqual({ error: ACADEMY_ERRORS.tooLong });
    expect((await api.post({ question: "x".repeat(5000) })).status).toBe(413);
    expect(api.ask).not.toHaveBeenCalled();
  });

  it("says it isn't switched on when there is no key", async () => {
    const api = await mount({ requireSignIn: signedInAs("aj"), ask: null });
    const res = await api.post({ question: "What is the lower turnaround?" });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: ACADEMY_ERRORS.notSetUp });
  });

  it("takes one question at a time from a person", async () => {
    let finish: () => void = () => {};
    const api = await mount({ requireSignIn: signedInAs("aj"), ask: () => new Promise((r) => (finish = () => r({ result: ANSWER, cost: 0 }))) });
    const first = api.post({ question: "First question?" });
    await new Promise((r) => setTimeout(r, 50));
    const second = await api.post({ question: "Second question?" });
    expect(second.status).toBe(429);
    expect((await second.json()).error).toBe(ACADEMY_LIMITS.messages!.busy);
    finish();
    expect((await first).status).toBe(200);
  });

  it("turns a failed call into one plain sentence", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const api = await mount({ requireSignIn: signedInAs("aj"), ask: async () => { throw Object.assign(new Error("overloaded"), { status: 529 }); } });
    const res = await api.post({ question: "What is the lower turnaround?" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: ACADEMY_ERRORS.failed });
    quiet.mockRestore();
  });
});
