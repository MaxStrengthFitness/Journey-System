/**
 * THE SIGNED-OUT LANDING for a Journey link: what a tab shows when the address
 * was /t/…, /l/… or /a/… and nobody is signed in on it.
 *
 * "This is a Journey link." Sign in is first: signed in, the link opens where
 * it points. On an iPad outside the Home Screen app (a link tapped in Teams
 * opens in Safari) it also says to open it in the Journey icon, with Copy
 * link beside it, in the blue of a selection (the Navy Frame), at least 40px.
 * The front door's look (features/front-door/kit.tsx), nothing new.
 */
import { useState } from "react";
import { FrontDoorPane, Tiles } from "../front-door/kit";
import { isStandalone } from "../home-screen/app-height";

export const LINK_LANDING_TITLE = "This is a Journey link.";
export const LINK_LANDING_LEDE = "Sign in and it opens where it points.";
export const OPEN_IN_ICON_LINE = "Open it in the Journey icon on the Home Screen, where you're already signed in.";

/** iPadOS in a browser tab, not the Home Screen app: Safari (and iPadOS 13+ says it is a Mac). */
export function outsideHomeScreenOnIPad(win: Window = window): boolean {
  const nav = win.navigator as Navigator & { standalone?: boolean };
  const ua = nav.userAgent || "";
  const iPad = /iPad/.test(ua) || (nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1);
  return iPad && !isStandalone(win);
}

export function LinkLanding({
  href,
  offerIcon,
  onSignIn,
}: {
  /** The address the tab opened with, for Copy link. */
  href: string;
  /** Say "Open it in the Journey icon" with Copy link (an iPad outside the app). */
  offerIcon: boolean;
  onSignIn: () => void;
}) {
  const [copied, setCopied] = useState<"" | "Copied" | "Couldn't copy">("");
  const copy = () => {
    const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clip?.writeText) {
      setCopied("Couldn't copy");
      return;
    }
    clip.writeText(href).then(
      () => setCopied("Copied"),
      () => setCopied("Couldn't copy"),
    );
  };
  return (
    <FrontDoorPane label="A Journey link">
      <main className="fd-page fd-page--center">
        <div className="fd-rise">
          <Tiles mode="still" small />
        </div>
        <h1 className="fd-display fd-display--l" style={{ marginTop: 28 }}>
          {LINK_LANDING_TITLE}
        </h1>
        <p className="fd-lede">{LINK_LANDING_LEDE}</p>
        <button type="button" className="fd-btn fd-btn--primary" style={{ marginTop: 22 }} onClick={onSignIn}>
          Sign in
        </button>
        {offerIcon && (
          <section className="fd-card" style={{ marginTop: 22 }} aria-label="Open it in the Journey icon">
            <p className="fd-small">{OPEN_IN_ICON_LINE}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
              <button type="button" className="fd-btn fd-btn--link" onClick={copy}>
                Copy link
              </button>
              <span className="fd-small" role="status" aria-live="polite">
                {copied}
              </span>
            </div>
          </section>
        )}
      </main>
    </FrontDoorPane>
  );
}
