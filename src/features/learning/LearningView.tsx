import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Dumbbell, GraduationCap, LayoutGrid } from "lucide-react";
import type { Machine, Trainer } from "../../types";
import { useActiveStudio } from "../../contexts/ActiveStudioContext";
import { auth } from "../../firebase";
import { CommentsProvider, mentionablePeople, type CommentsContextValue } from "../comments";
import { useLeaveGuard } from "../unsaved-changes";
import { WikiSectionsProvider, type WikiSectionsValue } from "../wiki";
import { CatalogView } from "../catalog";
import {
  AcademyWikiView,
  type AcademyGroupKey,
  type AcademyJump,
} from "../academy/AcademyWikiView";
import type { CatalogScope } from "../machine-db/ScopeSwitch";
import { LearningHome } from "./LearningHome";
import { LearningSearch } from "./LearningSearch";
import { canWriteStudioPages } from "./permissions";
import type { LearningRef } from "./ref";
import type { LearningDesign } from "../learning-vault/types";
import { DesignSwitcher } from "../learning-redesign/DesignSwitcher";
import { LearningRedesign } from "../learning-redesign/LearningRedesign";
import { naturalViewAs, rememberDesign, rememberedDesign, type ViewAs } from "../learning-redesign/design";
import "./learning.css";

/**
 * LEARNING — the tab, as one screen with three sections.
 *
 * Round: Learning + Planner, Sep 2026. Replaces the block in AppContent that
 * wired the Catalog and the Academy together.
 *
 *   Overview  ("learning")         the front page — LearningHome
 *   Catalog   ("machine-anatomy")  this studio's machines — CatalogWikiView
 *   Academy   ("academy")          the MSF method — AcademyWikiView
 *
 * The view ids are the app's, unchanged: stored notifications and the
 * settings shortcut already point at "machine-anatomy", and they keep working.
 *
 * WHAT THIS OWNS
 * --------------
 *   - the masthead (via the sections context WikiShell reads),
 *   - the one search, which hides the page rather than unmounting it,
 *   - every way into a page from outside: a Learning ref from the bell, a
 *     note or an announcement arrives as `jump`, and a tap on the front page
 *     or in search goes through the same openRef.
 * Each section still owns its own route inside itself — the reason recorded
 * in CatalogWikiView's header still holds: one back button, one meaning.
 *
 * EVERY DOOR ASKS FIRST (voice review follow-up review, Sep 27 2026)
 * ------------------------------------------------------------------
 * A pick in search, a tile on the Overview or a machine chip on an Academy
 * page REPLACES the page, often inside the same section, where the view does
 * not change and the app's guarded screen setter has nothing to ask about. So
 * each of these doors asks the unsaved-changes gate itself (`through`), and
 * sets its jump only INSIDE the answer: set first and then refused, a jump
 * would sit here and fire the next time its section opened. "Leave" puts the
 * studio cards back and closes an open editor before the page moves, so a
 * draft written for one machine can never be saved onto the next. A jump from
 * OUTSIDE the tab (`jump`) does not ask again: AppContent's openLearning asked
 * before it set it.
 *
 * THE PROTOTYPE BAR (the Learning vault redesign, Oct 19 2026, this branch)
 * -------------------------------------------------------------------------
 * A strip above the masthead picks one of three prototype designs, or today's
 * Learning ("Current", the default, so nothing changes for anyone who never
 * taps it). With a prototype on, LearningRedesign is drawn in place of the
 * three sections, inside the same comments and masthead, and every door
 * above that would open a page here (search, a jump from outside) hands the
 * design that page as its `jump` instead. Picking a design or "View as" asks
 * the gate first and changes only inside the answer, like every door. The
 * Learning title on the Overview, or the section already on, asks too and
 * then sends the design `resetSignal` + 1: back to that section's front page
 * (today's Learning has nothing to do there, so it is unchanged).
 */

export type LearningViewId = "learning" | "machine-anatomy" | "academy";

export interface LearningViewProps {
  view: LearningViewId;
  onViewChange: (view: LearningViewId) => void;
  /** The global machine list. The Catalog uses it until a roster exists. */
  machines: Machine[];
  authTrainer: Trainer | null;
  /** Everyone's trainer profile — the people a comment can tag are picked from these. */
  trainers?: Trainer[];
  /** A page to open, from outside the tab. Cleared once honoured. */
  jump: LearningRef | null;
  onJumpHandled: () => void;
  /**
   * The Catalog's door to the floor editor, My Studio → Machines (Catalog
   * R5's door, Sep 29 2026). AppContent remembers the section and opens My
   * Studio; here it goes through the leave question first, like every other
   * way out of a page. Absent: the Catalog draws no door. `"arrange"` (the
   * studio map, Oct 2026): the Catalog's Draw the floor, straight into
   * Arrange the floor.
   */
  onOpenFloorEditor?: (view?: "map" | "list" | "arrange") => void;
  /**
   * The prototype the tab opens on (the redesign's harness). Absent: the one
   * last picked on this iPad, else today's Learning.
   */
  initialDesign?: LearningDesign;
  /** Who a prototype reads as at first (the harness). Absent: the real viewer. */
  initialViewAs?: ViewAs | null;
}

