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
import { TodayStrip } from "./TodayStrip";
import { LearningRedesign } from "../learning-redesign/LearningRedesign";
import { onlyOnToday, type TodayDoor } from "../learning-redesign/today-door";
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
 * THE MIX, AND A DOOR TO TODAY'S PAGES (the Mix for everyone, Oct 20 2026)
 * -------------------------------------------------------------------------
 * AJ, Oct 20 2026: "Switch everyone to the Mix now, with a door on each page
 * to today's Learning for the studio tools, and move them in later." So
 * every trainer opens on the Mix (LearningRedesign), drawn in place of the
 * three sections inside the same comments and masthead; there is no picker
 * and no "View as". A Mix page whose counterpart here holds a studio tool
 * the Mix lacks (a machine's floor notes and set-up, the drawn floor, the
 * studio's own pages, comments; learning-redesign/today-door.ts) carries
 * one door; it asks the gate first and opens today's page in place, under
 * TodayStrip, whose Back to Learning asks too and goes back to the Mix page
 * the door was on.
 *
 * Every door into a page: search inside the tab stays where the trainer is
 * (the Mix, or today's pages); a jump from OUTSIDE the tab (the bell, a
 * note, an announcement) always opens the Mix, except a studio's own page,
 * which only today's Academy draws (onlyOnToday). The Learning title on the
 * Overview, or the section already on, sends the Mix `resetSignal` + 1:
 * back to that section's front page.
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
  /** Opens on today's pages rather than the Mix (a harness, a test). Absent: the Mix. */
  initialToday?: boolean;
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
  initialToday = false,
}: LearningViewProps) {
  const { activeStudioId, activeStudio } = useActiveStudio();

  const [catalogJump, setCatalogJump] = useState<string | null>(null);
  const [catalogGroup, setCatalogGroup] = useState<string | null>(null);
  const [catalogScope, setCatalogScope] = useState<CatalogScope | null>(null);
  const [academyJump, setAcademyJump] = useState<AcademyJump | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  /* Today's pages are on (a door was taken), and the section the Mix was on
     when it went: the Mix stays MOUNTED, hidden, on that section (review,
     Oct 20 2026), so Back to Learning finds it exactly as it was left, its
     trail, its tier and its scroll, and nothing is rebuilt on a slow iPad
     between clients. The page the Mix is asked to open is its own `jump`,
     cleared once it has opened it. */
  const [today, setToday] = useState(initialToday);
  const [mixSection, setMixSection] = useState<LearningViewId | null>(null);
  const [designJump, setDesignJump] = useState<LearningRef | null>(null);
  const clearDesignJump = useCallback(() => setDesignJump(null), []);
  /* The Mix asked back to its section's front page while already in the
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

  /** Today's pages at a door, without asking (the caller asked). */
  const showToday = useCallback(
    (door: TodayDoor) => {
      setSearchOpen(false);
      setToday(true);
      setDesignJump(null);
      setCatalogGroup(null);
      setCatalogScope(null);
      if (door.kind === "catalog") {
        setCatalogJump(null);
        onViewChange("machine-anatomy");
      } else if (door.kind === "academy") {
        setAcademyJump(null);
        onViewChange("academy");
      } else if (door.kind === "machine") {
        setCatalogJump(door.id);
        onViewChange("machine-anatomy");
      } else {
        setAcademyJump({ ref: door });
        onViewChange("academy");
      }
    },
    [onViewChange],
  );

  /** The Mix at a page, without asking: a fresh visit there. */
  const showMix = useCallback(
    (ref: LearningRef) => {
      setSearchOpen(false);
      setToday(false);
      setMixSection(null);
      setCatalogJump(null);
      setCatalogGroup(null);
      setCatalogScope(null);
      setAcademyJump(null);
      setDesignJump(ref);
      // The Mix opens the page itself; the masthead moves to its section.
      onViewChange(ref.kind === "machine" ? "machine-anatomy" : "academy");
    },
    [onViewChange],
  );

  /**
   * Opens a page, without asking: for a jump someone has already asked
   * about. Inside the tab (search) it stays on whichever Learning is on;
   * from outside it is the Mix. A studio's own page is today's only.
   */
  const openRefNow = useCallback(
    (ref: LearningRef, from: "inside" | "outside") => {
      setSearchOpen(false);
      if (onlyOnToday(ref)) {
        // The Mix waits where it is, for Back to Learning.
        if (!today) setMixSection(view);
        showToday(ref);
        return;
      }
      if (!today || from === "outside") {
        showMix(ref);
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
    [today, view, onViewChange, showToday, showMix],
  );

  /** The one door into a page, from inside the tab. */
  const openRef = useCallback(
    (ref: LearningRef) => through(() => openRefNow(ref, "inside")),
    [through, openRefNow],
  );

  // From outside the tab: AppContent's openLearning asked before it set this.
  useEffect(() => {
    if (!jump) return;
    openRefNow(jump, "outside");
    onJumpHandled();
  }, [jump, openRefNow, onJumpHandled]);

  /* A Mix page's door to today's page, and today's Back to Learning: each
     asks the gate first and changes only inside the answer. Back unhides
     the Mix on the section it was on, exactly as it was left. */
  const openToday = useCallback(
    (door: TodayDoor) =>
      through(() => {
        setMixSection(view);
        showToday(door);
      }),
    [through, showToday, view],
  );
  const backToLearning = useCallback(
    () =>
      through(() => {
        setSearchOpen(false);
        setToday(false);
        setCatalogJump(null);
        setCatalogGroup(null);
        setCatalogScope(null);
        setAcademyJump(null);
        if (mixSection) onViewChange(mixSection);
        setMixSection(null);
      }),
    [through, mixSection, onViewChange],
  );

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
        // The Mix deep in this section's trail goes back to its root.
        if (!today && id === view) {
          through(() => setDesignReset((n) => n + 1));
          return;
        }
        setSearchOpen(false);
        onViewChange(id as LearningViewId);
      },
      onHome: () => {
        if (!today && view === "learning") {
          through(() => setDesignReset((n) => n + 1));
          return;
        }
        setSearchOpen(false);
        onViewChange("learning");
      },
      onSearch: () => setSearchOpen(true),
      searchLabel: "Search Learning",
    }),
    [view, onViewChange, today, through],
  );

  return (
    <CommentsProvider value={comments}>
    <WikiSectionsProvider value={sections}>
      {today && <TodayStrip onBack={backToLearning} />}
      {/* Hidden, not unmounted, while search is open: closing search returns
          the trainer to the page they left, not to its section's index. */}
      <div className={searchOpen ? "lv__stash" : "lv__pass"}>
        {/* The Mix, mounted always; hidden (not unmounted) under today's
            pages, held on the section it was on when a door was taken. */}
        <div className={today ? "lv__stash" : "lv__pass"} data-mix={today ? "waiting" : "on"}>
          <LearningRedesign
            authTrainer={authTrainer}
            section={today ? (mixSection ?? view) : view}
            onSection={onViewChange}
            machines={machines}
            studioId={activeStudioId}
            studioName={activeStudio?.name ?? "This studio"}
            jump={designJump}
            onJumpHandled={clearDesignJump}
            resetSignal={designReset}
            onOpenToday={openToday}
          />
        </div>
        {today && (
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
