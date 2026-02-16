import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
} from "react-native";
import { useState, useRef, useEffect, useCallback } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Video, ResizeMode } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";
import { isExpoGo } from "@/lib/isExpoGo";

// react-native-vision-camera requires native code unavailable in Expo Go
let VisionCamera: React.ComponentType<any> | null = null;
let useCameraDevice: any = () => null;
let useCameraPermission: any = () => ({ hasPermission: false, requestPermission: async () => {} });
let useMicrophonePermission: any = () => ({ hasPermission: false, requestPermission: async () => {} });
let useCameraFormat: any = () => null;
type VideoFile = { path: string };
if (!isExpoGo) {
  try {
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

/** Maximum recording duration in seconds */
const MAX_RECORDING_DURATION = 15;

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
  const [recording, setRecording] = useState(false);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [trickName, setTrickName] = useState("");
  const [showTrickInput, setShowTrickInput] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isInitializing, setIsInitializing] = useState(true);

  const cameraRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Vision Camera hooks
  const device = useCameraDevice("back");
  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } =
    useCameraPermission();
  const { hasPermission: hasMicPermission, requestPermission: requestMicPermission } =
    useMicrophonePermission();

  // Use 120fps format for slow-mo replay capability
  // Falls back to best available if 120fps not supported
  const format = useCameraFormat(device, [
    { fps: 120 },
    { videoResolution: { width: 1920, height: 1080 } },
  ]);

  const hasAllPermissions = hasCameraPermission && hasMicPermission;

  // Request permissions when modal opens
  useEffect(() => {
    if (visible) {
      setIsInitializing(true);
      (async () => {
        if (!hasCameraPermission) {
          await requestCameraPermission();
        }
        if (!hasMicPermission) {
          await requestMicPermission();
        }
        setIsInitializing(false);
      })();
    }
  }, [
    visible,
    hasCameraPermission,
    hasMicPermission,
    requestCameraPermission,
    requestMicPermission,
  ]);

  // Recording timer
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

      // Animate progress bar
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
  }, [recording, progressAnim]);

  // Clean up on close
  useEffect(() => {
    if (!visible) {
      setVideoUri(null);
      setTrickName("");
      setShowTrickInput(false);
      setRecording(false);
      setRecordingTime(0);
    }
  }, [visible]);

  const startRecording = useCallback(async () => {
    if (!cameraRef.current) return;

    try {
      setRecording(true);
      cameraRef.current.startRecording({
        onRecordingFinished: (video: VideoFile) => {
          setRecording(false);
          setVideoUri(video.path);

          // Show trick name input for attackers
          if (isSettingTrick) {
            setShowTrickInput(true);
          }
        },
        onRecordingError: (error) => {
          console.error("[TrickRecorder] Recording error:", error);
          setRecording(false);
          Alert.alert("Recording Failed", "Please try again.");
        },
      });

      // Auto-stop after max duration
      setTimeout(() => {
        if (cameraRef.current && recording) {
          cameraRef.current.stopRecording();
        }
      }, MAX_RECORDING_DURATION * 1000);
    } catch (error) {
      console.error("[TrickRecorder] Failed to start recording:", error);
      setRecording(false);
      Alert.alert("Recording Failed", "Please try again.");
    }
  }, [isSettingTrick, recording]);

  const stopRecording = useCallback(() => {
    if (cameraRef.current) {
      cameraRef.current.stopRecording();
    }
  }, []);

  const handleRetake = useCallback(() => {
    setVideoUri(null);
    setTrickName("");
    setShowTrickInput(false);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!videoUri) return;

    if (isSettingTrick && !trickName.trim()) {
      // Allow submitting without trick name, but prompt
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

  // Expo Go does not support react-native-vision-camera
  if (visible && !VisionCamera) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={styles.permissionDenied}>
          <Ionicons name="videocam-off" size={64} color={SKATE.colors.lightGray} />
          <Text style={styles.permissionTitle}>Camera Recording Unavailable</Text>
          <Text style={styles.permissionText}>
            Trick recording requires a development build. Run "npx expo run:android" or use EAS Build to create a dev build with camera support.
          </Text>
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.backButton}
            onPress={onClose}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  // Loading state while checking permissions
  if (visible && isInitializing) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={styles.permissionDenied}>
          <ActivityIndicator size="large" color={SKATE.colors.orange} />
          <Text style={styles.permissionTitle}>Initializing Camera...</Text>
        </View>
      </Modal>
    );
  }

  // Permission denied view
  if (visible && !hasAllPermissions) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={styles.permissionDenied}>
          <Ionicons name="videocam-off" size={64} color={SKATE.colors.lightGray} />
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            Please enable camera and microphone access in your device settings to record tricks.
          </Text>
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.backButton}
            onPress={onClose}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  // No camera device available
  if (visible && !device) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={styles.permissionDenied}>
          <Ionicons name="warning" size={64} color={SKATE.colors.lightGray} />
          <Text style={styles.permissionTitle}>No Camera Available</Text>
          <Text style={styles.permissionText}>No camera device was found on this device.</Text>
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.backButton}
            onPress={onClose}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
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
                  {recordingTime}s / {MAX_RECORDING_DURATION}s
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

        {/* Trick name input modal */}
        {showTrickInput && (
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.trickInputOverlay}
          >
            <View style={styles.trickInputCard}>
              <Text style={styles.trickInputTitle}>Name Your Trick</Text>
              <TextInput
                style={styles.trickInput}
                placeholder="e.g., Kickflip, Tre flip..."
                placeholderTextColor={SKATE.colors.gray}
                value={trickName}
                onChangeText={setTrickName}
                autoFocus
                maxLength={50}
                returnKeyType="done"
                onSubmitEditing={handleTrickNameSubmit}
              />
              <View style={styles.trickInputButtons}>
                <TouchableOpacity
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel="Skip naming trick"
                  style={styles.trickInputButtonSecondary}
                  onPress={() => {
                    setShowTrickInput(false);
                    if (videoUri) onRecordComplete(videoUri, null);
                  }}
                >
                  <Text style={styles.trickInputButtonTextSecondary}>Skip</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel="Confirm trick name"
                  style={styles.trickInputButtonPrimary}
                  onPress={handleTrickNameSubmit}
                >
                  <Text style={styles.trickInputButtonText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        )}

        {/* Controls */}
        <View style={styles.controls}>
          {!videoUri ? (
            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel={recording ? "Stop recording" : "Start recording"}
              accessibilityState={{ selected: recording }}
              style={[styles.recordButton, recording && styles.recordingButton]}
              onPress={recording ? stopRecording : startRecording}
            >
              <Ionicons
                name={recording ? "stop" : "videocam"}
                size={36}
                color={SKATE.colors.white}
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.actionButtons}>
              <TouchableOpacity
                accessible
                accessibilityRole="button"
                accessibilityLabel="Retake video"
                accessibilityState={{ disabled: isUploading }}
                style={styles.actionButton}
                onPress={handleRetake}
                disabled={isUploading}
              >
                <Ionicons name="refresh" size={24} color={SKATE.colors.white} />
                <Text style={styles.actionButtonText}>Retake</Text>
              </TouchableOpacity>

              <TouchableOpacity
                accessible
                accessibilityRole="button"
                accessibilityLabel={isSettingTrick ? "Set this trick" : "Submit attempt"}
                accessibilityState={{ disabled: isUploading }}
                style={[styles.actionButton, styles.submitButton]}
                onPress={handleSubmit}
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <Text style={styles.uploadProgressText}>{uploadProgress}%</Text>
                    <Text style={styles.actionButtonText}>Uploading...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons
                      name={isSettingTrick ? "flash" : "checkmark"}
                      size={24}
                      color={SKATE.colors.white}
                    />
                    <Text style={styles.actionButtonText}>
                      {isSettingTrick ? "Set Trick" : "Submit"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Instructions */}
        <View style={styles.instructions}>
          <Text style={styles.instructionText}>
            {recording
              ? "Recording... Stop when done"
              : videoUri
                ? "Review your trick and submit when ready"
                : isSettingTrick
                  ? "Record the trick your opponent must match"
                  : "Attempt to land the same trick"}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SKATE.spacing.lg,
    paddingBottom: SKATE.spacing.lg,
    backgroundColor: SKATE.colors.grime,
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  headerContent: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: SKATE.colors.white,
    letterSpacing: 2,
  },
  trickToMatch: {
    fontSize: 14,
    color: SKATE.colors.orange,
    marginTop: SKATE.spacing.xs,
    fontWeight: "600",
  },
  placeholder: {
    width: 44,
  },
  cameraContainer: {
    flex: 1,
    position: "relative",
  },
  camera: {
    flex: 1,
  },
  recordingOverlay: {
    position: "absolute",
    top: SKATE.spacing.lg,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: SKATE.spacing.sm,
  },
  recordingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: SKATE.spacing.md,
    paddingVertical: SKATE.spacing.sm,
    borderRadius: SKATE.borderRadius.full,
    gap: SKATE.spacing.sm,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: SKATE.colors.blood,
  },
  recordingText: {
    color: SKATE.colors.blood,
    fontWeight: "bold",
    fontSize: 14,
  },
  timerText: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "600",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: SKATE.spacing.md,
    paddingVertical: SKATE.spacing.xs,
    borderRadius: SKATE.borderRadius.sm,
  },
  progressBarContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: SKATE.colors.darkGray,
  },
  progressBar: {
    height: "100%",
    backgroundColor: SKATE.colors.blood,
  },
  previewContainer: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
  },
  preview: {
    flex: 1,
  },
  controls: {
    padding: SKATE.spacing.xl,
    alignItems: "center",
    backgroundColor: SKATE.colors.grime,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: SKATE.colors.blood,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: SKATE.colors.white,
  },
  recordingButton: {
    backgroundColor: SKATE.colors.orange,
  },
  actionButtons: {
    flexDirection: "row",
    gap: SKATE.spacing.lg,
    width: "100%",
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SKATE.spacing.sm,
    backgroundColor: SKATE.colors.darkGray,
    paddingVertical: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.md,
    minHeight: SKATE.accessibility.minimumTouchTarget,
  },
  submitButton: {
    backgroundColor: SKATE.colors.orange,
  },
  actionButtonText: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "bold",
  },
  uploadProgressText: {
    color: SKATE.colors.white,
    fontSize: 18,
    fontWeight: "bold",
  },
  instructions: {
    padding: SKATE.spacing.lg,
    backgroundColor: SKATE.colors.ink,
  },
  instructionText: {
    color: SKATE.colors.lightGray,
    fontSize: 14,
    textAlign: "center",
  },
  permissionDenied: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
    justifyContent: "center",
    alignItems: "center",
    padding: SKATE.spacing.xxl,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: SKATE.colors.white,
    marginTop: SKATE.spacing.xl,
    marginBottom: SKATE.spacing.md,
  },
  permissionText: {
    fontSize: 14,
    color: SKATE.colors.lightGray,
    textAlign: "center",
    marginBottom: SKATE.spacing.xl,
  },
  backButton: {
    backgroundColor: SKATE.colors.orange,
    paddingHorizontal: SKATE.spacing.xxl,
    paddingVertical: SKATE.spacing.md,
    borderRadius: SKATE.borderRadius.md,
    minHeight: SKATE.accessibility.minimumTouchTarget,
    justifyContent: "center",
  },
  backButtonText: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "bold",
  },
  trickInputOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: SKATE.spacing.xl,
  },
  trickInputCard: {
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.xl,
    width: "100%",
    maxWidth: 340,
  },
  trickInputTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: SKATE.colors.white,
    textAlign: "center",
    marginBottom: SKATE.spacing.lg,
  },
  trickInput: {
    backgroundColor: SKATE.colors.ink,
    borderWidth: 2,
    borderColor: SKATE.colors.darkGray,
    borderRadius: SKATE.borderRadius.md,
    padding: SKATE.spacing.md,
    color: SKATE.colors.white,
    fontSize: 16,
    marginBottom: SKATE.spacing.lg,
  },
  trickInputButtons: {
    flexDirection: "row",
    gap: SKATE.spacing.md,
  },
  trickInputButtonPrimary: {
    flex: 1,
    backgroundColor: SKATE.colors.orange,
    paddingVertical: SKATE.spacing.md,
    borderRadius: SKATE.borderRadius.md,
    alignItems: "center",
    minHeight: SKATE.accessibility.minimumTouchTarget,
    justifyContent: "center",
  },
  trickInputButtonSecondary: {
    flex: 1,
    backgroundColor: SKATE.colors.darkGray,
    paddingVertical: SKATE.spacing.md,
    borderRadius: SKATE.borderRadius.md,
    alignItems: "center",
    minHeight: SKATE.accessibility.minimumTouchTarget,
    justifyContent: "center",
  },
  trickInputButtonText: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "bold",
  },
  trickInputButtonTextSecondary: {
    color: SKATE.colors.lightGray,
    fontSize: 16,
    fontWeight: "600",
  },
});

export default TrickRecorder;
