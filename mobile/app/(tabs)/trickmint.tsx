import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Video, ResizeMode } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { showMessage } from "react-native-flash-message";
import { SKATE } from "@/theme";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { TrickMintSkeleton } from "@/components/common/Skeleton";
import { ScreenErrorBoundary } from "@/components/common/ScreenErrorBoundary";
import { ClipGrid } from "@/components/ClipGrid";
import { UploadForm } from "@/components/UploadForm";
import { useTrickMintApi } from "@/hooks/useTrickMintApi";
import { useTrickUpload } from "@/hooks/useTrickUpload";
import { styles } from "./trickmint.styles";

type Tab = "upload" | "my-clips" | "feed";

function TrickMintScreenContent() {
  const { isAuthenticated, checkAuth } = useRequireAuth();
  const [activeTab, setActiveTab] = useState<Tab>("upload");
  const [trickName, setTrickName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  const { myClipsQuery, feedQuery, deleteMutation } = useTrickMintApi(activeTab, isAuthenticated);
  const { isUploading, uploadProgress, uploadVideo } = useTrickUpload();

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
      await uploadVideo({
        uri: video.uri,
        durationMs: video.duration || 0,
        trickName,
        description,
        isPublic,
      });
      setTrickName("");
      setDescription("");
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
          <Text style={[styles.tabText, activeTab === "feed" && styles.tabTextActive]}>Feed</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Upload Tab */}
        {activeTab === "upload" && (
          <UploadForm
            trickName={trickName}
            description={description}
            isPublic={isPublic}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            onChangeTrickName={setTrickName}
            onChangeDescription={setDescription}
            onTogglePublic={() => setIsPublic(!isPublic)}
            onPickVideo={handlePickVideo}
          />
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
                <TouchableOpacity style={styles.emptyButton} onPress={() => setActiveTab("upload")}>
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
