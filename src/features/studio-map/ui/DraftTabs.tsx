import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useToast } from "../../../contexts/ToastContext";
import { AdminButton, AdminInput, ConfirmDialog } from "../../admin/primitives";
import { useUnsavedChanges } from "../../unsaved-changes";
import { CURRENT_ID, DRAFT_SLOTS, draftNames, isPlanned, PLAN_LIMITS, type DraftSlot, type LoadedPlan, type Placement, type PlanRoom, type UndoRecord } from "../layout";
import {
  planUseThisLayout,
  renameDraft,
  restoreDraft,
  retireDraft,
  undoUseThisLayout,
  useThisLayout as sendMakeTheMap,
} from "../store";
import "../../admin/admin.css";
import "../studio-map.css";

/** What a tab will hold the moment it is shown: the content and the rev the write gave it. */
export interface ShownContent {
  room: PlanRoom;
  placements: Placement[];
  rev: number;
}

export interface DraftTabsProps {
  studioId: string;
  /** The editor's read of the collection: the map, the live drafts, every slot (retired ones too). */
  current: LoadedPlan | null;
  drafts: readonly LoadedPlan[];
  slots: readonly LoadedPlan[];
  /** The tab open: "current" (the map) or a draft's slot. */
  open: string;
  /** What is on the open tab is unsaved work. */
  dirty: boolean;
  authUid: string | null;
  /** Another tab (the editor asks about unsaved work first). */
  onOpen: (id: string) => void;
  /** Plan a remodel: the editor copies what is on screen into a free slot. */
  onPlan: () => void;
  /** After Make this the map, its Undo, or Delete plan: show this tab now, holding this (null: as the listener has it). */
  onShow: (id: string, content: ShownContent | null) => void;
  /**
   * A plan renamed: its stored copy moved from rev `from` to rev `to` (or back, when the rename was refused). An
   * unsaved copy on screen moves with it only when it was based on `from`: a copy based on an older rev still holds
   * work against that rev, and moving it would let Save overwrite the newer save it never saw.
   */
  onRenamed: (id: string, from: number, to: number) => void;
  /** The editor's own question about unsaved work, before Delete plan, or an Undo that changes the tab, throws it away. */
  guard: (proceed: () => void) => void;
}

/**
 * THE MAP AND ITS REMODEL PLANS (the studio map, Oct 2026): the editor's
 * tabs. "The map" is the layout every door draws; each remodel plan is a
 * draft in one of five slots, where a leader may also place machines the
 * studio doesn't own yet (AJ, Oct 11 2026, Q2: "AJ agrees"). The words are
 * AJ's own ("map", "plan out remodels"; design §G question 2, its built
 * default): The map · Remodel 1 · Plan a remodel · Make this the map.
 *
 * Make this the map is one batch, every write checked against the rev it
 * read, and its Undo is ready the moment it is tapped (worked out before
 * anything is sent). A plan holding machines still to buy keeps them: only
 * the floor's own machines become the map, and the old map is kept as a
 * plan in a free slot ("Before Oct 12, 3:40 PM") when one is free. Delete
 * plan gives the slot back, its content kept, and Undo brings it back. An
 * Undo that changes the tab asks about unsaved work first, like any other
 * way of changing it. Nothing here waits for the server: each write is
 * issued and the screen moves on, and a refusal comes back as a toast.
 */
