"use client";

import { useActionState, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { saveVoice, setVoiceQuick } from "@/actions/onboarding";
import type { AccountView } from "@/lib/serialize";
import { VOICES } from "@/lib/constants";
import { generateGreeting, greetingHasDisclosure } from "@/lib/greeting";
import { Button, Field, Input, Textarea, inputClass } from "@/components/ui";
import { FormFooter, type FormMode } from "@/components/form-footer";
import { WebTestCall } from "@/components/web-test-call";
import { ActionForm } from "@/components/action-form";

type VoiceSample = { id: string; name: string; available: boolean; previewUrl: string | null };
type VoiceOption = { id: string; name: string; provider: string; gender: string | null; accent: string | null; age: string | null; recommended: boolean; previewUrl: string | null };

const PROVIDER_LABEL: Record<string, string> = { elevenlabs: "ElevenLabs", cartesia: "Cartesia", platform: "Retell", inworld: "Inworld", openai: "OpenAI", minimax: "MiniMax", fish_audio: "Fish Audio" };

/** Browser speech synthesis is the fallback when Retell voice previews aren't available. */
function speak(text: string, pitch: number, rate: number) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.pitch = pitch;
  u.rate = rate;
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
  if (voices.length) u.voice = voices[Math.abs(Math.round(pitch * 10)) % voices.length];
  window.speechSynthesis.speak(u);
}

