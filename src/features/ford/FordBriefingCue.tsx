/**
 * ONE LINE ON THE BRIEFING: something to ask about — and, since the
 * reporting round (Sep 2026), the place to catch the answer.
 *
 * The briefing is the 1–5 minutes before hands go on a client, and roughly a
 * minute of it is conversation. That minute is where FORD details are earned
 * and where they pay off, so this is the one place the framework gets to speak
 * before the session rather than after it.
 *
 * It is deliberately ONE ROW, not a section. The briefing's job is "is there
 * anything here that could hurt them", and a personal detail must never
 * compete with a contraindication for a trainer's eye. So: small, quiet, below
 * the critical strip, and gone entirely when there is nothing worth saying.
 *
 * WHAT IT PICKS
 *   0. What the Hub card's Get to know mark is about, in the same words, by
 *      the Hub's one rule (`askAboutFor`; the briefing round, Oct 17 2026,
 *      AJ's F13 "2a"): a day coming up this week, then a Follow up next time
 *      question, then one that just happened, then news. A follow-up is
 *      cleared when its answer is saved here, or by "Nothing new".
 *   1. The soonest dated detail — a graduation eight days out, an anniversary
 *      next week. The highest-value thing a trainer can open with.
 *   2. Failing that, the most recent standing fact, so a trainer who has never
 *      met this client still has one true thing to say.
 *   3. Failing that, a prompt from the emptiest pillar — a question to ASK,
 *      which is how the record gets filled in the first place. Rotated by day
 *      so the studio's trainers are not all asking about the dog on the same
 *      Tuesday, and aware of retirement (client codex, Sep 2026): a retired
 *      client is never asked "How is work treating you?", a working one never
 *      how retirement is going (`FORD_PROMPT_WHEN`). Nothing else about the
 *      row changed.
 *
 * WHAT A TAP DOES (audit action item C)
 *   The row used to be read-only and told the trainer to "catch the answer
 *   with Remember this" — on another screen. Now the row is a 48px button
 *   and a tap opens the capture right underneath it, already filed under the
 *   pillar the cue was about. Same component as the floor sheet
 *   (`FordQuickCapture`), same one-box-one-button rule, same nullable pillar.
 *   Given no `author` the row stays read-only, as it was.
 *
 * WHEN FORD COULD NOT BE READ (client codex, phase 1)
 *   The row never says "nothing on file" unless FORD answered. While it is
 *   still loading the row is not drawn at all — a prompt that flashes up and
 *   is then replaced by a real detail is worse than a beat of nothing. A
 *   failed read says so, and still offers the capture (a failed READ is no
 *   reason to refuse a WRITE; never block a save). A refused read — a
 *   visiting trainer at a cross-train studio — says the client's FORD is
 *   their home studio's, and offers no capture, because the database would
 *   refuse that write too.
 */

import { useMemo, useState } from "react";
import { ChevronDown, Info, MessageCircle } from "lucide-react";
import type { Client } from "../../types";
import { FORD_META, FORD_PILLARS, type FordEntry, type FordPillar } from "./types";
import { useClientFord } from "./useClientFord";
import { FordMark, WhenChip, pillarPrompt } from "./ui";
import { FordQuickCapture } from "./FordQuickCapture";
import { clearFollowUp, fordStudioIdOf, type FordAuthor } from "./ford-write";
import { askAboutFor, type AskAbout } from "../hub-opportunities/get-to-know";
import { studioTodayKey } from "../../lib/studio-time";
import { clientFirstName } from "../../lib/client-name";
import { pronounsFor } from "../client-codex/kit/pronouns";
import { isRetiredClient } from "../client-life/life";
import "./ford.css";

export interface FordBriefingCueProps {
  client: Client | null;
  /** The signed-in trainer (Auth uid as `id`). Without it the row is read-only. */
  author?: FordAuthor | null;
  /**
   * Where a capture is stamped when the client names no studio of its own.
   * The client's own studio (`fordStudioIdOf`) wins, because it is what the
   * read filters on — a detail stamped anywhere else would never come back.
   */
  studioId?: string;
}

type Cue =
  | { kind: "ask"; entry: FordEntry; ask: AskAbout }
  | { kind: "detail"; entry: FordEntry }
  | { kind: "prompt"; pillar: FordPillar }
  | { kind: "unread"; reason: "failed" | "denied" };

