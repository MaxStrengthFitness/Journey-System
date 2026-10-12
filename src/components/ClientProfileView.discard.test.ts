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
    expect(dialog).toContain("Discard this unfinished session?");
    expect(dialog).toContain("Every set in it is deleted. This can't be undone.");
    expect(dialog).toContain("was last on it at");
    expect(dialog).toContain("might still be with the client, check with");
    expect(dialog).toMatch(/>\s*Keep it\s*</);
    expect(dialog).toMatch(/"Discard"/);
    expect(dialog).not.toMatch(/database|notes|Scrapping/i);
  });

  it("uses the destructive token, with no pulse, no glow and no white on red", () => {
    expect(dialog).toContain('variant="destructive"');
    expect(dialog).not.toMatch(/\bred-\d{3}\b|animate-pulse|shadow-\[0_0|text-white/);
  });

  it("discards in one batch, issued at once and never awaited, and leaves sessionNotes alone", () => {
    const handler = source.slice(source.indexOf("const handleDiscardActiveSession"), source.indexOf("/** Who runs a session"));
    expect(handler).toContain("discardStaleSession(db, target)");
    expect(handler).not.toMatch(/\bawait\b|deleteDoc|sessionNotes/);
    // Someone else's session: the server is asked when the question opens, and the final Discard waits for "ok".
    expect(source).toContain("checkStillLeftOpen(db, session, session.lastHeartbeatAt)");
    expect(handler).toContain('if (!discardTargetIsMine && discardCheck !== "ok") return;');
  });

  it("offers the menu's Discard only for this trainer's own session, judged as the tracker judges it", () => {
    expect(source).toContain("!isRecordedElsewhere(activeInProgressSession, myTrainerIds(liveAuthTrainer, user?.uid), null)");
  });
});
