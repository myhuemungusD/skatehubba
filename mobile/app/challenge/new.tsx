import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Camera, CameraType } from "expo-camera";
import { Video } from "expo-av";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { functions, storage, auth } from "@/lib/firebase.config";
import { showMessage } from "react-native-flash-message";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";

const createChallenge = httpsCallable(functions, "createChallenge");

export default function NewChallengeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const queryClient = useQueryClient();

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [recording, setRecording] = useState(false);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [camera, setCamera] = useState<Camera | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

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
        message: "Challenge sent! 🔥",
        type: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["challenges"] });
      router.back();
    },
    onError: (error: any) => {
      showMessage({
        message: error?.message || "Failed to send challenge",
        type: "danger",
      });
    },
  });

  const requestPermissions = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    setHasPermission(status === "granted");
  };

  const startRecording = async () => {
    if (!camera) return;

    setRecording(true);
    const video = await camera.recordAsync({
      maxDuration: 15, // One-take rule: exactly 15 seconds
      quality: "720p",
    });
    setRecording(false);
    setVideoUri(video.uri);
  };

  // FFmpeg optimization for <6s LTE upload (requires react-native-ffmpeg or expo-av)
  // const ffmpegCommand = `-i ${videoUri} -c:v h264 -b:v 4M -maxrate 4M -bufsize 8M -preset ultrafast -r 30 -vf "scale=1280:720" -c:a aac -b:a 128k ${outputPath}`;
  // TODO: Add video compression before upload to reduce file size by 60-70%

  const stopRecording = () => {
    if (camera && recording) {
      camera.stopRecording();
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
    } catch (error: any) {
      showMessage({
        message: error?.message || "Failed to upload video",
        type: "danger",
      });
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Requesting camera permission...</Text>
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Grant camera permission"
          style={styles.button}
          onPress={requestPermissions}
        >
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>No access to camera</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!videoUri ? (
        <>
          <Camera style={styles.camera} type={CameraType.back} ref={(ref) => setCamera(ref)}>
            <View style={styles.controls}>
              <Text
                accessibilityLabel="Recording time limit: 15 seconds, one take only"
                style={styles.timer}
              >
                15 seconds • One-take only
              </Text>
            </View>
          </Camera>

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
    flex: 1,
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
