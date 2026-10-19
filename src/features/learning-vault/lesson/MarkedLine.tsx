import { createElement } from "react";
import { EyeOff } from "lucide-react";
import { noteLine, whyLine } from "../markup";
import { LinkedText } from "../ui/LinkedText";
import type { MarkedBlock } from "../types";
import { hiddenWords } from "./lines";
import "../../wiki/wiki.css";
import "./lesson.css";

/**
 * A LINE, READ-ONLY, WITH THIS STUDIO'S MARKS — one line as a lesson card, a
 * drill or a set-up list shows it (lifted from the Interactive Course, the
 * Learning vault redesign, Oct 19 2026). Draws with lesson.css (vtl__).
 *
 * The words (terms tappable, through LinkedText and whatever ConceptLayer is
 * around it), and in the studio's version its marks laid on exactly as
 * ArticleBlocks lays them: the words struck, what the studio does instead,
 * why, who and when; the notes under it. Acting on a line is the full page's
 * job (ArticleBlocks), never this one's.
 *
 * `showLabel` false draws the line's label for a screen reader only: a run of
 * lines that share a label ("Clinical warning" over six warnings) says it
 * once, over the first (lines.ts runLabels, the same rule ArticleBlocks
 * keeps). `skip` is an entity the words must not link: a glossary word
 * inside its own definition is not a door to the card you are reading.
 *
 * `id` lets a page scroll to the line (it keeps clear of a sticky bar), and
 * `target` marks it as the one a tap sent the reader to (a dial's tile on a
 * set-up list): the selection's blue, a calm tint round it.
 *
 * `size` "small" is a panel's tighter lines (14px, the Stop panel);
 * "definition" a glossary card's (14px, airier). `tone` "warn" puts the
 * label in the caution plum (Stop). `noBullet` drops a bullet's dot where a
 * number already says the order. `className` is the page's own class on the
 * line, for where it sits (it never restyles the line's words).
 */
export function MarkedLine({
  block,
  studioLens,
  showLabel = true,
  skip,
  id,
  target = false,
  size = "regular",
  tone,
  noBullet = false,
  className,
}: {
  block: MarkedBlock;
  studioLens: boolean;
  showLabel?: boolean;
  skip?: string;
  id?: string;
  target?: boolean;
  size?: "regular" | "small" | "definition";
  tone?: "warn";
  noBullet?: boolean;
  className?: string;
}) {
  if (block.kind === "heading" || block.kind === "subheading") {
    return createElement(
      block.kind === "heading" ? "h3" : "h4",
      { className: `vtl__line-head vtl__line-head--${block.kind}`, id, "data-target": target ? "" : undefined },
      block.text,
    );
  }
  const strike = studioLens ? block.strike : undefined;
  const notes = studioLens ? block.notes : [];
  const classes = ["vtl__line", `vtl__line--${block.kind}`, className].filter(Boolean).join(" ");
  return (
    <div
      id={id}
      className={classes}
      data-struck={strike ? "" : undefined}
      data-target={target ? "" : undefined}
      data-size={size === "regular" ? undefined : size}
      data-tone={tone}
      data-nobullet={noBullet ? "" : undefined}
    >
      {block.label &&
        (showLabel ? (
          <span className="vtl__line-label">{block.label}</span>
        ) : (
          <span className="vtl__sr">{block.label}: </span>
        ))}
      <span className="vtl__line-text">{strike ? <StruckWords>{block.text}</StruckWords> : <LinkedText text={block.text} skip={skip} />}</span>
      {strike?.replacement && <span className="vtl__instead">{strike.replacement}</span>}
      {strike && <span className="vtl__why">{whyLine(strike)}</span>}
      {notes.map((n) => (
        <span key={n.id} className="vtl__note">
          <span className="vtl__note-body">{n.body}</span>
          <span className="vtl__note-by">{noteLine(n)}</span>
        </span>
      ))}
    </div>
  );
}

/** Words a studio crossed out: struck, in the muted ink, still there to read. */
export function StruckWords({ children }: { children: string }) {
  return <s className="vtl__struck">{children}</s>;
}

/** "2 crossed-out lines hidden": one quiet line where hidden lines were (nothing for none). */
export function HiddenLines({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <p className="vtl__hidden">
      <EyeOff size={14} aria-hidden />
      {hiddenWords(count)}
    </p>
  );
}
