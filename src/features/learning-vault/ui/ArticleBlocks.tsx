import { createElement, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Eye, EyeOff, MessageSquare, Strikethrough, Trash2 } from "lucide-react";
import { UnsavedChangesScope, useLeaveScope } from "../../unsaved-changes";
import { applyMarkup, noteLine, whyLine, type AppliedMarkup } from "../markup";
import type { MarkedBlock, StudioBlockNote, StudioStrike, VaultBlock, VaultSection, VaultTarget } from "../types";
import { BlockActions } from "./BlockActions";
import { NoteForm } from "./NoteForm";
import { OrphanMarks } from "./OrphanMarks";
import { ShareForm } from "./ShareForm";
import { StrikeForm } from "./StrikeForm";
import { SubmitForm } from "./SubmitForm";
import { useStudioMarkup, useVault } from "./VaultProvider";
import {
  canRemoveNote,
  hiddenLabel,
  hideAgainLabel,
  isMarkableKind,
  markerLabel,
  piecesOf,
  possessive,
  studioInSentence,
  type LineAction,
  type LinePiece,
} from "./line-actions";
import "../../wiki/wiki.css";
import "./article.css";

/**
 * THE PAGE BODY EVERY DESIGN DRAWS — marked lines, the line actions, the
 * forms in place (the Learning vault redesign, Oct 19 2026).
 *
 * AJ asked for "a studio's version with lines crossed out with a reason, and
 * notes on lines; the MSF original one tap away". The Tactical Codex, the
 * Living Vault and the Interactive Course lay a page out three ways, but the
 * page's words, and how a studio marks them, are drawn here once, so the
 * three prototypes are judged on their furniture and never on three
 * different ideas of a crossed-out line.
 *
 * HOW A LINE WORKS
 * ----------------
 * - A tap on a line (or Enter on it: each line is a focusable button with
 *   aria-expanded) selects it, with a calm outline, and opens a row of 44px
 *   actions under it (BlockActions; line-actions.ts says who gets which).
 *   A second tap on the same line, Escape, or a tap anywhere else lets go.
 *   One line at a time. Selecting never fights reading: a tap on a linked
 *   term inside a line opens its card and leaves the line alone, and a line
 *   whose words are being selected to copy is not toggled.
 * - Each action opens its form IN PLACE under the line, never a dialog
 *   (InheritedSafety's manner, admin/machines/editor/safety-removal.tsx).
 *   While a form is open a stray tap elsewhere does nothing; moving to
 *   another line, the same line again, or Escape asks first when something
 *   is typed (a leave scope around the form), and never loses it unasked.
 * - The studio's version (the "studio" lens): a crossed-out line STAYS, its
 *   words struck in the muted ink, then what the studio does instead, then
 *   "Why: {reason} · {who} · {date}" ("the baseline is always still there",
 *   studio-wiki.ts; RemovedLines on the Catalog says it the same way). Only
 *   when the reader hides crossed-out lines does it fold into a quiet
 *   "1 line hidden", which shows it again in place. Notes sit under their
 *   line (inline), or behind a marker in a 40px gutter that unfolds them
 *   (the Living Vault's "gutter"); the reason always stays in view. While a
 *   line is chosen its actions come straight under its words and reason,
 *   and a note comes off by its author or a leader, after a yes. Marks
 *   whose words have left the page gather at the foot (OrphanMarks).
 * - The MSF original (the "original" lens) shows no markup at all, and a
 *   line offers only "Tell head office" and "Ask in Teams".
 *
 * Every write goes to the vault's store (the in-memory sandbox for these
 * prototypes): nothing here reads or writes Firestore.
 */

