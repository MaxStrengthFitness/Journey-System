/**
 * THE CONCEPT LAYER — a tapped word opens its card beside it, and the card's
 * own words open the next one, three deep.
 *
 * Round: the Learning vault redesign, Oct 19 2026 (Design 2, the Living
 * Vault: "3-level lockable nested concept popovers"; the brief's picture was
 * the nested tooltip of Crusader Kings 3 and Victoria 3).
 *
 * HOW IT BEHAVES ON AN IPAD
 * -------------------------
 * - A tap on a linked word (LinkedText) opens its card UNDER the word, or
 *   above it when there is no room below; never on the sentence being read
 *   unless the screen has no room either side (concepts.ts, placePopover).
 * - A linked word inside the card pushes the next card. A crumb row shows the
 *   stack (up to three); a crumb takes you back to it. A fourth replaces the
 *   third, so the way back to where you started is always one tap.
 * - Scroll on, or tap anywhere else, and an unpinned card goes: dismissing it
 *   is not a decision. The Pin keeps it on screen while you read on; then
 *   only Close or Escape puts it away.
 * - Escape closes it and gives the word its focus back; the card takes the
 *   focus when it opens, so a keyboard reader lands in it.
 * - A card whose word is no longer on screen goes, pinned or not (review
 *   fix, Oct 19 2026): Learning's search hides the page (display: none)
 *   rather than unmounting it, and a pinned card used to stay floating over
 *   search pointing at nothing, taking search's own Escape. A word that is
 *   not drawn (shownOnScreen) is treated as a word that has gone.
 * - "Open page" goes to the thing itself; "Peek" (when the design has a peek
 *   sheet) opens it beside the page instead.
 *
 * WHY A PORTAL, AND WHY IT STOPS ITS OWN TAPS
 * -------------------------------------------
 * The card is position: fixed in <body>, so no transformed or scrolling
 * ancestor can clip it or widen Learning's one scroller (gaps.md §6). React
 * still bubbles a portal's events up the COMPONENT tree, into whatever line
 * the word was in; ArticleBlocks selects a line on a click. So the card stops
 * its own clicks, pointers and keys at its edge: a tap inside a card is never
 * a tap on the line underneath.
 *
 * Measured in layout effects that cannot throw (a throw there takes the screen
 * down, KNOWN-TRAPS), ResizeObserver feature-detected. Nothing is stored: the
 * stack is React state and goes with the layer.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  FileText,
  HeartPulse,
  ListChecks,
  MessageCircle,
  PanelBottomOpen,
  Pin,
  X,
} from "lucide-react";
import type { EntityKind, VaultRoute } from "../types";
import {
  anchorMoved,
  conceptCard,
  placePopover,
  pushConcept,
  samePlace,
  type BoxRect,
  type EntityIndex,
  type PopoverPlace,
} from "../concepts";
import { TermButton } from "./TermButton";
import "../../wiki/wiki.css";
import "./concept.css";

/* ------------------------------------------------------------------ *
 * The context a LinkedText reads
 * ------------------------------------------------------------------ */

export interface ConceptsValue {
  /** Open (or, tapped again, close) the card for an entity, beside the word tapped. */
  open: (entityId: string, anchor: HTMLElement) => void;
  /** Close the card and give the word its focus back. */
  close: () => void;
  index: EntityIndex | null;
}

const ConceptsContext = createContext<ConceptsValue | null>(null);

/** The layer's doors, or null outside one (LinkedText then draws plain words). */
export function useConcepts(): ConceptsValue | null {
  return useContext(ConceptsContext);
}

/* ------------------------------------------------------------------ *
 * The layer
 * ------------------------------------------------------------------ */

interface LayerState {
  stack: string[];
  anchor: HTMLElement | null;
  pinned: boolean;
}

const CLOSED: LayerState = { stack: [], anchor: null, pinned: false };

/**
 * True when the word is drawn: in the document, and not inside something
 * hidden (Learning's search stashes the page with display: none). An engine
 * without layout (a test's jsdom) cannot tell, and says yes.
 */
