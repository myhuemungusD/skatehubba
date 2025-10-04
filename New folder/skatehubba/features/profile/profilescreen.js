import React, { useState } from 'react';
import { 
  View, 
  Text, 
  Image, 
  ScrollView, 
  TouchableOpacity, 
  StyleSheet, 
  FlatList,
  Alert,
  SafeAreaView,
  Linking 
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { FontAwesome5, MaterialIcons, Ionicons } from '@expo/vector-icons';
import { uploadAvatar } from '../../api/authApi';
import { auth } from '../../services/firebase';
import { useAuth } from '../../hooks/useAuth';
import { ChallengeModal } from '../challenges/ChallengeModal';
import TradeModal from '../../components/trade/TradeModal';
import { VerifiedBadge } from '../../components/VerifiedBadge';
import { ProfileStat } from '../../components/ProfileStat';
import LanguagePicker from '../../components/settings/LanguagePicker';
import { useTranslation } from '../../services/localization';
import images from '../../constants/images.json';

export default function ProfileScreen({ route, navigation }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar || images.images.defaultAvatar);
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);

  // Get profile from route params or use current user
  const isOwnProfile = !route?.params?.userId;
  const profile = isOwnProfile ? user : route?.params?.profile;

  // Enhanced mock data for demonstration
  const enhancedProfile = {
    ...profile,
    level: profile?.level || 7,
    xp: profile?.xp || 7600,
    hubbaBucks: profile?.hubbaBucks || 65,
    city: profile?.city || "Redlands, CA",
    isVerified: profile?.isVerified || true,
    isSponsored: profile?.isSponsored || true,
    badges: profile?.badges || ["OG", "Beta Tester", "Trick Master"],
    gear: profile?.gear || [
      { id: "deck", label: "Baker OG Deck", image: "https://via.placeholder.com/80x80/FFD600/181b1e?text=DECK", rarity: "legendary" },
      { id: "shoes", label: "Osiris D3", image: "https://via.placeholder.com/80x80/FF6B6B/FFFFFF?text=SHOES", rarity: "rare" },
      { id: "hat", label: "Thrasher Trucker", image: "https://via.placeholder.com/80x80/4ECDC4/FFFFFF?text=HAT", rarity: "common" },
      { id: "wheels", label: "Spitfire Classic", image: "https://via.placeholder.com/80x80/45B7D1/FFFFFF?text=WHEELS", rarity: "epic" },
      { id: "trucks", label: "Independent Stage 11", image: "https://via.placeholder.com/80x80/96CEB4/FFFFFF?text=TRUCKS", rarity: "rare" },
    ],
    stats: { 
      clips: profile?.clips || 22, 
      lines: profile?.lines || 8, 
      followers: profile?.followers || 120, 
      following: profile?.following || 45,
      totalTricks: profile?.totalTricks || 156,
      bestCombo: profile?.bestCombo || 12,
      spotsSkated: profile?.spotsSkated || 15,
    },
    achievements: profile?.achievements || [
      { id: "first_kickflip", name: "First Kickflip", icon: "medal", earned: true },
      { id: "combo_master", name: "Combo Master", icon: "fire", earned: true },
      { id: "street_legend", name: "Street Legend", icon: "crown", earned: false },
    ],
    lastActivity: profile?.lastActivity || "2 hours ago",
    joinDate: profile?.joinDate || "March 2024",
    sponsors: profile?.sponsors || ["Baker", "Spitfire", "Independent"],
  };

  React.useLayoutEffect(() => {
    if (isOwnProfile) {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity
            onPress={() => navigation.navigate('ProfileSettings')}
            style={{ marginRight: 16 }}
          >
            <Ionicons name="settings-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        ),
      });
    }
  }, [navigation, isOwnProfile]);

  if (!enhancedProfile) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{t('profile.notFound')}</Text>
      </View>
    );
  }

  async function handleChangeAvatar() {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled) {
      setAvatarLoading(true);
      try {
        const url = await uploadAvatar(result.assets[0].uri, auth.currentUser.uid);
        setAvatarUrl(url);
        // Optionally update user context/state here
      } catch (e) {
        alert('Failed to upload avatar');
      }
      setAvatarLoading(false);
    }
  }

  const handleFollow = () => {
    setIsFollowing(!isFollowing);
    Alert.alert(
      isFollowing ? "Unfollowed" : "Following!",
      `You are ${isFollowing ? "no longer following" : "now following"} ${enhancedProfile.username}`
    );
  };

  const handleChallenge = () => {
    setShowChallengeModal(true);
  };
  const handleTrade = () => {
    setShowTradeModal(true);
  };

  const getRarityColor = (rarity) => {
    switch (rarity) {
      case "legendary": return "#FFD700";
      case "epic": return "#9B59B6";
      case "rare": return "#3498DB";
      case "common": return "#95A5A6";
      default: return "#95A5A6";
    }
  };

  const renderGearItem = ({ item }) => (
    <View style={styles.gearItem}>
      <View style={[styles.gearImageContainer, { borderColor: getRarityColor(item.rarity) }]}>
        <Image source={{ uri: item.image }} style={styles.gearImg} />
        <View style={[styles.rarityIndicator, { backgroundColor: getRarityColor(item.rarity) }]} />
      </View>
      <Text style={styles.gearLabel} numberOfLines={2}>{item.label}</Text>
      <Text style={[styles.gearRarity, { color: getRarityColor(item.rarity) }]}>
        {item.rarity.toUpperCase()}
      </Text>
    </View>
  );

  const renderAchievement = ({ item }) => (
    <View style={[styles.achievementItem, !item.earned && styles.achievementLocked]}>
      <FontAwesome5 
        name={item.icon} 
        size={24} 
        color={item.earned ? "#FFD600" : "#666"} 
      />
      <Text style={[styles.achievementText, !item.earned && styles.achievementLockedText]}>
        {item.name}
      </Text>
    </View>
  );

  const handleLanguageChange = async (langCode) => {
    // Language change is handled by the LanguagePicker component
    console.log('Language changed to:', langCode);
  };

  const openPrivacyPolicy = () => {
    Linking.openURL('https://skatehubba.com/privacy');
  };

  const openTermsOfService = () => {
    Linking.openURL('https://skatehubba.com/terms');
  };

  const renderSettingsSection = () => {
    if (!isOwnProfile) return null;

    return (
      <>
        <Text style={styles.sectionTitle}>{t('settings.title')}</Text>
        <View style={styles.settingsContainer}>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => setShowLanguagePicker(true)}
          >
            <Text style={styles.settingsButtonText}>{t('settings.language')}</Text>
            <Text style={styles.settingsButtonValue}>
              {t(`languages.${i18n.language}`)}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingsButton}
            onPress={openPrivacyPolicy}
          >
            <Text style={styles.settingsButtonText}>{t('settings.privacy')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingsButton}
            onPress={openTermsOfService}
          >
            <Text style={styles.settingsButtonText}>{t('settings.terms')}</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  };

  return (
    <>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
          {/* Enhanced Header Section */}
          <View style={styles.header}>
            <View style={styles.avatarContainer}>
              <Image 
                source={avatarUrl ? { uri: avatarUrl } : { uri: enhancedProfile.avatar || "https://i.pravatar.cc/120?img=17" }} 
                style={styles.avatar}
                accessible={true}
                accessibilityLabel={t('profile.avatar', { username: enhancedProfile.username })}
              />
              <View style={styles.levelBadge}>
                <Text style={styles.levelText}>{enhancedProfile.level}</Text>
              </View>
              {isOwnProfile && (
                <TouchableOpacity 
                  style={styles.editAvatarBtn} 
                  onPress={handleChangeAvatar}
                  accessible={true}
                  accessibilityLabel={t('profile.editAvatar')}
                  accessibilityRole="button"
                >
                  <FontAwesome5 name="camera" size={14} color="#181b1e" />
                </TouchableOpacity>
              )}
            </View>
            
            <View style={styles.userInfo}>
              <View style={styles.usernameRow}>
                <Text style={styles.username}>@{enhancedProfile.username}</Text>
                {enhancedProfile.isVerified && (
                  <MaterialIcons name="verified" size={20} color="#FFD600" style={styles.verifiedIcon} />
                )}
                {enhancedProfile.isSponsored && (
                  <FontAwesome5 name="star" size={16} color="#FF6B6B" style={styles.sponsorIcon} />
                )}
              </View>
              <Text style={styles.city}>
                <Ionicons name="location" size={14} color="#FFD600" />
                {" " + enhancedProfile.city}
              </Text>
              <Text style={styles.joinDate}>Joined {enhancedProfile.joinDate}</Text>
              <Text style={styles.lastActivity}>Last active: {enhancedProfile.lastActivity}</Text>
              {enhancedProfile.bio && (
                <Text style={styles.bio}>{enhancedProfile.bio}</Text>
              )}
            </View>
          </View>

          {/* Badges Section */}
          <View style={styles.badgesSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.badgesRow}>
              {enhancedProfile.badges.map((badge, index) => (
                <View key={index} style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* Stats Grid */}
          <View style={styles.statsContainer}>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{enhancedProfile.level}</Text>
                <Text style={styles.statLabel}>Level</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{enhancedProfile.xp.toLocaleString()}</Text>
                <Text style={styles.statLabel}>XP</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{enhancedProfile.hubbaBucks}</Text>
                <Text style={styles.statLabel}>Hubba Bucks</Text>
              </View>
            </View>
            
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{enhancedProfile.stats.clips}</Text>
                <Text style={styles.statLabel}>Clips</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{enhancedProfile.stats.lines}</Text>
                <Text style={styles.statLabel}>Lines</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{enhancedProfile.stats.totalTricks}</Text>
                <Text style={styles.statLabel}>Total Tricks</Text>
              </View>
            </View>

            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{enhancedProfile.stats.followers}</Text>
                <Text style={styles.statLabel}>Followers</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{enhancedProfile.stats.following}</Text>
                <Text style={styles.statLabel}>Following</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{enhancedProfile.stats.bestCombo}</Text>
                <Text style={styles.statLabel}>Best Combo</Text>
              </View>
            </View>
          </View>

          {/* Flexed Gear Section */}
          <View style={styles.gearSection}>
            <Text style={styles.sectionTitle}>
              <FontAwesome5 name="skateboarding" size={18} color="#FFD600" />
              {" "}Flexed Gear
            </Text>
            <FlatList
              horizontal
              data={enhancedProfile.gear}
              keyExtractor={item => item.id}
              renderItem={renderGearItem}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.gearList}
            />
          </View>

          {/* Sponsors Section */}
          <View style={styles.sponsorsSection}>
            <Text style={styles.sectionTitle}>
              <FontAwesome5 name="handshake" size={18} color="#FFD600" />
              {" "}Sponsors
            </Text>
            <View style={styles.sponsorRow}>
              {enhancedProfile.sponsors.map((brand, index) => (
                <View key={index} style={styles.sponsorBadge}>
                  <Text style={styles.sponsorText}>{brand}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Achievements Section */}
          <View style={styles.achievementsSection}>
            <Text style={styles.sectionTitle}>
              <FontAwesome5 name="trophy" size={18} color="#FFD600" />
              {" "}Achievements
            </Text>
            <FlatList
              horizontal
              data={enhancedProfile.achievements}
              keyExtractor={item => item.id}
              renderItem={renderAchievement}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.achievementsList}
            />
          </View>

          {/* Action Buttons */}
          {!isOwnProfile ? (
            <View style={styles.actionsContainer}>
              <TouchableOpacity 
                style={[styles.actionBtn, isFollowing && styles.followingBtn]} 
                onPress={handleFollow}
              >
                <FontAwesome5 
                  name={isFollowing ? "user-check" : "user-plus"} 
                  size={16} 
                  color={isFollowing ? "#181b1e" : "#FFD600"} 
                />
                <Text style={[styles.actionText, isFollowing && styles.followingText]}>
                  {isFollowing ? "Following" : "Follow"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionBtn} onPress={handleChallenge}>
                <FontAwesome5 name="fire" size={16} color="#FFD600" />
                <Text style={styles.actionText}>Challenge</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionBtn} onPress={handleTrade}>
                <FontAwesome5 name="exchange-alt" size={16} color="#FFD600" />
                <Text style={styles.actionText}>Trade</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.actionsContainer}>
              <TouchableOpacity 
                style={[styles.actionBtn, styles.editProfileBtn]} 
                onPress={() => navigation.navigate('ProfileSettings')}
              >
                <FontAwesome5 name="edit" size={16} color="#181b1e" />
                <Text style={[styles.actionText, styles.editProfileText]}>Edit Profile</Text>
              </TouchableOpacity>
            </View>
          )}

          {renderSettingsSection()}
        </ScrollView>
      </SafeAreaView>

      <ChallengeModal
        visible={showChallengeModal}
        onClose={() => setShowChallengeModal(false)}
        targetUser={{
          id: enhancedProfile.id,
          username: enhancedProfile.username,
          avatar: enhancedProfile.avatar,
          level: enhancedProfile.level
        }}
      />

      <LanguagePicker
        visible={showLanguagePicker}
        onSelectLanguage={handleLanguageChange}
      />

      <TradeModal
        visible={showTradeModal}
        onClose={() => setShowTradeModal(false)}
        yourUser={{
          name: "You",
          avatar: user?.avatar || avatarUrl,
          level: user?.level || 12,
          hubbaBucks: user?.hubbaBucks || 150,
          inventory: user?.inventory || []
        }}
        theirUser={{
          id: enhancedProfile.id,
          name: enhancedProfile.username,
          avatar: enhancedProfile.avatar,
          level: enhancedProfile.level,
          hubbaBucks: enhancedProfile.hubbaBucks,
          inventory: enhancedProfile.gear || []
        }}
        onConfirm={(tradeData) => {
          console.log('Trade confirmed:', tradeData);
          // Here you would send the trade to your backend
          setShowTradeModal(false);
        }}
        onCancel={() => setShowTradeModal(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#181b1e",
  },
  container: { 
    flex: 1, 
    backgroundColor: "#181b1e",
  },
  
  // Header styles
  header: { 
    flexDirection: "row", 
    alignItems: "flex-start", 
    paddingHorizontal: 20, 
    paddingTop: 20,
    marginBottom: 20,
  },
  avatarContainer: {
    position: "relative",
    marginRight: 16,
  },
  avatar: { 
    width: 80, 
    height: 80, 
    borderRadius: 40, 
    backgroundColor: "#ddd",
    borderWidth: 3,
    borderColor: "#FFD600",
  },
  levelBadge: {
    position: "absolute",
    bottom: -5,
    right: -5,
    backgroundColor: "#FFD600",
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#181b1e",
  },
  levelText: {
    color: "#181b1e",
    fontWeight: "bold",
    fontSize: 12,
  },
  editAvatarBtn: {
    position: "absolute",
    top: -5,
    left: -5,
    backgroundColor: "#FFD600",
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#181b1e",
  },
  userInfo: {
    flex: 1,
    paddingTop: 5,
  },
  usernameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  username: { 
    color: "#FFF", 
    fontWeight: "bold", 
    fontSize: 24,
  },
  verifiedIcon: {
    marginLeft: 8,
  },
  sponsorIcon: {
    marginLeft: 4,
  },
  city: { 
    color: "#FFD600", 
    fontSize: 14, 
    fontWeight: "500", 
    marginBottom: 4,
  },
  joinDate: {
    color: "#999",
    fontSize: 12,
    marginBottom: 2,
  },
  lastActivity: {
    color: "#999",
    fontSize: 12,
    marginBottom: 8,
  },
  bio: { 
    fontSize: 15, 
    color: "#FFF", 
    lineHeight: 20,
  },

  // Badges styles
  badgesSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  badgesRow: { 
    flexDirection: "row",
  },
  badge: { 
    backgroundColor: "#FFD600", 
    borderRadius: 12, 
    marginRight: 10, 
    paddingHorizontal: 12, 
    paddingVertical: 6,
  },
  badgeText: { 
    color: "#181b1e", 
    fontWeight: "bold", 
    fontSize: 12,
  },

  // Stats styles
  statsContainer: {
    paddingHorizontal: 20,
    marginBottom: 25,
  },
  statsGrid: { 
    flexDirection: "row", 
    justifyContent: "space-around", 
    marginBottom: 15,
    backgroundColor: "#23262b",
    borderRadius: 12,
    paddingVertical: 15,
  },
  statItem: { 
    alignItems: "center",
    flex: 1,
  },
  statNum: { 
    color: "#FFD600", 
    fontWeight: "bold", 
    fontSize: 18,
  },
  statLabel: { 
    color: "#FFF", 
    fontSize: 12, 
    marginTop: 4,
  },

  // Gear styles
  gearSection: { 
    marginBottom: 25,
  },
  sectionTitle: { 
    color: "#FFF", 
    fontWeight: "bold", 
    fontSize: 18, 
    marginBottom: 15,
    paddingHorizontal: 20,
  },
  gearList: {
    paddingHorizontal: 20,
  },
  gearItem: { 
    alignItems: "center", 
    marginRight: 20,
    width: 80,
  },
  gearImageContainer: {
    position: "relative",
    borderWidth: 2,
    borderRadius: 12,
    padding: 4,
  },
  gearImg: { 
    width: 60, 
    height: 60, 
    backgroundColor: "#bbb", 
    borderRadius: 8,
  },
  rarityIndicator: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#181b1e",
  },
  gearLabel: { 
    color: "#FFF", 
    fontSize: 11, 
    marginTop: 6,
    textAlign: "center",
    lineHeight: 14,
  },
  gearRarity: {
    fontSize: 9,
    fontWeight: "bold",
    marginTop: 2,
  },

  // Sponsors styles
  sponsorsSection: {
    paddingHorizontal: 20,
    marginBottom: 25,
  },
  sponsorRow: { 
    flexDirection: "row", 
    flexWrap: "wrap",
  },
  sponsorBadge: { 
    backgroundColor: "#23262b", 
    borderRadius: 12, 
    paddingVertical: 8, 
    paddingHorizontal: 16, 
    margin: 4,
    borderWidth: 1,
    borderColor: "#FFD600",
  },
  sponsorText: { 
    fontSize: 13, 
    color: "#FFD600",
    fontWeight: "600",
  },

  // Achievements styles
  achievementsSection: {
    marginBottom: 30,
  },
  achievementsList: {
    paddingHorizontal: 20,
  },
  achievementItem: {
    alignItems: "center",
    backgroundColor: "#23262b",
    borderRadius: 12,
    padding: 15,
    marginRight: 15,
    width: 100,
  },
  achievementLocked: {
    backgroundColor: "#1a1d22",
  },
  achievementText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 8,
    textAlign: "center",
    lineHeight: 14,
  },
  achievementLockedText: {
    color: "#666",
  },

  // Actions styles
  actionsContainer: { 
    flexDirection: "row", 
    justifyContent: "space-evenly", 
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  actionBtn: { 
    flexDirection: "row", 
    alignItems: "center", 
    backgroundColor: "#23262b", 
    borderRadius: 12, 
    paddingVertical: 12, 
    paddingHorizontal: 20, 
    marginHorizontal: 5,
    flex: 1,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FFD600",
  },
  followingBtn: {
    backgroundColor: "#FFD600",
  },
  editProfileBtn: {
    backgroundColor: "#FFD600",
  },
  actionText: { 
    color: "#FFD600", 
    fontWeight: "bold", 
    marginLeft: 8, 
    fontSize: 14,
  },
  followingText: {
    color: "#181b1e",
  },
  editProfileText: {
    color: "#181b1e",
  },

  // Settings styles (keep existing for compatibility)
  settingsContainer: {
    backgroundColor: "#23262b",
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 32,
  },
  settingsButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#2C2C2E",
  },
  settingsButtonText: {
    fontSize: 16,
    color: "#fff",
  },
  settingsButtonValue: {
    fontSize: 16,
    color: "#666",
  },
  errorText: {
    color: "#FF6B6B",
    fontSize: 16,
    textAlign: "center",
    marginTop: 50,
  },
});
