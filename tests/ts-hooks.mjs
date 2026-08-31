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

// Stripe webhook tests verify an HMAC, and HMAC verification behaves identically with any
// secret - so the test environment supplies a throwaway one. npm test must never reach for a
// production credential; the real signing secret lives only on Vercel and in
// .env.stripe-webhook-production, and nothing here reads either.
process.env.STRIPE_WEBHOOK_SECRET ||= "whsec_localtestonly_0000000000000000000000";

/**
 * next-auth's providers are CJS compiled with `exports.default = fn`. A bundler unwraps that;
 * Node's ESM loader hands back the whole exports object, and `CredentialsProvider(...)` explodes.
 * These specifiers get a one-line synthetic module that re-exports the real default.
 */
const CJS_DEFAULT_INTEROP = new Set(["next-auth/providers/credentials", "next-auth/providers/google"]);
const INTEROP_PREFIX = "frontdesk-interop:";

registerHooks({
  load(url, context, nextLoad) {
    if (url.startsWith(INTEROP_PREFIX)) {
      const real = url.slice(INTEROP_PREFIX.length);
      return { format: "module", source: `import m from ${JSON.stringify(real)}; export default m && m.default ? m.default : m;`, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
  resolve(specifier, context, nextResolve) {
    if (CJS_DEFAULT_INTEROP.has(specifier)) {
      const real = nextResolve(specifier, context);
      return { url: INTEROP_PREFIX + real.url, shortCircuit: true };
    }
    // Library code imports Next's top-level entries — next/server (after()), next/headers
    // (cookies/headers for the terms records), next/navigation (redirect). Next publishes them for
    // bundlers, not for Node's own ESM resolver, so map each to its real shim file. Tests only
    // load them — request-scoped calls all degrade or are never reached outside a request.
    if (/^next\/[a-z-]+$/.test(specifier)) {
      const base = resolvePath(SRC, "../node_modules/next/" + specifier.slice("next/".length));
      const found = withExtension(base) ?? `${base}.js`;
      return { url: pathToFileURL(found).href, shortCircuit: true };
    }
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
