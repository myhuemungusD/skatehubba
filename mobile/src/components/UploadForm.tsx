import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";
import { styles } from "../../app/(tabs)/trickmint.styles";

interface UploadFormProps {
  trickName: string;
  description: string;
  isPublic: boolean;
  isUploading: boolean;
  uploadProgress: number;
  onChangeTrickName: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onTogglePublic: () => void;
  onPickVideo: () => void;
}

export function UploadForm({
  trickName,
  description,
  isPublic,
  isUploading,
  uploadProgress,
  onChangeTrickName,
  onChangeDescription,
  onTogglePublic,
  onPickVideo,
}: UploadFormProps) {
  return (
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
            onChangeText={onChangeTrickName}
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
            onChangeText={onChangeDescription}
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
          onPress={onTogglePublic}
          disabled={isUploading}
        >
          <View style={[styles.visibilityBadge, isPublic && styles.visibilityBadgePublic]}>
            <Ionicons
              name={isPublic ? "globe" : "lock-closed"}
              size={14}
              color={isPublic ? "#10b981" : SKATE.colors.lightGray}
            />
            <Text style={[styles.visibilityText, isPublic && styles.visibilityTextPublic]}>
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
          onPress={onPickVideo}
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

        <Text style={styles.uploadHint}>Max 30s | MP4 | 50MB limit | Auto-generated thumbnail</Text>
      </View>
    </View>
  );
}