export function FordBriefingCue({ client, author = null, studioId = "" }: FordBriefingCueProps) {
  const { entries, buckets, upcoming, status } = useClientFord({
    clientId: client?.id ?? null,
    client,
  });
  const [open, setOpen] = useState(false);

  const cue = useMemo<Cue | null>(() => {
    if (status === "loading") return null;
    if (status === "failed" || status === "denied") return { kind: "unread", reason: status };

    /* One rule with the Hub (the briefing round, Oct 17 2026; AJ's F13,
       "2a"): what the Hub card's Get to know mark is about is what the
       briefing says, in the same words. A day coming up this week, then a
       Follow up next time question, then one that just happened, then news. */
    const ask = askAboutFor(entries, studioTodayKey());
    const asked = ask ? entries.find((e) => e.id === ask.entryId) : undefined;
    if (ask && asked) return { kind: "ask", entry: asked, ask };

    const soonest = upcoming[0];
    if (soonest) return { kind: "detail", entry: soonest.entry };

    const pinned = entries.filter((e) => e.isPinned && !e.isArchived);
    if (pinned.length > 0) return { kind: "detail", entry: pinned[pinned.length - 1] };

    // Nothing on file — ask, rather than show an empty state. The thinnest
    // pillar first, so the record fills out evenly instead of four deep
    // Family notes and nothing else.
    const thinnest = [...buckets].sort(
      (a, b) =>
        a.pinned.length + a.moments.length - (b.pinned.length + b.moments.length),
    )[0];
    return { kind: "prompt", pillar: thinnest?.pillar ?? FORD_PILLARS[0] };
  }, [entries, buckets, upcoming, status]);

  if (!client || !cue) return null;

  // A visitor's capture would be refused by the rules; don't offer it.
  const refused = cue.kind === "unread" && cue.reason === "denied";
  const canCapture = Boolean(author && client.id) && !refused;
  // An unread cue opens the capture unfiled — the floor path, a letter later.
  const pillar: FordPillar | null =
    cue.kind === "detail" || cue.kind === "ask" ? cue.entry.pillar : cue.kind === "prompt" ? cue.pillar : null;
  /* A Follow up next time question: saving the answer clears it, as the FORD
     page's "Asked it" does, and "Nothing new" clears it without one. Never
     waited on: a tap on the floor moves on. */
  const followUp = cue.kind === "ask" && cue.ask.reason === "follow-up" && client?.id ? { clientId: client.id, fordId: cue.entry.id } : null;
  const clearQuestion = () => {
    if (followUp) void clearFollowUp(followUp.clientId, followUp.fordId);
  };

  const body =
    cue.kind === "ask" ? (
      <>
        <FordMark pillar={cue.entry.pillar} size={30} />
        <span className="ford-upnext__body">
          <span className="ford-upnext__text">{cue.ask.sentence}</span>
          {cue.entry.opportunity?.idea ? <span className="ford-upnext__meta">{cue.entry.opportunity.idea}</span> : null}
        </span>
      </>
    ) : cue.kind === "unread" ? (
      <>
        <span className="ford-mark ford-mark--unfiled" style={{ width: 30, height: 30 }}>
          <Info size={15} strokeWidth={2.5} />
        </span>
        <span className="ford-upnext__body">
          <span className="ford-upnext__text">
            {cue.reason === "denied"
              ? "FORD is kept by the client's home studio"
              : "FORD couldn't be loaded for this briefing"}
          </span>
          <span className="ford-upnext__meta">
            {cue.reason === "denied"
              ? "Only that studio's team can read it or add to it"
              : canCapture
                ? "So this isn't the same as nothing on file · tap to note what they tell you"
                : "So this isn't the same as nothing on file"}
          </span>
        </span>
      </>
    ) : cue.kind === "detail" ? (
      <>
        <FordMark pillar={cue.entry.pillar} size={30} />
        <span className="ford-upnext__body">
          <span className="ford-upnext__text">{cue.entry.body}</span>
          {cue.entry.opportunity?.idea ? <span className="ford-upnext__meta">{cue.entry.opportunity.idea}</span> : null}
        </span>
        <WhenChip date={cue.entry.eventDate} recurrence={cue.entry.recurrence} />
      </>
    ) : (
      <>
        <span className="ford-mark ford-mark--unfiled" style={{ width: 30, height: 30 }}>
          <MessageCircle size={15} strokeWidth={2.5} />
        </span>
        <span className="ford-upnext__body">
          <span className="ford-upnext__text">
            “{pillarPrompt(cue.pillar, undefined, { retired: isRetiredClient(client) })}”
          </span>
          <span className="ford-upnext__meta">{`Nothing on file under ${FORD_META[cue.pillar].label} yet`}</span>
        </span>
      </>
    );

  return (
    <div
      className="ford-upnext"
      style={{ marginBlock: "0.5rem" }}
      data-testid="ford-briefing-cue"
      data-status={status}
    >
      {canCapture ? (
        <button
          type="button"
          className="ford-upnext__row"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="ford-briefing-capture"
        >
          {body}
          <ChevronDown
            size={16}
            aria-hidden
            style={{ flex: "none", transition: "transform 120ms ease", transform: open ? "rotate(180deg)" : undefined }}
          />
        </button>
      ) : (
        <div className="ford-upnext__row" style={{ cursor: "default" }}>
          {body}
        </div>
      )}

      {canCapture && open && author ? (
        <div
          id="ford-briefing-capture"
          style={{ padding: "0.85rem", borderTop: "1px solid var(--ford-border)", background: "var(--ford-surface-2)" }}
        >
          <FordQuickCapture
            clientId={client.id as string}
            clientFirstName={clientFirstName(client) || pronounsFor(client).subject}
            studioId={fordStudioIdOf(client) || studioId}
            author={author}
            origin="briefing"
            defaultPillar={pillar}
            onSaved={followUp ? clearQuestion : undefined}
          />
          {followUp ? (
            <button
              type="button"
              className="ford-btn ford-upnext__clear"
              data-testid="ford-briefing-clear"
              onClick={() => {
                clearQuestion();
                setOpen(false);
              }}
            >
              Nothing new, clear the question
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
