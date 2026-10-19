import { describe, expect, it } from "vitest";
import { ACADEMY_INDEX } from "../academy/useAcademyContent";
import { LEARNING_REF_KINDS, type LearningRef } from "../learning/ref";
import {
  STACK_MAX,
  isPageRoute,
  moduleOfTopic,
  pageKey,
  popRoute,
  pushRoute,
  refForRoute,
  replaceRoute,
  routeForRef,
  routeForTargetRef,
  routeKey,
  samePage,
  sameRoute,
} from "./routes";
import type { VaultRoute } from "./types";

/** One real topic from the committed index, so the test follows a corpus rebuild. */
const someModule = ACADEMY_INDEX.modules[0];
const someTopic = someModule.topics[0];

describe("routeForRef — every LearningRef kind opens somewhere", () => {
  const cases: [LearningRef, VaultRoute][] = [
    [{ kind: "machine", id: "m-leg-press" }, { kind: "machine", id: "m-leg-press" }],
    [{ kind: "academy-card", id: "lp" }, { kind: "card", id: "lp" }],
    [{ kind: "academy-script", id: "lower-body-lp" }, { kind: "script", id: "lower-body-lp" }],
    [{ kind: "academy-overview", id: "leg-press" }, { kind: "overview", id: "leg-press" }],
    [{ kind: "academy-module", id: "performance" }, { kind: "module", moduleId: "performance" }],
    [
      { kind: "academy-topic", id: someTopic.id, moduleId: someModule.id },
      { kind: "topic", moduleId: someModule.id, topicId: someTopic.id },
    ],
    [{ kind: "academy-cueing" }, { kind: "cueing" }],
    [{ kind: "academy-glossary", id: "Concentric" }, { kind: "glossary", term: "Concentric" }],
    [{ kind: "studio-page", id: "p1", studioId: "solon" }, { kind: "academy" }],
  ];

  it("covers all nine kinds", () => {
    expect(new Set(cases.map(([ref]) => ref.kind))).toEqual(new Set(LEARNING_REF_KINDS));
  });

  it.each(cases)("%o opens %o", (ref, route) => {
    expect(routeForRef(ref)).toEqual(route);
  });

  it("finds a topic's module in the index when the link does not carry it", () => {
    expect(routeForRef({ kind: "academy-topic", id: someTopic.id })).toEqual({
      kind: "topic",
      moduleId: someModule.id,
      topicId: someTopic.id,
    });
    expect(moduleOfTopic(someTopic.id)).toBe(someModule.id);
  });

  it("believes the index over a stale module on the link", () => {
    expect(routeForRef({ kind: "academy-topic", id: someTopic.id, moduleId: "summary" })).toEqual({
      kind: "topic",
      moduleId: someModule.id,
      topicId: someTopic.id,
    });
  });

  it("keeps a renamed topic's link as a topic with no module (the page then says it moved)", () => {
    expect(routeForRef({ kind: "academy-topic", id: "no-such-topic" })).toEqual({
      kind: "topic",
      moduleId: "",
      topicId: "no-such-topic",
    });
    expect(routeForRef({ kind: "academy-topic", id: "no-such-topic", moduleId: "intro" })).toEqual({
      kind: "topic",
      moduleId: "intro",
      topicId: "no-such-topic",
    });
  });

  it("opens the whole glossary when no term is named", () => {
    expect(routeForRef({ kind: "academy-glossary" })).toEqual({ kind: "glossary" });
  });
});

describe("refForRoute and routeForTargetRef", () => {
  it("names every page and nothing that is not one", () => {
    expect(refForRoute({ kind: "machine", id: "m-ext", tier: "script" })).toEqual({ kind: "machine", id: "m-ext" });
    expect(refForRoute({ kind: "module", moduleId: "intro" })).toEqual({ kind: "academy-module", id: "intro" });
    expect(refForRoute({ kind: "topic", moduleId: "intro", topicId: "intro-mission" })).toEqual({
      kind: "academy-topic",
      id: "intro-mission",
      moduleId: "intro",
    });
    expect(refForRoute({ kind: "topic", moduleId: "", topicId: "gone-topic" })).toEqual({
      kind: "academy-topic",
      id: "gone-topic",
    });
    expect(refForRoute({ kind: "card", id: "lp" })).toEqual({ kind: "academy-card", id: "lp" });
    expect(refForRoute({ kind: "script", id: "x" })).toEqual({ kind: "academy-script", id: "x" });
    expect(refForRoute({ kind: "overview", id: "y" })).toEqual({ kind: "academy-overview", id: "y" });
    expect(refForRoute({ kind: "glossary" })).toEqual({ kind: "academy-glossary" });
    expect(refForRoute({ kind: "glossary", term: "Gap" })).toEqual({ kind: "academy-glossary", id: "Gap" });
    expect(refForRoute({ kind: "cueing", moment: 3 })).toEqual({ kind: "academy-cueing" });
    expect(refForRoute({ kind: "playbook", id: "the-floor" })).toEqual({ kind: "playbook", id: "the-floor" });

    const places: VaultRoute[] = [
      { kind: "home" },
      { kind: "catalog" },
      { kind: "academy" },
      { kind: "quiz", deck: "mixed" },
      { kind: "map" },
      { kind: "queue" },
      { kind: "track", id: "lt-101" },
    ];
    for (const r of places) {
      expect(refForRoute(r)).toBeNull();
      expect(isPageRoute(r)).toBe(false);
    }
    expect(isPageRoute({ kind: "card", id: "lp" })).toBe(true);
  });

  it("round-trips every page route through its link", () => {
    const pages: VaultRoute[] = [
      { kind: "machine", id: "m-leg-press" },
      { kind: "module", moduleId: someModule.id },
      { kind: "topic", moduleId: someModule.id, topicId: someTopic.id },
      { kind: "card", id: "lp" },
      { kind: "script", id: "lower-body-lp" },
      { kind: "overview", id: "leg-press" },
      { kind: "glossary", term: "Gap" },
      { kind: "cueing" },
      { kind: "playbook", id: "the-floor" },
    ];
    for (const r of pages) {
      const ref = refForRoute(r);
      expect(ref).not.toBeNull();
      expect(routeForTargetRef(ref!)).toEqual(r);
    }
  });

  it("opens a playbook link as a playbook and any other link as routeForRef does", () => {
    expect(routeForTargetRef({ kind: "playbook", id: "renewals" })).toEqual({ kind: "playbook", id: "renewals" });
    expect(routeForTargetRef({ kind: "academy-cueing" })).toEqual({ kind: "cueing" });
  });
});