export function DraftTabs(props: DraftTabsProps) {
  const { studioId, current, drafts, slots, open, dirty, authUid, onOpen, onPlan, onShow, onRenamed, guard } = props;
  const { toast, error: toastError } = useToast();
  // The newest of everything, for an Undo tapped seconds later.
  const latest = useRef(props);
  latest.current = props;

  const tabs = [...drafts].sort((a, b) => DRAFT_SLOTS.indexOf(a.id as never) - DRAFT_SLOTS.indexOf(b.id as never));
  const draft = open === CURRENT_ID ? null : (drafts.find((d) => d.id === open) ?? null);
  const plannedCount = draft ? draft.placements.filter(isPlanned).length : 0;

  /* ── Make this the map ─────────────────────────────────────────── */
  const [asking, setAsking] = useState(false);
  const preview = asking && draft ? planUseThisLayout(current, draft, slots, Date.now()) : null;

  // Asked first: the Undo shows the map, which would throw away work typed on whatever tab is open since.
  const undoMake = (record: UndoRecord, uid: string) => () =>
    latest.current.guard(() => {
      const p = latest.current;
      const revOf = (id: string) => p.slots.find((s) => s.id === id)?.rev ?? 0;
      const revsNow = {
        current: p.current?.rev ?? 0,
        slot: revOf(record.draftId),
        before: record.beforeSlot ? (p.slots.find((s) => s.id === record.beforeSlot!.id)?.rev ?? null) : null,
      };
      const sent = undoUseThisLayout(studioId, record, revsNow, uid);
      if (!sent || !record.before.current) {
        toastError("The map has changed since, so Undo can't put the old one back.");
        return;
      }
      sent.catch((e: unknown) => {
        console.error("[studio map] the old map wasn't put back", e);
        toastError("The old map wasn't put back. The map is as it was made.");
      });
      p.onShow(CURRENT_ID, { ...record.before.current, rev: record.currentRev + 1 });
    });

  const make = () => {
    setAsking(false);
    if (!draft) return;
    if (!authUid) {
      toastError("Sign in again to make this the map.");
      return;
    }
    const nowMs = Date.now();
    const { record } = planUseThisLayout(current, draft, slots, nowMs);
    const name = draft.name;
    void sendMakeTheMap(studioId, current, draft, slots, authUid, nowMs).then((out) => {
      if (!("why" in out)) return;
      if (out.why === "invalid") toastError(out.problem);
      else if (out.why === "changed") toastError(`Someone changed the map or ${name} just now, so ${name} wasn't made the map. Nothing changed.`);
      else if (out.why === "unchecked") toastError(`${name} wasn't made the map, and Journey couldn't check why. Nothing changed.`);
      else toastError(`${name} wasn't made the map. Only a studio leader arranges the floor.`);
    });
    onShow(CURRENT_ID, { room: draft.room, placements: draft.placements.filter((p) => !isPlanned(p)), rev: record.currentRev });
    toast(`${name} is the map.`, "success", 10000, record.before.current ? { label: "Undo", run: undoMake(record, authUid) } : undefined);
  };

  const askMake = () => {
    if (!draft) return;
    if (dirty) {
      toastError("Save this plan first, then make it the map.");
      return;
    }
    setAsking(true);
  };

  /* ── More: Rename, Delete plan ─────────────────────────────────── */
  const [more, setMore] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const renameDirty = renaming !== null && !!draft && renaming.trim() !== draft.name;
  useUnsavedChanges(renameDirty, "the plan's name", { onDiscard: () => setRenaming(null) });
  const [nameProblem, setNameProblem] = useState<string | null>(null);

  const rename = () => {
    if (!draft || renaming === null) return;
    const name = renaming.replace(/\s+/g, " ").trim();
    if (!name || name.length > PLAN_LIMITS.name) {
      setNameProblem(`A plan's name is 1 to ${PLAN_LIMITS.name} characters.`);
      return;
    }
    setRenaming(null);
    setMore(false);
    if (name === draft.name) return;
    if (!authUid) {
      toastError("Sign in again to rename the plan.");
      return;
    }
    const before = draft;
    const from = before.rev;
    const to = from + 1;
    void renameDraft(studioId, before, name, authUid).then((out) => {
      if (out.ok) return;
      latest.current.onRenamed(before.id, to, from);
      toastError(`${before.name} wasn't renamed.`);
    });
    onRenamed(before.id, from, to);
  };

  const remove = () => {
    if (!draft) return;
    guard(() => {
      setMore(false);
      if (!authUid) {
        toastError("Sign in again to delete the plan.");
        return;
      }
      const gone = draft;
      const retired: LoadedPlan = { ...gone, rev: gone.rev + 1, retired: true };
      const uid = authUid;
      void retireDraft(studioId, gone, uid).then((out) => {
        if (!out.ok) toastError(`${gone.name} wasn't deleted.`);
      });
      onShow(CURRENT_ID, null);
      toast(`${gone.name} deleted.`, "success", 10000, {
        label: "Undo",
        // Asked first: the Undo opens the plan again, which would throw away work typed on the tab open since.
        run: () =>
          latest.current.guard(() => {
            void restoreDraft(studioId, retired, uid).then((out) => {
              if (!out.ok) toastError(`${gone.name} wasn't brought back.`);
            });
            latest.current.onShow(gone.id, { room: gone.room, placements: gone.placements, rev: retired.rev + 1 });
          }),
      });
    });
  };

  const tabButton = (id: string, name: string, toBuy: number) => (
    <button
      key={id}
      type="button"
      role="tab"
      className="smap-tabs__btn"
      aria-selected={open === id}
      onClick={() => {
        if (id !== open) onOpen(id);
      }}
    >
      <span className="smap-tabs__name">{name}</span>
      {toBuy > 0 && <span className="smap-tabs__meta">{toBuy} to buy</span>}
    </button>
  );

  return (
    <div className="smap-tabs-wrap">
      <div className="smap-tabs" role="tablist" aria-label="The map and its remodel plans">
        {tabButton(CURRENT_ID, "The map", 0)}
        {tabs.map((d) => tabButton(d.id, d.name, d.placements.filter(isPlanned).length))}
        {/* A plan just started, before the listener has brought it back. */}
        {open !== CURRENT_ID && !draft && (DRAFT_SLOTS as readonly string[]).includes(open) && tabButton(open, draftNames.draft(open as DraftSlot), 0)}
        <button type="button" className="smap-tabs__btn smap-tabs__btn--add" onClick={onPlan}>
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span className="smap-tabs__name">Plan a remodel</span>
        </button>
      </div>

      {draft && (
        <div className="smap-bar" role="group" aria-label={`${draft.name}'s actions`}>
          <AdminButton variant="primary" onClick={askMake}>
            Make this the map
          </AdminButton>
          <AdminButton variant="ghost" aria-expanded={more} onClick={() => setMore((m) => !m)}>
            More
          </AdminButton>
          {more && renaming === null && (
            <>
              <AdminButton
                onClick={() => {
                  setNameProblem(null);
                  setRenaming(draft.name);
                }}
              >
                Rename
              </AdminButton>
              <AdminButton variant="ghost" onClick={remove}>
                Delete plan
              </AdminButton>
            </>
          )}
        </div>
      )}

      {draft && renaming !== null && (
        <div className="smap-start__row">
          <label className="smap-row-label" htmlFor="smap-plan-name">
            Name
          </label>
          <AdminInput
            id="smap-plan-name"
            maxLength={PLAN_LIMITS.name}
            value={renaming}
            invalid={!!nameProblem}
            onChange={(e) => {
              setRenaming(e.target.value);
              setNameProblem(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") rename();
            }}
          />
          <AdminButton variant="primary" onClick={rename}>
            Save
          </AdminButton>
          <AdminButton variant="ghost" onClick={() => setRenaming(null)}>
            Cancel
          </AdminButton>
          {nameProblem && <p className="smap-form__problem">{nameProblem}</p>}
        </div>
      )}

      <ConfirmDialog
        open={asking && !!draft}
        title={draft ? `Make ${draft.name} the map?` : "Make this the map?"}
        body={draft && preview ? makeWords(draft, plannedCount, !!current, preview.free !== null, Date.now()) : undefined}
        confirmLabel="Make this the map"
        cancelLabel="Not yet"
        onConfirm={make}
        onCancel={() => setAsking(false)}
      />
    </div>
  );
}

/** The confirm's words: what stays on the plan, what becomes the map, and where the old map goes. */
export function makeWords(draft: Pick<LoadedPlan, "name">, plannedCount: number, hasMap: boolean, slotFree: boolean, nowMs: number): string {
  const before = draftNames.before(nowMs);
  if (plannedCount === 0) {
    return hasMap
      ? `The map you have now is kept as a plan, “${before}”, and Undo on the next message brings it back.`
      : `${draft.name} becomes the map every door draws.`;
  }
  const stay = plannedCount === 1 ? "1 machine still to buy stays on this plan." : `${plannedCount} machines still to buy stay on this plan.`;
  const old = !hasMap
    ? ""
    : slotFree
      ? ` The map you have now is kept as a plan, “${before}”.`
      : " The old map won't be kept as a plan. Undo on the next message brings it back.";
  return `${stay} Everything else becomes the map.${old}`;
}
