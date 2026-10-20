import { useMemo, useRef } from "react";
import type { Trainer } from "../../types";
import { auth } from "../../firebase";
import { useActiveStudio } from "../../contexts/ActiveStudioContext";
import { canWriteStudioPages, writesForStudioPerRules } from "../learning/permissions";
import { createSandboxStore, type MarkupStore } from "../learning-vault/markup-store";
import { MARKUP_ON } from "../learning-vault/markup-on";
import { sampleSeed } from "../learning-vault/sample";
import { VaultProvider } from "../learning-vault/ui/VaultProvider";
import type { VaultViewer } from "../learning-vault/types";
import type { DesignProps } from "./design-props";
import { viewerFor, type ViewAs } from "./design";
import { LazyDesign, type RedesignId } from "./lazy";

/**
 * THE ROOT OF EVERY PROTOTYPE DESIGN (the Learning vault redesign, Oct 19
 * 2026).
 *
 * LearningView draws this in place of its three sections when a prototype is
 * picked on the bar; the masthead (and the comments around it) stay its own.
 * Here:
 *
 *   WHO IS READING. The real viewer, from the same rules the buttons mirror
 *   everywhere else in Learning: the Auth uid (never the trainer document's
 *   id), crossing out = canWriteStudioPages, notes = writesForStudioPerRules,
 *   head office's queue = an administrator (the Admins dashboard's own gate).
 *   "View as" on the bar then changes only what they may do (viewerFor).
 *
 *   THE SANDBOX. Nothing in the prototypes reads or writes Firestore: every
 *   mark goes to ONE in-memory store per studio, seeded with the sample
 *   (learning-vault/sample.ts) on a development build only, so a fresh
 *   prototype shows what markup looks like; a production build starts empty. It is held here, keyed by the studio, so it survives a switch
 *   between Mix and Current and starts again when the studio changes. It
 *   is gone when Learning closes, or when the bar goes back to Current.
 */
/**
 * What the sandbox starts with. The sample marks (made-up crossed-out lines
 * and notes by sample people) are for the PC build and the harness only,
 * where a fresh prototype needs something to show; a production build starts
 * the sandbox empty, so nobody on a real studio ever sees made-up marks
 * attributed to people. (Review, Oct 19 2026.)
 */
export function sandboxSeed(studioId: string | null, studioName: string, dev: boolean) {
  return dev ? sampleSeed({ id: studioId ?? "this-studio", name: studioName }, new Date()) : undefined;
}

export interface LearningRedesignProps extends DesignProps {
  design: RedesignId;
  viewAs: ViewAs | null;
  authTrainer: Trainer | null;
}

export function LearningRedesign({ design, viewAs, authTrainer, ...props }: LearningRedesignProps) {
  const { isAdmin } = useActiveStudio();
  const { studioId, studioName } = props;
  const uid = auth.currentUser?.uid ?? null;

  const canStrike = canWriteStudioPages(authTrainer, studioId);
  const canNote = writesForStudioPerRules(authTrainer, studioId);
  const isHeadOffice = Boolean(isAdmin);
  const name = authTrainer?.fullName ?? "";
  const viewer = useMemo<VaultViewer>(
    () => viewerFor({ uid, name, canStrike, canNote, isHeadOffice }, viewAs),
    [uid, name, canStrike, canNote, isHeadOffice, viewAs],
  );

  // One sandbox per studio: made the first time, and again only when the
  // studio changes (a lazy ref, so a design switch keeps every mark).
  const studioKey = studioId ?? "";
  const sandbox = useRef<{ studioKey: string; store: MarkupStore } | null>(null);
  if (sandbox.current === null || sandbox.current.studioKey !== studioKey) {
    sandbox.current = {
      studioKey,
      // No sample marks while marking is off (markup-on.ts): nothing could show them.
      store: createSandboxStore(MARKUP_ON ? sandboxSeed(studioId, studioName, import.meta.env.DEV) : undefined),
    };
  }
  const store = sandbox.current.store;

  const studio = useMemo(() => ({ id: studioId, name: studioName }), [studioId, studioName]);

  return (
    // Keyed by the studio: another studio's version starts on its own lens.
    <VaultProvider key={studioKey} store={store} studio={studio} viewer={viewer} markup={MARKUP_ON}>
      <LazyDesign design={design} {...props} />
    </VaultProvider>
  );
}
