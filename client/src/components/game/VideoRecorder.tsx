/**
 * VideoRecorder Component
 *
 * One take. No retries. No preview. No pause. Auto-sends on stop.
 *
 * Hard constraints enforced client-side:
 * - Max 15 seconds
 * - No gallery uploads
 * - No re-record
 * - No trimming
 * - No review before send
 * - Recording auto-starts → auto-sends on stop
 */

import { useRef, useState, useCallback, useEffect } from "react";
import { Video, Circle, Square } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_DURATION_MS = 15_000;
const MAX_DURATION_S = MAX_DURATION_MS / 1000;

interface VideoRecorderProps {
  onRecordingComplete: (blob: Blob, durationMs: number) => void;
  disabled?: boolean;
  className?: string;
}

type RecorderState = "idle" | "requesting" | "recording" | "sent";

export function VideoRecorder({ onRecordingComplete, disabled, className }: VideoRecorderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef(onRecordingComplete);

  const [state, setState] = useState<RecorderState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Keep callback ref current to avoid stale closures
  useEffect(() => {
    onCompleteRef.current = onRecordingComplete;
  }, [onRecordingComplete]);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.onerror = null;
      if (mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const startRecording = useCallback(async () => {
    if (state !== "idle" || disabled) return;

    setState("requesting");
    setError(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        await videoRef.current.play();
      }

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm",
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const durationMs = Math.min(Date.now() - startTimeRef.current, MAX_DURATION_MS);
        const blob = new Blob(chunksRef.current, { type: "video/webm" });

        cleanup();
        setState("sent");

        // Auto-send. No preview. No confirmation. Done.
        onCompleteRef.current(blob, durationMs);
      };

      recorder.onerror = () => {
        cleanup();
        setState("idle");
        setError("Recording failed.");
      };

      mediaRecorderRef.current = recorder;
      startTimeRef.current = Date.now();
      recorder.start(100); // collect chunks every 100ms
      setState("recording");

      // Countdown timer
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        setElapsedMs(Math.min(elapsed, MAX_DURATION_MS));
      }, 50);

      // Auto-stop at 15 seconds — hard limit
      autoStopRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, MAX_DURATION_MS);
    } catch {
      cleanup();
      setState("idle");
      setError("Camera access denied.");
    }
  }, [state, disabled, cleanup]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const elapsedS = Math.floor(elapsedMs / 1000);
  const remainingS = MAX_DURATION_S - elapsedS;
  const progress = elapsedMs / MAX_DURATION_MS;

  if (state === "sent") {
    return (
      <div className={cn("flex flex-col items-center gap-4 p-6", className)}>
        <div className="w-16 h-16 rounded-full bg-neutral-800 flex items-center justify-center">
          <Video className="w-8 h-8 text-neutral-400" />
        </div>
        <div className="text-sm text-neutral-400 font-mono">Sent.</div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      {/* Camera viewfinder — only visible during recording */}
      <div className="relative w-full aspect-[9/16] max-h-[400px] bg-black rounded-lg overflow-hidden">
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />

        {state === "recording" && (
          <>
            {/* Timer bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-neutral-800">
              <div
                className="h-full bg-red-500 transition-all duration-100"
                style={{ width: `${progress * 100}%` }}
              />
            </div>

            {/* Time remaining */}
            <div className="absolute top-3 right-3 px-2 py-1 rounded bg-black/60 font-mono text-xs text-red-400">
              {remainingS}s
            </div>

            {/* Recording indicator */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs text-red-400 font-mono">REC</span>
            </div>
          </>
        )}

        {state === "idle" && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Video className="w-10 h-10 text-neutral-600 mx-auto mb-2" />
              <p className="text-xs text-neutral-500">One take. No retries.</p>
            </div>
          </div>
        )}

        {state === "requesting" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-neutral-400 font-mono">Accessing camera...</p>
          </div>
        )}
      </div>

      {error && <div className="text-xs text-red-400">{error}</div>}

      {/* Record / Stop button */}
      {state === "idle" && (
        <button
          onClick={startRecording}
          disabled={disabled}
          className={cn(
            "w-16 h-16 rounded-full border-4 border-red-500 flex items-center justify-center transition-all",
            "hover:border-red-400 active:scale-95",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          type="button"
        >
          <Circle className="w-10 h-10 text-red-500 fill-red-500" />
        </button>
      )}

      {state === "recording" && (
        <button
          onClick={stopRecording}
          className="w-16 h-16 rounded-full border-4 border-red-500 flex items-center justify-center transition-all active:scale-95"
          type="button"
        >
          <Square className="w-6 h-6 text-red-500 fill-red-500" />
        </button>
      )}

      {state === "idle" && (
        <p className="text-xs text-neutral-500 text-center max-w-[200px]">
          Max {MAX_DURATION_S}s. Starts immediately. Auto-sends on stop.
        </p>
      )}
    </div>
  );
}
