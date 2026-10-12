/**
 * The profile's Discard question lives in the profile's frame, not inside a
 * tab panel (session record, Sep 26 2026). The tabs mount only the panel on
 * screen, so a question inside Programming did nothing from Journey, Notes &
 * Profile or the Activity Archive, then appeared later on Programming. The
 * profile is too large to mount here, so this holds the structure in place.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(__dirname, "ClientProfileView.tsx"), "utf8");

describe("the profile's Discard question", () => {
  it("is drawn after the tabs close, so every tab reaches it", () => {
    const dialog = source.indexOf("open={!!discardTarget}");
    const tabsEnd = source.indexOf("</Tabs>");
    expect(dialog).toBeGreaterThan(-1);
    expect(tabsEnd).toBeGreaterThan(-1);
    expect(dialog).toBeGreaterThan(tabsEnd);
  });

  it("is drawn once", () => {
    expect(source.split("open={!!discardTarget}").length - 1).toBe(1);
  });

  /* The sessions round (Oct 12 2026; AJ: "Anyone can clear a session"). */
  const dialog = source.slice(source.indexOf("open={!!discardTarget}"), source.indexOf("<MachineMenu open={!!machineWindowId}"));

  it("says it in plain words, with Keep it and Discard, and no database words", () => {
    // The same title and words as the Active Session's (the review, Oct 12 2026).
    expect(dialog).toContain('"Discard this session?"');
    expect(dialog).toContain("s session?`");
    expect(dialog).toContain("DISCARD_BODY_WORDS");
    expect(dialog).toContain("lastOnItWords(");
    expect(dialog).toContain("discardQuietNote(discardTarget)");
    expect(dialog).toMatch(/>\s*Keep it\s*</);
    expect(dialog).toMatch(/"Discard"/);
    expect(dialog).not.toMatch(/database|notes|Scrapping/i);
  });

  it("draws Discard as the Active Session does, an outline in crimson words, and the hold-back line in ink, never crimson", () => {
    expect(dialog).not.toContain('variant="destructive"');
    expect(dialog).toMatch(/variant="outline"[\s\S]*text-destructive/);
    expect(dialog).not.toContain("bg-destructive/10");
    expect(dialog).not.toContain('role="alert"');
    expect(dialog).toContain('role="status"');
    expect(dialog).not.toMatch(/\bred-\d{3}\b|animate-pulse|shadow-\[0_0|text-white/);
  });

  it("discards in one batch, issued at once and never awaited, and leaves sessionNotes alone", () => {
    const handler = source.slice(source.indexOf("const handleDiscardActiveSession"), source.indexOf("/** Who runs a session"));
    // Every set id read when the question opened goes in the same batch (the review, Oct 12 2026).
    expect(handler).toContain("discardStaleSession(db, target, {}, [], readIds)");
    expect(source).toContain("void readSetIds(db, id)");
    expect(handler).not.toMatch(/\bawait\b|deleteDoc|sessionNotes/);
    // Someone else's session: the server is asked when the question opens, and the final Discard waits for "ok".
    expect(source).toContain("checkStillLeftOpen(db, session, session.lastHeartbeatAt)");
    expect(handler).toContain('if (!discardTargetIsMine && discardCheck !== "ok") return;');
  });

  it("offers the menu's Discard only for this trainer's own session, judged as the tracker judges it", () => {
    expect(source).toContain("!isRecordedElsewhere(activeInProgressSession, myTrainerIds(liveAuthTrainer, user?.uid), null)");
  });
});
