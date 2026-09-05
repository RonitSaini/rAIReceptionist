import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Which commit is actually serving.
 *
 * Every deploy so far has been verified by finding something about it that a stranger can observe —
 * a route that started answering, a field that appeared in a JSON response. That works until a
 * change is client-side only, and then there is nothing to look at: the last one (a list animation)
 * could not be confirmed from outside the login page at all, because the only evidence was inside a
 * code-split chunk that no public route loads.
 *
 * So the deploy stamps itself. Vercel sets these at build time; this hands back the three that say
 * which build answered, and nothing else. Deliberately NOT a health check — it touches no database
 * and makes no claim about whether anything works, because a health check that lies is worse than
 * none, and naming it `health` would invite exactly that. It answers one question: what is running?
 *
 * Public on purpose. A commit SHA is not a credential, and gating this behind auth would put it back
 * behind the same door that made the problem.
 */
export function GET() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  return NextResponse.json(
    {
      commit,
      // The short form is what a person reads off a terminal and compares by eye.
      shortCommit: commit ? commit.slice(0, 7) : null,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      // "production" | "preview" | "development" — so a preview URL cannot be mistaken for the real one.
      environment: process.env.VERCEL_ENV ?? "development",
    },
    // Never cached: a stale answer here would assert that an old build is the live one, which is the
    // single thing this must not do.
    { headers: { "Cache-Control": "no-store" } },
  );
}
