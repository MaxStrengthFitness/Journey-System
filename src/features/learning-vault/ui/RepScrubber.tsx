/**
 * THE REP SCRUBBER — one set, drawn as a timeline a trainer can drag
 * (Learning vault redesign, Oct 19 2026; the Interactive Course's
 * showpiece, and the machine page's "how it runs" in the other two).
 *
 * WHAT IT IS FOR
 * --------------
 * The Academy teaches the repetition in words: a gradual load-up "over a
 * time frame of 3 or more seconds", "6 to 10 seconds" each way, a pause and
 * a squeeze from the third rep, a lower turnaround that is "always
 * continuous". A new Life Transformer reads those once and has to carry
 * them to the floor. Here they can feel them: drag the thumb (or press
 * Play) and the moment under it says its rule, where the rule comes from,
 * and the phrasebook's words for it.
 *
 * WHAT IT NEVER SAYS
 * ------------------
 * That a rep IS 20 seconds (decision 10). It shows each stroke's own
 * seconds against the pace chosen (6 to 10, the house's 6 first) and the
 * Academy's window in one line. Nothing is scored, stored or timed against
 * the trainer: Play is a demonstration, not a drill.
 *
 * HOW IT IS BUILT
 * ---------------
 * A hand-built slider, not components/ui/slider (a 12px thumb in "go"
 * orange on a muted well: under the 40px rule and the wrong colour job). The
 * thumb is 44px and blue (blue is what you act on); the whole track is the
 * target, so a drag can start anywhere on it; pointer capture keeps the drag
 * when the finger leaves the bar; the arrow keys step half a second, Page Up
 * and Page Down jump a phase, Home and End go to the ends. Play moves the
 * thumb in real time and stops at the end; with reduced motion it steps a
 * second at a time instead of gliding. A change of pace or shape keeps the
 * thumb on the same moment (remapTime).
 *
 * The arithmetic and the words are in ../rep-phases.ts.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { LoadingMark } from "../../../components/LoadingMark";
import { useMediaQuery } from "../../../hooks/useMediaQuery";
import type { CueMoment } from "../../academy/types";
import {
  CUE_SOURCE_LABEL,
  DEFAULT_PACE,
  PACES,
  PHASE_WORDS,
  SHAPE_EXAMPLES,
  SHAPE_LABEL,
  SHAPE_WORDS,
  WINDOW_LINE,
  cuesForPhase,
  cycleOf,
  isContinuousTurn,
  jumpTimes,
  phaseAt,
  phaseJumpTime,
  phaseTiming,
  remapTime,
  repModel,
  round1,
  secondsText,
  sourceRouteOf,
} from "../rep-phases";
import type { RepModel, RepPhase, RepShape, VaultRoute } from "../types";
import "../../wiki/wiki.css";
import "./rep.css";

const SHAPES: readonly RepShape[] = ["endStop", "squeeze", "handoff"];
/** One arrow press: half a second, so a stroke is twelve presses at the house pace. */
const STEP = 0.5;
/** How many of a moment's lines show at once; "All n lines" opens the phrasebook. */
const PHRASES_SHOWN = 6;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

type BandKind = "start" | "stroke" | "turn" | "hold" | "end";

/** How a phase is drawn on the bar: the once-a-set ends hatched, strokes light, turns dark. */
export function bandKind(model: RepModel, ph: RepPhase): BandKind {
  if (ph.id === "loadup" || ph.id === "handoff") return "start";
  if (ph.id === "final") return "end";
  if (ph.id === "upper" || ph.id === "lower") return isContinuousTurn(model, ph) ? "turn" : "hold";
  return "stroke";
}

const pct = (n: number, total: number) => (total > 0 ? Math.min(100, Math.max(0, (n / total) * 100)) : 0);

export interface RepScrubberProps {
  /** The machine's shape. Without a machine, the three shapes are a switch and this is the first one shown. */
  shape?: RepShape;
  /** The Academy's phrasebook: null while it loads; leave it out to show no cue lines. */
  cues?: CueMoment[] | null;
  /** The machine this is for; with it, the shape is fixed and the switch is not drawn. */
  machineName?: string;
  /** "Read it": an Academy topic for a rule, the phrasebook for a moment's lines. */
  onOpenSource?: (route: VaultRoute) => void;
  className?: string;
}