export function LearningView({
  view,
  onViewChange,
  machines,
  authTrainer,
  trainers,
  jump,
  onJumpHandled,
  onOpenFloorEditor,
  initialDesign,
  initialViewAs = null,
}: LearningViewProps) {
  const { activeStudioId, activeStudio, isAdmin } = useActiveStudio();

  const [catalogJump, setCatalogJump] = useState<string | null>(null);
  const [catalogGroup, setCatalogGroup] = useState<string | null>(null);
  const [catalogScope, setCatalogScope] = useState<CatalogScope | null>(null);
  const [academyJump, setAcademyJump] = useState<AcademyJump | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  /* The prototype bar: which Learning, as whom, and the page a prototype is
     asked to open (its own `jump`, cleared once it has opened it). */
  const [design, setDesign] = useState<LearningDesign>(() => initialDesign ?? rememberedDesign() ?? "current");
  const [viewAs, setViewAs] = useState<ViewAs | null>(initialViewAs);
  const [designJump, setDesignJump] = useState<LearningRef | null>(null);
  const clearDesignJump = useCallback(() => setDesignJump(null), []);
  /* A prototype asked back to its section's front page while already in the
     section (the title on the Overview, or the section already on): it goes
     up by one inside the leave gate's answer (DesignProps.resetSignal). */
  const [designReset, setDesignReset] = useState(0);

  const canWritePages = canWriteStudioPages(authTrainer, activeStudioId);

  /* Comments (Learning + Planner round): this studio's thread on every page,
     and the people here who can be tagged. The Auth uid, never the trainer
     document's id — the rules pin a comment's author to it. */
  const uid = auth.currentUser?.uid ?? null;
  const comments = useMemo<CommentsContextValue>(
    () => ({
      studioId: activeStudioId,
      studioName: activeStudio?.name ?? "this studio",
      author: uid ? { id: uid, name: authTrainer?.fullName ?? "" } : null,
      // Neither of the author's ids: an older account's profile id differs.
      people: mentionablePeople(trainers ?? [], activeStudioId, [uid, authTrainer?.id]),
      // firestore.rules: a comment comes down by its author, a leader, or an admin.
      isLeaderHere: canWritePages,
    }),
    [activeStudioId, activeStudio?.name, uid, authTrainer?.id, authTrainer?.fullName, trainers, canWritePages],
  );
  const author = useMemo(
    () =>
      authTrainer?.id ? { id: authTrainer.id, name: authTrainer.fullName ?? "" } : null,
    [authTrainer?.id, authTrainer?.fullName],
  );

  /*
   * Every door below asks first, and sets its jump only once leaving is
   * agreed (see the header). Search closes BEFORE the question, so "Keep
   * editing" puts the trainer back on the page they were typing on. A nested
   * onViewChange inside the held answer does not ask a second time.
   */
  const leave = useLeaveGuard();
  const through = useCallback(
    (open: () => void) => {
      setSearchOpen(false);
      leave(open);
    },
    [leave],
  );

  /** Opens a page, without asking: for a jump someone has already asked about. */
  const openRefNow = useCallback(
    (ref: LearningRef) => {
      setSearchOpen(false);
      if (design !== "current") {
        // A prototype opens the page itself; the masthead moves to its section.
        setDesignJump(ref);
        onViewChange(ref.kind === "machine" ? "machine-anatomy" : "academy");
        return;
      }
      if (ref.kind === "machine") {
        setCatalogJump(ref.id);
        onViewChange("machine-anatomy");
      } else {
        setAcademyJump({ ref });
        onViewChange("academy");
      }
    },
    [design, onViewChange],
  );

  /** The one door into a page, from inside the tab. */
  const openRef = useCallback(
    (ref: LearningRef) => through(() => openRefNow(ref)),
    [through, openRefNow],
  );

  // From outside the tab: AppContent's openLearning asked before it set this.
  useEffect(() => {
    if (!jump) return;
    openRefNow(jump);
    onJumpHandled();
  }, [jump, openRefNow, onJumpHandled]);

  const openCatalog = useCallback(
    (groupKey?: string) =>
      through(() => {
        if (groupKey) setCatalogGroup(groupKey);
        onViewChange("machine-anatomy");
      }),
    [through, onViewChange],
  );

  const openAcademy = useCallback(
    (group?: AcademyGroupKey) =>
      through(() => {
        if (group) setAcademyJump({ group });
        onViewChange("academy");
      }),
    [through, onViewChange],
  );

  /* The bar's two picks. Each asks the gate first (a design or a role that
     goes away takes its open forms with it) and changes only inside the
     answer. A jump not yet honoured is dropped with the Learning it was
     meant for, so it can never fire later in another one. */
  const pickDesign = useCallback(
    (next: LearningDesign) =>
      through(() => {
        setDesign(next);
        rememberDesign(next);
        setDesignJump(null);
        setCatalogJump(null);
        setCatalogGroup(null);
        setCatalogScope(null);
        setAcademyJump(null);
      }),
    [through],
  );
  const pickViewAs = useCallback((next: ViewAs) => through(() => setViewAs(next)), [through]);
  const shownViewAs = viewAs ?? naturalViewAs({ canStrike: canWritePages, isHeadOffice: Boolean(isAdmin) });

  const sections = useMemo<WikiSectionsValue>(
    () => ({
      title: "Learning",
      titleIcon: <BookOpen size={19} aria-hidden />,
      sections: [
        { id: "learning", label: "Overview", icon: <LayoutGrid size={14} aria-hidden /> },
        { id: "machine-anatomy", label: "Catalog", icon: <Dumbbell size={14} aria-hidden /> },
        { id: "academy", label: "Academy", icon: <GraduationCap size={14} aria-hidden /> },
      ],
      active: view,
      onSelect: (id) => {
        // A prototype deep in this section's trail goes back to its root.
        if (design !== "current" && id === view) {
          through(() => setDesignReset((n) => n + 1));
          return;
        }
        setSearchOpen(false);
        onViewChange(id as LearningViewId);
      },
      onHome: () => {
        if (design !== "current" && view === "learning") {
          through(() => setDesignReset((n) => n + 1));
          return;
        }
        setSearchOpen(false);
        onViewChange("learning");
      },
      onSearch: () => setSearchOpen(true),
      searchLabel: "Search Learning",
    }),
    [view, onViewChange, design, through],
  );

  return (
    <CommentsProvider value={comments}>
    <WikiSectionsProvider value={sections}>
      <DesignSwitcher design={design} onDesign={pickDesign} viewAs={shownViewAs} onViewAs={pickViewAs} />
      {/* Hidden, not unmounted, while search is open: closing search returns
          the trainer to the page they left, not to its section's index. */}
      <div className={searchOpen ? "lv__stash" : "lv__pass"}>
        {design !== "current" ? (
          <LearningRedesign
            design={design}
            viewAs={viewAs}
            authTrainer={authTrainer}
            section={view}
            onSection={onViewChange}
            machines={machines}
            studioId={activeStudioId}
            studioName={activeStudio?.name ?? "This studio"}
            jump={designJump}
            onJumpHandled={clearDesignJump}
            resetSignal={designReset}
          />
        ) : (
          <>
            {view === "learning" && (
              <LearningHome
                machines={machines}
                canWritePages={canWritePages && Boolean(author)}
                onOpen={openRef}
                onOpenSearch={() => setSearchOpen(true)}
                onOpenCatalog={openCatalog}
                onOpenDatabase={() =>
                  through(() => {
                    setCatalogScope("msf");
                    onViewChange("machine-anatomy");
                  })
                }
                onOpenAcademy={openAcademy}
                onNewPage={() =>
                  through(() => {
                    setAcademyJump({ newPage: true });
                    onViewChange("academy");
                  })
                }
              />
            )}
            {view === "machine-anatomy" && (
              <CatalogView
                machines={machines}
                authTrainer={authTrainer}
                openMachineId={catalogJump}
                onOpenedMachine={() => setCatalogJump(null)}
                openGroupKey={catalogGroup}
                onOpenedGroup={() => setCatalogGroup(null)}
                openScope={catalogScope}
                onOpenedScope={() => setCatalogScope(null)}
                onOpenAcademy={(machineId, focus, machineName) =>
                  through(() => {
                    setAcademyJump({ machineId, focus, fromLabel: machineName });
                    onViewChange("academy");
                  })
                }
                onOpenFloorEditor={onOpenFloorEditor ? (view) => through(() => onOpenFloorEditor(view)) : undefined}
              />
            )}
            {view === "academy" && (
              <AcademyWikiView
                jump={academyJump}
                onClearJump={() => setAcademyJump(null)}
                canManagePages={canWritePages}
                author={author}
                catalogMachines={machines}
                onOpenMachine={(machineId) =>
                  through(() => {
                    setCatalogJump(machineId);
                    onViewChange("machine-anatomy");
                  })
                }
              />
            )}
          </>
        )}
      </div>

      {searchOpen && (
        <LearningSearch
          machines={machines}
          onClose={() => setSearchOpen(false)}
          onOpen={openRef}
        />
      )}
    </WikiSectionsProvider>
    </CommentsProvider>
  );
}
