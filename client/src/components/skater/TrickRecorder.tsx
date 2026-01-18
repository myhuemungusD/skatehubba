import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Video, Pause, RotateCcw, Check, X } from 'lucide-react';

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
  const [trickName, setTrickName] = useState('');
  const [cameraReady, setCameraReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
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

  const startCamera = async () => {
    try {
      let stream: MediaStream;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' }, // Prefer back camera on mobile
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: true,
        });
      } catch (constraintError) {
        console.warn(
          'Back camera or facingMode constraint not available, retrying without facingMode:',
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
      console.error('Error accessing camera:', error);
      alert('Unable to access camera. Please check permissions.');
    }
  };

  const stopCamera = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startRecording = () => {
    if (!streamRef.current) return;

    chunksRef.current = [];

    try {
      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType: 'video/webm;codecs=vp8,opus',
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        setVideoBlob(blob);
        setIsPreviewing(true);

        if (previewRef.current) {
          previewRef.current.src = URL.createObjectURL(blob);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Unable to start recording.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const retake = () => {
    setVideoBlob(null);
    setIsPreviewing(false);
    setRecordingTime(0);
    setTrickName('');

    if (previewRef.current) {
      previewRef.current.src = '';
    }
  };

  const handleSubmit = () => {
    if (videoBlob && trickName.trim()) {
      onRecordComplete?.(videoBlob, trickName);
      onClose?.();
    } else {
      alert('Please name your trick before submitting!');
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 bg-black/50 backdrop-blur-sm text-white w-12 h-12 rounded-full flex items-center justify-center hover:bg-black/70 transition-all"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Camera View / Preview */}
      <div className="relative w-full h-full">
        {!isPreviewing ? (
          <>
            {/* Live Camera Feed */}
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />

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
                      <span className="text-white font-bold text-xl">{formatTime(recordingTime)}</span>
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
                  className="w-20 h-20 rounded-full bg-gradient-to-br from-red-500 to-red-600 border-4 border-white shadow-2xl flex items-center justify-center hover:from-red-600 hover:to-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Video className="w-10 h-10 text-white" />
                </motion.button>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={stopRecording}
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
            <video ref={previewRef} controls className="w-full h-full object-cover" />

            {/* Preview Overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent p-6">
              {/* Trick Name Input */}
              <div className="mb-6">
                <label className="block text-white text-sm font-semibold mb-2">Name Your Trick</label>
                <input
                  type="text"
                  value={trickName}
                  onChange={(e) => setTrickName(e.target.value)}
                  placeholder="e.g., Kickflip, Heelflip, 360 Flip..."
                  className="w-full bg-zinc-800 text-white px-4 py-3 rounded-xl border-2 border-zinc-700 focus:border-orange-500 outline-none transition-all"
                  autoFocus
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
