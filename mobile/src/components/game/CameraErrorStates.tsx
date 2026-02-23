import { View, Text, Modal, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";
import { styles } from "./TrickRecorder.styles";

type CameraErrorVariant = "unavailable" | "initializing" | "permission-denied" | "no-device";

interface CameraErrorStateProps {
  visible: boolean;
  variant: CameraErrorVariant;
  onClose: () => void;
}

export function CameraErrorState({ visible, variant, onClose }: CameraErrorStateProps) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {variant === "initializing" ? (
        <View style={styles.permissionDenied}>
          <ActivityIndicator size="large" color={SKATE.colors.orange} />
          <Text style={styles.permissionTitle}>Initializing Camera...</Text>
        </View>
      ) : (
        <View style={styles.permissionDenied}>
          <Ionicons
            name={variant === "no-device" ? "warning" : "videocam-off"}
            size={64}
            color={SKATE.colors.lightGray}
          />
          <Text style={styles.permissionTitle}>
            {variant === "unavailable" && "Camera Recording Unavailable"}
            {variant === "permission-denied" && "Camera Access Required"}
            {variant === "no-device" && "No Camera Available"}
          </Text>
          <Text style={styles.permissionText}>
            {variant === "unavailable" &&
              'Trick recording requires a development build. Run "npx expo run:android" or use EAS Build to create a dev build with camera support.'}
            {variant === "permission-denied" &&
              "Please enable camera and microphone access in your device settings to record tricks."}
            {variant === "no-device" && "No camera device was found on this device."}
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
      )}
    </Modal>
  );
}
