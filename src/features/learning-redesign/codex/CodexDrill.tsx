import { useMemo, useState } from "react";
import { studioTodayKey } from "../../../lib/studio-time";
import { pageFor } from "../../learning-vault/pages";
import { CueDrillCard } from "../../learning-vault/lesson/CueDrill";
import { cueDrillsIn, dayIndex } from "../../learning-vault/lesson/drills";
import { useAppliedMarkup } from "../../learning-vault/ui/ArticleBlocks";
import type { VaultPage } from "../../learning-vault/types";
import { useCodex } from "./codex-context";
import "./codex.css";

/**
 * "WHAT WOULD YOU CUE?" — the Overview's drill of the day (the Mix, Oct 19
 * 2026; the Course's, lifted into the shared parts). One moment of a set,
 * the studio's date picks it (the same all day on every iPad, a different
 * one tomorrow; nothing is stored), the trainer says it, then sees the
 * Academy's lines. "Another moment" deals the next one. Nothing is scored,
 * timed or kept.
 *
 * It waits on the phrasebook's reference chunk; until that lands, or if it
 * will not, it draws nothing and Play stands alone.
 */
export function DrillOfTheDay() {
  const { data } = useCodex();
  const page = useMemo(() => pageFor({ kind: "cueing" }, data), [data]);
  if (typeof page === "string") return null;
  return <DrillBody page={page} />;
}

function DrillBody({ page }: { page: VaultPage }) {
  const { peek } = useCodex();
  const applied = useAppliedMarkup(page.target, page.sections);
  const drills = useMemo(() => cueDrillsIn(page.sections, { min: 3 }), [page.sections]);
  const today = useMemo(() => dayIndex(studioTodayKey(), drills.length), [drills.length]);
  const [step, setStep] = useState(0);
  if (drills.length === 0) return null;
  const drill = drills[(today + step) % drills.length];
  return (
    <CueDrillCard
      key={drill.section}
      drill={drill}
      marked={applied.sections}
      studioLens={applied.studioLens}
      size="large"
      onAll={drill.moment !== null ? () => peek({ kind: "cueing", moment: drill.moment ?? undefined }) : undefined}
      another={() => setStep((s) => s + 1)}
      focusReveal={step > 0}
    />
  );
}
