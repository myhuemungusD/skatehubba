import { View, Text, Modal, TouchableOpacity, Animated } from "react-native";
import { useState, useCallback, useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Video, ResizeMode } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { Alert } from "react-native";
import { SKATE } from "@/theme";
import { isExpoGo } from "@/lib/isExpoGo";
import { useCameraPermissions } from "@/hooks/useCameraPermissions";
import { useRecordingState } from "@/hooks/useRecordingState";
import { CameraErrorState } from "./CameraErrorStates";
import { TrickNameInput } from "./TrickNameInput";
import { RecordingControls } from "./RecordingControls";
import { styles } from "./TrickRecorder.styles";

// Types for conditionally-loaded vision camera
type CameraDevice = Record<string, unknown>;
type CameraFormat = Record<string, unknown> & { maxFps?: number };

// react-native-vision-camera requires native code unavailable in Expo Go
let VisionCamera: React.ComponentType<Record<string, unknown>> | null = null;
let useCameraDevice: (position: string) => CameraDevice | null = () => null;
let useCameraPermission: () => {
  hasPermission: boolean;
  requestPermission: () => Promise<boolean>;
} = () => ({ hasPermission: false, requestPermission: async () => false });
let useMicrophonePermission: () => {
  hasPermission: boolean;
  requestPermission: () => Promise<boolean>;
} = () => ({ hasPermission: false, requestPermission: async () => false });
let useCameraFormat: (
  device: CameraDevice | null,
  filters: Array<Record<string, unknown>>
) => CameraFormat | null = () => null;
if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic require needed for conditional native module loading; static import would crash Expo Go since the native module is unavailable there
    const vc = require("react-native-vision-camera");
    VisionCamera = vc.Camera;
    useCameraDevice = vc.useCameraDevice;
    useCameraPermission = vc.useCameraPermission;
    useMicrophonePermission = vc.useMicrophonePermission;
    useCameraFormat = vc.useCameraFormat;
  } catch {
    // Native module not available
  }
}

interface TrickRecorderProps {
  /** Whether the recorder modal is visible */
  visible: boolean;
  /** Close the recorder */
  onClose: () => void;
  /** Callback when recording is complete with video URI and optional trick name */
  onRecordComplete: (videoUri: string, trickName: string | null) => void;
  /** Whether this is an attacker setting a trick (shows trick name input) */
  isSettingTrick: boolean;
  /** The trick name to match (for defender) */
  trickToMatch?: string | null;
  /** Whether currently uploading */
  isUploading?: boolean;
  /** Upload progress (0-100) */
  uploadProgress?: number;
}

/**
 * Camera wrapper for recording trick attempts using react-native-vision-camera.
 * Handles permissions, recording timer, preview, and trick naming.
 */
