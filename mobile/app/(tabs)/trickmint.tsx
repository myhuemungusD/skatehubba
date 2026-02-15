import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Video, ResizeMode } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { showMessage } from "react-native-flash-message";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { storage, auth } from "@/lib/firebase.config";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { SKATE } from "@/theme";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { TrickMintSkeleton } from "@/components/common/Skeleton";
import { ScreenErrorBoundary } from "@/components/common/ScreenErrorBoundary";

type Tab = "upload" | "my-clips" | "feed";

interface TrickClip {
  id: number;
  userId: string;
  userName: string;
  trickName: string;
  description: string | null;
  videoUrl: string;
  videoDurationMs: number | null;
  thumbnailUrl: string | null;
  fileSizeBytes: number | null;
  mimeType: string | null;
  status: "processing" | "ready" | "failed" | "flagged";
  views: number;
  likes: number;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ClipListResponse {
  clips: TrickClip[];
  total: number;
  limit: number;
  offset: number;
}

function TrickMintScreenContent() {
  const { isAuthenticated, checkAuth } = useRequireAuth();
  const [activeTab, setActiveTab] = useState<Tab>("upload");
  const [trickName, setTrickName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  // Queries
  const myClipsQuery = useQuery({
    queryKey: ["trickmint", "my-clips"],
    queryFn: () =>
      apiRequest<ClipListResponse>("/api/trickmint/my-clips?limit=50&offset=0"),
    enabled: activeTab === "my-clips" && isAuthenticated,
  });

  const feedQuery = useQuery({
    queryKey: ["trickmint", "feed"],
    queryFn: () =>
      apiRequest<ClipListResponse>("/api/trickmint/feed?limit=50&offset=0"),
    enabled: activeTab === "feed" && isAuthenticated,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (clipId: number) => {
      return apiRequest(`/api/trickmint/${clipId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trickmint"] });
      showMessage({
        message: "Clip deleted",
        type: "success",
        duration: 2000,
      });
    },
    onError: () => {
      showMessage({
        message: "Failed to delete clip",
        type: "danger",
        duration: 2000,
      });
    },
  });

  const handlePickVideo = async () => {
    if (!checkAuth({ message: "Sign in to upload tricks" })) return;

    if (!trickName.trim()) {
      showMessage({
        message: "Name Required",
        description: "Give your trick a name first.",
        type: "warning",
        duration: 2000,
      });
      return;
    }

    // Request permissions
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showMessage({
        message: "Permission Required",
        description: "We need access to your media library to upload videos.",
        type: "warning",
        duration: 3000,
      });
      return;
    }

    // Pick video
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      quality: 1,
      videoMaxDuration: 30,
    });

    if (!result.canceled && result.assets[0]) {
      const video = result.assets[0];
      await uploadVideo(video.uri, video.duration || 0);
    }
  };

  const uploadVideo = async (uri: string, durationMs: number) => {
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
            setTrickName("");
            setDescription("");
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

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle" size={48} color={SKATE.colors.orange} />
          <Text style={styles.emptyTitle}>Sign In Required</Text>
          <Text style={styles.emptyText}>You must be logged in to use TrickMint.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="film" size={24} color={SKATE.colors.orange} />
        </View>
        <View>
          <Text style={styles.headerTitle}>TrickMint</Text>
          <Text style={styles.headerSubtitle}>Record. Upload. Own it.</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "upload" && styles.tabActive]}
          onPress={() => setActiveTab("upload")}
        >
          <Ionicons
            name="cloud-upload"
            size={18}
            color={activeTab === "upload" ? SKATE.colors.white : SKATE.colors.lightGray}
          />
          <Text style={[styles.tabText, activeTab === "upload" && styles.tabTextActive]}>
            Upload
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "my-clips" && styles.tabActive]}
          onPress={() => setActiveTab("my-clips")}
        >
          <Ionicons
            name="film"
            size={18}
            color={activeTab === "my-clips" ? SKATE.colors.white : SKATE.colors.lightGray}
          />
          <Text style={[styles.tabText, activeTab === "my-clips" && styles.tabTextActive]}>
            My Clips
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "feed" && styles.tabActive]}
          onPress={() => setActiveTab("feed")}
        >
          <Ionicons
            name="globe"
            size={18}
            color={activeTab === "feed" ? SKATE.colors.white : SKATE.colors.lightGray}
          />
          <Text style={[styles.tabText, activeTab === "feed" && styles.tabTextActive]}>
            Feed
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Upload Tab */}
        {activeTab === "upload" && (
          <View style={styles.uploadContainer}>
            <View style={styles.uploadCard}>
              <View style={styles.uploadHeader}>
                <Ionicons name="videocam" size={20} color={SKATE.colors.orange} />
                <Text style={styles.uploadTitle}>Record Your Trick</Text>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Trick Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Kickflip, Tre Flip, Nollie Heel..."
                  placeholderTextColor={SKATE.colors.gray}
                  value={trickName}
                  onChangeText={setTrickName}
                  maxLength={200}
                  editable={!isUploading}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Description (optional)</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="First try, flat ground, etc."
                  placeholderTextColor={SKATE.colors.gray}
                  value={description}
                  onChangeText={setDescription}
                  maxLength={1000}
                  multiline
                  numberOfLines={3}
                  editable={!isUploading}
                  textAlignVertical="top"
                />
              </View>

              {/* Visibility Toggle */}
              <TouchableOpacity
                style={styles.visibilityToggle}
                onPress={() => setIsPublic(!isPublic)}
                disabled={isUploading}
              >
                <View
                  style={[styles.visibilityBadge, isPublic && styles.visibilityBadgePublic]}
                >
                  <Ionicons
                    name={isPublic ? "globe" : "lock-closed"}
                    size={14}
                    color={isPublic ? "#10b981" : SKATE.colors.lightGray}
                  />
                  <Text
                    style={[
                      styles.visibilityText,
                      isPublic && styles.visibilityTextPublic,
                    ]}
                  >
                    {isPublic ? "Public" : "Private"}
                  </Text>
                </View>
                <Text style={styles.visibilityHint}>
                  {isPublic ? "Visible in feed" : "Only you can see this"}
                </Text>
              </TouchableOpacity>

              {/* Upload Button */}
              <TouchableOpacity
                style={[styles.uploadButton, isUploading && styles.uploadButtonDisabled]}
                onPress={handlePickVideo}
                disabled={isUploading || !trickName.trim()}
              >
                {isUploading ? (
                  <ActivityIndicator size="small" color={SKATE.colors.white} />
                ) : (
                  <>
                    <Ionicons name="cloud-upload" size={20} color={SKATE.colors.white} />
                    <Text style={styles.uploadButtonText}>Pick Video from Library</Text>
                  </>
                )}
              </TouchableOpacity>

              {isUploading && (
                <View style={styles.progressContainer}>
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
                  </View>
                  <Text style={styles.progressText}>{Math.round(uploadProgress)}%</Text>
                </View>
              )}

              <Text style={styles.uploadHint}>
                Max 30s | MP4 | 50MB limit | Auto-generated thumbnail
              </Text>
            </View>
          </View>
        )}

        {/* My Clips Tab */}
        {activeTab === "my-clips" && (
          <View style={styles.clipsContainer}>
            {myClipsQuery.isLoading && <TrickMintSkeleton />}

            {myClipsQuery.data && myClipsQuery.data.clips.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="film" size={48} color={SKATE.colors.gray} />
                <Text style={styles.emptyTitle}>No clips yet</Text>
                <Text style={styles.emptyText}>Record your first trick to get started.</Text>
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={() => setActiveTab("upload")}
                >
                  <Ionicons name="cloud-upload" size={20} color={SKATE.colors.white} />
                  <Text style={styles.emptyButtonText}>Upload a Trick</Text>
                </TouchableOpacity>
              </View>
            )}

            {myClipsQuery.data && myClipsQuery.data.clips.length > 0 && (
              <>
                <Text style={styles.clipCount}>
                  {myClipsQuery.data.total} clip{myClipsQuery.data.total !== 1 ? "s" : ""}
                </Text>
                <ClipGrid
                  clips={myClipsQuery.data.clips}
                  onVideoClick={setSelectedVideo}
                  onDelete={(id) => deleteMutation.mutate(id)}
                  showDelete
                />
              </>
            )}
          </View>
        )}

        {/* Feed Tab */}
        {activeTab === "feed" && (
          <View style={styles.clipsContainer}>
            {feedQuery.isLoading && <TrickMintSkeleton />}

            {feedQuery.data && feedQuery.data.clips.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="globe" size={48} color={SKATE.colors.gray} />
                <Text style={styles.emptyTitle}>No public clips yet</Text>
                <Text style={styles.emptyText}>Be the first to upload.</Text>
              </View>
            )}

            {feedQuery.data && feedQuery.data.clips.length > 0 && (
              <ClipGrid clips={feedQuery.data.clips} onVideoClick={setSelectedVideo} />
            )}
          </View>
        )}
      </ScrollView>

      {/* Video Player Modal */}
      {selectedVideo && (
        <Modal visible={!!selectedVideo} transparent animationType="slide">
          <View style={styles.videoModal}>
            <View style={styles.videoModalContent}>
              <View style={styles.videoModalHeader}>
                <Text style={styles.videoModalTitle}>Video</Text>
                <TouchableOpacity onPress={() => setSelectedVideo(null)}>
                  <Ionicons name="close" size={24} color={SKATE.colors.white} />
                </TouchableOpacity>
              </View>
              <Video
                source={{ uri: selectedVideo }}
                style={styles.videoPlayer}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

export default function TrickMintScreen() {
  return (
    <ScreenErrorBoundary screenName="TrickMint">
      <TrickMintScreenContent />
    </ScreenErrorBoundary>
  );
}

// Clip Grid Component
interface ClipGridProps {
  clips: TrickClip[];
  onVideoClick: (url: string) => void;
  onDelete?: (id: number) => void;
  showDelete?: boolean;
}

function ClipGrid({ clips, onVideoClick, onDelete, showDelete }: ClipGridProps) {
  return (
    <View style={styles.clipGrid}>
      {clips.map((clip) => (
        <View key={clip.id} style={styles.clipCard}>
          <TouchableOpacity
            style={styles.clipThumbnail}
            onPress={() => onVideoClick(clip.videoUrl)}
          >
            {clip.thumbnailUrl ? (
              <Image source={{ uri: clip.thumbnailUrl }} style={styles.thumbnailImage} />
            ) : (
              <View style={styles.thumbnailPlaceholder}>
                <Ionicons name="videocam" size={32} color={SKATE.colors.gray} />
              </View>
            )}
            <View style={styles.playIcon}>
              <Ionicons name="play" size={32} color={SKATE.colors.white} />
            </View>
            {clip.videoDurationMs && (
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{Math.ceil(clip.videoDurationMs / 1000)}s</Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.clipInfo}>
            <Text style={styles.clipName} numberOfLines={1}>
              {clip.trickName}
            </Text>
            <View style={styles.clipMeta}>
              <View style={styles.clipStats}>
                <Ionicons name="eye" size={12} color={SKATE.colors.gray} />
                <Text style={styles.clipStatText}>{clip.views}</Text>
              </View>
              {showDelete && onDelete && (
                <TouchableOpacity onPress={() => onDelete(clip.id)}>
                  <Ionicons name="trash" size={14} color={SKATE.colors.gray} />
                </TouchableOpacity>
              )}
            </View>
            {clip.userName && (
              <Text style={styles.clipUser} numberOfLines={1}>
                by {clip.userName}
              </Text>
            )}
          </View>
        </View>
      ))}
    </View>
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
    gap: SKATE.spacing.md,
    padding: SKATE.spacing.lg,
    paddingTop: SKATE.spacing.xl,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 106, 0, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: SKATE.colors.white,
  },
  headerSubtitle: {
    fontSize: 14,
    color: SKATE.colors.lightGray,
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: SKATE.borderRadius.lg,
    padding: 4,
    marginHorizontal: SKATE.spacing.lg,
    marginBottom: SKATE.spacing.lg,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SKATE.spacing.xs,
    paddingVertical: SKATE.spacing.sm,
    borderRadius: SKATE.borderRadius.md,
  },
  tabActive: {
    backgroundColor: SKATE.colors.orange,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: SKATE.colors.lightGray,
  },
  tabTextActive: {
    color: SKATE.colors.white,
  },
  content: {
    flex: 1,
  },
  uploadContainer: {
    padding: SKATE.spacing.lg,
  },
  uploadCard: {
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 106, 0, 0.2)",
  },
  uploadHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
    marginBottom: SKATE.spacing.lg,
  },
  uploadTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: SKATE.colors.white,
  },
  formGroup: {
    marginBottom: SKATE.spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: SKATE.colors.lightGray,
    marginBottom: SKATE.spacing.sm,
  },
  input: {
    backgroundColor: SKATE.colors.ink,
    borderWidth: 1,
    borderColor: SKATE.colors.gray,
    borderRadius: SKATE.borderRadius.md,
    padding: SKATE.spacing.md,
    color: SKATE.colors.white,
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  visibilityToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
    marginBottom: SKATE.spacing.lg,
  },
  visibilityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.xs,
    paddingHorizontal: SKATE.spacing.md,
    paddingVertical: SKATE.spacing.xs,
    borderRadius: 16,
    backgroundColor: SKATE.colors.gray,
    borderWidth: 1,
    borderColor: SKATE.colors.gray,
  },
  visibilityBadgePublic: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderColor: "#10b981",
  },
  visibilityText: {
    fontSize: 12,
    fontWeight: "600",
    color: SKATE.colors.lightGray,
  },
  visibilityTextPublic: {
    color: "#10b981",
  },
  visibilityHint: {
    fontSize: 12,
    color: SKATE.colors.gray,
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SKATE.spacing.sm,
    backgroundColor: SKATE.colors.orange,
    padding: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.lg,
    marginBottom: SKATE.spacing.md,
  },
  uploadButtonDisabled: {
    backgroundColor: SKATE.colors.gray,
    opacity: 0.5,
  },
  uploadButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: SKATE.colors.white,
  },
  progressContainer: {
    marginBottom: SKATE.spacing.md,
  },
  progressBar: {
    height: 8,
    backgroundColor: SKATE.colors.gray,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: SKATE.spacing.xs,
  },
  progressFill: {
    height: "100%",
    backgroundColor: SKATE.colors.orange,
  },
  progressText: {
    fontSize: 12,
    color: SKATE.colors.lightGray,
    textAlign: "center",
  },
  uploadHint: {
    fontSize: 12,
    color: SKATE.colors.gray,
    textAlign: "center",
  },
  clipsContainer: {
    padding: SKATE.spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SKATE.spacing.xl * 2,
  },
  loadingText: {
    fontSize: 14,
    color: SKATE.colors.lightGray,
    marginTop: SKATE.spacing.md,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SKATE.spacing.xl * 2,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: SKATE.colors.white,
    marginTop: SKATE.spacing.lg,
    marginBottom: SKATE.spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: SKATE.colors.lightGray,
    textAlign: "center",
    marginBottom: SKATE.spacing.lg,
  },
  emptyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
    backgroundColor: SKATE.colors.orange,
    paddingHorizontal: SKATE.spacing.lg,
    paddingVertical: SKATE.spacing.md,
    borderRadius: SKATE.borderRadius.lg,
  },
  emptyButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: SKATE.colors.white,
  },
  clipCount: {
    fontSize: 12,
    color: SKATE.colors.gray,
    marginBottom: SKATE.spacing.md,
  },
  clipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SKATE.spacing.md,
  },
  clipCard: {
    width: "48%",
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    borderWidth: 1,
    borderColor: SKATE.colors.gray,
    overflow: "hidden",
  },
  clipThumbnail: {
    aspectRatio: 9 / 16,
    backgroundColor: SKATE.colors.ink,
    position: "relative",
  },
  thumbnailImage: {
    width: "100%",
    height: "100%",
  },
  thumbnailPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  playIcon: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: [{ translateX: -16 }, { translateY: -16 }],
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  durationBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    fontSize: 10,
    color: SKATE.colors.white,
    fontWeight: "600",
  },
  clipInfo: {
    padding: SKATE.spacing.sm,
  },
  clipName: {
    fontSize: 14,
    fontWeight: "600",
    color: SKATE.colors.white,
    marginBottom: SKATE.spacing.xs,
  },
  clipMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SKATE.spacing.xs,
  },
  clipStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  clipStatText: {
    fontSize: 12,
    color: SKATE.colors.gray,
  },
  clipUser: {
    fontSize: 12,
    color: SKATE.colors.gray,
  },
  videoModal: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    alignItems: "center",
    justifyContent: "center",
    padding: SKATE.spacing.lg,
  },
  videoModalContent: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    overflow: "hidden",
  },
  videoModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: SKATE.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: SKATE.colors.gray,
  },
  videoModalTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: SKATE.colors.lightGray,
  },
  videoPlayer: {
    aspectRatio: 9 / 16,
    backgroundColor: SKATE.colors.ink,
  },
});
