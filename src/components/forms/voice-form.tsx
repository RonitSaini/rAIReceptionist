"use client";

import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { saveVoice } from "@/actions/onboarding";
import type { AccountView } from "@/lib/serialize";
import { VOICES } from "@/lib/constants";
import { generateGreeting, greetingHasDisclosure } from "@/lib/greeting";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { FormFooter, type FormMode } from "@/components/form-footer";

type VoiceSample = { id: string; name: string; available: boolean; previewUrl: string | null };

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
  const [voiceId, setVoiceId] = useState(account.voiceId);
  const [hostName, setHostName] = useState(account.hostName);
  const [greeting, setGreeting] = useState(account.greeting ?? generateGreeting(account.restaurantName, account.hostName));
  const [samples, setSamples] = useState<Record<string, VoiceSample>>({});
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canSpeak = useSyncExternalStore(
    () => () => {},
    () => "speechSynthesis" in window,
    () => false,
  );

  // Real Retell voice samples when the API key is configured.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/retell/voices")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { voices?: VoiceSample[] } | null) => {
        if (cancelled || !data?.voices) return;
        setSamples(Object.fromEntries(data.voices.map((v) => [v.id, v])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function play(v: (typeof VOICES)[number]) {
    const sample = samples[v.id];
    if (sample?.previewUrl) {
      audioRef.current?.pause();
      const audio = new Audio(sample.previewUrl);
      audioRef.current = audio;
      setPlaying(v.id);
      audio.onended = () => setPlaying(null);
      audio.onerror = () => setPlaying(null);
      audio.play().catch(() => setPlaying(null));
      return;
    }
    speak(`Hi, I'm ${v.name}. ${v.sampleText}`, v.pitch, v.rate);
  }

  const hasRealSamples = Object.values(samples).some((s) => s.previewUrl);
  const hasDisclosure = greetingHasDisclosure(greeting);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="voiceId" value={voiceId} />

      <section className="space-y-3">
        <h2 className="text-base font-bold">Choose a voice</h2>
        <p className="text-sm text-gray-500">{hasRealSamples ? "Tap play to hear each voice." : "Tap play to hear a preview. (Previews use your browser's voice until the phone system is connected.)"}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {VOICES.map((v) => {
            const selected = v.id === voiceId;
            const sample = samples[v.id];
            const playable = sample?.previewUrl ? true : canSpeak;
            return (
              <div key={v.id} className={`flex items-center justify-between gap-3 rounded-2xl border-2 p-4 ${selected ? "border-brand-600 bg-brand-50" : "border-gray-200 bg-white"}`}>
                <button type="button" onClick={() => setVoiceId(v.id)} className="flex-1 text-left">
                  <span className="block font-semibold">{v.name}</span>
                  <span className="block text-sm text-gray-500">{v.description}</span>
                  {sample && !sample.available ? <span className="block text-xs text-amber-700">Not available on your Retell account — a similar voice will be used.</span> : null}
                </button>
                <Button type="button" variant="secondary" size="sm" onClick={() => play(v)} disabled={!playable} aria-label={`Play ${v.name} sample`}>
                  {playing === v.id ? "▶ Playing" : "▶ Play"}
                </Button>
              </div>
            );
          })}
        </div>
      </section>

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
          <Button type="button" variant="secondary" size="sm" onClick={() => setGreeting(generateGreeting(account.restaurantName, hostName))}>
            Regenerate greeting
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={!canSpeak} onClick={() => { const v = VOICES.find((x) => x.id === voiceId) ?? VOICES[0]; speak(greeting, v.pitch, v.rate); }}>
            ▶ Read greeting aloud (browser voice)
          </Button>
        </div>
        <p className="text-xs text-gray-500">
          The read-aloud button uses your browser&apos;s built-in voice to check wording only. To hear {VOICES.find((x) => x.id === voiceId)?.name ?? "your chosen voice"} say the greeting for real, use <strong>Call me to test</strong> on the Phone step.
        </p>
      </section>

      <FormFooter state={state} pending={pending} mode={mode} backHref="/onboarding/5" />
    </form>
  );
}
