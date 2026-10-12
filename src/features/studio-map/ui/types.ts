/**
 * The editor's props, apart from its screen, so a host imports only types
 * and lazy.tsx (the editor and the drawing stay off the first screen).
 */

export interface LayoutViewProps {
  studioId: string;
  studioName: string;
  /** Only a studio's leaders arrange its floor; anyone else gets one line and Back. */
  canLead: boolean;
  /** The Auth uid: the rules pin `updatedBy` to it. */
  authUid: string | null;
  /** The writer's name, for a copy kept as a draft ("AJ's, Oct 12 3:40 PM"). */
  authorName: string | null;
  /** Demo Mode: the practice layout is one tap away. */
  isDemo: boolean;
  /** A trainer's name from their uid, from the list the host already has. */
  nameOf?: (uid: string) => string | null;
  /** Back to the map (through the host's leave guard). */
  onDone: () => void;
}
