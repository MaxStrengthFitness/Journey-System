/**
 * OPERATIONS → TODAY: "Booked here, filed at another studio".
 *
 * Meg Pauly trained at Strongsville but Mindbody's Home location said
 * westlake, so Journey filed her there and Strongsville could not open her
 * record. This row lists those clients to a studio's leaders and files each at
 * this studio on one press and one confirmation. The server decides and
 * re-checks (functions/src/homeStudio.ts); this only asks and shows.
 *
 * Quiet by rule: drawn only when there is someone to move. A failed or
 * unfinished read draws nothing at all, never "nothing to move" (a missing
 * line is honest; a false all-clear is not). Nobody is pinged and nothing runs
 * on its own.
 */
import { useState } from "react";
import { useToast } from "../../contexts/ToastContext";
import { formatStudioDate } from "../../lib/studio-time";
import type { Trainer } from "../../types";
import { AdminButton } from "../admin/primitives";
import { ActionRows } from "../admin/overview/pieces";
import { NOTICE_WHY, maySeeHomeStudioNotice, movedSentence, noticeHeading, noticeSentence } from "./home-studio";
import { useHomeStudioNotices } from "./useHomeStudioNotices";

export function HomeStudioNotice({ studioId, studioName, authTrainer, tz }: { studioId: string; studioName: string; authTrainer: Trainer; tz?: string }) {
  const allowed = maySeeHomeStudioNotice(authTrainer, studioId);
  const { notices, truncated, move } = useHomeStudioNotices(studioId, allowed);
  const { success, error } = useToast();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!allowed || notices.length === 0) return null;

  const run = async (clientId: string, name: string) => {
    setBusy(clientId);
    const refusal = await move(clientId);
    setBusy(null);
    setConfirming(null);
    if (refusal) error(refusal);
    else success(movedSentence(name, studioName));
  };

  return (
    <div className="ops-sec__card" data-testid="home-studio-notice">
      <ActionRows
        rows={[
          {
            key: "home-studio",
            clientId: null,
            name: noticeHeading(notices.length),
            sentence: notices.map((n) => n.name).join(", ") + (truncated ? " and others" : ""),
            proof: NOTICE_WHY,
            tone: "info",
            badge: "Filing",
            actions: (
              <AdminButton size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
                {open ? "Hide" : "Show"}
              </AdminButton>
            ),
            below: open ? (
              <ActionRows
                rows={notices.map((n) => ({
                  key: `home-studio:${n.clientId}`,
                  clientId: null,
                  name: n.name,
                  sentence: noticeSentence(n, n.lastAt ? formatStudioDate(new Date(n.lastAt), { month: "short", day: "numeric" }, tz) : null),
                  actions:
                    confirming === n.clientId ? (
                      <>
                        <AdminButton size="sm" busy={busy === n.clientId} onClick={() => void run(n.clientId, n.name)}>
                          Yes, file her at {studioName}
                        </AdminButton>
                        <AdminButton size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                          Not now
                        </AdminButton>
                      </>
                    ) : (
                      <AdminButton size="sm" variant="ghost" onClick={() => setConfirming(n.clientId)}>
                        Move to {studioName}
                      </AdminButton>
                    ),
                }))}
                empty=""
              />
            ) : undefined,
          },
        ]}
        empty=""
      />
    </div>
  );
}
