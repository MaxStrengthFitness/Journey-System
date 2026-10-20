import { useMemo, useRef } from "react";
import type { Trainer } from "../../types";
import { auth } from "../../firebase";
import { useActiveStudio } from "../../contexts/ActiveStudioContext";
import { canWriteStudioPages, writesForStudioPerRules } from "../learning/permissions";
import { createSandboxStore, type MarkupStore } from "../learning-vault/markup-store";
import { MARKUP_ON } from "../learning-vault/markup-on";
import { VaultProvider } from "../learning-vault/ui/VaultProvider";
import type { VaultViewer } from "../learning-vault/types";
import type { DesignProps } from "./design-props";
import { LazyMix } from "./lazy";

/**
 * THE MIX'S ROOT — every trainer's Learning since Oct 20 2026 (the Learning
 * vault redesign, Oct 19 2026; AJ: "we can go ahead and stay with Mix").
 *
 * LearningView draws this in place of today's three sections; the masthead
 * (and the comments around it) stay its own. Here:
 *
 *   WHO IS READING. The real viewer, from the same rules the buttons mirror
 *   everywhere else in Learning: the Auth uid (never the trainer document's
 *   id), crossing out = canWriteStudioPages, notes = writesForStudioPerRules,
 *   head office's queue = an administrator (the Admins dashboard's own gate).
 *   None of it is drawn while marking is off (markup-on.ts).
 *
 *   THE STORE. Nothing reads or writes Firestore: marks would go to ONE
 *   in-memory store per studio, which starts empty. While marking is off
 *   nothing can be put in it; it is held here, keyed by the studio, for the
 *   round that keeps marks for real (learning-vault/README.md).
 */
export interface LearningRedesignProps extends DesignProps {
  authTrainer: Trainer | null;
}

export function LearningRedesign({ authTrainer, ...props }: LearningRedesignProps) {
  const { isAdmin } = useActiveStudio();
  const { studioId, studioName } = props;
  const uid = auth.currentUser?.uid ?? null;

  const canStrike = canWriteStudioPages(authTrainer, studioId);
  const canNote = writesForStudioPerRules(authTrainer, studioId);
  const isHeadOffice = Boolean(isAdmin);
  const name = authTrainer?.fullName ?? "";
  const viewer = useMemo<VaultViewer>(
    () => ({ uid, name, canStrike, canNote, isHeadOffice }),
    [uid, name, canStrike, canNote, isHeadOffice],
  );

  // One store per studio: made the first time, and again only when the
  // studio changes (a lazy ref).
  const studioKey = studioId ?? "";
  const held = useRef<{ studioKey: string; store: MarkupStore } | null>(null);
  if (held.current === null || held.current.studioKey !== studioKey) {
    held.current = { studioKey, store: createSandboxStore() };
  }
  const store = held.current.store;

  const studio = useMemo(() => ({ id: studioId, name: studioName }), [studioId, studioName]);

  return (
    // Keyed by the studio: another studio's version starts on its own lens.
    <VaultProvider key={studioKey} store={store} studio={studio} viewer={viewer} markup={MARKUP_ON}>
      <LazyMix {...props} />
    </VaultProvider>
  );
}
