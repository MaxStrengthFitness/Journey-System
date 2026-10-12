/**
 * A Node loader hook for scripts that reach app code which imports a picture
 * or a stylesheet (the FileMaker import round, Oct 12 2026: the machine-name
 * table in src/features/catalog/names.ts reads src/data/machine-database.ts,
 * which imports the machines' photos). Vite handles those imports in the app
 * and in the tests; Node does not, and stops on ".webp". Here each such file
 * loads as an empty string, which a script never shows anyone.
 *
 * Used as: module.register("./lib/stub-assets.mjs", import.meta.url), then a
 * DYNAMIC import of the module that reaches the pictures (a static import is
 * loaded before any of the script's own code runs).
 */
const ASSET = /\.(webp|png|jpe?g|gif|svg|avif|css)(\?.*)?$/i;

export async function load(url, context, nextLoad) {
  if (ASSET.test(url)) return { format: "module", source: 'export default "";', shortCircuit: true };
  return nextLoad(url, context);
}
