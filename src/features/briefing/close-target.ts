/**
 * WHERE THE BRIEFING'S CLOSE GOES, AND WHAT IT SAYS (the briefing round, Oct
 * 17 2026; AJ's F4, "a", Oct 16 2026: "The briefing's X returns to where
 * Start was tapped", and Back says where it goes: "Back to the Hub", "Back to
 * Calendar").
 *
 * Until this round the close always opened the client's profile, whatever
 * door Start was tapped from. AppContent remembers the screen a session was
 * opened from (`sessionFrom`); this answers where that is and how the button
 * names it. A screen it doesn't know goes where the close always went, the
 * profile. The leave gate still asks first when something is typed.
 */
import type { View } from "../../types";

export interface CloseTarget {
  view: View;
  words: string;
}

const WORDS: Partial<Record<View, string>> = {
  clients: "Back to the Hub",
  calendar: "Back to Calendar",
  "client-directory": "Back to Clients",
  "studio-tasks": "Back to My Studio",
  learning: "Back to Learning",
  "admin-dashboard": "Back to Operations",
};

export function closeTargetOf(from: View | null | undefined, firstName?: string | null): CloseTarget {
  if (from && from !== "profile" && from !== "workouts" && WORDS[from]) return { view: from, words: WORDS[from]! };
  const name = (firstName ?? "").trim();
  return { view: "profile", words: name ? `Back to ${name}'s profile` : "Back to the profile" };
}
