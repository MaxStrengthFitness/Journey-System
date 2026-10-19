/**
 * THE WAY IN: acting on the link this tab opened with, once Journey can.
 *
 * AppContent calls this once, above its early returns. It:
 *   - reads the share document as soon as someone is signed in (before the
 *     studio picker, so the picker can offer the link's studio first);
 *   - once a studio is picked, asks ./decide.ts what to do and does it ONCE:
 *     opens through the bell's own navigation (`open`), offers Switch as a
 *     toast with one button and never switches by itself, says a refusal in
 *     the rules' words, or holds the link behind a quiet line while a session
 *     screen is up;
 *   - for a session link, reads the session document and tells its four
 *     cases apart (`sessionCase`).
 *
 * Every read here is one document, judged by the rules; nothing is written.
 * A Switch offer that is not taken lets the link go when the toast does, so a
 * studio switched to twenty minutes later never opens a profile by surprise.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { decide, refusalFor, sessionCase, type OpenTarget, type SessionCase } from "./decide";
import { studioNamedByLink, type LinkTarget } from "./parse";
import { clearPendingLink, peekPendingLink } from "./pending";
import { shareRecordOf, type ShareRead } from "./share";

/** How long the Switch offer stands. The toast and the held link go together. */
export const SWITCH_OFFER_MS = 12_000;

export interface DeepLinkIo {
  /** The Firebase Auth uid; null until signed in. */
  uid: string | null;
  /** Signed in, trainer record found, a studio picked, the picker closed. */
  ready: boolean;
  activeStudioId: string | null;
  myStudioIds: readonly string[];
  myTrainerIds: readonly string[];
  studioNameOf: (studioId: string) => string | null;
  sessionRunning: boolean;
  /** Opens the place, through the bell's path: the unsaved-changes gate is asked there. */
  open: (target: OpenTarget, session?: SessionCase) => void;
  /** The person tapped Switch: AppContent switches, and the let-go effect releases the client. */
  switchStudio: (studioId: string) => void;
  say: {
    info: (message: string, duration?: number, action?: { label: string; run: () => void }) => void;
    error: (message: string) => void;
  };
}

export interface DeepLinkState {
  /** The quiet line while the link waits for Finish; null otherwise. */
  holdLine: string | null;
  /** The studio the link is at, once known: the picker offers it first. */
  linkStudioId: string | null;
  /** A link is waiting. */
  hasLink: boolean;
}

function codeOf(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code.replace(/^firestore\//, "") : "unknown";
}

export function useDeepLink(io: DeepLinkIo): DeepLinkState {
  const [link, setLink] = useState<LinkTarget | null>(() => peekPendingLink()?.target ?? null);
  const [share, setShare] = useState<ShareRead | null>(null);

  // One read of the share document, as soon as someone is signed in.
  useEffect(() => {
    if (!io.uid || !link || link.kind !== "share" || share) return;
    let cancelled = false;
    setShare({ status: "loading" });
    getDoc(doc(db, "shares", link.shareId))
      .then((snap) => {
        if (cancelled) return;
        const record = snap.exists() ? shareRecordOf(snap.data()) : null;
        setShare(record ? { status: "ready", share: record } : { status: "refused", code: "missing" });
      })
      .catch((err: unknown) => {
        if (!cancelled) setShare({ status: "refused", code: codeOf(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [io.uid, link, share]);

  const linkStudioId = useMemo(() => {
    if (!link) return null;
    if (share?.status === "ready") return share.share.studioId;
    return studioNamedByLink(link);
  }, [link, share]);

  const decision = useMemo(
    () =>
      link && io.ready
        ? decide({
            link,
            activeStudioId: io.activeStudioId,
            myStudioIds: io.myStudioIds,
            studioNameOf: io.studioNameOf,
            sessionRunning: io.sessionRunning,
            share,
          })
        : null,
    [link, io.ready, io.activeStudioId, io.myStudioIds, io.studioNameOf, io.sessionRunning, share],
  );

  const letGo = useCallback(() => {
    clearPendingLink();
    setLink(null);
    setShare(null);
  }, []);

  // The latest io, read inside the effect without re-running it.
  const ioRef = useRef(io);
  ioRef.current = io;
  /** What has been acted on already, so a re-render repeats nothing. */
  const acted = useRef<string | null>(null);
  const offerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchAccepted = useRef(false);

  useEffect(() => {
    if (!decision || !link) return;
    if (decision.kind === "wait" || decision.kind === "hold") return;
    const key = `${decision.kind}:${"studioId" in decision ? decision.studioId : ""}`;
    if (acted.current === key) return;
    acted.current = key;
    const current = ioRef.current;

    if (decision.kind === "switch") {
      if (switchAccepted.current) return; // the switch is under way; the next render opens
      current.say.info(decision.sentence, SWITCH_OFFER_MS, {
        label: decision.action,
        run: () => {
          switchAccepted.current = true;
          if (offerTimer.current) clearTimeout(offerTimer.current);
          current.switchStudio(decision.studioId);
        },
      });
      offerTimer.current = setTimeout(() => {
        if (!switchAccepted.current) letGo();
      }, SWITCH_OFFER_MS);
      return;
    }
    if (offerTimer.current) clearTimeout(offerTimer.current);

    if (decision.kind === "refuse") {
      current.say.error(decision.sentence);
      if (!decision.keep) letGo();
      else acted.current = null; // offline: the same answer may be given again later
      return;
    }
    if (decision.kind === "demo") {
      current.say.info(decision.sentence);
      letGo();
      return;
    }

    // open
    const { target } = decision;
    if (target.kind !== "session") {
      letGo();
      current.open(target);
      return;
    }
    getDoc(doc(db, "sessions", target.sessionId))
      .then((snap) => {
        const found = sessionCase(snap.exists() ? (snap.data() as Parameters<typeof sessionCase>[0]) : null, current.myTrainerIds);
        letGo();
        if (found.kind === "say") current.say.info(found.sentence);
        else current.open(target, found);
      })
      .catch((err: unknown) => {
        const refusal = refusalFor(codeOf(err));
        current.say.error(refusal.sentence);
        if (!refusal.keep) letGo();
        else acted.current = null;
      });
  }, [decision, link, letGo]);

  useEffect(
    () => () => {
      if (offerTimer.current) clearTimeout(offerTimer.current);
    },
    [],
  );

  return {
    holdLine: decision?.kind === "hold" ? decision.line : null,
    linkStudioId,
    hasLink: link !== null,
  };
}
