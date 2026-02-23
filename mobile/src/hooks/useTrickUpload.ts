import { useState } from "react";
import { showMessage } from "react-native-flash-message";
import { storage, auth } from "@/lib/firebase.config";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface UploadParams {
  uri: string;
  durationMs: number;
  trickName: string;
  description: string;
  isPublic: boolean;
}

/**
 * Handles Firebase Storage upload with progress tracking and server submission.
 */
export function useTrickUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadVideo = async ({
    uri,
    durationMs,
    trickName,
    description,
    isPublic,
  }: UploadParams) => {
    if (!auth.currentUser) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Fetch the video file
      const response = await fetch(uri);
      const blob = await response.blob();

      // Upload to Firebase Storage
      const timestamp = Date.now();
      const videoPath = `trickmint/${auth.currentUser.uid}/${timestamp}.mp4`;
      const storageRef = ref(storage, videoPath);
      const uploadTask = uploadBytesResumable(storageRef, blob);

      // Monitor upload progress
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          console.error("Upload error:", error);
          showMessage({
            message: "Upload Failed",
            description: "Unable to upload video. Please try again.",
            type: "danger",
            duration: 3000,
          });
          setIsUploading(false);
        },
        async () => {
          // Upload completed successfully
          const videoUrl = await getDownloadURL(uploadTask.snapshot.ref);

          // Submit to server
          const data = await apiRequest<{ clip?: unknown }>("/api/trickmint/submit", {
            method: "POST",
            body: JSON.stringify({
              trickName: trickName.trim(),
              description: description.trim() || undefined,
              videoUrl,
              videoDurationMs: durationMs,
              fileSizeBytes: blob.size,
              mimeType: blob.type || "video/mp4",
              isPublic,
            }),
          });

          if (data.clip) {
            showMessage({
              message: "✅ Trick Uploaded!",
              description: "Your clip is now live.",
              type: "success",
              duration: 2000,
            });
            queryClient.invalidateQueries({ queryKey: ["trickmint"] });
          } else {
            throw new Error("Upload failed");
          }
        }
      );
    } catch (error) {
      showMessage({
        message: "Upload Failed",
        description: error instanceof Error ? error.message : "Please try again.",
        type: "danger",
        duration: 3000,
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return { isUploading, uploadProgress, uploadVideo };
}
