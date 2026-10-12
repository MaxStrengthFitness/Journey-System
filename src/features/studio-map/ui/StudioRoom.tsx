import { memo, useEffect, useId, useMemo, useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { FireExtinguisher, HeartPulse } from "lucide-react";
import type { KnownSize } from "../../../types/machines";
import { footprint } from "../geometry";
import { isSafety, placeName, type Placement, type PlanPoint, type PlanRoom, type RoomPlace } from "../layout";
import type { Tool } from "../placement";
import { inRoom, roomShape, type RoomShape } from "../room";
import { MARKER_MM } from "../sizes";
import { handlesFor, pickAt, type TapTarget } from "../tap";
import { sizeLine } from "../units";
import { DEAD_PX } from "../placement";
import { frameOf, roomBounds, type Frame } from "./drawing";
import "../studio-map.css";

/**
 * THE DRAWING — one presentational SVG for every door (the studio map, Oct
 * 2026): the floor (its boxes, no edge, so two boxes read as one floor),
 * the editor's 1 ft grid, the walls with each door's span left out and its
 * swing drawn into the room, the areas with their names, the pillars, the
 * machines at their true size (a round marker for one with no size, dashed
 * for a machine still to buy), the machines' codes, and on top THE SAFETY
 * LAYER: the AED and the fire extinguisher, never under a machine, never
 * dimmed, their words always drawn (AJ, Oct 11 2026: "Fire extinguisher.
 * AED."), and in the editor the selected box's or place's handles.
 *
 * No Firestore, no Relay, no router. Every element carries a class and the
 * stylesheet sets its colour: no colour attribute is ever written. A label
 * is drawn only where it fits, else dropped whole, never clipped; the full
 * name is always in the list beside the drawing and in the aria-label.
 *
 * A tap goes through `pickAt` (a footprint that holds it, else the nearest
 * within 22 px); places are never tap targets here. The editor passes
 * `interaction` and does its own picking with the point in millimetres.
 */

export interface MapMachine {
  id: string;
  name: string;
  code: string;
  placement: Placement;
  /** null: a round marker, no size on file. */
  size: KnownSize | null;
  planned?: boolean;
}

export interface RoomInteraction {
  tool: Tool;
  /** The selected box or place, drawn with its handles in the room tool. */
  selected: { id: string; rect: { x: number; y: number; w: number; h: number }; kind?: RoomPlace["kind"] } | null;
  onPointerDown: (e: ReactPointerEvent<SVGSVGElement>, mm: PlanPoint, frame: Frame) => void;
  onPointerMove: (e: ReactPointerEvent<SVGSVGElement>, mm: PlanPoint, frame: Frame) => void;
  onPointerUp: (e: ReactPointerEvent<SVGSVGElement>, mm: PlanPoint, frame: Frame) => void;
  onPointerCancel: () => void;
}

export interface StudioRoomProps {
  /** "{Studio}'s map". */
  ariaLabel: string;
  room: PlanRoom;
  /** The host's memoised roomShape(room.boxes); worked out here if absent. */
  shape?: RoomShape;
  /** The room's extent to fit (the host's, so a box dragged past it never rescales the drawing under a finger). */
  bounds?: ReturnType<typeof roomBounds>;
  machines: readonly MapMachine[];
  /** The container's width; the drawing fits it at zoom 1. */
  widthPx: number;
  /** The most the container may be tall, when the host knows it: the drawing fits that too at zoom 1. */
  heightPx?: number;
  zoom?: number;
  selectedId?: string | null;
  /** The editor's overlaps: a plum edge. */
  warnIds?: ReadonlySet<string>;
  /** A door's own mark on a machine: a class from studio-map.css, and words for its aria-label. */
  markOf?: (id: string) => { className?: string; aria?: string } | null;
  /** The Catalog's Find narrowing (never dims the safety layer). */
  dimIds?: ReadonlySet<string>;
  /** Extra words for a machine's aria-label (the editor's overlap lines). */
  ariaOf?: (id: string) => string | null;
  onPick: (id: string) => void;
  interaction?: RoomInteraction;
}

/* ------------------------------------------------------------------ *
 * Text widths: measured once each, estimated where there's no canvas
 * ------------------------------------------------------------------ */

const widths = new Map<string, number>();
let ctx: CanvasRenderingContext2D | null | undefined;
function textWidth(text: string, px: number): number {
  const key = `${px}|${text}`;
  const known = widths.get(key);
  if (known !== undefined) return known;
  let w = 0.62 * px * text.length;
  const jsdom = typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent);
  if (!jsdom && typeof document !== "undefined") {
    if (ctx === undefined) {
      try {
        ctx = document.createElement("canvas").getContext("2d");
      } catch {
        ctx = null;
      }
    }
    if (ctx) {
      ctx.font = `700 ${px}px "Saira Condensed", system-ui, sans-serif`;
      w = ctx.measureText(text).width;
    }
  }
  widths.set(key, w);
  return w;
}

