import { useState } from "react";
import { AdminButton, AdminInput } from "../../admin/primitives";
import { formOf, isSafety, PLACE_WORDS, placeName, type RoomBox, type RoomPlace } from "../layout";
import type { NudgeDir } from "../placement";
import { doorAlong } from "../room";
import { ftIn, mmFromFtIn, parseFtIn, sizeLine } from "../units";
import type { KnownSize } from "../../../types/machines";
import type { SwapCandidate } from "../planned";
import { MovePad } from "./MovePad";
import "../../admin/admin.css";
import "../studio-map.css";

export type PanelItem =
  | {
      kind: "machine";
      id: string;
      name: string;
      code: string;
      size: KnownSize | null;
      /** Where its size came from, or why it has none. */
      source: string;
      /** Its overlap lines, the only place they are written. */
      lines: readonly string[];
    }
  | {
      /** A machine still to buy, on a remodel plan. */
      kind: "planned";
      id: string;
      label: string;
      size: KnownSize | null;
      source: string;
      lines: readonly string[];
      /** Bought it? The floor's machines not placed yet, the same movement first. */
      swap: { same: readonly SwapCandidate[]; other: readonly SwapCandidate[] };
    }
  | { kind: "box"; box: RoomBox; index: number; canRemove: boolean }
  | { kind: "place"; place: RoomPlace };

export interface PanelActions {
  movable: boolean;
  onTurn: (by: 90 | -90 | 15 | -15) => void;
  onToWall: () => void;
  onTakeOff: () => void;
  onNudge: (dir: NudgeDir) => void;
  onTypedBox: (id: string, wMm: number, hMm: number) => void;
  onRemoveBox: (id: string) => void;
  onLabel: (id: string, text: string) => void;
  onTypedPlace: (id: string, wMm: number, hMm: number) => void;
  onRemovePlace: (id: string) => void;
  /** Bought it? The machine still to buy becomes this floor machine, at its spot and turn. */
  onSwapIn: (plannedId: string, machineId: string) => void;
}

const feetOf = (mm: number) => String(Math.round(mm / 304.8));

/** A length typed as feet and inches, from the two boxes; null when they don't read. */
function lengthOf(ft: string, inch: string): number | null {
  const r = parseFtIn(ft, inch);
  return "mm" in r ? r.mm : null;
}

function FtInField({ id, label, value, onChange }: { id: string; label: string; value: { ft: string; in: string }; onChange: (v: { ft: string; in: string }) => void }) {
  return (
    <div className="smap-item__row">
      <label className="smap-row-label" htmlFor={`${id}-ft`}>
        {label}
      </label>
      <AdminInput id={`${id}-ft`} className="smap-num" inputMode="numeric" aria-label={`${label}, feet`} value={value.ft} onChange={(e) => onChange({ ...value, ft: e.target.value })} />
      <span className="smap-quiet">ft</span>
      <AdminInput id={`${id}-in`} className="smap-num" inputMode="decimal" aria-label={`${label}, inches`} value={value.in} onChange={(e) => onChange({ ...value, in: e.target.value })} />
      <span className="smap-quiet">in</span>
    </div>
  );
}

const ftInOf = (mm: number) => {
  const v = ftIn(mm);
  return { ft: String(v.ft), in: String(v.in) };
};

