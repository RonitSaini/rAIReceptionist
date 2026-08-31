/**
 * Lets `node --test` import the app's TypeScript modules directly.
 *
 * Node strips types on its own, but it will not resolve the two things the app's source relies
 * on for module specifiers: extensionless relative imports (`./retell`) and the `@/` alias that
 * maps to `src/`. This registers a synchronous resolve hook that supplies both, so a test can
 * call the real `buildGeneralPrompt` rather than a copy of it. No bundler, no new dependency.
 *
 * Used with: node --import ./tests/ts-hooks.mjs --test tests/*.test.mjs
 */
import { registerHooks } from "node:module";
import { statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const SRC = resolvePath(dirname(fileURLToPath(import.meta.url)), "../src");

const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

/**
 * `./foo` -> `./foo.ts` / `./foo.tsx` / `./foo/index.ts`, mirroring TypeScript's own resolution.
 * The directory itself must not win: `@/verticals` is a folder AND a module, and returning the
 * folder makes Node try to read a directory as source.
 */
function withExtension(path) {
  for (const candidate of [path, `${path}.ts`, `${path}.tsx`, `${path}/index.ts`, `${path}/index.tsx`]) {
    if (isFile(candidate)) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const found = withExtension(resolvePath(SRC, specifier.slice(2)));
      if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
    }
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const found = withExtension(resolvePath(dirname(fileURLToPath(context.parentURL)), specifier));
      if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
