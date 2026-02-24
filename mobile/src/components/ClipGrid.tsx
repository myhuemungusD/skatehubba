import { View, Text, TouchableOpacity, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";
import { styles } from "../../app/(tabs)/trickmint.styles";

export interface TrickClip {
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

export interface ClipListResponse {
  clips: TrickClip[];
  total: number;
  limit: number;
  offset: number;
}

interface ClipGridProps {
  clips: TrickClip[];
  onVideoClick: (url: string) => void;
  onDelete?: (id: number) => void;
  showDelete?: boolean;
}

export function ClipGrid({ clips, onVideoClick, onDelete, showDelete }: ClipGridProps) {
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
