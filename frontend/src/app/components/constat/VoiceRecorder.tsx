"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// Minimal typing of the Web Speech API (prefixed in Chromium/Edge, absent from lib.dom).
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function createRecognition(): Recognition | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

/**
 * Records a voice message (kept as audio evidence) and transcribes it live in French
 * with the browser's speech recognition when available.
 */
export default function VoiceRecorder({
  onTranscript,
  onAudio,
}: {
  onTranscript: (text: string) => void;
  onAudio: (audio: Blob) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState<{ audio: boolean; speech: boolean } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const finalText = useRef("");

  useEffect(() => {
    const id = setTimeout(
      () => setSupported({ audio: typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices, speech: createRecognition() !== null }),
      0
    );
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  async function start() {
    finalText.current = "";
    setInterim("");
    setSeconds(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        onAudio(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
      };
      recorder.start();
      recorderRef.current = recorder;
    } catch {
      recorderRef.current = null;
    }

    const recognition = createRecognition();
    if (recognition) {
      recognition.lang = "fr-FR";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (e) => {
        let partial = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const text = e.results[i][0].transcript;
          if (e.results[i].isFinal) finalText.current += `${text.trim()}. `;
          else partial += text;
        }
        setInterim(partial);
        onTranscript(finalText.current.trim());
      };
      recognition.start();
      recognitionRef.current = recognition;
    }
    setRecording(true);
  }

  function stop() {
    recorderRef.current?.stop();
    recognitionRef.current?.stop();
    setRecording(false);
    setInterim("");
  }

  if (supported && !supported.audio && !supported.speech) {
    return <p className="text-xs text-muted-foreground">Enregistrement vocal non disponible sur ce navigateur : décrivez l&apos;accident par écrit.</p>;
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={recording ? stop : start}
        className={cn(
          "relative grid size-14 shrink-0 place-items-center rounded-full text-white transition active:scale-95",
          recording ? "bg-red-500" : "bg-gradient-to-br from-fuchsia-500 to-indigo-500"
        )}
        aria-label={recording ? "Arrêter" : "Enregistrer"}
      >
        {recording && <span className="absolute inset-0 rounded-full ring-2 ring-red-400 animate-pulse-ring" />}
        {recording ? <Square className="size-5 fill-current" /> : <Mic className="size-6" />}
      </button>
      <div className="min-w-0 flex-1 text-xs">
        {recording ? (
          <>
            <p className="flex items-center gap-2 font-medium text-red-300">
              <span className="flex h-4 items-end gap-0.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className="w-1 animate-pulse rounded-full bg-red-300" style={{ height: `${6 + ((i * 7 + seconds * 3) % 10)}px`, animationDelay: `${i * 120}ms` }} />
                ))}
              </span>
              Enregistrement · {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
            </p>
            <p className="mt-1 truncate italic text-muted-foreground">{interim || "Parlez naturellement…"}</p>
          </>
        ) : (
          <p className="text-muted-foreground">
            Décrivez l&apos;accident à voix haute.
            {supported?.speech ? " Transcription automatique en français." : " (Transcription auto indisponible : complétez le texte.)"}
          </p>
        )}
      </div>
    </div>
  );
}
