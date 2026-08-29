import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listVoices } from "@/lib/retell";
import { retellConfigured } from "@/lib/env";
import { VOICES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export type VoiceOption = {
  id: string;
  name: string;
  provider: string;
  gender: string | null;
  accent: string | null;
  age: string | null;
  recommended: boolean;
  previewUrl: string | null;
};

/** Providers ordered by how natural they tend to sound on phone calls. */
const PROVIDER_ORDER = ["elevenlabs", "cartesia", "platform", "inworld", "openai", "minimax", "fish_audio"];

/**
 * Voices for the Voice step: our curated defaults (with Retell preview audio) plus the full
 * English catalog so the owner can audition and pick any voice.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!retellConfigured()) return NextResponse.json({ configured: false, voices: [], all: [] }, { status: 200 });

  try {
    const catalog = await listVoices();
    const voices = VOICES.map((v) => {
      const match = catalog.find((x) => x.voice_id === v.id);
      return { id: v.id, name: v.name, available: !!match, previewUrl: match?.preview_audio_url ?? null };
    });

    const all: VoiceOption[] = catalog
      // English-speaking voices only; localized variants carry a language tag in the name.
      .filter((x) => !/\((?!en)[a-z]{2}-[A-Z]{2}\)/.test(x.voice_name) && !/localized/i.test(x.voice_id))
      .filter((x) => !x.accent || /american|british|australian|canadian|indian/i.test(x.accent))
      .map((x) => ({
        id: x.voice_id,
        name: x.voice_name,
        provider: x.provider,
        gender: x.gender ? x.gender.toLowerCase() : null,
        accent: x.accent ?? null,
        age: x.age ?? null,
        recommended: !!(x as { recommended?: boolean }).recommended,
        previewUrl: x.preview_audio_url ?? null,
      }))
      .sort((a, b) => {
        if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
        const pa = PROVIDER_ORDER.indexOf(a.provider);
        const pb = PROVIDER_ORDER.indexOf(b.provider);
        if (pa !== pb) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
        return a.name.localeCompare(b.name);
      });

    return NextResponse.json({ configured: true, voices, all }, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (e) {
    return NextResponse.json({ configured: true, voices: [], all: [], error: e instanceof Error ? e.message : "Could not load voices" }, { status: 200 });
  }
}
