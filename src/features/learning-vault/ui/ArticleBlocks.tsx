import {
  createElement,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Eye, EyeOff, MessageSquare, Pointer, Send, Strikethrough, Trash2 } from "lucide-react";
import { UnsavedChangesScope, useLeaveScope } from "../../unsaved-changes";
import { applyMarkup, noteLine, whyLine, type AppliedMarkup } from "../markup";
import type {
  LearningSubmission,
  MarkedBlock,
  StudioBlockNote,
  StudioStrike,
  VaultBlock,
  VaultSection,
  VaultTarget,
} from "../types";
import { BlockActions } from "./BlockActions";
import { NoteForm } from "./NoteForm";
import { OrphanMarks } from "./OrphanMarks";
import { ShareForm } from "./ShareForm";
import { StrikeForm } from "./StrikeForm";
import { SubmitForm } from "./SubmitForm";
import { useStudioMarkup, useSubmissions, useVault } from "./VaultProvider";
import {
  answerOf,
  canRemoveNote,
  hiddenLabel,
  hideAgainLabel,
  hintSpot,
  isMarkableKind,
  labelRuns,
  lineActions,
  lineHintWords,
  markerLabel,
  piecesOf,
  possessive,
  sectionTone,
  studioInSentence,
  verdictWord,
  type LineAction,
  type LinePiece,
} from "./line-actions";
import { lineHintSeen, markLineHintSeen, subscribeLineHint } from "./line-hint";
import { pageAccent } from "./page-accent";
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
 * - A tap on a line selects it, with a calm blue OUTLINE (a spoken line keeps
 *   its own wash inside it), and opens a row of 44px actions under it
 *   (BlockActions; line-actions.ts says who gets which). A second tap on the
 *   same line, Escape, or a tap anywhere else lets go. One line at a time.
 *   Selecting never fights reading: a tap on a linked term inside a line
 *   opens its card and leaves the line alone, and a line whose words are
 *   being selected to copy is not toggled.
 * - The line itself is not a button (review fix, Oct 19 2026): a button's
 *   children are flattened into its name, so VoiceOver could not reach the
 *   linked terms inside a line. Each line carries ONE real button instead,
 *   "Actions for this line", laid over it, unseen and untouchable (a finger
 *   taps the line); a keyboard or VoiceOver reader lands on it after the
 *   line's words and terms, and its focus ring outlines the whole line. The
 *   terms and that button are siblings, never nested.
 * - Until the reader has chosen a line once (on this iPad), the page says so
 *   in one quiet line: "Tap a line to …" (line-hint.ts). There is no hover
 *   on an iPad to find it with. It sits under the first line on screen
 *   outside the plum Stop well, after the run of lines that line's label is
 *   said over, never between the two (hintSpot); a page whose lines are all
 *   in the well says it above its first section. All three designs draw it
 *   here, the same way (recheck fix, Oct 19 2026).
 * - Each action opens its form IN PLACE under the line, never a dialog
 *   (InheritedSafety's manner, admin/machines/editor/safety-removal.tsx).
 *   While a form is open a stray tap elsewhere does nothing; moving to
 *   another line, the same line again, or Escape asks first when something
 *   is typed (a leave scope around the form), and never loses it unasked. A
 *   form is shown only while its action is still offered: switching to the
 *   MSF original, or View as a trainer, closes a cross-out form (the switch
 *   asked about any typing before it switched).
 * - The studio's version (the "studio" lens): a crossed-out line STAYS, its
 *   words struck in the muted ink, then what the studio does instead, then
 *   "Why: {reason} · {who} · {date}" ("the baseline is always still there",
 *   studio-wiki.ts; RemovedLines on the Catalog says it the same way). Only
 *   when the reader hides crossed-out lines does it fold into a quiet
 *   "1 line hidden", which shows it again in place. Notes sit under their
 *   line (inline), or behind a marker in a 40px gutter that unfolds them
 *   (the Living Vault's "gutter"); the reason always stays in view. What
 *   the studio told head office about a line, and head office's answer, is
 *   said under it too ("Kim told head office · Taken"): nothing pings
 *   anyone, so this is where the answer is pulled from. While a line is
 *   chosen its actions come straight under its words and reason, and a note
 *   comes off by its author or a leader, after a yes. Marks whose words have
 *   left the page gather at the foot (OrphanMarks).
 * - A label is said once per run of lines that share it (labelRuns): a
 *   machine's Stop list reads "Clinical warning" once over its warnings. The
 *   Stop list itself is the house's plum caution well (sectionTone).
 * - The MSF original (the "original" lens) shows no markup at all, and a
 *   line offers only "Tell head office" and "Ask in Teams".
 *
 * Every write goes to the vault's store (the in-memory sandbox for these
 * prototypes): nothing here reads or writes Firestore.
 */

export interface ArticleBlocksProps {
  target: VaultTarget;
  sections: VaultSection[];
  /**
   * inline: a studio's notes and reasons under each line (Designs 1 and 3);
   * gutter: markers in a left gutter that open the line's notes (Design 2).
   * The gutter is drawn wherever the page has a studio's version, in BOTH
   * versions: on the MSF original it is kept empty, so switching versions
   * never moves a word or the Stop well's edge sideways (recheck fix, Oct 19
   * 2026). Never in a compact body (a peek, where 58px of empty gutter halves
   * the column), nor with no studio (no version to switch to); those are
   * laid out inline. The root's data-annotate says which was drawn, for
   * anything that lines up with it.
   */
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
   * tier at a time, a peek of one word) passes false, because a mark on a
   * line in another part is not a line that changed, and draws the page's
   * own once instead:
   * `<OrphanMarks orphans={useAppliedMarkup(target, page.sections).orphans} />`
   * over the WHOLE page's sections.
   */
  showOrphans?: boolean;
  /**
   * The page's accent (the custom properties wiki/categories' accentStyle
   * sets): a spoken line's band and wash and a cue's rule take it, so blue
   * keeps its one meaning (act, select). Default: a machine page's own
   * category, read from its target; any other page inherits an accent an
   * ancestor set, else the neutral grey. A machine's card, script or deep
   * dive passes `pageAccent(page)` (./page-accent). null sets nothing here.
   */
  accent?: CSSProperties | null;
  /**
   * The one quiet "Tap a line to …" (under the first line outside the Stop
   * well, after its label's run: hintSpot), until the reader has chosen a
   * line once on this iPad. Default true; never in a compact body (a peek).
   * A design that draws the same page twice on one screen passes false to
   * the second.
   */
  tapHint?: boolean;
}