function BoxPanel({ item, a }: { item: Extract<PanelItem, { kind: "box" }>; a: PanelActions }) {
  const { box } = item;
  const [w, setW] = useState(feetOf(box.w));
  const [h, setH] = useState(feetOf(box.h));
  const apply = () => {
    const wf = Number(w);
    const hf = Number(h);
    if (!Number.isFinite(wf) || !Number.isFinite(hf) || wf <= 0 || hf <= 0) return;
    a.onTypedBox(box.id, mmFromFtIn(Math.round(wf), 0), mmFromFtIn(Math.round(hf), 0));
  };
  return (
    <section className="smap-item" aria-label={`Box ${item.index}`}>
      <p className="smap-item__name">
        Box {item.index} · {feetOf(box.w)} ft × {feetOf(box.h)} ft
      </p>
      <div className="smap-item__row">
        <label className="smap-row-label" htmlFor={`smap-box-w-${box.id}`}>
          Width
        </label>
        <AdminInput id={`smap-box-w-${box.id}`} className="smap-num" inputMode="numeric" value={w} onChange={(e) => setW(e.target.value)} />
        <span className="smap-quiet">ft ×</span>
        <label className="smap-row-label" htmlFor={`smap-box-h-${box.id}`}>
          Length
        </label>
        <AdminInput id={`smap-box-h-${box.id}`} className="smap-num" inputMode="numeric" value={h} onChange={(e) => setH(e.target.value)} />
        <span className="smap-quiet">ft</span>
        <AdminButton onClick={apply}>Set the size</AdminButton>
      </div>
      {item.canRemove && (
        <div className="smap-item__row">
          <AdminButton variant="ghost" onClick={() => a.onRemoveBox(box.id)}>
            Remove box
          </AdminButton>
        </div>
      )}
    </section>
  );
}

function PlacePanel({ item, a }: { item: Extract<PanelItem, { kind: "place" }>; a: PanelActions }) {
  const { place } = item;
  const [label, setLabel] = useState(place.label ?? "");
  const form = formOf(place.kind);
  const door = place.kind === "door";
  const [w, setW] = useState(ftInOf(door ? doorAlong(place) : place.w));
  const [h, setH] = useState(ftInOf(place.h));
  const apply = () => {
    const wm = lengthOf(w.ft, w.in);
    const hm = door ? 0 : lengthOf(h.ft, h.in);
    if (wm === null || hm === null) return;
    a.onTypedPlace(place.id, wm, hm);
  };
  return (
    <section className="smap-item" aria-label={placeName(place)}>
      <p className="smap-item__name">{placeName(place)}</p>
      {placeName(place) !== PLACE_WORDS[place.kind] && <p className="smap-item__meta">{PLACE_WORDS[place.kind]}</p>}
      <div className="smap-item__row">
        <label className="smap-row-label" htmlFor={`smap-place-name-${place.id}`}>
          Name
        </label>
        <AdminInput
          id={`smap-place-name-${place.id}`}
          maxLength={40}
          placeholder={PLACE_WORDS[place.kind]}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => a.onLabel(place.id, label)}
          onKeyDown={(e) => {
            if (e.key === "Enter") a.onLabel(place.id, label);
          }}
        />
      </div>
      {!isSafety(place.kind) && (
        <>
          {door ? (
            <FtInField id={`smap-place-w-${place.id}`} label="Width along the wall" value={w} onChange={setW} />
          ) : (
            <>
              <FtInField id={`smap-place-w-${place.id}`} label="Width" value={w} onChange={setW} />
              <FtInField id={`smap-place-h-${place.id}`} label="Length" value={h} onChange={setH} />
            </>
          )}
          <div className="smap-item__row">
            <AdminButton onClick={apply}>Set the size</AdminButton>
          </div>
        </>
      )}
      {form === "marker" && isSafety(place.kind) && <p className="smap-item__meta">Shown on every door's map, so a trainer can find it.</p>}
      <div className="smap-item__row">
        <AdminButton variant="ghost" onClick={() => a.onRemovePlace(place.id)}>
          Remove
        </AdminButton>
      </div>
    </section>
  );
}

/**
 * A MACHINE STILL TO BUY (the studio map, Oct 2026): its name (the leader's
 * own words, 1 to 60), where its size came from, what it overlaps, its moves,
 * and "Bought it? Swap in the real one" (Oct 11 reviews, A23): once the
 * machine is on the floor list, the machines not placed yet are offered, the
 * same movement first, and a pick puts that machine at the same spot and
 * turn. Remove takes it off the plan; Undo brings it back.
 */
