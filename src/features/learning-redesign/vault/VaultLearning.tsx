import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LearningRef } from "../../learning/ref";
import { pushRoute, routeForRef } from "../../learning-vault/routes";
import type { VaultRoute } from "../../learning-vault/types";
import { useVaultData, type VaultData } from "../../learning-vault/useVaultData";
import { useVaultNav } from "../../learning-vault/useVaultNav";
import { ConceptLayer } from "../../learning-vault/ui/ConceptLayer";
import { usePeekStack } from "../../learning-vault/ui/PeekSheet";
import type { DesignProps } from "../design-props";
import { SECTION_LABEL } from "../design";
import {
  AcademyScreen,
  CatalogScreen,
  HomeScreen,
  MapScreen,
  PageScreen,
  QueueScreen,
  QuizScreen,
  TrackScreen,
} from "./screens";
import { NO_EXPLORE, VaultScreenProvider, type ExploreState, type VaultScreen } from "./shell";
import "../../wiki/wiki.css";
import "./vault-map.css";

/**
 * DESIGN 2 — THE LIVING VAULT & RUMOR MAP (the Learning vault redesign,
 * Oct 19 2026). README.md beside this file has the idea and the screens.
 *
 * Learning as a connected vault you wander. The Overview opens on the map of
 * everything in it; every page shows what it connects to and why; every word
 * that means something opens a card you can follow three deep; and a peek
 * sheet holds a second page under your thumb.
 *
 * WHERE THINGS LIVE
 * -----------------
 * The data is gathered ONCE, here (useVaultData), and lives as long as the
 * design does. Each masthead section (Overview, Catalog, Academy) gets its
 * own trail of pages, keyed by the section, so a tap on the masthead lands on
 * that section's front page without asking twice (the masthead already
 * asked). The map remembers its focus, its chips and its lens across the
 * trail (ExploreState), so coming Back from a page lands on the map as it
 * was left.
 *
 * A page opened from outside goes on top of the section's trail, and the
 * Learning title on the Overview (or the section already on) takes the trail
 * back to its front page (`resetSignal`). The app asked about any typing
 * before either arrived, so both move the trail with useVaultNav's `set`,
 * which does not ask a second time.
 */
export default function VaultLearning(props: DesignProps) {
  const { section, machines, studioId } = props;
  const data = useVaultData({ studioId, machines });

  // What the maps and lenses remember while Learning is open. React state
  // only: nothing outlives the design, so a sign-out forgets it with the tree.
  const [explored, setExplored] = useState<Record<string, ExploreState>>({});
  const [lenses, setLenses] = useState<Record<string, string>>({});
  const explore = useCallback((key: string) => explored[key] ?? NO_EXPLORE, [explored]);
  const setExplore = useCallback(
    (key: string, next: ExploreState) => setExplored((prev) => (prev[key] === next ? prev : { ...prev, [key]: next })),
    [],
  );
  const lens = useCallback((key: string) => lenses[key] ?? "", [lenses]);
  const setLens = useCallback(
    (key: string, value: string) => setLenses((prev) => (prev[key] === value ? prev : { ...prev, [key]: value })),
    [],
  );

  const memory = useMemo(() => ({ explore, setExplore, lens, setLens }), [explore, setExplore, lens, setLens]);

  return <VaultBody key={section} {...props} data={data} memory={memory} />;
}

/** The root page of each masthead section. */
export function rootFor(section: DesignProps["section"]): VaultRoute {
  if (section === "machine-anatomy") return { kind: "catalog" };
  if (section === "academy") return { kind: "academy" };
  return { kind: "home" };
}

type Memory = Pick<VaultScreen, "explore" | "setExplore" | "lens" | "setLens">;

function VaultBody({
  section,
  jump,
  onJumpHandled,
  resetSignal = 0,
  data,
  memory,
}: DesignProps & { data: VaultData; memory: Memory }) {
  const nav = useVaultNav(rootFor(section));
  const peek = usePeekStack();

  // A page opened from outside (search, the bell, a shared link): on top of
  // this section's trail, then handed back. Before paint, so the section's
  // front page never flashes first. The app already asked (set, not push).
  const handled = useRef<LearningRef | null>(null);
  useLayoutEffect(() => {
    if (!jump || handled.current === jump) return;
    handled.current = jump;
    nav.set(pushRoute(nav.stack, routeForRef(jump)));
    onJumpHandled();
  }, [jump, nav, onJumpHandled]);

  // Back to the section's front page (the title, or the section already on):
  // the trail and the peek let go. LearningView asked first.
  const seenReset = useRef(resetSignal);
  useLayoutEffect(() => {
    if (resetSignal === seenReset.current) return;
    seenReset.current = resetSignal;
    nav.set([rootFor(section)]);
    peek.close();
  }, [resetSignal, nav, peek, section]);

  const { push } = nav;
  const peekPush = peek.push;
  const screen = useMemo<VaultScreen>(
    () => ({
      data,
      nav,
      peek,
      rootLabel: SECTION_LABEL[section],
      open: push,
      peekAt: peekPush,
      ...memory,
    }),
    [data, nav, peek, section, push, peekPush, memory],
  );

  return (
    <VaultScreenProvider value={screen}>
      <ConceptLayer index={data.entities} onOpen={push} onPeek={peekPush}>
        <Screen route={nav.route} />
      </ConceptLayer>
    </VaultScreenProvider>
  );
}

function Screen({ route }: { route: VaultRoute }) {
  switch (route.kind) {
    case "home":
      return <HomeScreen />;
    case "catalog":
      return <CatalogScreen />;
    case "academy":
      return <AcademyScreen />;
    case "track":
      return <TrackScreen id={route.id} />;
    case "quiz":
      return <QuizScreen key={route.deck ?? "any"} deck={route.deck} />;
    case "queue":
      return <QueueScreen />;
    case "map":
      return <MapScreen key={route.focus ?? ""} focus={route.focus} />;
    default:
      return <PageScreen route={route} />;
  }
}
