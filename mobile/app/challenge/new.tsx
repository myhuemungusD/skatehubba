import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { useState, useRef, useEffect } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
  useCameraFormat,
  VideoFile,
} from "react-native-vision-camera";
import { Video } from "expo-av";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { functions, storage, auth } from "@/lib/firebase.config";
import { showMessage } from "react-native-flash-message";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";

const createChallenge = httpsCallable(functions, "createChallenge");

const MAX_RECORDING_DURATION = 15;

export default function NewChallengeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const queryClient = useQueryClient();

  const [recording, setRecording] = useState(false);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const cameraRef = useRef<Camera>(null);

  // Vision Camera hooks
  const device = useCameraDevice("back");
  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } =
    useCameraPermission();
  const { hasPermission: hasMicPermission, requestPermission: requestMicPermission } =
    useMicrophonePermission();

  // Use 120fps format for slow-mo replay capability
  const format = useCameraFormat(device, [
    { fps: 120 },
    { videoResolution: { width: 1920, height: 1080 } },
  ]);

  const hasAllPermissions = hasCameraPermission && hasMicPermission;

  // Request permissions on mount
  useEffect(() => {
    (async () => {
      if (!hasCameraPermission) {
        await requestCameraPermission();
      }
      if (!hasMicPermission) {
        await requestMicPermission();
      }
    })();
  }, [hasCameraPermission, hasMicPermission, requestCameraPermission, requestMicPermission]);

  // Validate opponent UID is provided
  if (!params.opponentUid) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Error: No opponent selected</Text>
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Go back to previous screen"
          style={styles.button}
          onPress={() => router.back()}
        >
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const challengeMutation = useMutation({
    mutationFn: async ({ clipUrl, thumbnailUrl }: { clipUrl: string; thumbnailUrl?: string }) => {
      const result = await createChallenge({
        opponentUid: params.opponentUid as string,
        clipUrl,
        clipDurationSec: 15,
        thumbnailUrl,
      });
      return result.data;
    },
    onSuccess: () => {
      showMessage({
        message: "Challenge sent!",
        type: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["challenges"] });
      router.back();
    },
    onError: (error: Error) => {
      showMessage({
        message: error?.message || "Failed to send challenge",
        type: "danger",
      });
    },
  });

  const startRecording = async () => {
    if (!cameraRef.current) return;

    try {
      setRecording(true);
      cameraRef.current.startRecording({
        onRecordingFinished: (video: VideoFile) => {
          setRecording(false);
          setVideoUri(video.path);
        },
        onRecordingError: (error) => {
          console.error("[NewChallenge] Recording error:", error);
          setRecording(false);
          showMessage({
            message: "Recording failed. Please try again.",
            type: "danger",
          });
        },
      });

      // Auto-stop after max duration
      setTimeout(() => {
        if (cameraRef.current && recording) {
          cameraRef.current.stopRecording();
        }
      }, MAX_RECORDING_DURATION * 1000);
    } catch (error) {
      console.error("[NewChallenge] Failed to start recording:", error);
      setRecording(false);
      showMessage({
        message: "Failed to start recording",
        type: "danger",
      });
    }
  };

  const stopRecording = () => {
    if (cameraRef.current) {
      cameraRef.current.stopRecording();
    }
  };

  const submitChallenge = async () => {
    if (!videoUri || !auth.currentUser) {
      showMessage({
        message: "Not authenticated or no video to upload",
        type: "danger",
      });
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(0);

      // Create storage paths
      const timestamp = Date.now();
      const storagePath = `challenges/${auth.currentUser.uid}/${timestamp}.mp4`;

      // Fetch video file from local URI
      const response = await fetch(videoUri);
      const blob = await response.blob();

      // Upload video to Firebase Storage with progress
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, blob, {
        contentType: "video/mp4",
      });

      const clipUrl = await new Promise<string>((resolve, reject) => {
        uploadTask.on(
          "state_changed",
          (snapshot) => {
            if (snapshot.totalBytes > 0) {
              const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
              setUploadProgress(progress);
            }
          },
          (error) => reject(error),
          async () => {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(url);
          }
        );
      });

      // Auto-send challenge with uploaded video
      challengeMutation.mutate({
        clipUrl,
        thumbnailUrl: undefined, // Optional for now
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to upload video";
      showMessage({
        message: errorMessage,
        type: "danger",
      });
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  if (!hasAllPermissions) {
    return (
      <View style={styles.container}>
        <Ionicons name="videocam-off" size={64} color={SKATE.colors.lightGray} />
        <Text style={styles.text}>Camera access required</Text>
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Grant camera permission"
          style={styles.button}
          onPress={async () => {
            await requestCameraPermission();
            await requestMicPermission();
          }}
        >
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.container}>
        <Ionicons name="warning" size={64} color={SKATE.colors.lightGray} />
        <Text style={styles.text}>No camera device available</Text>
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.button}
          onPress={() => router.back()}
        >
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!videoUri ? (
        <>
          <Camera
            ref={cameraRef}
            style={styles.camera}
            device={device}
            format={format}
            isActive={!videoUri}
            video={true}
            audio={true}
            fps={format?.maxFps ?? 30}
          />
          <View style={styles.controls}>
            <Text
              accessibilityLabel="Recording time limit: 15 seconds, one take only"
              style={styles.timer}
            >
              15 seconds - One-take only
            </Text>
          </View>

          <View style={styles.bottomControls}>
            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel={recording ? "Stop recording video" : "Start recording video"}
              accessibilityState={{ disabled: false, selected: recording }}
              style={[styles.recordButton, recording && styles.recordingButton]}
              onPress={recording ? stopRecording : startRecording}
            >
              <Ionicons
                name={recording ? "stop" : "videocam"}
                size={32}
                color={SKATE.colors.white}
              />
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <Video
            source={{ uri: videoUri }}
            style={styles.preview}
            useNativeControls
            isLooping
            shouldPlay
          />

          <View style={styles.actions}>
            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel="Retake video"
              style={styles.actionButton}
              onPress={() => setVideoUri(null)}
            >
              <Text style={styles.actionButtonText}>Retake</Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel="Send challenge to opponent"
              accessibilityState={{ disabled: challengeMutation.isPending || uploading }}
              style={[styles.actionButton, styles.submitButton]}
              onPress={submitChallenge}
              disabled={challengeMutation.isPending || uploading}
            >
              {uploading || challengeMutation.isPending ? (
                <View style={styles.uploadStatus}>
                  <ActivityIndicator color={SKATE.colors.white} />
                  <Text style={styles.uploadText}>
                    {uploadProgress !== null ? `Uploading ${uploadProgress}%` : "Uploading..."}
                  </Text>
                </View>
              ) : (
                <Text style={styles.actionButtonText}>
                  {uploading ? "Uploading..." : "Send Challenge"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    color: SKATE.colors.white,
    fontSize: 16,
    marginBottom: 20,
    marginTop: 16,
  },
  button: {
    backgroundColor: SKATE.colors.orange,
    paddingVertical: SKATE.spacing.md,
    paddingHorizontal: SKATE.spacing.xxl,
    borderRadius: SKATE.borderRadius.md,
    minHeight: SKATE.accessibility.minimumTouchTarget,
    justifyContent: "center",
  },
  buttonText: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "bold",
  },
  camera: {
    flex: 1,
    width: "100%",
  },
  controls: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "transparent",
    padding: SKATE.spacing.xl,
  },
  timer: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: SKATE.spacing.sm,
    borderRadius: SKATE.borderRadius.md,
  },
  bottomControls: {
    position: "absolute",
    bottom: 40,
    width: "100%",
    alignItems: "center",
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: SKATE.colors.blood,
    justifyContent: "center",
    alignItems: "center",
  },
  recordingButton: {
    backgroundColor: SKATE.colors.orange,
  },
  preview: {
    flex: 1,
    width: "100%",
  },
  actions: {
    flexDirection: "row",
    gap: SKATE.spacing.md,
    padding: SKATE.spacing.xl,
  },
  actionButton: {
    flex: 1,
    backgroundColor: SKATE.colors.gray,
    paddingVertical: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.md,
    alignItems: "center",
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
  uploadStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
  },
  uploadText: {
    color: SKATE.colors.white,
    fontSize: 14,
    fontWeight: "600",
  },
});