const LABEL_PX = 12;
/** The safety markers are never drawn smaller than this, whatever the zoom. */
export const SAFETY_MIN_PX = 28;

/* ------------------------------------------------------------------ *
 * The room's layers, drawn once per room and scale
 * ------------------------------------------------------------------ */

/** Door spans on one wall line, so the wall's path leaves them out. */
function wallPath(shape: RoomShape, doors: readonly RoomPlace[], f: Frame): string {
  const parts: string[] = [];
  for (const w of shape.walls) {
    const vertical = w.a.x === w.b.x;
    const line = vertical ? w.a.x : w.a.y;
    const lo = vertical ? Math.min(w.a.y, w.b.y) : Math.min(w.a.x, w.b.x);
    const hi = vertical ? Math.max(w.a.y, w.b.y) : Math.max(w.a.x, w.b.x);
    const gaps = doors
      .filter((d) => (d.h > d.w) === vertical && Math.abs((vertical ? d.x + d.w / 2 : d.y + d.h / 2) - line) < 2)
      .map((d) => (vertical ? [d.y, d.y + d.h] : [d.x, d.x + d.w]) as [number, number])
      .filter(([a, b]) => b > lo && a < hi)
      .sort((p, q) => p[0] - q[0]);
    let at = lo;
    const piece = (a: number, b: number) => {
      if (b - a < 1) return;
      const p = f.toPx(vertical ? { x: line, y: a } : { x: a, y: line });
      const q = f.toPx(vertical ? { x: line, y: b } : { x: b, y: line });
      parts.push(`M${p.x.toFixed(1)} ${p.y.toFixed(1)}L${q.x.toFixed(1)} ${q.y.toFixed(1)}`);
    };
    for (const [a, b] of gaps) {
      piece(at, Math.max(at, a));
      at = Math.max(at, b);
    }
    piece(at, hi);
  }
  return parts.join("");
}

/** A door's swing: a quarter circle from its hinge end, into the room. */
function doorArc(d: RoomPlace, shape: RoomShape, f: Frame): string | null {
  const vertical = d.h > d.w;
  const along = vertical ? d.h : d.w;
  if (vertical) {
    const x = d.x + d.w / 2;
    const side = inRoom({ x: x + 10, y: d.y + along / 2 }, shape) ? 1 : inRoom({ x: x - 10, y: d.y + along / 2 }, shape) ? -1 : 0;
    if (!side) return null;
    const hinge = f.toPx({ x, y: d.y });
    const end = f.toPx({ x, y: d.y + along });
    const open = f.toPx({ x: x + side * along, y: d.y });
    const r = along * f.s;
    return `M${hinge.x} ${hinge.y}L${open.x} ${open.y}A${r} ${r} 0 0 ${side > 0 ? 1 : 0} ${end.x} ${end.y}`;
  }
  const y = d.y + d.h / 2;
  const side = inRoom({ x: d.x + along / 2, y: y + 10 }, shape) ? 1 : inRoom({ x: d.x + along / 2, y: y - 10 }, shape) ? -1 : 0;
  if (!side) return null;
  const hinge = f.toPx({ x: d.x, y });
  const end = f.toPx({ x: d.x + along, y });
  const open = f.toPx({ x: d.x, y: y + side * along });
  const r = along * f.s;
  return `M${hinge.x} ${hinge.y}L${open.x} ${open.y}A${r} ${r} 0 0 ${side > 0 ? 0 : 1} ${end.x} ${end.y}`;
}

