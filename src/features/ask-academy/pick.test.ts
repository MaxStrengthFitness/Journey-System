import { describe, expect, it } from "vitest";
import { MAX_PAGES, pickRequest, readPicks } from "./pick";
import { PICK_MODEL } from "./models";
import type { AcademyPage } from "./pages";

const page = (id: string, sameAs: string[] = []): AcademyPage => ({ id, kind: "topic", shelf: "Shelf", title: id, text: `text of ${id}`, sameAs });
const pages = [page("topic:a"), page("topic:b", ["topic:b-again"]), page("topic:c"), page("topic:d"), page("topic:e"), page("topic:f")];

const reply = (text: string, stop_reason: "end_turn" | "refusal" = "end_turn") => ({
  stop_reason,
  content: [{ type: "text" as const, text, citations: null }],
});

describe("pickRequest", () => {
  const req = pickRequest("How long do we rest?", pages);

  it("asks Haiku, at low effort, for JSON in the pick's shape", () => {
    expect(req.model).toBe(PICK_MODEL);
    expect(req.output_config?.effort).toBe("low");
    expect(req.output_config?.format?.type).toBe("json_schema");
  });

  it("puts the page list in the system prompt behind a cache mark, and the question alone in the message", () => {
    const system = req.system as { text: string; cache_control?: unknown }[];
    expect(system[1].text).toContain("topic:b — Shelf › topic:b");
    expect(system[1].cache_control).toEqual({ type: "ephemeral" });
    expect(req.messages).toEqual([{ role: "user", content: "How long do we rest?" }]);
  });
});

describe("readPicks", () => {
  it("keeps real pages, best first", () => {
    expect(readPicks(reply('{"pages":["topic:c","topic:a"],"covered":true}'), pages)).toEqual({ ok: true, pageIds: ["topic:c", "topic:a"], covered: true });
  });

  it("drops a made-up id and turns a second name into its page, once", () => {
    const r = readPicks(reply('{"pages":["topic:nope","topic:b-again","topic:b"],"covered":true}'), pages);
    expect(r).toEqual({ ok: true, pageIds: ["topic:b"], covered: true });
  });

  it(`stops at ${MAX_PAGES} pages`, () => {
    const r = readPicks(reply('{"pages":["topic:a","topic:b","topic:c","topic:d","topic:e","topic:f"],"covered":true}'), pages);
    expect(r.ok && r.pageIds).toHaveLength(MAX_PAGES);
  });

  it("is not covered when no real page is left", () => {
    expect(readPicks(reply('{"pages":["topic:nope"],"covered":true}'), pages)).toEqual({ ok: true, pageIds: [], covered: false });
    expect(readPicks(reply('{"pages":[],"covered":false}'), pages)).toEqual({ ok: true, pageIds: [], covered: false });
  });

  it("says why when the reply can't be read", () => {
    expect(readPicks(reply("not json"), pages)).toEqual({ ok: false, reason: "the pick was not JSON" });
    expect(readPicks(reply('{"pages":"topic:a"}'), pages)).toEqual({ ok: false, reason: "the pick had the wrong shape" });
    expect(readPicks(reply("", "refusal"), pages)).toEqual({ ok: false, reason: "refused" });
  });
});
