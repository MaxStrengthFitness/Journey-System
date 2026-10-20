/**
 * Learning on a page of its own, for the redesign round (the Learning vault
 * redesign, Oct 19 2026): the app's REAL LearningView (the Mix, everyone's
 * Learning since Oct 20 2026, and today's pages behind its doors), inside a stand-in of the shell AppContent draws it
 * in (the header, <main>, the real bottom bar), with the real providers and
 * every database call answered by stubs/ instead.
 *
 *   ?design=codex|current                  codex: the Mix (the default); current:
 *                                          today's pages, as a Mix door opens them
 *                                          (a jump from outside opens the Mix, as
 *                                          in the app)
 *   &view=learning|machine-anatomy|academy the masthead's section (default learning)
 *   &theme=light|dark                      (default light)
 *   &role=leader|trainer|admin             who is signed in (sample.ts; default leader)
 *   &machine=m-leg-press                   open that machine (a Learning jump)
 *   &ref=<LearningRef JSON, url-encoded>   open that page (a Learning jump), e.g.
 *        %7B%22kind%22%3A%22academy-topic%22%2C%22id%22%3A%22performance-gradual-load-up%22%7D
 *   &empty=1  &flag=0                      see sample.ts
 *
 * The jump is set just after the first render, the way the bell's arrives.
 * window.__ready is true once the page has mounted; window.__view is the
 * section; window.__writes lists anything that would have been written.
 * shots.mjs photographs it. It never ships.
 */
import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./preview.css";
// The six token sheets the app's main.tsx loads on the first screen, in its order.
import "../../src/features/journey-grid/journey-grid.tokens.css";
import "../../src/features/equipment/equipment.tokens.css";
import "../../src/features/calendar/calendar.tokens.css";
import "../../src/features/subjective-report/subjective-report.tokens.css";
import "../../src/features/catalog/catalog.tokens.css";
import "../../src/features/studio-tasks/studio-tasks.tokens.css";
import { ActiveStudioProvider } from "../../src/contexts/ActiveStudioContext";
import { ToastProvider } from "../../src/contexts/ToastContext";
import { UnsavedChangesProvider } from "../../src/features/unsaved-changes";
import { LearningView, type LearningViewId } from "../../src/features/learning/LearningView";
import { parseLearningRef, type LearningRef } from "../../src/features/learning/ref";
import { AppBottomBar } from "../../src/components/AppBottomBar";
import { GLOBAL_MACHINES, IS_ADMIN, STUDIO, STUDIO_ID, TRAINER } from "./sample";

const params = new URLSearchParams(location.search);
const theme = params.get("theme") === "dark" ? "dark" : "light";
document.documentElement.classList.add(theme);
// The provider reads the open studio from here, once, at its first render.
try {
  localStorage.setItem("max_strength_active_studio_id", STUDIO_ID);
} catch {
  /* a private window: the studio then stays unset */
}

const VIEWS: LearningViewId[] = ["learning", "machine-anatomy", "academy"];
const START_VIEW: LearningViewId = VIEWS.find((v) => v === params.get("view")) ?? "learning";
const TODAY = params.get("design") === "current";

function startJump(): LearningRef | null {
  const machine = params.get("machine");
  if (machine) return { kind: "machine", id: machine };
  const raw = params.get("ref");
  if (!raw) return null;
  try {
    return parseLearningRef(JSON.parse(raw));
  } catch {
    console.error(`The ref parameter is not a Learning ref: ${raw}`);
    return null;
  }
}

type Watched = { __ready?: boolean; __view?: string };

function Shell() {
  const [view, setView] = useState<LearningViewId>(START_VIEW);
  const [jump, setJump] = useState<LearningRef | null>(null);
  const clearJump = useCallback(() => setJump(null), []);
  (window as unknown as Watched).__view = view;

  // After the first render, as a link from the bell arrives.
  useEffect(() => {
    const ref = startJump();
    if (ref) setJump(ref);
    (window as unknown as Watched).__ready = true;
  }, []);

  return (
    <div className="app-shell flex flex-col overflow-hidden bg-background text-foreground font-sans overflow-x-hidden w-full max-w-full">
      <header
        className="h-14 shrink-0 flex items-center px-4 text-sm font-bold"
        style={{ background: "var(--chrome)", color: "var(--chrome-ink)" }}
      >
        Journey · Solon
      </header>
      <main className="w-full max-w-full mx-auto relative flex-1 min-h-0 overflow-hidden bg-background p-0 flex flex-col">
        <LearningView
          key="learning"
          view={view}
          onViewChange={setView}
          machines={GLOBAL_MACHINES}
          authTrainer={TRAINER}
          trainers={[TRAINER]}
          jump={jump}
          onJumpHandled={clearJump}
          onOpenFloorEditor={() => {}}
          initialToday={TODAY}
        />
      </main>
      <AppBottomBar
        appMode="trainer"
        currentView={view}
        isAdmin={IS_ADMIN}
        hasClient={false}
        liveSession={undefined}
        lastLearningView={view}
        onNavigate={(v) => {
          if ((VIEWS as string[]).includes(v)) setView(v as LearningViewId);
        }}
        onResumeSession={() => {}}
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <ActiveStudioProvider studios={[STUDIO]} authTrainer={TRAINER} isAdmin={IS_ADMIN} onLogout={async () => {}}>
        <UnsavedChangesProvider>
          <Shell />
        </UnsavedChangesProvider>
      </ActiveStudioProvider>
    </ToastProvider>
  </StrictMode>,
);