describe("routeKey, sameRoute, samePage", () => {
  it("gives every distinct place its own key", () => {
    const routes: VaultRoute[] = [
      { kind: "home" },
      { kind: "catalog" },
      { kind: "academy" },
      { kind: "queue" },
      { kind: "machine", id: "m-ext" },
      { kind: "machine", id: "m-ext", tier: "science" },
      { kind: "module", moduleId: "intro" },
      { kind: "topic", moduleId: "intro", topicId: "intro-mission" },
      { kind: "card", id: "lp" },
      { kind: "script", id: "lp" },
      { kind: "overview", id: "lp" },
      { kind: "playbook", id: "lp" },
      { kind: "track", id: "lp" },
      { kind: "glossary" },
      { kind: "glossary", term: "Gap" },
      { kind: "cueing" },
      { kind: "cueing", moment: 0 },
      { kind: "quiz" },
      { kind: "quiz", deck: "rep" },
      { kind: "map" },
      { kind: "map", focus: "machine:m-ext" },
    ];
    const keys = routes.map(routeKey);
    expect(new Set(keys).size).toBe(routes.length);
  });

  it("treats a machine's tier as a different place but the same page", () => {
    const a: VaultRoute = { kind: "machine", id: "m-ext" };
    const b: VaultRoute = { kind: "machine", id: "m-ext", tier: "adapt" };
    expect(sameRoute(a, b)).toBe(false);
    expect(samePage(a, b)).toBe(true);
    expect(sameRoute(a, { kind: "machine", id: "m-ext" })).toBe(true);
    expect(samePage({ kind: "glossary", term: "Gap" }, { kind: "glossary" })).toBe(true);
    expect(samePage({ kind: "cueing", moment: 2 }, { kind: "cueing" })).toBe(true);
    expect(pageKey({ kind: "card", id: "lp" })).toBe(routeKey({ kind: "card", id: "lp" }));
    expect(samePage({ kind: "card", id: "lp" }, { kind: "script", id: "lp" })).toBe(false);
  });
});

describe("the stack", () => {
  const home: VaultRoute = { kind: "home" };
  const a: VaultRoute = { kind: "card", id: "a" };
  const b: VaultRoute = { kind: "card", id: "b" };
  const c: VaultRoute = { kind: "card", id: "c" };

  it("pushes a new page on top and leaves the page already on top alone", () => {
    const s1 = pushRoute([home], a);
    expect(s1).toEqual([home, a]);
    expect(pushRoute(s1, { kind: "card", id: "a" })).toBe(s1);
  });

  it("cuts the trail back to a page re-opened from further down", () => {
    expect(pushRoute([home, a, b, c], a)).toEqual([home, a]);
    expect(pushRoute([home, a, b], home)).toEqual([home]);
  });

  it("caps the trail's depth and never drops the root", () => {
    let s: VaultRoute[] = [home];
    for (let i = 0; i < STACK_MAX + 15; i += 1) s = pushRoute(s, { kind: "card", id: `c${i}` });
    expect(s.length).toBe(STACK_MAX);
    expect(s[0]).toEqual(home);
    expect(s[s.length - 1]).toEqual({ kind: "card", id: `c${STACK_MAX + 14}` });
  });

  it("replaces the page on top, and replacing it with itself changes nothing", () => {
    const s = [home, a];
    expect(replaceRoute(s, b)).toEqual([home, b]);
    expect(replaceRoute(s, a)).toBe(s);
    expect(replaceRoute([home], a)).toEqual([a]);
    expect(replaceRoute([home, a, b], home)).toEqual([home]);
  });

  it("goes back one page and never past the root", () => {
    expect(popRoute([home, a, b])).toEqual([home, a]);
    const root = [home];
    expect(popRoute(root)).toBe(root);
  });

  it("starts an empty stack with the route it is given", () => {
    expect(pushRoute([], a)).toEqual([a]);
    expect(replaceRoute([], a)).toEqual([a]);
  });
});
