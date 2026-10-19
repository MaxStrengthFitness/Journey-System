/**
 * The app's src/firebase.ts, for the Learning redesign preview: no app, no network,
 * nobody's data. The preview's vite.config.ts points every import of
 * src/firebase here. It never ships.
 */
export const db = { __preview: true };
// The signed-in person's Auth uid (Learning reads auth.currentUser?.uid).
export const auth = { currentUser: { uid: "uid-sam-lee" } };
export const googleProvider = {};
export const browserPopupRedirectResolver = {};
export const signInWithPopup = async () => {
  throw new Error("The Learning preview signs nobody in.");
};
export function prepareSignIn(): Promise<void> {
  return Promise.resolve();
}
export function signInNeedsHelperFirst(): boolean {
  return false;
}
