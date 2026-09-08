import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

/**
 * What the public web is told about this site (2026-09-08, after the launch audit found no
 * sitemap, no robots.txt and no Open Graph card). The lists live in src/lib/site.ts; these hold
 * the routes to them and the lists to the app's real directory layout.
 */

process.env.NEXT_PUBLIC_APP_URL ??= "https://www.frontdeskai.dev";
const { PUBLIC_PATHS, PRIVATE_PREFIXES } = await import("@/lib/site");
const sitemap = (await import("../src/app/sitemap.ts")).default;
const robots = (await import("../src/app/robots.ts")).default;

test("the sitemap lists exactly the public pages, as absolute URLs on the app's domain", () => {
  const entries = sitemap();
  const base = process.env.NEXT_PUBLIC_APP_URL;
  assert.deepEqual(entries.map((e) => e.url), PUBLIC_PATHS.map((p) => `${base}${p === "/" ? "" : p}`));
  for (const e of entries) assert.ok(e.url.startsWith("https://"), e.url);
  assert.equal(entries[0].priority, 1);
});

test("robots allows the site, keeps crawlers out of the API, onboarding and every signed-in route, and names the sitemap", () => {
  const r = robots();
  assert.equal(r.rules.allow, "/");
  assert.equal(r.sitemap, `${process.env.NEXT_PUBLIC_APP_URL}/sitemap.xml`);
  const disallow = r.rules.disallow;
  for (const p of ["/api/", "/onboarding/"]) assert.ok(disallow.includes(p), p);
  // Every route directory under the signed-in group must be covered, so a new page is private by default.
  // Route groups ((lists), (detail)) are not URL segments: look through them to the real route directories.
  const appDir = new URL("../src/app/(app)/", import.meta.url);
  const appRoutes = readdirSync(appDir, { withFileTypes: true }).filter((d) => d.isDirectory()).flatMap((d) => (d.name.startsWith("(") ? readdirSync(new URL(`${d.name}/`, appDir), { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => `/${x.name}`) : [`/${d.name}`]));
  for (const route of appRoutes) assert.ok(disallow.some((p) => route === p || route.startsWith(p)), `${route} is not disallowed`);
  // And no public page is.
  for (const p of PUBLIC_PATHS) assert.ok(!disallow.some((d) => p !== "/" && p.startsWith(d)), `${p} is public but disallowed`);
  assert.equal(new Set(PRIVATE_PREFIXES).size, PRIVATE_PREFIXES.length, "no duplicate prefixes");
});

test("the Open Graph card is a 1200x630 PNG built from the wordmark, and Twitter re-uses it", () => {
  // Read as source: the test loader handles .ts, not .tsx, and the image itself is checked on the running app.
  const og = readFileSync(new URL("../src/app/opengraph-image.tsx", import.meta.url), "utf8");
  assert.match(og, /export const size = \{ width: 1200, height: 630 \}/);
  assert.match(og, /export const contentType = "image\/png"/);
  assert.match(og, /export const alt = /);
  assert.match(og, /public\/logo\.png/);
  const tw = readFileSync(new URL("../src/app/twitter-image.tsx", import.meta.url), "utf8");
  assert.match(tw, /export \{ default, alt, size, contentType \} from "\.\/opengraph-image"/);
});