export function TrickRecorder({
  visible,
  onClose,
  onRecordComplete,
  isSettingTrick,
  trickToMatch,
  isUploading = false,
  uploadProgress = 0,
}: TrickRecorderProps) {
  const insets = useSafeAreaInsets();
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [trickName, setTrickName] = useState("");
  const [showTrickInput, setShowTrickInput] = useState(false);

  const device = useCameraDevice("back");
  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } =
    useCameraPermission();
  const { hasPermission: hasMicPermission, requestPermission: requestMicPermission } =
    useMicrophonePermission();

  const format = useCameraFormat(device, [
    { fps: 120 },
    { videoResolution: { width: 1920, height: 1080 } },
  ]);

  const { isInitializing } = useCameraPermissions({
    visible,
    hasCameraPermission,
    hasMicPermission,
    requestCameraPermission,
    requestMicPermission,
  });

  const {
    cameraRef,
    progressAnim,
    recording,
    recordingTime,
    maxDuration,
    startRecording,
    stopRecording,
  } = useRecordingState({
    onVideoReady: (uri) => {
      setVideoUri(uri);
      if (isSettingTrick) {
        setShowTrickInput(true);
      }
    },
  });

  // Clean up on close
  useEffect(() => {
    if (!visible) {
      setVideoUri(null);
      setTrickName("");
      setShowTrickInput(false);
    }
  }, [visible]);

  const hasAllPermissions = hasCameraPermission && hasMicPermission;

  const handleRetake = useCallback(() => {
    setVideoUri(null);
    setTrickName("");
    setShowTrickInput(false);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!videoUri) return;

    if (isSettingTrick && !trickName.trim()) {
      Alert.alert(
        "Name Your Trick",
        "Want to add a trick name? This helps your opponent know what to match.",
        [
          {
            text: "Skip",
            style: "cancel",
            onPress: () => onRecordComplete(videoUri, null),
          },
          {
            text: "Add Name",
            onPress: () => setShowTrickInput(true),
          },
        ]
      );
      return;
    }

    onRecordComplete(videoUri, trickName.trim() || null);
  }, [videoUri, trickName, isSettingTrick, onRecordComplete]);

  const handleTrickNameSubmit = useCallback(() => {
    if (!videoUri) return;
    setShowTrickInput(false);
    onRecordComplete(videoUri, trickName.trim() || null);
  }, [videoUri, trickName, onRecordComplete]);

  // Error states
  if (visible && !VisionCamera) {
    return <CameraErrorState visible={visible} variant="unavailable" onClose={onClose} />;
  }
  if (visible && isInitializing) {
    return <CameraErrorState visible={visible} variant="initializing" onClose={onClose} />;
  }
  if (visible && !hasAllPermissions) {
    return <CameraErrorState visible={visible} variant="permission-denied" onClose={onClose} />;
  }
  if (visible && !device) {
    return <CameraErrorState visible={visible} variant="no-device" onClose={onClose} />;
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={recording ? undefined : onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + SKATE.spacing.lg }]}>
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Close recorder"
            accessibilityState={{ disabled: recording || isUploading }}
            style={styles.closeButton}
            onPress={onClose}
            disabled={recording || isUploading}
          >
            <Ionicons
              name="close"
              size={28}
              color={recording || isUploading ? SKATE.colors.gray : SKATE.colors.white}
            />
          </TouchableOpacity>

          <View style={styles.headerContent}>
            {isSettingTrick ? (
              <Text style={styles.headerTitle}>SET YOUR TRICK</Text>
            ) : (
              <>
                <Text style={styles.headerTitle}>MATCH THE TRICK</Text>
                {trickToMatch && <Text style={styles.trickToMatch}>{trickToMatch}</Text>}
              </>
            )}
          </View>

          <View style={styles.placeholder} />
        </View>

        {/* Camera / Preview */}
        {!videoUri ? (
          <View style={styles.cameraContainer}>
            {device && VisionCamera && (
              <VisionCamera
                ref={cameraRef}
                style={styles.camera}
                device={device}
                format={format}
                isActive={visible && !videoUri}
                video={true}
                audio={true}
                fps={format?.maxFps ?? 30}
              />
            )}

            {/* Recording indicator */}
            {recording && (
              <View style={styles.recordingOverlay}>
                <View style={styles.recordingIndicator}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingText}>REC</Text>
                </View>
                <Text style={styles.timerText}>
                  {recordingTime}s / {maxDuration}s
                </Text>
              </View>
            )}

            {/* Recording progress bar */}
            {recording && (
              <View style={styles.progressBarContainer}>
                <Animated.View
                  style={[
                    styles.progressBar,
                    {
                      width: progressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ["0%", "100%"],
                      }),
                    },
                  ]}
                />
              </View>
            )}
          </View>
        ) : (
          <View style={styles.previewContainer}>
            <Video
              source={{ uri: videoUri }}
              style={styles.preview}
              useNativeControls
              isLooping
              shouldPlay
              resizeMode={ResizeMode.CONTAIN}
            />
          </View>
        )}

        {/* Trick name input overlay */}
        {showTrickInput && (
          <TrickNameInput
            trickName={trickName}
            onChangeTrickName={setTrickName}
            onConfirm={handleTrickNameSubmit}
            onSkip={() => {
              setShowTrickInput(false);
              if (videoUri) onRecordComplete(videoUri, null);
            }}
          />
        )}

        <RecordingControls
          videoUri={videoUri}
          recording={recording}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
          isSettingTrick={isSettingTrick}
          onStartRecording={() => startRecording()}
          onStopRecording={stopRecording}
          onRetake={handleRetake}
          onSubmit={handleSubmit}
        />
      </View>
    </Modal>
  );
}

export default TrickRecorder;
