/**
 * A small static import walker for the two guards in this folder
 * (deep-link.imports.test.ts, floor-guard.test.ts), in the shape of
 * src/first-screen.test.ts's. Test code only: nothing in the app imports it.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\s+(type\s+)?([^;"'`]*?)\s*from\s*["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

/**
 * The static, non-type imports of a src file, as src-relative paths with "/"
 * (packages are left out). `withLazy` also follows dynamic `import()`s: a
 * screen that lazy-loads a door still has that door.
 */
export function importsOf(rel: string, withLazy = true): string[] {
  if (!/\.(ts|tsx)$/.test(rel)) return [];
  const text = readFileSync(join(SRC, rel), "utf8");
  const out: string[] = [];
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[5] ?? m[4] ?? m[3];
    if (m[5] && !withLazy) continue;
    if (!m[4] && !m[5]) {
      if (m[1]) continue; // import type
      const named = /^\{([\s\S]*)\}$/.exec(m[2].trim());
      if (named) {
        const parts = named[1].split(",").map((s) => s.trim()).filter(Boolean);
        if (parts.length && parts.every((p) => p.startsWith("type "))) continue;
      }
    }
    if (!spec.startsWith(".") && !spec.startsWith("@/")) continue;
    const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : join(dirname(join(SRC, rel)), spec);
    for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      const candidate = base + ext;
      if (/\.(ts|tsx)$/.test(candidate) && existsSync(candidate) && statSync(candidate).isFile()) {
        out.push(relative(SRC, candidate).replace(/\\/g, "/"));
        break;
      }
    }
  }
  return out;
}

/** Every src file reachable from `roots`, with the chain that first reached it. */
export function reachable(roots: string[], withLazy = true): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const queue: string[][] = roots.map((r) => [r]);
  while (queue.length) {
    const chain = queue.shift()!;
    const file = chain[chain.length - 1];
    if (seen.has(file)) continue;
    seen.set(file, chain);
    for (const next of importsOf(file, withLazy)) {
      if (!seen.has(next)) queue.push([...chain, next]);
    }
  }
  return seen;
}

/** The app's source files under a src-relative folder (tests and helpers left out). */
export function appFilesUnder(rel: string): string[] {
  const dir = join(SRC, rel);
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "__tests__") continue;
      out.push(...appFilesUnder(`${rel}/${name}`));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts")) {
      out.push(`${rel}/${name}`);
    }
  }
  return out;
}

export function chainWords(chain: string[]): string {
  return chain.join("\n    -> ");
}
