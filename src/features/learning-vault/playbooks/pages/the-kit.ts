/**
 * PLAYBOOK — Your kit: clicker, stopwatch, iPad (pillar: equipment and cueing).
 *
 * The three things a Life Transformer carries round the floor
 * (docs/business/the-floor.md:58-64), the three timers that are never the
 * same thing (:118-127), and the Academy's own page on the clicker
 * (docs/msf-academy/Academy/Academy - Registering Performance - Use of the
 * Clicker.txt), which is the one Academy file a playbook cites: the clicker
 * is the floor's equipment AND its cue, and nothing in docs/business says
 * how to use it.
 *
 * "6-10" means two things in the sources (business digest, register #4):
 * seconds each way (the Academy, here) and reps to failure (AJ). This page
 * only ever says seconds, and says the unit every time.
 */

import type { PlaybookPage } from "../../types";
import { at, bullet, CLICKER, FLOOR, para } from "../write";

export const THE_KIT: PlaybookPage = {
  id: "the-kit",
  title: "Your kit: clicker, stopwatch, iPad",
  lede:
    "Three things go round the floor with you. The clicker counts only good reps and tells the client when, the stopwatch times holds, and the iPad gets set down at every machine.",
  pillar: "equipment",
  status: "draft",
  sections: [
    {
      id: "carry",
      title: "What you carry",
      blocks: [
        bullet(
          "A mechanical clicker. It counts the reps and it's the client's audio cue, done by hand, never by the app.",
          at(FLOOR, 58, 60),
        ),
        bullet(
          "A stopwatch on a lanyard, if you use one. The app has its own, so you never need another.",
          at(FLOOR, 60, 61),
        ),
        bullet(
          "The iPad, in your non-dominant hand. You set it down constantly: on the floor, on the next machine, on top of the machine in use.",
          at(FLOOR, 61, 63),
        ),
        para("Picked up, walked, set down, five to eight times a session.", at(FLOOR, 63, 64)),
      ],
    },
    {
      id: "clicker",
      title: "The clicker counts only good reps",
      blocks: [
        para(
          "Tell a new client the clicker records only worthy repetitions. The focus is the quality of each rep, not the weight or the number.",
          at(CLICKER, 4),
        ),
        para(
          "At the least, every rep stays inside six to ten seconds on the way up and six to ten seconds on the way down, at one even pace, breathing freely, head neutral.",
          at(CLICKER, 5),
        ),
        para(
          "Accepting poor reps can add up to a weight increase the client's form isn't ready for.",
          at(CLICKER, 6),
        ),
        para(
          "Only full reps with acceptable form are counted, because any increase in load should rest on full reps alone.",
          at(CLICKER, 7),
        ),
      ],
    },
    {
      id: "click",
      title: "The click at the top",
      blocks: [
        para(
          "The clicker is also a command at the upper turnaround. Where the machine calls for a pause or a squeeze, delay the click, and the client learns to hold it until the click comes.",
          at(CLICKER, 8, 9),
        ),
        para(
          "Don't click until the client has reached peak effort with a neutral head and a relaxed face and jaw.",
          at(CLICKER, 10),
        ),
        para(
          "Your timing sharpens as you learn to watch the working muscles and the pads on the movement arm.",
          at(CLICKER, 10),
        ),
      ],
    },
    {
      id: "timers",
      title: "Three timers, never the same thing",
      blocks: [
        bullet("Session time: the clock for the whole workout, about twenty minutes.", at(FLOOR, 122)),
        bullet(
          "Time on machine: from getting in to getting out, briefing included. It's an estimate, never time under tension.",
          at(FLOOR, 123),
        ),
        bullet("Set time: the actual set or hold, from the stopwatch you stop.", at(FLOOR, 124)),
        para("Stopping the stopwatch fills in the set's seconds. It never changes time on machine.", at(FLOOR, 126, 127)),
      ],
    },
    {
      id: "order",
      title: "When the floor changes the order",
      blocks: [
        para(
          "The floor is shared. If another trainer is on the compound row, it moves later and the next machine goes ahead of it.",
          at(FLOOR, 147, 149),
        ),
        para("Changing today's order is normal. It's today's order only; the routine keeps its own.", at(FLOOR, 150, 153)),
        para(
          "On the last machine, add another if you need to. End Session stays at the top, away from your thumb.",
          at(FLOOR, 276, 278),
        ),
      ],
    },
  ],
  related: [
    {
      route: { kind: "topic", moduleId: "further", topicId: "further-registering-performance-use-of-the-clicker" },
      title: "Registering Performance - Use of the Clicker",
      why: "The Academy's whole page on the clicker.",
    },
    {
      route: { kind: "topic", moduleId: "performance", topicId: "performance-turnaround-technique" },
      title: "Turnaround Technique",
      why: "Where the pause, the squeeze and the click belong.",
    },
    {
      route: { kind: "cueing" },
      title: "Cueing phrasebook",
      why: "What to say at each moment of the set.",
    },
    {
      route: { kind: "playbook", id: "the-twenty-minutes" },
      title: "The twenty minutes",
      why: "The session the kit is for.",
    },
  ],
};
