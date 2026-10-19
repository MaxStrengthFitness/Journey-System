import { MessageSquarePlus, RotateCcw, Send, Share2, Strikethrough } from "lucide-react";
import type { MarkedBlock, VaultTarget } from "../types";
import { useVault } from "./VaultProvider";
import { actionLabel, lineActions, type LineAction } from "./line-actions";
import "../../wiki/wiki.css";
import "./article.css";

/**
 * THE ROW UNDER A SELECTED LINE — the Learning vault redesign, Oct 19 2026.
 *
 * One row of 44px buttons, by who is reading and which version is on
 * screen (line-actions.ts holds the rule):
 *
 *   Cross out for Solon…  (a leader, on Solon's version; "Put it back" on a
 *                          line already crossed out)
 *   Note for Solon        (anyone at the studio, on Solon's version)
 *   Tell head office      (anyone, either version)
 *   Ask in Teams          (anyone, either version)
 *
 * Each one opens its form IN PLACE under the line (InheritedSafety's
 * pattern: "Nothing here is a dialog"); "Put it back" acts at once, as it
 * does for a safety line on a unit. The button whose form is open says so
 * (aria-expanded), and a second tap on it closes the form.
 */
export function BlockActions({
  target,
  block,
  onPick,
  open = null,
}: {
  target: VaultTarget;
  block: MarkedBlock;
  onPick: (a: LineAction) => void;
  /** The action whose form is open under the line, if any. */
  open?: LineAction | null;
}) {
  const vault = useVault();
  const studioLens = vault.lens === "studio" && vault.studio.id !== null;
  const actions = lineActions({
    studioLens,
    canStrike: vault.viewer.canStrike,
    canNote: vault.viewer.canNote,
    struck: Boolean(block.strike),
  });

  return (
    <div className="vta__actions" role="group" aria-label={`What to do with this line on ${target.title}`}>
      {actions.map((a) => {
        const opens = a !== "unstrike";
        return (
          <button
            key={a}
            type="button"
            className="vta__btn"
            data-action={a}
            aria-expanded={opens ? open === a : undefined}
            onClick={() => onPick(a)}
          >
            <ActionIcon action={a} />
            {actionLabel(a, vault.studio.name)}
          </button>
        );
      })}
    </div>
  );
}

function ActionIcon({ action }: { action: LineAction }) {
  switch (action) {
    case "strike":
      return <Strikethrough size={16} aria-hidden />;
    case "unstrike":
      return <RotateCcw size={16} aria-hidden />;
    case "note":
      return <MessageSquarePlus size={16} aria-hidden />;
    case "submit":
      return <Send size={16} aria-hidden />;
    case "share":
      return <Share2 size={16} aria-hidden />;
  }
}
