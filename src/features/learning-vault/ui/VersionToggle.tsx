/**
 * THE VERSION SWITCH — "Solon's version | MSF original", the one switch
 * between a studio's marked-up page and Max Strength's words. Round: the
 * Learning vault redesign, Oct 19 2026.
 *
 * The round's brief (AJ's overnight ask): a studio's version with lines
 * crossed out with a reason and notes on lines, and the MSF original one tap
 * away. So the switch is two segments, the studio's version first, 44px
 * tall, on every page that can carry markup. While the studio's version is
 * showing and the page has a crossed-out line, a second button offers to
 * hide them: crossed-out lines stay on the page by default (the baseline is
 * always still there), and hiding them is the reader's own choice, for
 * reading the studio's page as the studio teaches it.
 *
 * With no studio open there is no studio version, so the switch draws
 * nothing (an administrator outside a studio reads the original).
 *
 * TYPING ON THE PAGE: moving to the original, or hiding crossed-out lines,
 * can take away a line's in-place form (a note half written under a
 * crossed-out line, a strike's reason). Both ask the page first
 * (useWikiPageGuard: inside a Learning page it asks about the page's
 * typing; anywhere else it goes at once) and change the lens only inside the
 * answer. Coming back to the studio's version, or showing the lines again,
 * takes nothing away, so it never asks.
 */

import { Eye, EyeOff } from "lucide-react";
import { useWikiPageGuard } from "../../wiki/page-guard";
import { useOptionalVault, versionLabel } from "./VaultProvider";
import type { MarkupLens } from "../types";
import "../../wiki/wiki.css";
import "./version.css";

export function VersionToggle(props: { struck?: number }) {
  const vault = useOptionalVault();
  const guard = useWikiPageGuard();
  if (!vault || !vault.studio.id) return <></>;

  const { lens, setLens, showCrossed, setShowCrossed, studio } = vault;
  const struck = Math.max(0, Math.floor(props.struck ?? 0));

  const pick = (next: MarkupLens) => {
    if (next === lens) return;
    if (next === "original") guard(() => setLens("original"));
    else setLens(next);
  };
  const flip = () => {
    if (showCrossed) guard(() => setShowCrossed(false));
    else setShowCrossed(true);
  };

  return (
    <div className="vtv">
      <div className="vtv__seg" role="group" aria-label="Which version to read">
        <button
          type="button"
          className="vtv__opt"
          aria-pressed={lens === "studio"}
          data-lens="studio"
          onClick={() => pick("studio")}
        >
          {versionLabel(studio.name)}
        </button>
        <button
          type="button"
          className="vtv__opt"
          aria-pressed={lens === "original"}
          data-lens="original"
          onClick={() => pick("original")}
        >
          MSF original
        </button>
      </div>
      {lens === "studio" && struck > 0 && (
        <button type="button" className="vtv__toggle" data-action="crossed" onClick={flip}>
          {showCrossed ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
          <span>{showCrossed ? "Hide crossed-out lines" : "Show crossed-out lines"}</span>
        </button>
      )}
    </div>
  );
}
