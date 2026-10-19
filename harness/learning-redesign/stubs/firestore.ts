/**
 * firebase/firestore, for the Learning redesign preview: the real module, with every
 * call that would reach a database answered here from the sample instead
 * (sample.ts). Reads answer once; writes are kept on `window.__writes` so a
 * screenshot run can see them; nothing leaves the page. It never ships.
 */
export * from "firebase/firestore";
import { PREVIEW_DOCS } from "../sample";

type Ref = { __path: string; __doc?: boolean };
const path = (parts: unknown[]) => parts.filter((p) => typeof p === "string").join("/");
const writes: { op: string; path: string; data?: unknown }[] = [];
(window as unknown as { __writes: typeof writes }).__writes = writes;

function snapOf(p: string) {
  const rows = PREVIEW_DOCS(p);
  const docs = rows.map((d) => ({ id: String(d.id), data: () => d, exists: () => true, ref: { __path: `${p}/${d.id}` } }));
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    metadata: { fromCache: false, hasPendingWrites: false },
    forEach: (fn: (d: unknown) => void) => docs.forEach(fn),
    docChanges: () => docs.map((doc) => ({ type: "added", doc })),
  };
}
const docSnap = (p: string) => ({ id: p.split("/").pop(), exists: () => false, data: () => undefined, metadata: { fromCache: false } });

export const collection = (_db: unknown, ...parts: unknown[]): Ref => ({ __path: path(parts) });
export const collectionGroup = (_db: unknown, id: string): Ref => ({ __path: `**/${id}` });
export const doc = (_db: unknown, ...parts: unknown[]): Ref => ({ __path: path(parts), __doc: true });
export const query = (ref: Ref) => ref;
export const where = () => ({});
export const orderBy = () => ({});
export const limit = () => ({});
export const limitToLast = () => ({});
export const startAfter = () => ({});
export const endBefore = () => ({});
export const and = () => ({});
export const or = () => ({});
export const documentId = () => "__name__";
export const serverTimestamp = () => new Date();
export const increment = (n: number) => n;
export const arrayUnion = (...v: unknown[]) => v;
export const arrayRemove = (...v: unknown[]) => v;
export const deleteField = () => null;

export function onSnapshot(ref: Ref, next?: unknown, _error?: unknown) {
  const cb = typeof next === "function" ? next : (next as { next?: (s: unknown) => void } | undefined)?.next;
  setTimeout(() => cb?.(ref.__doc ? docSnap(ref.__path) : snapOf(ref.__path)), 0);
  return () => {};
}
export const getDocs = async (ref: Ref) => snapOf(ref.__path);
export const getDocsFromCache = getDocs;
export const getDocsFromServer = getDocs;
export const getDoc = async (ref: Ref) => docSnap(ref.__path);
export const getDocFromCache = getDoc;
export const getDocFromServer = getDoc;
export const getCountFromServer = async (ref: Ref) => ({ data: () => ({ count: snapOf(ref.__path).size }) });
export const addDoc = async (ref: Ref, data: unknown) => {
  writes.push({ op: "add", path: ref.__path, data });
  return { id: `preview-${writes.length}` };
};
export const setDoc = async (ref: Ref, data: unknown) => void writes.push({ op: "set", path: ref.__path, data });
export const updateDoc = async (ref: Ref, data: unknown) => void writes.push({ op: "update", path: ref.__path, data });
export const deleteDoc = async (ref: Ref) => void writes.push({ op: "delete", path: ref.__path });
export function writeBatch() {
  const ops: { op: string; path: string; data?: unknown }[] = [];
  return {
    set: (ref: Ref, data: unknown) => ops.push({ op: "set", path: ref.__path, data }),
    update: (ref: Ref, data: unknown) => ops.push({ op: "update", path: ref.__path, data }),
    delete: (ref: Ref) => ops.push({ op: "delete", path: ref.__path }),
    commit: async () => void writes.push(...ops),
  };
}
