import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listVoices } from "@/lib/retell";
import { retellConfigured } from "@/lib/env";
import { VOICES } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * Real voice samples for the Voice step. Returns our curated voices with Retell's preview audio when the
 * API key is configured; the client falls back to browser speech synthesis otherwise.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!retellConfigured()) return NextResponse.json({ configured: false, voices: [] }, { status: 200 });

  try {
    const all = await listVoices();
    const voices = VOICES.map((v) => {
      const match = all.find((x) => x.voice_id === v.id);
      return { id: v.id, name: v.name, available: !!match, previewUrl: match?.preview_audio_url ?? null };
    });
    return NextResponse.json({ configured: true, voices }, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (e) {
    return NextResponse.json({ configured: true, voices: [], error: e instanceof Error ? e.message : "Could not load voices" }, { status: 200 });
  }
}