const RoomLayers = memo(function RoomLayers({
  room,
  shape,
  frame,
  grid,
  boxes,
}: {
  room: PlanRoom;
  shape: RoomShape;
  frame: Frame;
  grid: boolean;
  /** The room tool: each box's outline, so the boxes can be seen and picked. */
  boxes: boolean;
}) {
  const f = frame;
  const doors = room.places.filter((p) => p.kind === "door");
  const ft = 304.8 * f.s;
  // The grid is the floor's alone: clipped to the boxes, so a notch outside the room stays plain tray.
  const clipId = `smap-floor-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  let gridPath = "";
  if (grid && ft >= 6 && shape.boxes.length > 0) {
    const { x0, y0, x1, y1 } = shape.bbox;
    const segs: string[] = [];
    for (let x = x0; x <= x1 + 1; x += 304.8) {
      const a = f.toPx({ x, y: y0 });
      const b = f.toPx({ x, y: y1 });
      segs.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)}V${b.y.toFixed(1)}`);
    }
    for (let y = y0; y <= y1 + 1; y += 304.8) {
      const a = f.toPx({ x: x0, y });
      const b = f.toPx({ x: x1, y });
      segs.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)}H${b.x.toFixed(1)}`);
    }
    gridPath = segs.join("");
  }
  const floorRects = room.boxes.map((b) => {
    const p = f.toPx(b);
    return { id: b.id, x: p.x, y: p.y, w: b.w * f.s, h: b.h * f.s };
  });
  return (
    <g>
      {floorRects.map((r) => (
        <rect key={r.id} className="smap-floor" x={r.x} y={r.y} width={r.w} height={r.h} />
      ))}
      {gridPath && (
        <>
          <clipPath id={clipId}>
            {floorRects.map((r) => (
              <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h} />
            ))}
          </clipPath>
          <path className="smap-grid" d={gridPath} clipPath={`url(#${clipId})`} />
        </>
      )}
      <path className="smap-wall" d={wallPath(shape, doors, f)} />
      {doors.map((d) => {
        const arc = doorArc(d, shape, f);
        return arc ? <path key={d.id} className="smap-door" d={arc} /> : null;
      })}
      {room.places
        .filter((p) => p.kind !== "door" && !isSafety(p.kind))
        .map((p) => {
          const at = f.toPx(p);
          const w = p.w * f.s;
          const h = p.h * f.s;
          const name = placeName(p);
          const pillar = p.kind === "pillar";
          const fits = !pillar && h >= LABEL_PX + 4 && textWidth(name, LABEL_PX) <= w - 8;
          return (
            <g key={p.id}>
              <rect className={pillar ? "smap-place smap-place--pillar" : "smap-place"} x={at.x} y={at.y} width={w} height={h} />
              {fits && (
                <text className="smap-place__name" x={at.x + w / 2} y={at.y + h / 2} textAnchor="middle" dominantBaseline="central">
                  {name}
                </text>
              )}
            </g>
          );
        })}
      {boxes &&
        room.boxes.map((b) => {
          const p = f.toPx(b);
          return <rect key={`o-${b.id}`} className="smap-box" x={p.x} y={p.y} width={b.w * f.s} height={b.h * f.s} />;
        })}
    </g>
  );
});

/* ------------------------------------------------------------------ *
 * One machine
 * ------------------------------------------------------------------ */

interface MachineGProps {
  m: MapMachine;
  frame: Frame;
  sel: boolean;
  warn: boolean;
  markClass: string | undefined;
  aria: string;
  dim: boolean;
  focusable: boolean;
  onKey: (e: KeyboardEvent<SVGGElement>, id: string) => void;
}