export function shownOnScreen(el: Element | null | undefined): boolean {
  if (!el || !el.isConnected) return false;
  try {
    const check = (el as Element & { checkVisibility?: () => boolean }).checkVisibility;
    if (typeof check === "function") return check.call(el);
    if (el.getClientRects().length > 0) return true;
    // No rects: hidden, unless nothing here has a layout at all.
    return typeof document !== "undefined" && document.documentElement.getClientRects().length === 0;
  } catch {
    return true;
  }
}

function giveFocusBack(anchor: HTMLElement | null): void {
  try {
    if (anchor && anchor.isConnected) anchor.focus({ preventScroll: true });
  } catch {
    // A word that cannot take focus is not a reason to fail a close.
  }
}

export function ConceptLayer(props: {
  index: EntityIndex | null;
  onOpen: (route: VaultRoute) => void;
  onPeek?: (route: VaultRoute) => void;
  children: ReactNode;
}) {
  const { index, onOpen, onPeek, children } = props;
  const [layer, setLayer] = useState<LayerState>(CLOSED);

  // The doors are stable (LinkedText memoises its links on the context), so
  // they read the latest state through refs rather than closing over it.
  const layerRef = useRef(layer);
  layerRef.current = layer;
  const indexRef = useRef(index);
  indexRef.current = index;

  const shut = useCallback((returnFocus: boolean) => {
    const { stack, anchor } = layerRef.current;
    if (stack.length === 0) return;
    layerRef.current = CLOSED;
    setLayer(CLOSED);
    if (returnFocus) giveFocusBack(anchor);
  }, []);

  const open = useCallback((entityId: string, anchor: HTMLElement) => {
    const idx = indexRef.current;
    if (!idx || !idx.byId.has(entityId) || !anchor) return;
    const current = layerRef.current;
    // The same word tapped again puts its card away (the finger is already on it).
    const next =
      current.anchor === anchor && current.stack.length === 1 && current.stack[0] === entityId
        ? CLOSED
        : { stack: [entityId], anchor, pinned: false };
    layerRef.current = next;
    setLayer(next);
  }, []);

  const close = useCallback(() => shut(true), [shut]);

  const value = useMemo<ConceptsValue>(() => ({ open, close, index }), [open, close, index]);

  const push = useCallback((id: string) => {
    setLayer((prev) => (prev.stack.length === 0 ? prev : { ...prev, stack: pushConcept(prev.stack, id) }));
  }, []);
  const toCrumb = useCallback((i: number) => {
    setLayer((prev) => ({ ...prev, stack: prev.stack.slice(0, i + 1) }));
  }, []);
  const togglePin = useCallback(() => {
    setLayer((prev) => ({ ...prev, pinned: !prev.pinned }));
  }, []);

  // A new index (the glossary landed, a design changed) can drop an id the
  // stack holds; a stack with nothing left in it is closed.
  const stack = index ? layer.stack.filter((id) => index.byId.has(id)) : [];
  const portalHost = typeof document !== "undefined" ? document.body : null;

  return (
    <ConceptsContext.Provider value={value}>
      {children}
      {index && stack.length > 0 && layer.anchor && portalHost
        ? createPortal(
            <ConceptPopover
              index={index}
              stack={stack}
              anchor={layer.anchor}
              pinned={layer.pinned}
              onPush={push}
              onCrumb={toCrumb}
              onTogglePin={togglePin}
              onClose={shut}
              onOpen={onOpen}
              onPeek={onPeek}
            />,
            portalHost,
          )
        : null}
    </ConceptsContext.Provider>
  );
}

/* ------------------------------------------------------------------ *
 * The card
 * ------------------------------------------------------------------ */

type Glyph = ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean; className?: string }>;

/** What kind of thing a card is, shown, not labelled: one glyph per kind. */
const KIND_GLYPH: Record<EntityKind, Glyph> = {
  term: BookOpen,
  machine: Dumbbell,
  rule: ListChecks,
  clinical: HeartPulse,
  topic: FileText,
  cue: MessageCircle,
  playbook: ClipboardList,
};

/**
 * The words on the card's main button: what it does. A clinical flag has no
 * page of its own: it opens as its `map` route, which each design draws its
 * own way (the Vault's map focused on it, the Codex's entry, the Course's
 * connections), so its button says only "Open", true in all three (recheck
 * fix, Oct 19 2026: "Show on the map" promised a map the Course does not have).
 */