export interface ArticleBlocksProps {
  target: VaultTarget;
  sections: VaultSection[];
  /** inline: a studio's notes and reasons under each line (Designs 1 and 3); gutter: markers in a left gutter that open the line's notes (Design 2). */
  annotate?: "inline" | "gutter";
  /** Usually (t) => <LinkedText text={t} />. Applied to every line but headings, and never to struck words. */
  renderText?: (text: string, block: VaultBlock) => ReactNode;
  /** The peek sheet: tighter, and lines still take actions. */
  compact?: boolean;
  /** The level of each section's title; a block heading sits one below it. */
  headingLevel?: 2 | 3;
  hideSectionTitles?: boolean;
  /**
   * List the studio's marks whose words have left the page ("Lines that
   * changed since {Studio} marked them") at the foot. Default true. A design
   * that draws one PART of a page here (a codex tier, the course's manual one
   * tier at a time) passes false, because a mark on a line in another part is
   * not a line that changed, and draws the page's own once instead:
   * `<OrphanMarks orphans={useAppliedMarkup(target, page.sections).orphans} />`
   * over the WHOLE page's sections.
   */
  showOrphans?: boolean;
}

/** The foot of a page drawn in parts: drawn once by the design, over the whole page (see showOrphans). */
export { OrphanMarks } from "./OrphanMarks";

type FormKind = Exclude<LineAction, "unstrike">;

/**
 * This studio's markup laid on a page exactly as ArticleBlocks lays it, for
 * a design that wants the same answer beside the body: `struck` for
 * VersionToggle's "Hide crossed-out lines", `orphans` for a count in a
 * header. `studioLens` is false when the MSF original is on screen, or
 * there is no studio to mark it for.
 */
export function useAppliedMarkup(
  target: VaultTarget,
  sections: VaultSection[],
): AppliedMarkup & { studioLens: boolean } {
  const vault = useVault();
  const markup = useStudioMarkup(target.key);
  const studioLens = vault.lens === "studio" && vault.studio.id !== null;
  return useMemo(
    () => ({
      ...applyMarkup(sections, studioLens ? markup : null, {
        lens: studioLens ? "studio" : "original",
        showCrossed: vault.showCrossed,
      }),
      studioLens,
    }),
    [sections, markup, studioLens, vault.showCrossed],
  );
}

export function ArticleBlocks(props: ArticleBlocksProps) {
  // Keyed by page: the line selected, an open form and what is unfolded
  // belong to one page, and a design that swaps the page in place must not
  // carry them onto the next one. (A form's typing is asked about by the
  // door that changes the page, before it changes.)
  return <ArticleBody key={props.target.key} {...props} />;
}

/** A tap that landed on a control inside the line (a linked term, a link) and so is not a tap on the line. */
const CONTROL = "a, button, input, textarea, select, summary, label, [role='button'], [role='link'], [data-vault-term]";

function insideControl(target: EventTarget | null, line: Element): boolean {
  if (!(target instanceof Element)) return false;
  const control = target.closest(CONTROL);
  return control !== null && control !== line && line.contains(control);
}

/** The reader is selecting words in this line to copy them: a tap that ends a selection is not a choice. */
function selectingText(line: Element): boolean {
  if (typeof window === "undefined" || typeof window.getSelection !== "function") return false;
  const sel = window.getSelection();
  return Boolean(sel && !sel.isCollapsed && sel.anchorNode && line.contains(sel.anchorNode));
}