export function RepScrubber({ shape, cues, machineName, onOpenSource, className }: RepScrubberProps) {
  const fixed = typeof machineName === "string" && machineName.trim() !== "";
  const [picked, setPicked] = useState<RepShape>(shape ?? "endStop");
  const activeShape: RepShape = fixed ? (shape ?? "endStop") : picked;
  const [pace, setPace] = useState<number>(DEFAULT_PACE);
  const model = useMemo(() => repModel(activeShape, pace), [activeShape, pace]);

  // The thumb's moment belongs to the model it was set on. When the pace or
  // the shape changes, it is carried across to the same moment of the new
  // one, during this render (React's "information from previous renders"
  // pattern), so no frame ever draws it past the end of a shorter bar.
  const [clock, setClock] = useState<{ model: RepModel; t: number }>(() => ({ model, t: 0 }));
  let t = clock.t;
  if (clock.model !== model) {
    t = remapTime(clock.model, model, clock.t);
    setClock({ model, t });
  }
  const moveTo = useCallback((next: (t: number, m: RepModel) => number) => {
    // Clamped, not rounded: Play and a drag glide; the keys step in round half-seconds themselves.
    setClock((c) => ({ model: c.model, t: Math.min(c.model.total, Math.max(0, next(c.t, c.model))) }));
  }, []);

  const current = phaseAt(model, t);
  const cycle = cycleOf(model);
  const sourceRoute = sourceRouteOf(current);
  const phaseCues = cues ? cuesForPhase(cues, current, activeShape, fixed ? machineName : undefined) : null;
  const atEnd = t >= model.total - 0.01;

  /* ---- Play ---------------------------------------------------------- */

  const [playing, setPlaying] = useState(false);
  const reduceMotion = useMediaQuery(REDUCED_MOTION);
  const tRef = useRef(t);
  useLayoutEffect(() => {
    tRef.current = t;
  });

  useEffect(() => {
    if (!playing) return;
    const total = model.total;
    let cur = tRef.current >= total - 0.01 ? 0 : tRef.current;
    let stopped = false;
    const stop = () => {
      stopped = true;
      setPlaying(false);
    };
    const canGlide = !reduceMotion && typeof window.requestAnimationFrame === "function";
    if (!canGlide) {
      // Reduced motion: a whole second at a time, no glide.
      const id = window.setInterval(() => {
        cur = Math.min(total, Math.floor(cur + 1e-6) + 1);
        moveTo(() => cur);
        if (cur >= total) {
          window.clearInterval(id);
          stop();
        }
      }, 1000);
      return () => window.clearInterval(id);
    }
    let last: number | null = null;
    let frame = 0;
    const tick = (now: number) => {
      if (stopped) return;
      if (last !== null) cur = Math.min(total, cur + Math.max(0, now - last) / 1000);
      last = now;
      moveTo(() => cur);
      if (cur >= total) {
        stop();
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
    };
  }, [playing, model, reduceMotion, moveTo]);

  const onPlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (atEnd) moveTo(() => 0);
    setPlaying(true);
  };

  /* ---- Dragging ------------------------------------------------------ */

  const railRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const dragId = useRef<number | null>(null);
  const [grabbed, setGrabbed] = useState(false);

  const timeAt = (clientX: number): number | null => {
    const el = railRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0)) return null;
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return f * model.total;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    setPlaying(false);
    dragId.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // No pointer capture (an old browser, a test): the drag still follows inside the bar.
    }
    const at = timeAt(e.clientX);
    if (at !== null) moveTo(() => at);
    setGrabbed(true);
    thumbRef.current?.focus({ preventScroll: true });
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragId.current !== e.pointerId) return;
    const at = timeAt(e.clientX);
    if (at !== null) moveTo(() => at);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragId.current !== e.pointerId) return;
    dragId.current = null;
    setGrabbed(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Already released.
    }
  };

  /* ---- Keys ---------------------------------------------------------- */

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    let next: ((t: number, m: RepModel) => number) | null = null;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = (now) => round1(now + STEP);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = (now) => round1(now - STEP);
        break;
      case "PageUp":
        next = (now, m) => jumpTimes(m).find((j) => j > now + 0.05) ?? m.total;
        break;
      case "PageDown":
        next = (now, m) => {
          const before = jumpTimes(m).filter((j) => j < now - 0.05);
          return before.length ? before[before.length - 1] : 0;
        };
        break;
      case "Home":
        next = () => 0;
        break;
      case "End":
        next = (_now, m) => m.total;
        break;
      default:
        return;
    }
    if (!next) return;
    e.preventDefault();
    setPlaying(false);
    moveTo(next);
  };

  /* ---- Words --------------------------------------------------------- */

  const titleId = useId();
  const paceId = useId();
  const thumbAt = pct(t, model.total);
  const traceStyle = { "--vtr-secs": String(Math.max(1, Math.round(model.total))) } as CSSProperties;
  // Turns are drawn over the strokes they join, so they come last.
  const bands = [...model.phases].sort((a, b) => Number(bandKind(model, a) === "turn") - Number(bandKind(model, b) === "turn"));

  return (
    <section className={`vtr${className ? ` ${className}` : ""}`} aria-labelledby={titleId}>
      <div className="vtr__head">
        <div className="vtr__titles">
          <h3 className="vtr__title" id={titleId}>
            The repetition
          </h3>
          <p className="vtr__sub">
            {fixed ? <strong className="vtr__machine">{machineName}: </strong> : null}
            {SHAPE_WORDS[activeShape]}
          </p>
          {!fixed && <p className="vtr__examples">{SHAPE_EXAMPLES[activeShape]}</p>}
        </div>
        {!fixed && (
          <div className="vtr__seg vtr__shapes" role="group" aria-label="How the set begins and turns">
            {SHAPES.map((s) => (
              <button
                key={s}
                type="button"
                className="vtr__seg-btn"
                aria-pressed={s === activeShape}
                onClick={() => {
                  setPlaying(false);
                  setPicked(s);
                }}
              >
                {SHAPE_LABEL[s]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="vtr__now">
        <div className="vtr__readout">
          {/* The phase's name is the one thing read aloud as it changes; the clock beside it is not. */}
          <div className="vtr__phase-live" aria-live="polite">
            <p className="vtr__phase" key={current.id} data-phase={current.id}>
              {current.label}
            </p>
          </div>
          <p className="vtr__words">
            <span>{PHASE_WORDS[current.id]}</span>
            <span className="vtr__clock">{phaseTiming(model, current, t)}</span>
          </p>
        </div>
        <button type="button" className="vtr__btn vtr__btn--primary vtr__play" onClick={onPlay}>
          {playing ? <Pause size={18} aria-hidden="true" /> : atEnd ? <RotateCcw size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
          <span>{playing ? "Pause" : atEnd ? "Play again" : "Play"}</span>
        </button>
      </div>

      <div
        className="vtr__track"
        style={traceStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="vtr__rail" ref={railRef}>
          {bands.map((ph) => (
            <span
              key={ph.id}
              className={`vtr__band vtr__band--${bandKind(model, ph)}${ph.id === current.id ? " vtr__band--on" : ""}`}
              style={{ left: `${pct(ph.from, model.total)}%`, width: `${pct(ph.to - ph.from, model.total)}%` }}
              data-phase={ph.id}
              aria-hidden="true"
            />
          ))}
          <span className="vtr__ruler" aria-hidden="true" />
          <span className="vtr__fill" style={{ width: `${thumbAt}%` }} aria-hidden="true" />
          <div
            ref={thumbRef}
            className="vtr__thumb"
            role="slider"
            tabIndex={0}
            aria-label="The moment in the set"
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={model.total}
            aria-valuenow={round1(t)}
            aria-valuetext={`${current.label}, ${secondsText(t)} seconds in`}
            data-grabbed={grabbed ? "true" : undefined}
            style={{ left: `${thumbAt}%` }}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>

      <div className="vtr__cycle-row">
        <p
          className="vtr__cycle"
          style={{ marginLeft: `${pct(cycle.from, model.total)}%`, width: `${pct(cycle.to - cycle.from, model.total)}%` }}
        >
          {cycle.words}
        </p>
      </div>

      <div className="vtr__steps" role="group" aria-label="Go to a moment">
        {model.phases.map((ph) => (
          <button
            key={ph.id}
            type="button"
            className="vtr__step"
            aria-pressed={ph.id === current.id}
            onClick={() => {
              setPlaying(false);
              moveTo((_now, m) => phaseJumpTime(m, ph.id));
            }}
          >
            <span className={`vtr__swatch vtr__swatch--${bandKind(model, ph)}`} aria-hidden="true" />
            <span className="vtr__step-label">{ph.label}</span>
          </button>
        ))}
      </div>

      <div className="vtr__foot">
        <div className="vtr__pace">
          <span className="vtr__pace-label" id={paceId}>
            Seconds each way
          </span>
          <div className="vtr__seg" role="group" aria-labelledby={paceId}>
            {PACES.map((p) => (
              <button key={p} type="button" className="vtr__seg-btn vtr__seg-btn--num" aria-pressed={p === pace} onClick={() => setPace(p)}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <p className="vtr__window">{WINDOW_LINE}</p>
      </div>

      <div className="vtr__detail">
        <div className="vtr__rule">
          <p className="vtr__rule-text">{current.rule}</p>
          <p className="vtr__src">
            <span className="vtr__src-label">{current.source}</span>
            {onOpenSource && sourceRoute && (
              <button type="button" className="vtr__btn vtr__btn--quiet" onClick={() => onOpenSource(sourceRoute)}>
                Read it
              </button>
            )}
          </p>
        </div>
        {cues !== undefined && (
          <div className="vtr__say">
            <h4 className="vtr__h">What to say</h4>
            {cues === null ? (
              <LoadingMark size="sm" label="Loading the Academy's cues…" />
            ) : phaseCues && phaseCues.phrases.length > 0 ? (
              <>
                <ul className="vtr__phrases">
                  {phaseCues.phrases.slice(0, PHRASES_SHOWN).map((p, i) => (
                    <li key={`${i}-${p}`}>{p}</li>
                  ))}
                </ul>
                <p className="vtr__src">
                  <span className="vtr__src-label">
                    {CUE_SOURCE_LABEL} · {phaseCues.title}
                  </span>
                  {onOpenSource && (
                    <button
                      type="button"
                      className="vtr__btn vtr__btn--quiet"
                      onClick={() => onOpenSource({ kind: "cueing", moment: phaseCues.index })}
                    >
                      {phaseCues.phrases.length > PHRASES_SHOWN ? `All ${phaseCues.phrases.length} lines` : "Read it"}
                    </button>
                  )}
                </p>
              </>
            ) : (
              <p className="vtr__none">The phrasebook has no lines for this moment.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