export function VoiceForm({ account, mode }: { account: AccountView; mode: FormMode }) {
  const [state, action, pending] = useActionState(saveVoice, null);
  const [voiceId, setVoiceIdState] = useState(account.voiceId);
  const [voiceSave, setVoiceSave] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingVoice, startSavingVoice] = useTransition();

  /** Picking a voice saves it immediately and rebuilds the agent — no need to submit the form. */
  function setVoiceId(id: string) {
    setVoiceIdState(id);
    setVoiceSave(null);
    startSavingVoice(async () => {
      const r = await setVoiceQuick(id);
      const name = VOICES.find((v) => v.id === id)?.name ?? all.find((v) => v.id === id)?.name ?? id;
      setVoiceSave(r?.ok ? { ok: true, text: `${name} saved — your AI host now uses this voice.` } : { ok: false, text: r?.error ?? "Could not save the voice." });
    });
  }
  const [hostName, setHostName] = useState(account.hostName);
  const [greeting, setGreeting] = useState(account.greeting ?? generateGreeting(account.businessName, account.hostName));
  const [samples, setSamples] = useState<Record<string, VoiceSample>>({});
  const [all, setAll] = useState<VoiceOption[]>([]);
  const [retellReady, setRetellReady] = useState(false);
  const [browse, setBrowse] = useState(false);
  const [filter, setFilter] = useState<{ gender: "" | "female" | "male"; q: string }>({ gender: "", q: "" });
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canSpeak = useSyncExternalStore(
    () => () => {},
    () => "speechSynthesis" in window,
    () => false,
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/retell/voices")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { configured?: boolean; voices?: VoiceSample[]; all?: VoiceOption[] } | null) => {
        if (cancelled || !data) return;
        if (data.configured) setRetellReady(true);
        if (data.voices) setSamples(Object.fromEntries(data.voices.map((v) => [v.id, v])));
        if (data.all) setAll(data.all);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      audioRef.current?.pause();
    };
  }, []);

  function playUrl(id: string, url: string) {
    audioRef.current?.pause();
    if (playing === id) {
      setPlaying(null);
      return;
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlaying(id);
    audio.onended = () => setPlaying(null);
    audio.onerror = () => setPlaying(null);
    audio.play().catch(() => setPlaying(null));
  }

  function playCurated(v: (typeof VOICES)[number]) {
    const sample = samples[v.id];
    if (sample?.previewUrl) return playUrl(v.id, sample.previewUrl);
    speak(`Hi, I'm ${v.name}. ${v.sampleText}`, v.pitch, v.rate);
  }

  const hasRealSamples = Object.values(samples).some((s) => s.previewUrl);
  const hasDisclosure = greetingHasDisclosure(greeting);
  const curated = VOICES.find((x) => x.id === voiceId);
  const custom = !curated ? all.find((x) => x.id === voiceId) : undefined;
  // Friendly name even before the catalog has loaded ("11labs-Myra" -> "Myra").
  const selectedName = curated?.name ?? custom?.name ?? voiceId.replace(/^(11labs|cartesia|openai|minimax|inworld|fish_audio|retell)-/, "");

  const q = filter.q.trim().toLowerCase();
  const filtered = all.filter((v) => (!filter.gender || v.gender === filter.gender) && (!q || v.name.toLowerCase().includes(q) || v.provider.includes(q) || (v.accent ?? "").toLowerCase().includes(q)));

  return (
    <ActionForm action={action} className="space-y-6">
      <input type="hidden" name="voiceId" value={voiceId} />

      {/* Two columns on desktop: voices left, greeting + test call right (sticky). Stacked on phones. */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start lg:gap-8">
      <section className="space-y-3">
        <h2 className="text-base font-bold">Choose a voice</h2>
        <p className="text-sm text-gray-500">{hasRealSamples ? "Tap play to hear each voice." : "Tap play to hear a preview. (Previews use your browser's voice until the phone system is connected.)"}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {VOICES.map((v) => {
            const selected = v.id === voiceId;
            const sample = samples[v.id];
            const playable = sample?.previewUrl ? true : canSpeak;
            return (
              <div key={v.id} className={`flex items-center justify-between gap-3 rounded-2xl border-2 p-4 ${selected ? "border-brand-600 bg-brand-50" : "border-gray-200 bg-surface"}`}>
                <button type="button" onClick={() => setVoiceId(v.id)} className="flex-1 text-left">
                  <span className="block font-semibold">{v.name}</span>
                  <span className="block text-sm text-gray-500">{v.description}</span>
                  {sample && !sample.available ? <span className="block text-xs text-amber-700">Not available on your Retell account — a similar voice will be used.</span> : null}
                </button>
                <Button type="button" variant="secondary" size="sm" onClick={() => playCurated(v)} disabled={!playable} aria-label={`Play ${v.name} sample`}>
                  {playing === v.id ? "■ Stop" : "▶ Play"}
                </Button>
              </div>
            );
          })}
        </div>

        {custom ? (
          <div className="rounded-2xl border-2 border-brand-600 bg-brand-50 p-4">
            <p className="font-semibold">
              Selected: {custom.name} <span className="text-sm font-normal text-gray-500">· {PROVIDER_LABEL[custom.provider] ?? custom.provider}{custom.accent ? ` · ${custom.accent}` : ""}</span>
            </p>
          </div>
        ) : null}

        <p className="text-xs text-gray-500" role="status" aria-live="polite">
          {savingVoice ? "Saving voice…" : voiceSave ? <span className={voiceSave.ok ? "font-semibold text-brand-700" : "font-semibold text-red-600"}>{voiceSave.text}</span> : `Current voice: ${selectedName}. Picking a voice saves it right away.`}
        </p>

        {all.length > 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-surface">
            <button type="button" onClick={() => setBrowse((b) => !b)} className="flex min-h-12 w-full items-center justify-between px-4 text-left font-semibold">
              <span>Browse all {all.length} voices</span>
              <span aria-hidden="true">{browse ? "▴" : "▾"}</span>
            </button>
            {browse ? (
              <div className="border-t border-gray-100 p-3">
                <div className="mb-3 flex flex-wrap gap-2">
                  {(["", "female", "male"] as const).map((g) => (
                    <button key={g || "all"} type="button" onClick={() => setFilter((f) => ({ ...f, gender: g }))} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${filter.gender === g ? "border-brand-600 bg-brand-50 text-brand-800" : "border-gray-300 text-gray-700"}`}>
                      {g === "" ? "All" : g === "female" ? "Female" : "Male"}
                    </button>
                  ))}
                  <input value={filter.q} onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))} placeholder="Search name, accent, provider" className={`${inputClass} min-h-10 flex-1 basis-40`} aria-label="Search voices" />
                </div>
                <p className="mb-2 text-xs text-gray-500">★ = recommended by Retell. ElevenLabs and Cartesia voices generally sound the most natural on phone calls.</p>
                <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto">
                  {filtered.map((v) => {
                    const selected = v.id === voiceId;
                    return (
                      <li key={v.id} className={`flex items-center justify-between gap-2 py-2 ${selected ? "bg-brand-50" : ""}`}>
                        <button type="button" onClick={() => setVoiceId(v.id)} className="min-w-0 flex-1 px-2 text-left">
                          <span className="block text-sm font-semibold">
                            {v.recommended ? "★ " : ""}
                            {v.name}
                          </span>
                          <span className="block truncate text-xs text-gray-500">
                            {PROVIDER_LABEL[v.provider] ?? v.provider}
                            {v.gender ? ` · ${v.gender}` : ""}
                            {v.accent ? ` · ${v.accent}` : ""}
                            {v.age ? ` · ${v.age.toLowerCase()}` : ""}
                          </span>
                        </button>
                        <Button type="button" variant="secondary" size="sm" disabled={!v.previewUrl} onClick={() => v.previewUrl && playUrl(v.id, v.previewUrl)} aria-label={`Play ${v.name}`}>
                          {playing === v.id ? "■" : "▶"}
                        </Button>
                        <Button type="button" variant={selected ? "primary" : "ghost"} size="sm" onClick={() => setVoiceId(v.id)}>
                          {selected ? "Selected" : "Use"}
                        </Button>
                      </li>
                    );
                  })}
                  {filtered.length === 0 ? <li className="py-4 text-center text-sm text-gray-500">No voices match.</li> : null}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="space-y-6 lg:sticky lg:top-20">
      <section className="space-y-3">
        <h2 className="text-base font-bold">Greeting</h2>
        <Field label="Name the AI uses for itself" htmlFor="hostName">
          <Input id="hostName" name="hostName" value={hostName} onChange={(e) => setHostName(e.target.value)} maxLength={40} required />
        </Field>
        <Field label="Greeting" htmlFor="greeting" hint='Must include "this call may be recorded".'>
          <Textarea id="greeting" name="greeting" value={greeting} onChange={(e) => setGreeting(e.target.value)} rows={4} required />
        </Field>
        {!hasDisclosure ? <p className="text-sm font-semibold text-red-600">Add &ldquo;this call may be recorded&rdquo; to the greeting.</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setGreeting(generateGreeting(account.businessName, hostName))}>
            Regenerate greeting
          </Button>
        </div>
      </section>

      <FormFooter state={state} pending={pending} mode={mode} backHref="/onboarding/5" />

      <section className="space-y-3">
        <h2 className="text-base font-bold">Hear it for real</h2>
        <p className="text-sm text-gray-500">The test call uses {selectedName}. If you edited the greeting or host name, save the form first.</p>
        {retellReady ? <WebTestCall hostName={hostName} /> : <p className="text-sm text-gray-500">Browser test calls become available once RETELL_API_KEY is configured.</p>}
      </section>
      </div>
      </div>
    </ActionForm>
  );
}
