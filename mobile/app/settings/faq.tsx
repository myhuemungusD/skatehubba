import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { SKATE } from "@/theme";
import { ScreenErrorBoundary } from "@/components/common/ScreenErrorBoundary";
import * as Linking from "expo-linking";

type FaqItem = {
  question: string;
  answer: string;
};

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What is SkateHubba?",
    answer:
      "SkateHubba is a mobile platform for skateboarders to find spots, challenge friends to S.K.A.T.E. games, and share their best tricks. Connect with your local skate community and level up your game.",
  },
  {
    question: "How do I challenge someone to a S.K.A.T.E. game?",
    answer:
      'Go to the Challenges tab and tap "New Challenge." Search for another skater, set your terms (number of letters, trick style), and send the invite. Your opponent will be notified and can accept or decline.',
  },
  {
    question: "How do spot check-ins work?",
    answer:
      "Open the Map tab to browse nearby skate spots. Tap a spot to view details, then tap Check In to log that you skated there. Check-ins help keep the spot info accurate and show the community which spots are active.",
  },
  {
    question: "How do push notifications work?",
    answer:
      "SkateHubba sends push notifications for new challenges, game updates, and community activity. You can enable or disable push notifications at any time in Settings → Push Notifications.",
  },
  {
    question: "How do I report inappropriate content?",
    answer:
      'Tap the three-dot menu on any post, profile, or game clip and select "Report." Our moderation team reviews all reports and takes action within 24 hours. You can also email support@skatehubba.com for urgent issues.',
  },
  {
    question: "Can I delete a spot I added?",
    answer:
      "You can edit or flag a spot for removal by tapping the spot on the map, then selecting Edit or Report an Issue. Admins review spot edit requests to keep the map accurate.",
  },
  {
    question: "How do I contact support?",
    answer: "Email support@skatehubba.com — our team typically responds within one business day.",
  },
];

function FaqScreenContent() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        Find answers to common questions about SkateHubba below. Still need help? Reach out to us.
      </Text>

      {FAQ_ITEMS.map((item, index) => (
        <View key={index} style={styles.card}>
          <Text style={styles.question}>{item.question}</Text>
          <Text style={styles.answer}>{item.answer}</Text>
        </View>
      ))}

      <TouchableOpacity
        accessible
        accessibilityRole="button"
        accessibilityLabel="Email support at support@skatehubba.com"
        style={styles.contactButton}
        onPress={() => Linking.openURL("mailto:support@skatehubba.com")}
      >
        <Text style={styles.contactButtonText}>Email Support</Text>
      </TouchableOpacity>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

export default function FaqScreen() {
  return (
    <ScreenErrorBoundary screenName="FAQ">
      <FaqScreenContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
  },
  content: {
    padding: SKATE.spacing.lg,
  },
  intro: {
    color: SKATE.colors.gray,
    fontSize: SKATE.fontSize.md,
    marginBottom: SKATE.spacing.xl,
    lineHeight: 22,
  },
  card: {
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.lg,
    marginBottom: SKATE.spacing.md,
  },
  question: {
    color: SKATE.colors.white,
    fontSize: SKATE.fontSize.lg,
    fontWeight: SKATE.fontWeight.semibold,
    marginBottom: SKATE.spacing.sm,
  },
  answer: {
    color: SKATE.colors.lightGray,
    fontSize: SKATE.fontSize.md,
    lineHeight: 22,
  },
  contactButton: {
    flexDirection: "row",
    backgroundColor: SKATE.colors.orange,
    borderRadius: SKATE.borderRadius.md,
    paddingVertical: SKATE.spacing.md,
    paddingHorizontal: SKATE.spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    marginTop: SKATE.spacing.lg,
    minHeight: SKATE.accessibility.minimumTouchTarget,
  },
  contactButtonText: {
    color: SKATE.colors.ink,
    fontWeight: SKATE.fontWeight.bold,
    fontSize: SKATE.fontSize.lg,
  },
  bottomPadding: {
    height: 40,
  },
});