/** The foot of a page drawn in parts: drawn once by the design, over the whole page (see showOrphans). */
export { OrphanMarks } from "./OrphanMarks";
/** A page's accent, for the `accent` prop of a card, script or deep dive. */
export { pageAccent } from "./page-accent";

type FormKind = Exclude<LineAction, "unstrike">;

/** Where the focus goes once a control it was on has gone (Put it back, Remove, a form closing). */
type FocusAim =
  | { kind: "line"; unit: string }
  | { kind: "keep"; noteId: string }
  | { kind: "remove"; noteId: string };

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

/** A tap that landed on a control inside the line (a linked term, a link, the line's own button) and so is not a tap on the line. */
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

/** Focus is nowhere in particular (a tap on a line takes none), or inside this page body. */
function focusIsHereOrNowhere(root: HTMLElement | null): boolean {
  if (typeof document === "undefined") return true;
  const active = document.activeElement;
  return !active || active === document.body || Boolean(root?.contains(active));
}

/** The focus was lost with the control it was on (it went to <body>, or nowhere). */
function focusLost(): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  return !active || active === document.body || !active.isConnected;
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
  accent,
  tapHint = true,
}: ArticleBlocksProps) {
  const vault = useVault();
  const applied = useAppliedMarkup(target, sections);
  const { studioLens } = applied;
  const studioId = vault.studio.id;
  const studio = studioInSentence(vault.studio.name);
  // The gutter wherever the page has a studio's version, in either version
  // (see the prop): empty on the MSF original, so the lens never slides the
  // words or the Stop well sideways; never in a peek.
  const gutter = annotate === "gutter" && !compact && studioId !== null;
  const drawn: "inline" | "gutter" = gutter ? "gutter" : "inline";
  const { canStrike, canNote } = vault.viewer;

  // Every switch away from an open form goes through this scope, so typing
  // inside it is asked about (and only it: the page's own doors ask about
  // everything through WikiShell's scope, which holds this one).
  const scope = useLeaveScope();
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const openUnitRef = useRef<HTMLDivElement | null>(null);
  /** Each line's own button: where the focus goes back to. */
  const toggleRefs = useRef(new Map<string, HTMLButtonElement>());
  const aim = useRef<FocusAim | null>(null);

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

  const hintSeen = useSyncExternalStore(subscribeLineHint, lineHintSeen, lineHintSeen);

  /* What the studio told head office about each line of this page, and the
     answer (studio's version only: the original carries no markup). */
  const submissions = useSubmissions();
  const answers = useMemo(() => {
    const byKey = new Map<string, LearningSubmission[]>();
    if (!studioLens || studioId === null) return byKey;
    for (const s of submissions) {
      if (s.studioId !== studioId || s.targetKey !== target.key || !s.blockKey) continue;
      const list = byKey.get(s.blockKey) ?? [];
      list.push(s);
      byKey.set(s.blockKey, list);
    }
    for (const list of byKey.values()) list.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    return byKey;
  }, [submissions, studioLens, studioId, target.key]);

  /* The chosen line, and whether its open form is still one it offers: the
     lens or the viewer can change under an open form (MSF original, View
     as), and a form for an action the line no longer offers must go. */
  const selectedBlock = useMemo<MarkedBlock | null>(() => {
    if (selected === null) return null;
    const [si, bi] = selected.split(".").map(Number);
    return applied.sections[si]?.blocks[bi] ?? null;
  }, [selected, applied.sections]);
  const offered = selectedBlock
    ? lineActions({ studioLens, canStrike, canNote, struck: Boolean(selectedBlock.strike) })
    : [];
  const formShown: FormKind | null = form !== null && offered.includes(form) ? form : null;
  const formGone = form !== null && formShown === null;
  useEffect(() => {
    if (formGone) setForm(null);
  }, [formGone]);

  const letGo = () => {
    setSelected(null);
    setForm(null);
    setAsking(null);
  };

  /** A form closed by its own button (Keep it, Cancel, Done, Add note): the focus goes back to its line. */
  const closeFormOf = (unit: string) => () => {
    aim.current = { kind: "line", unit };
    setForm(null);
  };
  const doneWith = (unit: string) => () => {
    aim.current = { kind: "line", unit };
    letGo();
  };

  const select = (unit: string) => {
    markLineHintSeen();
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

  const pick = (block: MarkedBlock, unit: string, action: LineAction) => {
    if (action === "unstrike") {
      if (studioId === null) return;
      scope.guard(() => {
        vault.store.unstrike(studioId, target.key, block.key);
        setForm(null);
        // "Put it back" goes as it acts (Cross out takes its place): the focus goes back to the line.
        aim.current = { kind: "line", unit };
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

  // The control the focus was on has gone (Put it back, Remove, Keep, a form
  // closing, a crossed-out line folding away while crossed-out lines are
  // hidden): hand the focus to the nearest thing that is still there, so a
  // keyboard or VoiceOver reader is not thrown back to the top of the page.
  // Only when the focus really was lost: a reader who moved on keeps it.
  useLayoutEffect(() => {
    const a = aim.current;
    if (!a) return;
    aim.current = null;
    if (!focusLost()) return;
    const root = rootRef.current;
    if (!root) return;
    let el: HTMLElement | null | undefined = null;
    if (a.kind === "line") {
      // Another line chosen since (Leave, then the next line): that line is the reader's now.
      if (selected !== null && selected !== a.unit) return;
      el = toggleRefs.current.get(a.unit) ?? root.querySelector<HTMLElement>(`.vta__reveal[data-units~="${a.unit}"]`);
    } else if (a.kind === "keep") {
      el = root.querySelector<HTMLElement>(`[data-note-keep="${a.noteId}"]`);
    } else {
      el = root.querySelector<HTMLElement>(`[data-note-remove="${a.noteId}"]`);
    }
    try {
      el?.focus({ preventScroll: true });
    } catch {
      // Focus is a courtesy; never a reason to fail.
    }
  });

  // Escape closes the innermost thing: the form (asking first if anything is
  // typed), then the selection, handing the focus back to the line. It is
  // this page's only while the reader is on it (the focus here, or nowhere
  // in particular), and it is used up here (preventDefault), so a peek or a
  // sheet listening further out does not close on the same key.
  useEffect(() => {
    if (selected === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (!focusIsHereOrNowhere(rootRef.current)) return;
      e.preventDefault();
      const toggle = toggleRefs.current.get(selected);
      if (form !== null) {
        scope.guard(() => {
          setForm(null);
          toggle?.focus();
        });
        return;
      }
      setSelected(null);
      setAsking(null);
      toggle?.focus();
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

  const renderForm = (kind: FormKind, block: MarkedBlock, unit: string, section: VaultSection): ReactNode => {
    switch (kind) {
      case "strike":
        return <StrikeForm target={target} block={block} onDone={doneWith(unit)} onCancel={closeFormOf(unit)} />;
      case "note":
        return <NoteForm target={target} block={block} onDone={doneWith(unit)} onCancel={closeFormOf(unit)} />;
      case "submit":
        return <SubmitForm target={target} block={block} onDone={doneWith(unit)} onCancel={closeFormOf(unit)} />;
      case "share":
        return (
          <ShareForm target={target} block={block} sectionTitle={section.title.trim() || undefined} onDone={closeFormOf(unit)} />
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
  const renderNote = (note: StudioBlockNote, unit: string, removable: boolean) => {
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
                  aim.current = { kind: "line", unit };
                  setAsking(null);
                  if (studioId !== null) vault.store.removeNote(studioId, target.key, note.id);
                }}
              >
                Remove
              </button>
              <button
                type="button"
                className="vta__btn vta__btn--quiet"
                data-note-keep={note.id}
                onClick={() => {
                  aim.current = { kind: "remove", noteId: note.id };
                  setAsking(null);
                }}
              >
                Keep
              </button>
            </span>
          </div>
        ) : (
          <div className="vta__mark-row">
            <p className="vta__mark-by">{noteLine(note)}</p>
            <button
              type="button"
              className="vta__btn vta__btn--quiet"
              data-note-remove={note.id}
              onClick={() => {
                aim.current = { kind: "keep", noteId: note.id };
                setAsking(note.id);
              }}
            >
              <Trash2 size={16} aria-hidden />
              Remove
            </button>
          </div>
        )}
      </li>
    );
  };

  /** What this studio told head office about the line, and where it stands. */
  const renderAnswers = (list: LearningSubmission[]) => (
    <ul className="vta__answers" aria-label="Sent to head office about this line">
      {list.map((s) => {
        const a = answerOf(s);
        return (
          <li key={s.id} className="vta__answer" data-verdict={a.verdict}>
            <p className="vta__answer-head">
              <Send size={14} aria-hidden />
              <span>
                {a.head} · <strong className="vta__verdict">{verdictWord(a.verdict)}</strong>
              </span>
            </p>
            {a.note && <p className="vta__answer-note">{a.note}</p>}
            {a.note && a.noteBy && <p className="vta__mark-by">{a.noteBy}</p>}
          </li>
        );
      })}
    </ul>
  );

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

  // The one quiet hint: under the first line on screen outside the Stop
  // well, after its label's run (never between a label and its lines), else
  // above the first section (hintSpot).
  const hintWords =
    tapHint && !compact && !hintSeen
      ? lineHintWords(lineActions({ studioLens, canStrike, canNote, struck: false }))
      : null;
  const spot = hintWords ? hintSpot(applied.sections) : null;
  const hintUnit = spot?.kind === "line" ? `${spot.section}.${spot.index}` : null;
  const renderHint = (where: "line" | "top") => (
    <p className={where === "top" ? "vta__tap-hint vta__tap-hint--top" : "vta__tap-hint"}>
      <Pointer size={14} aria-hidden />
      <span>{hintWords}</span>
    </p>
  );

  const renderLine = (block: MarkedBlock, unit: string, section: VaultSection, showLabel: boolean) => {
    if (!isMarkableKind(block.kind)) return renderHeading(block, unit);
    const isOpen = selected === unit;
    const strike = studioLens ? block.strike : undefined;
    const notes = studioLens ? block.notes : [];
    const told = answers.get(block.key) ?? [];
    const notesShown = !gutter || opened.has(unit);
    const panelId = `${baseId}-panel-${unit}`;
    const label = (block.label ?? "").trim();

    return (
      <div
        key={unit}
        className={`vta__unit${isOpen ? " vta__unit--open" : ""}`}
        ref={isOpen ? openUnitRef : undefined}
        data-unit={unit}
        data-run={label ? (showLabel ? "head" : "cont") : undefined}
      >
        {gutter && <div className="vta__gutter">{renderMarker(unit, Boolean(strike), notes.length, notesShown)}</div>}
        <div className="vta__col">
          <div
            className="vta__line"
            data-kind={block.kind}
            data-vta-line=""
            data-selected={isOpen ? "" : undefined}
            onClick={(e) => {
              if (insideControl(e.target, e.currentTarget) || selectingText(e.currentTarget)) return;
              select(unit);
            }}
          >
            {label &&
              (showLabel ? (
                <span className="vta__label">{label}</span>
              ) : (
                // Said once over the run on screen; still said here to a screen reader.
                <span className="vta__sr">{label}: </span>
              ))}
            <span className={`vta__text vta__text--${block.kind}`}>
              {strike ? (
                <s className="vta__struck">{block.text}</s>
              ) : renderText ? (
                renderText(block.text, block)
              ) : (
                block.text
              )}
            </span>
            {/* The line's one real control, after its words (a screen reader
                hears the line, its terms, then this). Laid over the line and
                untouchable: a finger taps the line itself. */}
            <button
              type="button"
              ref={(el) => {
                if (el) toggleRefs.current.set(unit, el);
                else toggleRefs.current.delete(unit);
              }}
              className="vta__toggle"
              aria-label="Actions for this line"
              aria-expanded={isOpen}
              aria-controls={isOpen ? panelId : undefined}
              onClick={() => select(unit)}
            />
          </div>
          {/* The reason belongs to the line's words, so it sits right under
              them; the actions come next, then the notes. */}
          {strike && renderStrike(strike)}
          {isOpen && (
            <div className="vta__panel" id={panelId}>
              {block.source && block.source !== section.note && <p className="vta__source">{block.source}</p>}
              <BlockActions target={target} block={block} onPick={(a) => pick(block, unit, a)} open={formShown} />
              {formShown && <UnsavedChangesScope scope={scope}>{renderForm(formShown, block, unit, section)}</UnsavedChangesScope>}
            </div>
          )}
          {notesShown && notes.length > 0 && (
            <ul className="vta__notes" aria-label={`${possessive(studio)} notes on this line`}>
              {notes.map((n) => renderNote(n, unit, isOpen && formShown === null))}
            </ul>
          )}
          {told.length > 0 && renderAnswers(told)}
          {hintUnit === unit && !isOpen && renderHint("line")}
        </div>
      </div>
    );
  };

  const renderHidden = (
    piece: Extract<LinePiece<MarkedBlock>, { kind: "hidden" }>,
    si: number,
    section: VaultSection,
    shownLabels: boolean[],
  ) => {
    const run = `${si}.${piece.id}`;
    const shown = revealed.has(run);
    const units = piece.lines.map((l) => `${si}.${l.index}`);
    return (
      <div key={run} className="vta__hidden">
        <button
          type="button"
          className="vta__reveal"
          aria-expanded={shown}
          data-units={units.join(" ")}
          onClick={() => toggleRevealed(run, units)}
        >
          {shown ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
          {shown ? hideAgainLabel(piece.lines.length) : hiddenLabel(piece.lines.length)}
        </button>
        {shown && piece.lines.map((l) => renderLine(l.block, `${si}.${l.index}`, section, shownLabels[l.index]))}
      </div>
    );
  };

  const lineCount = applied.sections.reduce((n, s) => n + s.blocks.length, 0);
  // A section with no lines can still say something honest in its note (an
  // empty codex tier's "Nothing written for this machine yet."), so the
  // generic well is only for a page with neither lines nor notes.
  const noteCount = applied.sections.filter((s) => (s.note ?? "").trim() !== "").length;

  // The page's accent for its spoken lines: given, else its machine's.
  const accentVars = accent === undefined ? pageAccent({ target }) : (accent ?? undefined);

  return (
    <div
      ref={rootRef}
      className="vta"
      data-annotate={drawn}
      data-compact={compact ? "" : undefined}
      style={accentVars}
    >
      {spot?.kind === "top" && renderHint("top")}
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
          const pieces = piecesOf(blocks);
          // Which lines the reader sees: a hidden run shown again counts.
          const shownAt = blocks.map((b) => !b.hidden);
          for (const p of pieces) {
            if (p.kind === "hidden" && revealed.has(`${si}.${p.id}`)) for (const l of p.lines) shownAt[l.index] = true;
          }
          const shownLabels = labelRuns(
            blocks.map((b, i) => ({ kind: b.kind, label: b.label, shown: shownAt[i] })),
            section.title,
          );
          const titleId = `${baseId}-title-${si}`;
          const showTitle = !hideSectionTitles && section.title.trim() !== "";
          return (
            <section
              key={`${si}-${section.id}`}
              className="vta__section"
              data-tone={sectionTone(section.id) ?? undefined}
              aria-labelledby={showTitle ? titleId : undefined}
            >
              {showTitle && createElement(`h${headingLevel}`, { id: titleId, className: "vta__title" }, section.title)}
              {section.note && <p className="vta__section-note">{section.note}</p>}
              <div className="vta__lines">
                {pieces.map((piece) =>
                  piece.kind === "line"
                    ? renderLine(piece.block, `${si}.${piece.index}`, section, shownLabels[piece.index])
                    : renderHidden(piece, si, section, shownLabels),
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
