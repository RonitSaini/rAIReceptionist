"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RetellWebClient } from "retell-client-js-sdk";
import { Alert, Button } from "@/components/ui";

type Status = "idle" | "starting" | "connected" | "ended" | "error";
type Line = { role: "agent" | "user"; content: string };

/**
 * In-browser test call with the restaurant's AI host (Retell web call over WebRTC).
 * Uses the saved settings — the agent is rebuilt from them right before the call starts.
 */
export function WebTestCall({ hostName, compact = false }: { hostName: string; compact?: boolean }) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [agentTalking, setAgentTalking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState<Line[]>([]);
  const [callId, setCallId] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const clientRef = useRef<RetellWebClient | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const end = useCallback(() => {
    clientRef.current?.stopCall();
  }, []);

  useEffect(() => () => clientRef.current?.stopCall(), []);

  useEffect(() => {
    if (status !== "connected") return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [transcript]);

  async function start() {
    setError(null);
    setTranscript([]);
    setSeconds(0);
    setMuted(false);
    setStatus("starting");
    try {
      const res = await fetch("/api/retell/web-call", { method: "POST" });
      const data = (await res.json()) as { accessToken?: string; callId?: string; error?: string };
      if (!res.ok || !data.accessToken) throw new Error(data.error ?? "Could not start the call.");
      setCallId(data.callId ?? null);

      const { RetellWebClient } = await import("retell-client-js-sdk");
      const client = new RetellWebClient();
      clientRef.current = client;
      client.on("call_started", () => setStatus("connected"));
      client.on("call_ended", () => {
        setStatus("ended");
        setAgentTalking(false);
      });
      client.on("agent_start_talking", () => setAgentTalking(true));
      client.on("agent_stop_talking", () => setAgentTalking(false));
      client.on("update", (u: { transcript?: Line[] }) => {
        if (u.transcript) setTranscript(u.transcript);
      });
      client.on("error", (e: unknown) => {
        setError(e instanceof Error ? e.message : typeof e === "string" ? e : "Call error");
        setStatus("error");
        client.stopCall();
      });
      await client.startCall({ accessToken: data.accessToken, sampleRate: 24000 });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }

  function toggleMute() {
    const c = clientRef.current;
    if (!c) return;
    if (muted) c.unmute();
    else c.mute();
    setMuted(!muted);
  }

  const live = status === "starting" || status === "connected";
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className={`rounded-2xl border p-4 ${live ? "border-brand-600 bg-brand-50" : "border-gray-200 bg-surface"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Test call in your browser</p>
          <p className="text-sm text-gray-500">
            {status === "idle" && `Talk to ${hostName} using your microphone. Uses your saved settings.`}
            {status === "starting" && "Connecting… allow microphone access if asked."}
            {status === "connected" && (
              <span className="inline-flex items-center gap-2">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${agentTalking ? "animate-pulse bg-brand-600" : "bg-green-500"}`} />
                {agentTalking ? `${hostName} is speaking` : "Listening"} · {mm}:{ss}
              </span>
            )}
            {status === "ended" && `Call ended after ${mm}:${ss}.`}
            {status === "error" && "Something went wrong."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {live ? (
            <>
              <Button type="button" variant="secondary" size="sm" onClick={toggleMute} disabled={status !== "connected"}>
                {muted ? "Unmute" : "Mute"}
              </Button>
              <Button type="button" variant="danger" size="sm" onClick={end}>
                End call
              </Button>
            </>
          ) : (
            <Button type="button" size={compact ? "sm" : "md"} onClick={start}>
              🎧 {status === "idle" ? "Start test call" : "Call again"}
            </Button>
          )}
        </div>
      </div>

      {error ? (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {transcript.length > 0 ? (
        <div ref={transcriptRef} className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-xl bg-surface p-3">
          {transcript.map((t, i) => (
            <div key={i} className={`flex ${t.role === "agent" ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${t.role === "agent" ? "bg-brand-100 text-brand-900" : "bg-gray-100 text-gray-900"}`}>
                <span className="block text-[11px] font-semibold uppercase tracking-wide opacity-60">{t.role === "agent" ? hostName : "You"}</span>
                {t.content}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {status === "ended" && callId ? (
        <p className="mt-3 text-sm">
          <Link href={`/calls/${callId}`} className="font-semibold text-brand-700">
            View this call&apos;s recording and transcript
          </Link>{" "}
          <span className="text-gray-500">(recording and summary arrive a few seconds after the call ends)</span>
        </p>
      ) : null}
    </div>
  );
}
