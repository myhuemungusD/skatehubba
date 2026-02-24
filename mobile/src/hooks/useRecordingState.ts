import { useState, useRef, useEffect, useCallback } from "react";
import { Alert, Animated } from "react-native";

/** Maximum recording duration in seconds */
const MAX_RECORDING_DURATION = 15;

type VideoFile = { path: string };

interface CameraRef {
  startRecording: (options: {
    onRecordingFinished: (video: VideoFile) => void;
    onRecordingError: (error: unknown) => void;
  }) => void;
  stopRecording: () => void;
}

interface UseRecordingStateParams {
  /** Called with the recorded video file path when recording finishes. */
  onVideoReady: (uri: string) => void;
}

/**
 * Manages recording timer, progress animation, and start/stop logic
 * for react-native-vision-camera.
 */
export function useRecordingState({ onVideoReady }: UseRecordingStateParams) {
  const cameraRef = useRef<CameraRef | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const stopRecording = useCallback(() => {
    if (cameraRef.current) {
      cameraRef.current.stopRecording();
    }
  }, []);

  // Recording timer and progress animation
  useEffect(() => {
    if (recording) {
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          const next = prev + 1;
          if (next >= MAX_RECORDING_DURATION) {
            stopRecording();
          }
          return next;
        });
      }, 1000);

      Animated.timing(progressAnim, {
        toValue: 1,
        duration: MAX_RECORDING_DURATION * 1000,
        useNativeDriver: false,
      }).start();
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      progressAnim.setValue(0);
    };
  }, [recording, progressAnim, stopRecording]);

  const startRecording = useCallback(async () => {
    if (!cameraRef.current) return;

    try {
      setRecording(true);
      cameraRef.current.startRecording({
        onRecordingFinished: (video: VideoFile) => {
          setRecording(false);
          onVideoReady(video.path);
        },
        onRecordingError: (error: unknown) => {
          console.error("[TrickRecorder] Recording error:", error);
          setRecording(false);
          Alert.alert("Recording Failed", "Please try again.");
        },
      });
      // Auto-stop is handled by the timer useEffect above
    } catch (error) {
      console.error("[TrickRecorder] Failed to start recording:", error);
      setRecording(false);
      Alert.alert("Recording Failed", "Please try again.");
    }
  }, [onVideoReady]);

  return {
    cameraRef,
    progressAnim,
    recording,
    recordingTime,
    maxDuration: MAX_RECORDING_DURATION,
    startRecording,
    stopRecording,
  };
}
