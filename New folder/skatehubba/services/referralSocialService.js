import { db } from './firebase';
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  getDocs,
  getDoc,
  query, 
  where, 
  orderBy, 
  limit,
  serverTimestamp,
  arrayUnion
} from 'firebase/firestore';
import { analyticsService, EventCategory } from './analytics';
import GlobalErrorHandler from './errorHandler';
import CurrencyProgressionService from './currencyProgressionService';

class ReferralSocialService {
  constructor() {
    this.referralCodes = new Map();
    this.socialRewards = new Map();
    this.giftingSystem = new Map();
    this.communityEvents = new Map();
  }

  // REFERRAL SYSTEM
  async generateReferralCode(userId) {
    try {
      const userProfile = await CurrencyProgressionService.getUserProfile(userId);
      
      // Create unique referral code
      const referralCode = `SKATE${userId.substring(0, 4).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      
      const referral = {
        userId,
        code: referralCode,
        uses: 0,
        maxUses: 50, // Limit to prevent abuse
        totalRewardsEarned: {
          hubbaBucks: 0,
          xp: 0
        },
        referredUsers: [],
        isActive: true,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
      };

      const referralRef = await addDoc(collection(db, 'referralCodes'), referral);
      
      // Update user profile with referral code
      const userRef = doc(db, 'userProfiles', userId);
      await updateDoc(userRef, {
        referralCode: referralCode,
        referralId: referralRef.id
      });

      analyticsService.logEvent('referral_code_generated', {
        category: EventCategory.SOCIAL,
        user_id: userId,
        referral_code: referralCode
      });

      return { id: referralRef.id, ...referral };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'referral_social',
        action: 'generate_referral_code'
      });
      throw new Error('Failed to generate referral code');
    }
  }

  async useReferralCode(newUserId, referralCode) {
    try {
      // Find referral code
      const q = query(
        collection(db, 'referralCodes'),
        where('code', '==', referralCode),
        where('isActive', '==', true)
      );

      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        throw new Error('Invalid or expired referral code');
      }

      const referralDoc = snapshot.docs[0];
      const referral = { id: referralDoc.id, ...referralDoc.data() };

      // Check if code can still be used
      if (referral.uses >= referral.maxUses) {
        throw new Error('Referral code has reached maximum uses');
      }

      if (new Date() > new Date(referral.expiresAt)) {
        throw new Error('Referral code has expired');
      }

      // Check if user already used a referral code
      const newUserProfile = await CurrencyProgressionService.getUserProfile(newUserId);
      if (newUserProfile.referredBy) {
        throw new Error('User already used a referral code');
      }

      // Process referral rewards
      const rewards = await this.processReferralRewards(referral.userId, newUserId, referralCode);

      // Update referral record
      const referralRef = doc(db, 'referralCodes', referral.id);
      await updateDoc(referralRef, {
        uses: referral.uses + 1,
        referredUsers: arrayUnion(newUserId),
        totalRewardsEarned: {
          hubbaBucks: referral.totalRewardsEarned.hubbaBucks + rewards.referrer.hubbaBucks,
          xp: referral.totalRewardsEarned.xp + rewards.referrer.xp
        },
        lastUsed: new Date()
      });

      // Update new user profile
      const newUserRef = doc(db, 'userProfiles', newUserId);
      await updateDoc(newUserRef, {
        referredBy: referral.userId,
        referralCode: referralCode,
        referralRewardsReceived: rewards.referee
      });

      analyticsService.logEvent('referral_code_used', {
        category: EventCategory.SOCIAL,
        referrer_id: referral.userId,
        referee_id: newUserId,
        referral_code: referralCode,
        referrer_rewards: rewards.referrer,
        referee_rewards: rewards.referee
      });

      return rewards;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'referral_social',
        action: 'use_referral_code'
      });
      throw error;
    }
  }

  async processReferralRewards(referrerId, refereeId, referralCode) {
    try {
      const referrerRewards = {
        hubbaBucks: 100, // Premium currency reward for referrer
        xp: 500
      };

      const refereeRewards = {
        hubbaBucks: 50, // Welcome bonus for new user
        xp: 250
      };

      // Award rewards to referrer
      await CurrencyProgressionService.addHubbaBucks(
        referrerId, 
        referrerRewards.hubbaBucks, 
        'referral', 
        { referee_id: refereeId, code: referralCode }
      );
      
      await CurrencyProgressionService.addXP(
        referrerId, 
        referrerRewards.xp, 
        'referral', 
        { referee_id: refereeId, code: referralCode }
      );

      // Award welcome bonus to new user
      await CurrencyProgressionService.addHubbaBucks(
        refereeId, 
        refereeRewards.hubbaBucks, 
        'referral', 
        { referrer_id: referrerId, code: referralCode }
      );
      
      await CurrencyProgressionService.addXP(
        refereeId, 
        refereeRewards.xp, 
        'referral', 
        { referrer_id: referrerId, code: referralCode }
      );

      // Send notifications
      await this.sendReferralSuccessNotifications(referrerId, refereeId, referrerRewards, refereeRewards);

      return {
        referrer: referrerRewards,
        referee: refereeRewards
      };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'referral_social',
        action: 'process_referral_rewards'
      });
      throw new Error('Failed to process referral rewards');
    }
  }

  // SOCIAL REWARDS SYSTEM
  async awardSocialReward(userId, action, metadata = {}) {
    try {
      const rewardTable = {
        like_clip: { xp: 5 },
        comment_clip: { xp: 10 },
        share_clip: { xp: 15, hubbaBucks: 5 },
        crew_invite: { xp: 25 },
        session_host: { xp: 50 },
        spot_discovery: { xp: 100 },
        community_help: { xp: 30 },
        event_participation: { xp: 75, hubbaBucks: 10 },
        content_creation: { xp: 100, hubbaBucks: 25 }
      };

      const reward = rewardTable[action];
      if (!reward) {
        throw new Error('Invalid social action');
      }

      // Check daily limits to prevent abuse
      const dailyLimit = await this.checkDailyRewardLimit(userId, action);
      if (!dailyLimit.canEarn) {
        return { 
          success: false, 
          reason: 'Daily limit reached',
          nextResetTime: dailyLimit.nextReset
        };
      }

      const transactions = [];

      // Award XP
      if (reward.xp) {
        const xpTransaction = await CurrencyProgressionService.addXP(
          userId, 
          reward.xp, 
          'social', 
          { action, ...metadata }
        );
        transactions.push(xpTransaction);
      }

      // Award Hubba Bucks (if applicable)
      if (reward.hubbaBucks) {
        const hbTransaction = await CurrencyProgressionService.addHubbaBucks(
          userId, 
          reward.hubbaBucks, 
          'social', 
          { action, ...metadata }
        );
        transactions.push(hbTransaction);
      }

      // Update daily tracking
      await this.updateDailyRewardTracking(userId, action);

      analyticsService.logEvent('social_reward_earned', {
        category: EventCategory.SOCIAL,
        user_id: userId,
        action: action,
        xp_earned: reward.xp || 0,
        hubba_bucks_earned: reward.hubbaBucks || 0
      });

      return {
        success: true,
        rewards: reward,
        transactions: transactions
      };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'referral_social',
        action: 'award_social_reward'
      });
      return { success: false, reason: 'Failed to award reward' };
    }
  }

  async checkDailyRewardLimit(userId, action) {
    try {
      const today = new Date().toDateString();
      const trackingRef = doc(db, 'dailyRewardTracking', `${userId}_${today}`);
      const trackingDoc = await getDoc(trackingRef);

      const limits = {
        like_clip: 50,
        comment_clip: 20,
        share_clip: 10,
        crew_invite: 5,
        session_host: 3,
        spot_discovery: 5,
        community_help: 10,
        event_participation: 3,
        content_creation: 5
      };

      const limit = limits[action] || 0;
      
      if (!trackingDoc.exists()) {
        return { canEarn: true, remaining: limit };
      }

      const data = trackingDoc.data();
      const currentCount = data[action] || 0;

      return {
        canEarn: currentCount < limit,
        remaining: Math.max(0, limit - currentCount),
        nextReset: new Date(new Date().getTime() + 24 * 60 * 60 * 1000)
      };
    } catch (error) {
      return { canEarn: false, remaining: 0 };
    }
  }

  async updateDailyRewardTracking(userId, action) {
    try {
      const today = new Date().toDateString();
      const trackingRef = doc(db, 'dailyRewardTracking', `${userId}_${today}`);
      
      const trackingDoc = await getDoc(trackingRef);
      
      if (trackingDoc.exists()) {
        const currentCount = trackingDoc.data()[action] || 0;
        await updateDoc(trackingRef, {
          [action]: currentCount + 1,
          lastUpdated: new Date()
        });
      } else {
        await updateDoc(trackingRef, {
          userId,
          date: today,
          [action]: 1,
          createdAt: new Date(),
          lastUpdated: new Date()
        });
      }
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'referral_social',
        action: 'update_daily_reward_tracking'
      });
    }
  }

  // GIFTING SYSTEM
  async sendGift(senderId, recipientId, giftData) {
    try {
      const senderProfile = await CurrencyProgressionService.getUserProfile(senderId);
      
      // Validate gift
      const gift = {
        type: giftData.type, // 'hubba_bucks', 'xp', 'item'
        amount: giftData.amount || 0,
        itemId: giftData.itemId || null,
        message: giftData.message || '',
        occasion: giftData.occasion || 'friendship' // birthday, achievement, friendship, etc.
      };

      // Check if sender can afford the gift
      if (gift.type === 'hubba_bucks') {
        if (senderProfile.hubbaBucks < gift.amount) {
          throw new Error('Insufficient Hubba Bucks to send gift');
        }
        
        // Deduct from sender
        await CurrencyProgressionService.spendHubbaBucks(senderId, gift.amount, 'gift_sent');
      } else if (gift.type === 'xp') {
        if (senderProfile.xp < gift.amount) {
          throw new Error('Insufficient XP to send gift');
        }
        
        // Deduct from sender
        await CurrencyProgressionService.spendXP(senderId, gift.amount, 'gift_sent');
      }

      // Create gift record
      const giftRecord = {
        senderId,
        recipientId,
        ...gift,
        status: 'pending',
        sentAt: new Date(),
        claimedAt: null,
        giftId: this.generateGiftId()
      };

      const giftRef = await addDoc(collection(db, 'gifts'), giftRecord);

      // Send notification to recipient
      await this.sendGiftNotification(recipientId, senderId, gift);

      analyticsService.logEvent('gift_sent', {
        category: EventCategory.SOCIAL,
        sender_id: senderId,
        recipient_id: recipientId,
        gift_type: gift.type,
        gift_amount: gift.amount,
        occasion: gift.occasion
      });

      return { id: giftRef.id, ...giftRecord };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'referral_social',
        action: 'send_gift'
      });
      throw error;
    }
  }

  async claimGift(recipientId, giftId) {
    try {
      const giftRef = doc(db, 'gifts', giftId);
      const giftDoc = await getDoc(giftRef);

      if (!giftDoc.exists()) {
        throw new Error('Gift not found');
      }

      const gift = giftDoc.data();

      if (gift.recipientId !== recipientId) {
        throw new Error('Not authorized to claim this gift');
      }

      if (gift.status === 'claimed') {
        throw new Error('Gift already claimed');
      }

      // Award gift to recipient
      if (gift.type === 'hubba_bucks') {
        await CurrencyProgressionService.addHubbaBucks(
          recipientId, 
          gift.amount, 
          'gift_received', 
          { sender_id: gift.senderId, gift_id: giftId }
        );
      } else if (gift.type === 'xp') {
        await CurrencyProgressionService.addXP(
          recipientId, 
          gift.amount, 
          'gift_received', 
          { sender_id: gift.senderId, gift_id: giftId }
        );
      } else if (gift.type === 'item') {
        // Award item logic would go here
        await this.awardGiftItem(recipientId, gift.itemId);
      }

      // Update gift status
      await updateDoc(giftRef, {
        status: 'claimed',
        claimedAt: new Date()
      });

      // Send thank you notification to sender
      await this.sendGiftClaimedNotification(gift.senderId, recipientId, gift);

      analyticsService.logEvent('gift_claimed', {
        category: EventCategory.SOCIAL,
        recipient_id: recipientId,
        sender_id: gift.senderId,
        gift_type: gift.type,
        gift_amount: gift.amount
      });

      return gift;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'referral_social',
        action: 'claim_gift'
      });
      throw error;
    }
  }

  // COMMUNITY EVENTS
  async createCommunityEvent(eventData) {
    try {
      const event = {
        name: eventData.name,
        description: eventData.description,
        type: eventData.type, // 'challenge', 'contest', 'community_day', 'charity'
        
        // Timing
        startTime: eventData.startTime,
        endTime: eventData.endTime,
        registrationDeadline: eventData.registrationDeadline,
        
        // Rewards
        rewards: {
          participation: eventData.participationRewards || { xp: 100 },
          top10: eventData.top10Rewards || { hubbaBucks: 200, xp: 500 },
          top3: eventData.top3Rewards || { hubbaBucks: 500, xp: 1000 },
          winner: eventData.winnerRewards || { hubbaBucks: 1000, xp: 2000 }
        },
        
        // Requirements
        minLevel: eventData.minLevel || 1,
        entryFee: eventData.entryFee || null,
        maxParticipants: eventData.maxParticipants || 1000,
        
        // Tracking
        participants: [],
        leaderboard: [],
        totalPrizePool: 0,
        
        status: 'upcoming', // upcoming, live, ended
        createdAt: new Date()
      };

      const eventRef = await addDoc(collection(db, 'communityEvents'), event);
      
      analyticsService.logEvent('community_event_created', {
        category: EventCategory.COMMUNITY,
        event_id: eventRef.id,
        event_type: event.type,
        max_participants: event.maxParticipants
      });

      return { id: eventRef.id, ...event };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'referral_social',
        action: 'create_community_event'
      });
      throw new Error('Failed to create community event');
    }
  }

  // Utility Functions
  generateGiftId() {
    return `gift_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async sendReferralSuccessNotifications(referrerId, refereeId, referrerRewards, refereeRewards) {
    try {
      // Notification to referrer
      await addDoc(collection(db, 'notifications'), {
        userId: referrerId,
        type: 'referral_success',
        title: '🎉 Referral Success!',
        message: `Your friend joined SkateHubba! You earned ${referrerRewards.hubbaBucks} Hubba Bucks and ${referrerRewards.xp} XP!`,
        timestamp: new Date(),
        read: false,
        category: 'social'
      });

      // Welcome notification to new user
      await addDoc(collection(db, 'notifications'), {
        userId: refereeId,
        type: 'welcome_bonus',
        title: '🛹 Welcome to SkateHubba!',
        message: `Thanks for joining! You received ${refereeRewards.hubbaBucks} Hubba Bucks and ${refereeRewards.xp} XP as a welcome bonus!`,
        timestamp: new Date(),
        read: false,
        category: 'welcome'
      });
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'referral_social',
        action: 'send_referral_success_notifications'
      });
    }
  }

