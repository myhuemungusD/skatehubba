import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Video, Pause, RotateCcw, Check, X } from "lucide-react";
import { logger } from "../../lib/logger";

const MAX_RECORDING_SECONDS = 60;

/** Pick the best supported video MIME type for MediaRecorder */
function getSupportedMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4",
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "";
}

interface TrickRecorderProps {
  spotId: string;
  onRecordComplete?: (videoBlob: Blob, trickName: string) => void;
  onClose?: () => void;
}

export default function TrickRecorder({ spotId, onRecordComplete, onClose }: TrickRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [trickName, setTrickName] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera recording is not supported in this browser.");
      return;
    }

    try {
      let stream: MediaStream;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: true,
        });
      } catch (constraintError) {
        logger.warn(
          "Back camera or facingMode constraint not available, retrying without facingMode:",
          constraintError
        );
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: true,
        });
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraReady(true);
      }
    } catch (error) {
      logger.error("Error accessing camera:", error);
      setCameraError("Unable to access camera. Please check your browser permissions.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => {
          const next = prev + 1;
          if (next >= MAX_RECORDING_SECONDS) {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
              mediaRecorderRef.current.stop();
            }
            setIsRecording(false);
          }
          return next;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const startRecording = () => {
    if (!streamRef.current) return;

    chunksRef.current = [];

    try {
      const mimeType = getSupportedMimeType();
      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const mediaRecorder = new MediaRecorder(streamRef.current, options);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const actualMime = mimeType || "video/webm";
        const blob = new Blob(chunksRef.current, { type: actualMime });
        setVideoBlob(blob);
        setIsPreviewing(true);

        // Revoke previous object URL to prevent memory leak
        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current);
        }

        if (previewRef.current) {
          const url = URL.createObjectURL(blob);
          previewUrlRef.current = url;
          previewRef.current.src = url;
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
    } catch (error) {
      logger.error("Error starting recording:", error);
      setCameraError("Unable to start recording. Your browser may not support video capture.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const retake = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    setVideoBlob(null);
    setIsPreviewing(false);
    setRecordingTime(0);
    setTrickName("");

    if (previewRef.current) {
      previewRef.current.src = "";
    }
  };

  const handleSubmit = () => {
    if (!videoBlob || !trickName.trim()) return;
    onRecordComplete?.(videoBlob, trickName);
    onClose?.();
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (cameraError) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-6">
        <Video className="w-16 h-16 text-neutral-600 mb-4" />
        <p className="text-white text-lg font-semibold mb-2">Camera Unavailable</p>
        <p className="text-neutral-400 text-sm text-center mb-6 max-w-xs">{cameraError}</p>
        <button
          onClick={onClose}
          className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-8 rounded-xl transition-all"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Close Button */}
      <button
        onClick={onClose}
        aria-label="Close recorder"
        className="absolute top-4 right-4 z-10 bg-black/50 backdrop-blur-sm text-white w-12 h-12 rounded-full flex items-center justify-center hover:bg-black/70 transition-all"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Camera View / Preview */}
      <div className="relative w-full h-full">
        {!isPreviewing ? (
          <>
            {/* Live Camera Feed */}
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover">
              <track kind="captions" />
            </video>

            {/* Camera Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/50 pointer-events-none">
              {/* Recording Indicator */}
              <AnimatePresence>
                {isRecording && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute top-6 left-1/2 -translate-x-1/2"
                  >
                    <div className="bg-red-500 rounded-full px-6 py-3 flex items-center gap-3 shadow-lg">
                      <div className="w-4 h-4 bg-white rounded-full animate-pulse" />
                      <span className="text-white font-bold text-xl">
                        {formatTime(recordingTime)}
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Spot Info */}
              <div className="absolute top-6 left-6">
                <div className="bg-black/50 backdrop-blur-sm rounded-lg px-4 py-2 text-white">
                  <p className="text-xs text-gray-300">Recording at</p>
                  <p className="font-bold">{spotId.slice(0, 12)}...</p>
                </div>
              </div>
            </div>

            {/* Camera Controls */}
            <div className="absolute bottom-8 left-0 right-0 flex justify-center items-center gap-6">
              {!isRecording ? (
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={startRecording}
                  disabled={!cameraReady}
                  aria-label="Start recording"
                  className="w-20 h-20 rounded-full bg-gradient-to-br from-red-500 to-red-600 border-4 border-white shadow-2xl flex items-center justify-center hover:from-red-600 hover:to-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Video className="w-10 h-10 text-white" />
                </motion.button>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={stopRecording}
                  aria-label="Stop recording"
                  className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 border-4 border-white shadow-2xl flex items-center justify-center"
                >
                  <Pause className="w-10 h-10 text-white" />
                </motion.button>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Video Preview */}
            <video ref={previewRef} controls className="w-full h-full object-cover">
              <track kind="captions" />
            </video>

            {/* Preview Overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent p-6">
              {/* Trick Name Input */}
              <div className="mb-6">
                <label
                  htmlFor="trick-name-input"
                  className="block text-white text-sm font-semibold mb-2"
                >
                  Name Your Trick
                </label>
                <input
                  id="trick-name-input"
                  type="text"
                  value={trickName}
                  onChange={(e) => setTrickName(e.target.value)}
                  placeholder="e.g., Kickflip, Heelflip, 360 Flip..."
                  className="w-full bg-zinc-800 text-white px-4 py-3 rounded-xl border-2 border-zinc-700 focus:border-orange-500 outline-none transition-all"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={retake}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-5 h-5" />
                  Retake
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!trickName.trim()}
                  className="flex-1 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-bold py-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Check className="w-5 h-5" />
                  Submit Trick
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
