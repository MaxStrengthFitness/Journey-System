/**
 * The app's src/firebase.ts, for the briefing preview: no app, no network,
 * nobody's data. The preview's vite.config.ts points every import of
 * src/firebase here. It never ships.
 */
export const db = { __preview: true };
export const auth = { currentUser: { uid: "uid-preview" } };
export const googleProvider = {};
export const browserPopupRedirectResolver = {};
export const signInWithPopup = async () => {
  throw new Error("The briefing preview signs nobody in.");
};
export function prepareSignIn(): Promise<void> {
  return Promise.resolve();
}
export function signInNeedsHelperFirst(): boolean {
  return false;
}