export function openLabel(route: VaultRoute): string {
  return route.kind === "map" ? "Open" : "Open page";
}

/** A card's taps go no further than the card (see the header: the line underneath). */
function keepInside(e: SyntheticEvent): void {
  e.stopPropagation();
}

function rectOf(el: HTMLElement): BoxRect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function viewportSize(): { width: number; height: number } {
  return { width: window.innerWidth || 0, height: window.innerHeight || 0 };
}

function ConceptPopover(props: {
  index: EntityIndex;
  stack: string[];
  anchor: HTMLElement;
  pinned: boolean;
  onPush: (id: string) => void;
  onCrumb: (i: number) => void;
  onTogglePin: () => void;
  onClose: (returnFocus: boolean) => void;
  onOpen: (route: VaultRoute) => void;
  onPeek?: (route: VaultRoute) => void;
}) {
  const { index, stack, anchor, pinned, onPush, onCrumb, onTogglePin, onClose, onOpen, onPeek } = props;
  const topId = stack[stack.length - 1];
  const card = conceptCard(topId, index);
  const titleId = useId();
  const popRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const [place, setPlace] = useState<PopoverPlace | null>(null);
  /** Where the word was when its card opened: a scroll is measured from here. */
  const openedAt = useRef<BoxRect | null>(null);

  // The latest props for the window listeners, which are added once per open.
  const live = useRef({ pinned, anchor, onClose });
  live.current = { pinned, anchor, onClose };

  const measure = useCallback(() => {
    try {
      const pop = popRef.current;
      const a = live.current.anchor;
      if (!pop || !a) return;
      if (!shownOnScreen(a)) {
        live.current.onClose(false);
        return;
      }
      const next = placePopover(rectOf(a), { width: pop.offsetWidth, height: pop.offsetHeight }, viewportSize());
      setPlace((prev) => (samePlace(prev, next) ? prev : next));
    } catch {
      // Never let a measurement take Learning down: the card stays where it was.
    }
  }, []);

  // A new word: remember where it is, and place the card before it paints.
  useLayoutEffect(() => {
    try {
      openedAt.current = anchor.isConnected ? rectOf(anchor) : null;
    } catch {
      openedAt.current = null;
    }
    measure();
  }, [anchor, measure]);

  // A new card in the stack is a new height: place it again.
  useLayoutEffect(() => {
    measure();
  }, [topId, stack.length, measure]);

  // The word's page went away under the card (a design swapped the page),
  // or is hidden (search stashed it): nothing to point at, so the card goes,
  // quietly, pinned or not.
  useLayoutEffect(() => {
    if (!shownOnScreen(anchor)) onClose(false);
  });

  // The card's own size changes (fonts, a long summary): follow it.
  useEffect(() => {
    const pop = popRef.current;
    if (!pop || typeof ResizeObserver !== "function") return;
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => measure());
      ro.observe(pop);
    } catch {
      ro = null;
    }
    return () => ro?.disconnect();
  }, [measure]);

  // The screen turns or the keyboard comes up: place it again.
  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      vv?.removeEventListener("resize", onResize);
    };
  }, [measure]);

  // Scroll on, tap elsewhere, Escape: the three ways a card goes.
  useEffect(() => {
    const inside = (t: EventTarget | null) => t instanceof Node && !!popRef.current?.contains(t);

    const onScroll = (e: Event) => {
      const a = live.current.anchor;
      if (!shownOnScreen(a)) {
        live.current.onClose(false);
        return;
      }
      if (live.current.pinned || inside(e.target)) return;
      try {
        if (!a.isConnected) {
          live.current.onClose(false);
          return;
        }
        const before = openedAt.current;
        if (before && anchorMoved(before, rectOf(a))) live.current.onClose(false);
        else measure();
      } catch {
        live.current.onClose(false);
      }
    };

    const onPointerDown = (e: Event) => {
      if (live.current.pinned) return;
      const t = e.target;
      if (inside(t)) return;
      // The word itself: its own click decides (a second tap closes it).
      if (t instanceof Node && live.current.anchor.contains(t)) return;
      live.current.onClose(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // The unsaved-changes question is above everything; Escape is its.
      if (document.querySelector('[role="alertdialog"]')) return;
      // A card whose word is hidden is not the innermost thing: Escape is
      // whatever is on screen's (search's own box), and the card just goes.
      if (!shownOnScreen(live.current.anchor)) {
        live.current.onClose(false);
        return;
      }
      // The innermost thing open is this card: Escape is not also a line's.
      e.stopPropagation();
      live.current.onClose(true);
    };

    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [measure]);

  // The card takes the focus as it opens, and again for each card pushed, so
  // a keyboard or VoiceOver reader is where the words are.
  useEffect(() => {
    try {
      titleRef.current?.focus({ preventScroll: true });
    } catch {
      // Focus is a courtesy here, never a reason to fail.
    }
  }, [topId]);

  if (!card) return null;
  const { entity, summary, connected } = card;
  const Kind = KIND_GLYPH[entity.kind] ?? FileText;
  const labelOf = (id: string) => index.byId.get(id)?.label ?? id;

  return (
    <div
      ref={popRef}
      className="vtc__pop"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-pinned={pinned ? "true" : "false"}
      data-side={place?.side ?? "below"}
      style={{ top: place?.top ?? 0, left: place?.left ?? 0, visibility: place ? undefined : "hidden" }}
      onClick={keepInside}
      onPointerDown={keepInside}
      onMouseDown={keepInside}
      onTouchStart={keepInside}
      onKeyDown={keepInside}
    >
      {stack.length > 1 && (
        <nav className="vtc__crumbs" aria-label="Cards open">
          <ol>
            {stack.map((id, i) => {
              const here = i === stack.length - 1;
              return (
                <li key={id}>
                  {here ? (
                    <span className="vtc__crumb vtc__crumb--here" aria-current="true">
                      {labelOf(id)}
                    </span>
                  ) : (
                    <>
                      <button type="button" className="vtc__crumb" onClick={() => onCrumb(i)}>
                        {labelOf(id)}
                      </button>
                      <ChevronRight size={14} aria-hidden className="vtc__crumb-sep" />
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      <div className="vtc__head">
        {/* Keyed by the card on top, so a pushed card eases in rather than
            swapping its words under the reader's eye. */}
        <div className="vtc__heading" key={`h-${topId}`}>
          <h2 id={titleId} ref={titleRef} className="vtc__title" tabIndex={-1}>
            {entity.label}
          </h2>
          <p className="vtc__source">
            <Kind size={14} strokeWidth={2.2} aria-hidden className="vtc__source-icon" />
            <span>{entity.source}</span>
          </p>
        </div>
        <button
          type="button"
          className="vtc__icon"
          aria-label="Pin"
          aria-pressed={pinned}
          title={pinned ? "Pinned: stays open while you scroll" : "Pin: keep it open while you scroll"}
          onClick={onTogglePin}
        >
          <Pin size={18} aria-hidden />
        </button>
        <button type="button" className="vtc__icon" aria-label="Close" onClick={() => onClose(true)}>
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="vtc__body" key={`b-${topId}`}>
        {summary.length > 0 && (
          <p className="vtc__summary">
            {summary.map((s, i) =>
              s.entityId ? (
                <TermButton key={`${s.entityId}-${i}`} onPress={() => onPush(s.entityId as string)}>
                  {s.text}
                </TermButton>
              ) : (
                <span key={`t-${i}`}>{s.text}</span>
              ),
            )}
          </p>
        )}

        {connected.length > 0 && (
          <ul className="vtc__links">
            {connected.map((other) => {
              const Glyph = KIND_GLYPH[other.kind] ?? FileText;
              return (
                <li key={other.id}>
                  <button type="button" className="vtc__chip" onClick={() => onPush(other.id)}>
                    <Glyph size={14} strokeWidth={2.2} aria-hidden className="vtc__chip-icon" />
                    <span>{other.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="vtc__actions">
          <button
            type="button"
            className="vtc__btn vtc__btn--open"
            onClick={() => {
              onOpen(entity.route);
              onClose(false);
            }}
          >
            <span>{openLabel(entity.route)}</span>
            <ArrowRight size={16} aria-hidden />
          </button>
          {onPeek && (
            <button
              type="button"
              className="vtc__btn"
              onClick={() => {
                onPeek(entity.route);
                onClose(false);
              }}
            >
              <PanelBottomOpen size={16} aria-hidden />
              <span>Peek</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