const MachineG = memo(
  function MachineG({ m, frame, sel, warn, markClass, aria, dim, focusable, onKey }: MachineGProps) {
    const f = frame;
    const c = f.toPx(m.placement);
    const cls = [
      "smap-m",
      m.size ? "" : "smap-m--marker",
      m.planned ? "smap-m--planned" : "",
      sel ? "smap-m--sel" : "",
      warn ? "smap-m--over" : "",
      dim ? "smap-m--dim" : "",
      markClass ?? "",
    ]
      .filter(Boolean)
      .join(" ");
    const hitR = Math.max(22, ((m.size ? Math.min(m.size.widthMm, m.size.lengthMm) : MARKER_MM) * f.s) / 2);
    return (
      <g
        className={cls}
        transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)}) rotate(${m.placement.rotationDeg})`}
        role="button"
        aria-label={aria}
        tabIndex={focusable ? 0 : -1}
        data-id={m.id}
        onKeyDown={(e) => onKey(e, m.id)}
      >
        {m.size ? (
          <>
            <rect className="smap-m__lift" x={(-m.size.widthMm / 2) * f.s + 1} y={(-m.size.lengthMm / 2) * f.s + 1} width={m.size.widthMm * f.s} height={m.size.lengthMm * f.s} />
            <rect className="smap-m__body" x={(-m.size.widthMm / 2) * f.s} y={(-m.size.lengthMm / 2) * f.s} width={m.size.widthMm * f.s} height={m.size.lengthMm * f.s} />
            <rect className="smap-m__back" x={(-m.size.widthMm / 2) * f.s} y={(-m.size.lengthMm / 2) * f.s} width={m.size.widthMm * f.s} height={3} />
          </>
        ) : (
          <circle className="smap-m__body" r={(MARKER_MM / 2) * f.s} />
        )}
        <CleanMark m={m} frame={f} markClass={markClass} />
        <circle className="smap-m__hit" r={hitR} />
      </g>
    );
  },
  (a, b) =>
    a.m.placement === b.m.placement &&
    a.m.size === b.m.size &&
    a.m.planned === b.m.planned &&
    a.m.name === b.m.name &&
    a.frame === b.frame &&
    a.sel === b.sel &&
    a.warn === b.warn &&
    a.markClass === b.markClass &&
    a.aria === b.aria &&
    a.dim === b.dim &&
    a.focusable === b.focusable,
);

/**
 * The cleaning checklist's two looks on a machine (the studio map, phase 4):
 * a tick in the body's corner for Wiped today, a small plum dot for Used
 * since its wipe (information, never a verdict; never orange). Drawn only
 * for the classes the map's Cleaning mode gives (`markOf`); nothing for an
 * unknown state.
 */
function CleanMark({ m, frame, markClass }: { m: MapMachine; frame: Frame; markClass: string | undefined }) {
  if (!markClass) return null;
  const classes = markClass.split(" ");
  const wiped = classes.includes("smap-m--wiped");
  const used = !wiped && classes.includes("smap-m--used");
  if (!wiped && !used) return null;
  const f = frame;
  const r = wiped ? 7 : 4;
  const x = m.size ? (m.size.widthMm / 2) * f.s - r - 3 : ((MARKER_MM / 2) * f.s) * 0.7;
  const y = m.size ? (-m.size.lengthMm / 2) * f.s + r + 5 : -((MARKER_MM / 2) * f.s) * 0.7;
  if (used) return <circle className="smap-m__used" cx={x} cy={y} r={r} />;
  return (
    <g className="smap-m__wiped">
      <circle className="smap-m__tick-bg" cx={x} cy={y} r={r} />
      <path className="smap-m__tick" d={`M${x - 3.5} ${y}l2.5 2.5l4.5-5`} />
    </g>
  );
}

/** The code, unrotated, at the machine's centre, only where it fits; a machine still to buy says so under it. */
function Label({ m, frame }: { m: MapMachine; frame: Frame }) {
  const f = frame;
  const c = f.toPx(m.placement);
  const text = m.size ? m.code : "?";
  const lines = m.planned ? [...(text ? [text] : []), "To buy"] : text ? [text] : [];
  if (lines.length === 0) return null;
  let room = (MARKER_MM * f.s) - 4;
  let tall = MARKER_MM * f.s;
  if (m.size) {
    const fp = footprint(m.placement, m.size);
    const xs = fp.map((p) => p.x);
    const ys = fp.map((p) => p.y);
    room = (Math.max(...xs) - Math.min(...xs)) * f.s - 6;
    tall = (Math.max(...ys) - Math.min(...ys)) * f.s;
  }
  if (tall < LABEL_PX * lines.length + 4 || lines.some((l) => textWidth(l, LABEL_PX) > room)) return null;
  return (
    <text className="smap-m__code" x={c.x} y={c.y - ((lines.length - 1) * (LABEL_PX + 2)) / 2} textAnchor="middle" dominantBaseline="central">
      {lines.map((l, i) => (
        <tspan key={l} x={c.x} dy={i === 0 ? 0 : LABEL_PX + 2}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

/* ------------------------------------------------------------------ *
 * The safety layer and the handles
 * ------------------------------------------------------------------ */

/** The safety markers' words: 12px, as studio-map.css draws them. */
const SAFETY_LABEL_PX = 12;

interface SafetyMark {
  p: RoomPlace;
  c: PlanPoint;
  side: number;
  name: string;
  /** The words' baseline: under the marker, or over it where under would run into words already drawn. */
  labelY: number;
}

type PxRect = { x0: number; y0: number; x1: number; y1: number };
const meets = (a: PxRect, b: PxRect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Where each safety marker's words go: under it, unless they would run into
 * words already drawn or another marker, then over it. Two markers a foot
 * apart never merge their words ("Fire exAEDuisher").
 */
export function safetyMarks(places: readonly RoomPlace[], f: Frame): SafetyMark[] {
  const marks = places
    .filter((p) => isSafety(p.kind))
    .map((p) => {
      const c = f.toPx({ x: p.x + p.w / 2, y: p.y + p.h / 2 });
      const side = Math.max(SAFETY_MIN_PX, p.w * f.s);
      return { p, c, side, name: placeName(p) };
    });
  const boxes: PxRect[] = marks.map((m) => ({ x0: m.c.x - m.side / 2, y0: m.c.y - m.side / 2, x1: m.c.x + m.side / 2, y1: m.c.y + m.side / 2 }));
  const drawn: PxRect[] = [];
  return marks.map((m, i) => {
    const half = textWidth(m.name, SAFETY_LABEL_PX) / 2 + 2;
    const at = (baseline: number): PxRect => ({ x0: m.c.x - half, y0: baseline - SAFETY_LABEL_PX, x1: m.c.x + half, y1: baseline + 3 });
    const under = m.c.y + m.side / 2 + 14;
    const over = m.c.y - m.side / 2 - 6;
    const clear = (r: PxRect) => !drawn.some((d) => meets(r, d)) && !boxes.some((b, j) => j !== i && meets(r, b));
    const labelY = clear(at(under)) || !clear(at(over)) ? under : over;
    drawn.push(at(labelY));
    return { ...m, labelY };
  });
}

function Safety({ m }: { m: SafetyMark }) {
  const { p, c, side, name, labelY } = m;
  const Glyph = p.kind === "aed" ? HeartPulse : FireExtinguisher;
  const g = side * 0.64;
  return (
    <g className="smap-safety" role="img" aria-label={name}>
      <rect className="smap-safety__box" x={c.x - side / 2} y={c.y - side / 2} width={side} height={side} rx={4} />
      <Glyph className="smap-safety__glyph" x={c.x - g / 2} y={c.y - g / 2} width={g} height={g} aria-hidden="true" />
      <text className="smap-safety__name" x={c.x} y={labelY} textAnchor="middle">
        {name}
      </text>
    </g>
  );
}

function Handles({ sel, frame }: { sel: NonNullable<RoomInteraction["selected"]>; frame: Frame }) {
  const f = frame;
  const handles = handlesFor({ ...sel.rect, kind: sel.kind }, f.mmPerPx);
  const r = f.toPx(sel.rect);
  return (
    <g>
      <rect className="smap-sel-edge" x={r.x} y={r.y} width={sel.rect.w * f.s} height={sel.rect.h * f.s} />
      {handles.map((h) => {
        const c = f.toPx(h.at);
        const across = h.edge === "left" || h.edge === "right";
        const [w, ht] = h.edge === "corner" ? [20, 20] : across ? [12, 28] : [28, 12];
        return (
          <g key={h.edge} data-edge={h.edge}>
            <rect className="smap-handle smap-handle--hit" x={c.x - 22} y={c.y - 22} width={44} height={44} />
            <rect className="smap-handle" x={c.x - w / 2} y={c.y - ht / 2} width={w} height={ht} rx={3} />
          </g>
        );
      })}
    </g>
  );
}

/* ------------------------------------------------------------------ */

function StudioRoomImpl({
  ariaLabel,
  room,
  shape: given,
  bounds: givenBounds,
  machines,
  widthPx,
  heightPx = 0,
  zoom = 1,
  selectedId = null,
  warnIds,
  markOf,
  dimIds,
  ariaOf,
  onPick,
  interaction,
}: StudioRoomProps) {
  const shape = useMemo(() => given ?? roomShape(room.boxes), [given, room.boxes]);
  const bounds = useMemo(() => givenBounds ?? roomBounds(room, shape), [givenBounds, room, shape]);
  const frame = useMemo(() => frameOf(bounds, widthPx, zoom, heightPx), [bounds, widthPx, zoom, heightPx]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);
  const tool = interaction?.tool ?? null;

  // A browser decides whether a touch pans when it starts, before any
  // handler runs: CSS sets touch-action up front, and this non-passive
  // listener is the fallback for WebKit on SVG.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !tool || tool === "view") return;
    const stop = (e: TouchEvent) => {
      const t = e.target as Element | null;
      if (!t || typeof t.closest !== "function") return;
      if (tool === "machines" ? t.closest(".smap-m") : t.closest(".smap--sel, .smap-handle")) e.preventDefault();
    };
    svg.addEventListener("touchstart", stop, { passive: false });
    return () => svg.removeEventListener("touchstart", stop);
  }, [tool]);

  const targets = useMemo<TapTarget[]>(
    () =>
      machines.map((m) => ({
        id: m.id,
        footprint: m.size ? footprint(m.placement, m.size) : null,
        centre: { x: m.placement.x, y: m.placement.y },
      })),
    [machines],
  );

  const mmOf = (e: ReactPointerEvent<SVGSVGElement>): { mm: PlanPoint; px: PlanPoint } => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = { x: e.clientX - r.left, y: e.clientY - r.top };
    return { mm: frame.toMm(px), px };
  };

  const onKey = (e: KeyboardEvent<SVGGElement>, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onPick(id);
    }
  };

  const safety = useMemo(() => safetyMarks(room.places, frame), [room.places, frame]);

  return (
    <svg
      ref={svgRef}
      className="smap-svg"
      role="group"
      aria-label={ariaLabel}
      width={frame.widthPx}
      height={frame.heightPx}
      viewBox={`0 0 ${frame.widthPx} ${frame.heightPx}`}
      onPointerDown={(e) => {
        const { mm, px } = mmOf(e);
        down.current = px;
        interaction?.onPointerDown(e, mm, frame);
      }}
      onPointerMove={(e) => {
        if (!interaction) return;
        interaction.onPointerMove(e, mmOf(e).mm, frame);
      }}
      onPointerUp={(e) => {
        const { mm, px } = mmOf(e);
        if (interaction) {
          interaction.onPointerUp(e, mm, frame);
        } else if (down.current && Math.hypot(px.x - down.current.x, px.y - down.current.y) < DEAD_PX) {
          const id = pickAt(mm, targets, 22 * frame.mmPerPx);
          if (id) onPick(id);
        }
        down.current = null;
      }}
      onPointerCancel={() => {
        down.current = null;
        interaction?.onPointerCancel();
      }}
    >
      <RoomLayers room={room} shape={shape} frame={frame} grid={!!interaction} boxes={tool === "room"} />
      <g>
        {machines.map((m) => {
          const mark = markOf?.(m.id) ?? null;
          const extra = ariaOf?.(m.id);
          const aria = [
            m.name,
            m.size ? sizeLine(m.size) : "size not known",
            ...(m.planned ? ["to buy"] : []),
            ...(mark?.aria ? [mark.aria] : []),
            ...(extra ? [extra] : []),
          ].join(", ");
          return (
            <MachineG
              key={m.id}
              m={m}
              frame={frame}
              sel={selectedId === m.id}
              warn={!!warnIds?.has(m.id)}
              markClass={mark?.className}
              aria={aria}
              dim={!!dimIds?.has(m.id)}
              focusable={!!interaction}
              onKey={onKey}
            />
          );
        })}
      </g>
      <g className="smap-labels" aria-hidden="true">
        {machines.map((m) => (
          <Label key={m.id} m={m} frame={frame} />
        ))}
      </g>
      <g className="smap-safety-layer">
        {safety.map((m) => (
          <Safety key={m.p.id} m={m} />
        ))}
      </g>
      {interaction?.tool === "room" && interaction.selected && (
        <g className="smap--sel" data-id={interaction.selected.id}>
          <Handles sel={interaction.selected} frame={frame} />
        </g>
      )}
    </svg>
  );
}

export const StudioRoom = memo(StudioRoomImpl);
export default StudioRoom;