function PlannedPanel({ item, a }: { item: Extract<PanelItem, { kind: "planned" }>; a: PanelActions }) {
  const [label, setLabel] = useState(item.label);
  const [swapping, setSwapping] = useState(false);
  const all = [...item.swap.same, ...item.swap.other];
  const chip = (u: SwapCandidate) => (
    <button key={u.machineId} type="button" className="smap-chip" onClick={() => a.onSwapIn(item.id, u.machineId)}>
      <span className="smap-chip__name">{u.name}</span>
    </button>
  );
  return (
    <section className="smap-item" aria-label={`${item.label}, still to buy`}>
      <p className="smap-item__name">{item.label}</p>
      <p className="smap-item__meta">Still to buy</p>
      {item.size && <p className="smap-item__meta">{sizeLine(item.size)}</p>}
      <p className="smap-item__meta">{item.source}</p>
      {item.lines.map((l) => (
        <p key={l} className="smap-item__line">
          {l}
        </p>
      ))}
      <div className="smap-item__row">
        <label className="smap-row-label" htmlFor={`smap-planned-name-${item.id}`}>
          Name
        </label>
        <AdminInput
          id={`smap-planned-name-${item.id}`}
          maxLength={60}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => a.onLabel(item.id, label)}
          onKeyDown={(e) => {
            if (e.key === "Enter") a.onLabel(item.id, label);
          }}
        />
      </div>
      {a.movable && <MovePad marker={!item.size} onTurn={a.onTurn} onToWall={a.onToWall} onNudge={a.onNudge} />}
      <div className="smap-item__row">
        <AdminButton aria-expanded={swapping} onClick={() => setSwapping((s) => !s)}>
          Bought it? Swap in the real one
        </AdminButton>
        <AdminButton variant="ghost" onClick={a.onTakeOff}>
          Remove
        </AdminButton>
      </div>
      {swapping &&
        (all.length === 0 ? (
          <p className="smap-item__meta">Add it to the floor list first, then swap it in here.</p>
        ) : (
          <div className="smap-editor" role="group" aria-label="Which machine on the floor list it is">
            {item.swap.same.length > 0 && <div className="smap-chips">{item.swap.same.map(chip)}</div>}
            {item.swap.other.length > 0 && (
              <>
                {item.swap.same.length > 0 && <p className="smap-item__meta">Other machines not placed yet</p>}
                <div className="smap-chips">{item.swap.other.map(chip)}</div>
              </>
            )}
          </div>
        ))}
    </section>
  );
}

/**
 * THE SELECTED THING (the studio map, Oct 2026): a machine (its name, its
 * size and where that came from, what it overlaps, and its moves), a box of
 * the room (its size typed, the way that never needs a drag), or a place
 * (its name and its size). Keyed by the item by the host, so typing never
 * carries from one thing to the next.
 */
export function ItemPanel({ item, actions }: { item: PanelItem; actions: PanelActions }) {
  if (item.kind === "box") return <BoxPanel item={item} a={actions} />;
  if (item.kind === "place") return <PlacePanel item={item} a={actions} />;
  if (item.kind === "planned") return <PlannedPanel item={item} a={actions} />;
  return (
    <section className="smap-item" aria-label={item.name}>
      <p className="smap-item__name">{item.name}</p>
      {item.code && <p className="smap-item__meta">{item.code}</p>}
      {item.size && <p className="smap-item__meta">{sizeLine(item.size)}</p>}
      <p className="smap-item__meta">{item.source}</p>
      {item.lines.map((l) => (
        <p key={l} className="smap-item__line">
          {l}
        </p>
      ))}
      {actions.movable && (
        <MovePad marker={!item.size} onTurn={actions.onTurn} onToWall={actions.onToWall} onTakeOff={actions.onTakeOff} onNudge={actions.onNudge} />
      )}
    </section>
  );
}
