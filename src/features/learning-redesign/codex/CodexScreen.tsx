import { QuizMode } from "../../learning-vault/ui/QuizMode";
import { SubmissionQueue } from "../../learning-vault/ui/SubmissionQueue";
import { routeKey } from "../../learning-vault/routes";
import type { VaultRoute } from "../../learning-vault/types";
import { useCodex } from "./codex-context";
import { CodexFrame } from "./CodexFrame";
import { CodexHome } from "./CodexHome";
import { AcademyIndex, CatalogIndex, ModulePage, TrackPage } from "./CodexIndexes";
import { MachinePage } from "./CodexMachine";
import { ArticlePage, CueingPage, GlossaryPage, MapEntryPage, TopicPage } from "./CodexArticle";
import "./codex.css";

/** The page the trail is on, drawn by its kind. */
export function CodexScreen({ route }: { route: VaultRoute }) {
  switch (route.kind) {
    case "home":
      return <CodexHome />;
    case "catalog":
      return <CatalogIndex />;
    case "academy":
      return <AcademyIndex />;
    case "machine":
      return <MachinePage key={routeKey(route)} route={route} />;
    case "module":
      return <ModulePage key={routeKey(route)} route={route} />;
    case "topic":
      return <TopicPage key={routeKey(route)} route={route} />;
    case "card":
    case "script":
    case "overview":
    case "playbook":
      return <ArticlePage key={routeKey(route)} route={route} />;
    case "glossary":
      return <GlossaryPage key={routeKey(route)} route={route} />;
    case "cueing":
      return <CueingPage key={routeKey(route)} route={route} />;
    case "track":
      return <TrackPage key={routeKey(route)} route={route} />;
    case "quiz":
      return <QuizPage key={routeKey(route)} route={route} />;
    case "queue":
      return <QueuePage />;
    case "map":
      return <MapEntryPage key={routeKey(route)} route={route} />;
  }
}

/** The quiz, inside the page's one scroller (QuizMode brings a card into view there). */
function QuizPage({ route }: { route: Extract<VaultRoute, { kind: "quiz" }> }) {
  const { data, peek, nav } = useCodex();
  return (
    <CodexFrame>
      <div className="cdx__quiz">
        <QuizMode
          key={route.deck ?? "pick"}
          bank={data.quizBank}
          initialDeck={route.deck}
          onOpenSource={peek}
          onExit={nav.canBack ? nav.back : undefined}
        />
      </div>
    </CodexFrame>
  );
}

/** Head office's queue: the lines studios cross out, and what the floor sent in. */
function QueuePage() {
  const { open } = useCodex();
  return (
    <CodexFrame>
      <div className="cdx__queue">
        <SubmissionQueue onOpen={open} />
      </div>
    </CodexFrame>
  );
}