  async sendGiftNotification(recipientId, senderId, gift) {
    try {
      await addDoc(collection(db, 'notifications'), {
        userId: recipientId,
        type: 'gift_received',
        title: '🎁 You received a gift!',
        message: `Someone sent you ${gift.amount} ${gift.type.replace('_', ' ')}! Tap to claim.`,
        timestamp: new Date(),
        read: false,
        category: 'social',
        metadata: { senderId, giftType: gift.type, amount: gift.amount }
      });
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'referral_social',
        action: 'send_gift_notification'
      });
    }
  }

  async getUserReferralStats(userId) {
    try {
      const q = query(
        collection(db, 'referralCodes'),
        where('userId', '==', userId)
      );

      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        return {
          hasReferralCode: false,
          stats: null
        };
      }

      const referral = snapshot.docs[0].data();
      
      return {
        hasReferralCode: true,
        code: referral.code,
        stats: {
          totalReferrals: referral.uses,
          totalRewardsEarned: referral.totalRewardsEarned,
          referredUsers: referral.referredUsers.length,
          remainingUses: referral.maxUses - referral.uses
        }
      };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'referral_social',
        action: 'get_user_referral_stats'
      });
      return { hasReferralCode: false, stats: null };
    }
  }
}

export default new ReferralSocialService();
