/**
 * THE STUDIO SWITCH WORKS FROM EVERY SCREEN (Oct 12 2026). AJ: "We can only
 * switch studios in trainer mode, it doesnt pop up when in operations or
 * admin mode". Read from AppContent's source, because the shell is too large
 * to mount: the picker answers a request to change studio on ANY screen,
 * the header's studio name opens it on every screen, and the menu's Switch
 * studio asks the same thing.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(__dirname, "..", "..", "AppContent.tsx"), "utf8");

describe("Switch studio, from Operations and the Admins dashboard too", () => {
  it("shows the picker whenever someone asked, whatever the screen", () => {
    const gate = app.match(/if \(\s*(isChangingStudio \|\|[\s\S]*?)\) \{\s*return \(\s*<StudioSelectionView/);
    expect(gate, "the picker's early return in AppContent.tsx").toBeTruthy();
    // The two dashboards are excused only from "no studio yet", never from the ask.
    const noStudioPart = gate![1].replace(/^isChangingStudio \|\|/, "");
    expect(noStudioPart).toMatch(/!activeStudioId/);
    expect(noStudioPart).not.toMatch(/isChangingStudio/);
  });

  it("the header's studio name opens the picker on every screen; only the logo goes home", () => {
    const header = app.match(/<AppHeader[\s\S]*?\/>/)?.[0] ?? "";
    expect(header).toMatch(/onStudioClick=\{openStudioPicker\}/);
    expect(header).toMatch(/onHomeClick=\{appMode === "admin" \?/);
  });

  it("a switch forgets Operations' open client, so coming back never reopens her", () => {
    const letGo = app.match(/useLetGoOnStudioSwitch\(activeStudioId, currentView, \(\{ toHub \}\) => \{[\s\S]*?\n {2}\}\);/)?.[0] ?? "";
    expect(letGo, "AppContent's let-go callback").toBeTruthy();
    expect(letGo).toMatch(/setSelectedClientIdNow\(null\)/);
    expect(letGo).toMatch(/rememberClient\(null\)/);
  });

  it("the menu's Switch studio opens the same picker", () => {
    expect(app).toMatch(/onClick=\{\(\) => menuNavigate\(openStudioPicker\)\}[\s\S]{0,400}Switch studio/);
  });
});