function ArticleBody({
  target,
  sections,
  annotate = "inline",
  renderText,
  compact = false,
  headingLevel = 2,
  hideSectionTitles = false,
  showOrphans = true,
}: ArticleBlocksProps) {
  const vault = useVault();
  const applied = useAppliedMarkup(target, sections);
  const { studioLens } = applied;
  const studioId = vault.studio.id;
  const studio = studioInSentence(vault.studio.name);
  const gutter = annotate === "gutter";

  // Every switch away from an open form goes through this scope, so typing
  // inside it is asked about (and only it: the page's own doors ask about
  // everything through WikiShell's scope, which holds this one).
  const scope = useLeaveScope();
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const openUnitRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef(new Map<string, HTMLElement>());

  /** The selected line, as "{section index}.{block index}" (two lines can share words, so never the block key). */
  const [selected, setSelected] = useState<string | null>(null);
  /** The form open under the selected line. */
  const [form, setForm] = useState<FormKind | null>(null);
  /** Gutter mode: the lines whose notes are unfolded. */
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  /** Runs of hidden lines the reader has shown again in place. */
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(() => new Set());
  /** The note whose "Remove" is waiting for its answer. */
  const [asking, setAsking] = useState<string | null>(null);

  const letGo = () => {
    setSelected(null);
    setForm(null);
    setAsking(null);
  };
  const closeForm = () => setForm(null);

  const select = (unit: string) => {
    if (selected === unit) {
      scope.guard(letGo);
      return;
    }
    scope.guard(() => {
      setSelected(unit);
      setForm(null);
      setAsking(null);
    });
  };

  const pick = (block: MarkedBlock, action: LineAction) => {
    if (action === "unstrike") {
      if (studioId === null) return;
      scope.guard(() => {
        vault.store.unstrike(studioId, target.key, block.key);
        setForm(null);
      });
      return;
    }
    scope.guard(() => setForm((open) => (open === action ? null : action)));
  };

  const toggleOpened = (unit: string) =>
    setOpened((prev) => {
      const next = new Set(prev);
      if (next.has(unit)) next.delete(unit);
      else next.add(unit);
      return next;
    });

  const toggleRevealed = (run: string, units: string[]) =>
    scope.guard(() => {
      const hiding = revealed.has(run);
      setRevealed((prev) => {
        const next = new Set(prev);
        if (next.has(run)) next.delete(run);
        else next.add(run);
        return next;
      });
      if (hiding && selected !== null && units.includes(selected)) letGo();
    });

  // A tap anywhere else lets the line go: a CLICK, so a finger that scrolls
  // the page never counts. Not while a form is open: a stray tap must never
  // throw away a reason half typed (the form's own buttons close it).
  useEffect(() => {
    if (selected === null || form !== null) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target;
      // A button that went away in the tap it made (Put it back, Remove).
      if (!(t instanceof Node) || !t.isConnected) return;
      if (openUnitRef.current?.contains(t)) return;
      if (t instanceof Element) {
        // Another line: its own tap selects it.
        if (rootRef.current?.contains(t) && t.closest("[data-vta-line]")) return;
        // A card or a question laid over the page (a term's concept card,
        // the leave question) is not "elsewhere on the page".
        if (t.closest('[role="dialog"], [role="alertdialog"]')) return;
      }
      setSelected(null);
      setAsking(null);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [selected, form]);

  // A form that closed took the focused button with it. Hand the focus back
  // to its line (Keep it, or Done), unless the reader has moved on to
  // another line or the focus already landed somewhere.
  const lastForm = useRef<{ selected: string | null; form: FormKind | null }>({ selected: null, form: null });
  useEffect(() => {
    const was = lastForm.current;
    lastForm.current = { selected, form };
    if (was.form === null || form !== null || was.selected === null) return;
    if (selected !== null && selected !== was.selected) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    lineRefs.current.get(was.selected)?.focus({ preventScroll: true });
  }, [selected, form]);

  // Escape closes the innermost thing: the form (asking first if anything is
  // typed), then the selection, handing the focus back to the line.
  useEffect(() => {
    if (selected === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const line = lineRefs.current.get(selected);
      if (form !== null) {
        scope.guard(() => {
          setForm(null);
          line?.focus();
        });
        return;
      }
      setSelected(null);
      setAsking(null);
      line?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected, form, scope]);

  // The actions appear under the line; if that is below the fold, bring them
  // up just enough to see (the nearest edge, never a jump to the top).
  useEffect(() => {
    if (selected === null) return;
    const panel = openUnitRef.current?.querySelector<HTMLElement>(".vta__panel");
    if (!panel || typeof panel.scrollIntoView !== "function") return;
    try {
      panel.scrollIntoView({ block: "nearest" });
    } catch {
      // An engine without scroll options: the row is still there to scroll to.
    }
  }, [selected, form]);

  const renderForm = (kind: FormKind, block: MarkedBlock, section: VaultSection): ReactNode => {
    switch (kind) {
      case "strike":
        return <StrikeForm target={target} block={block} onDone={letGo} onCancel={closeForm} />;
      case "note":
        return <NoteForm target={target} block={block} onDone={letGo} onCancel={closeForm} />;
      case "submit":
        return <SubmitForm target={target} block={block} onDone={letGo} onCancel={closeForm} />;
      case "share":
        return (
          <ShareForm target={target} block={block} sectionTitle={section.title.trim() || undefined} onDone={closeForm} />
        );
    }
  };

  const renderStrike = (strike: StudioStrike) => (
    <div className="vta__mark vta__mark--strike">
      {strike.replacement && <p className="vta__mark-body">{strike.replacement}</p>}
      <p className="vta__mark-by">{whyLine(strike)}</p>
    </div>
  );

  /** A note under its line; while the line is chosen, its author or a leader may take it off (after a yes). */
  const renderNote = (note: StudioBlockNote, removable: boolean) => {
    const canRemove = removable && studioId !== null && canRemoveNote(note, vault.viewer);
    return (
      <li key={note.id} className="vta__mark vta__mark--note">
        <p className="vta__mark-body">{note.body}</p>
        {!canRemove ? (
          <p className="vta__mark-by">{noteLine(note)}</p>
        ) : asking === note.id ? (
          <div className="vta__mark-row">
            <span className="vta__confirm" role="alert">
              Remove this note?
            </span>
            <span className="vta__mark-tools">
              <button
                type="button"
                className="vta__btn vta__btn--danger"
                onClick={() => {
                  setAsking(null);
                  if (studioId !== null) vault.store.removeNote(studioId, target.key, note.id);
                }}
              >
                Remove
              </button>
              <button type="button" className="vta__btn vta__btn--quiet" onClick={() => setAsking(null)}>
                Keep
              </button>
            </span>
          </div>
        ) : (
          <div className="vta__mark-row">
            <p className="vta__mark-by">{noteLine(note)}</p>
            <button type="button" className="vta__btn vta__btn--quiet" onClick={() => setAsking(note.id)}>
              <Trash2 size={16} aria-hidden />
              Remove
            </button>
          </div>
        )}
      </li>
    );
  };

  const renderMarker = (unit: string, struck: boolean, count: number, shown: boolean) => {
    if (count > 0) {
      return (
        <button
          type="button"
          className="vta__marker"
          aria-expanded={shown}
          aria-label={markerLabel(vault.studio.name, struck, count)}
          onClick={() => toggleOpened(unit)}
        >
          {struck && <Strikethrough size={14} aria-hidden />}
          <span className="vta__marker-count">
            <MessageSquare size={12} aria-hidden />
            {count}
          </span>
        </button>
      );
    }
    if (struck) {
      return (
        <span className="vta__marker vta__marker--still" role="img" aria-label={markerLabel(vault.studio.name, true, 0)}>
          <Strikethrough size={16} aria-hidden />
        </span>
      );
    }
    return null;
  };

  const renderHeading = (block: MarkedBlock, unit: string) =>
    createElement(
      `h${Math.min(6, headingLevel + (block.kind === "heading" ? 1 : 2))}`,
      { key: unit, className: `vta__heading vta__heading--${block.kind}` },
      block.text,
    );

  const renderLine = (block: MarkedBlock, unit: string, section: VaultSection) => {
    if (!isMarkableKind(block.kind)) return renderHeading(block, unit);
    const isOpen = selected === unit;
    const strike = studioLens ? block.strike : undefined;
    const notes = studioLens ? block.notes : [];
    const notesShown = !gutter || opened.has(unit);
    const panelId = `${baseId}-panel-${unit}`;

    return (
      <div
        key={unit}
        className={`vta__unit${isOpen ? " vta__unit--open" : ""}`}
        ref={isOpen ? openUnitRef : undefined}
        data-unit={unit}
      >
        {gutter && <div className="vta__gutter">{renderMarker(unit, Boolean(strike), notes.length, notesShown)}</div>}
        <div className="vta__col">
          <div
            ref={(el) => {
              if (el) lineRefs.current.set(unit, el);
              else lineRefs.current.delete(unit);
            }}
            className="vta__line"
            data-kind={block.kind}
            data-vta-line=""
            role="button"
            tabIndex={0}
            aria-expanded={isOpen}
            aria-controls={isOpen ? panelId : undefined}
            onClick={(e) => {
              if (insideControl(e.target, e.currentTarget) || selectingText(e.currentTarget)) return;
              select(unit);
            }}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                select(unit);
              }
            }}
          >
            {block.label && <span className="vta__label">{block.label}</span>}
            <span className={`vta__text vta__text--${block.kind}`}>
              {strike ? (
                <s className="vta__struck">{block.text}</s>
              ) : renderText ? (
                renderText(block.text, block)
              ) : (
                block.text
              )}
            </span>
          </div>
          {/* The reason belongs to the line's words, so it sits right under
              them; the actions come next, then the notes. */}
          {strike && renderStrike(strike)}
          {isOpen && (
            <div className="vta__panel" id={panelId}>
              {block.source && block.source !== section.note && <p className="vta__source">{block.source}</p>}
              <BlockActions target={target} block={block} onPick={(a) => pick(block, a)} open={form} />
              {form && <UnsavedChangesScope scope={scope}>{renderForm(form, block, section)}</UnsavedChangesScope>}
            </div>
          )}
          {notesShown && notes.length > 0 && (
            <ul className="vta__notes" aria-label={`${possessive(studio)} notes on this line`}>
              {notes.map((n) => renderNote(n, isOpen && form === null))}
            </ul>
          )}
        </div>
      </div>
    );
  };

  const renderHidden = (piece: Extract<LinePiece<MarkedBlock>, { kind: "hidden" }>, si: number, section: VaultSection) => {
    const run = `${si}.${piece.id}`;
    const shown = revealed.has(run);
    const units = piece.lines.map((l) => `${si}.${l.index}`);
    return (
      <div key={run} className="vta__hidden">
        <button
          type="button"
          className="vta__reveal"
          aria-expanded={shown}
          onClick={() => toggleRevealed(run, units)}
        >
          {shown ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
          {shown ? hideAgainLabel(piece.lines.length) : hiddenLabel(piece.lines.length)}
        </button>
        {shown && piece.lines.map((l) => renderLine(l.block, `${si}.${l.index}`, section))}
      </div>
    );
  };

  const lineCount = applied.sections.reduce((n, s) => n + s.blocks.length, 0);
  // A section with no lines can still say something honest in its note (an
  // empty codex tier's "Nothing written for this machine yet."), so the
  // generic well is only for a page with neither lines nor notes.
  const noteCount = applied.sections.filter((s) => (s.note ?? "").trim() !== "").length;

  return (
    <div
      ref={rootRef}
      className="vta"
      data-annotate={annotate}
      data-compact={compact ? "" : undefined}
    >
      {lineCount === 0 && noteCount === 0 ? (
        <p className="vta__empty">Nothing written here yet.</p>
      ) : (
        applied.sections.map((section, si) => {
          // A heading is never hidden (it takes no marks), and the line being
          // worked on stays in view until it is let go: hiding crossed-out
          // lines must never fold a half-typed form away.
          const blocks = section.blocks.map((b, bi) =>
            b.hidden && (!isMarkableKind(b.kind) || selected === `${si}.${bi}`) ? { ...b, hidden: false } : b,
          );
          const titleId = `${baseId}-title-${si}`;
          const showTitle = !hideSectionTitles && section.title.trim() !== "";
          return (
            <section
              key={`${si}-${section.id}`}
              className="vta__section"
              aria-labelledby={showTitle ? titleId : undefined}
            >
              {showTitle && createElement(`h${headingLevel}`, { id: titleId, className: "vta__title" }, section.title)}
              {section.note && <p className="vta__section-note">{section.note}</p>}
              <div className="vta__lines">
                {piecesOf(blocks).map((piece) =>
                  piece.kind === "line"
                    ? renderLine(piece.block, `${si}.${piece.index}`, section)
                    : renderHidden(piece, si, section),
                )}
              </div>
            </section>
          );
        })
      )}
      {studioLens && showOrphans && <OrphanMarks target={target} orphans={applied.orphans} headingLevel={headingLevel} />}
    </div>
  );
}
