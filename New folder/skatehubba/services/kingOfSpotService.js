import { db } from './firebase';
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  limit,
  serverTimestamp 
} from 'firebase/firestore';
import { analyticsService, EventCategory } from './analytics';
import GlobalErrorHandler from './errorHandler';
import aiTrickJudge from './aiTrickJudge';

class KingOfSpotService {
  constructor() {
    this.activeBattles = new Map();
    this.battleListeners = new Map();
  }

  async createBattle(spotId, battleConfig) {
    try {
      const battle = {
        spotId,
        creatorId: battleConfig.creatorId,
        title: battleConfig.title || 'King of the Spot',
        description: battleConfig.description || 'Battle for supremacy at this spot',
        type: battleConfig.type || 'realtime', // realtime, async, timed
        duration: battleConfig.duration || 3600000, // 1 hour in ms
        maxParticipants: battleConfig.maxParticipants || 10,
        entryFee: battleConfig.entryFee || 0,
        prizes: battleConfig.prizes || [],
        rules: battleConfig.rules || [],
        status: 'open',
        participants: [],
        submissions: [],
        leaderboard: [],
        startTime: battleConfig.startTime || new Date(),
        endTime: new Date(Date.now() + (battleConfig.duration || 3600000)),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const battleRef = await addDoc(collection(db, 'kingOfSpotBattles'), battle);
      
      analyticsService.logEvent('king_spot_battle_created', {
        category: EventCategory.CHALLENGE,
        spot_id: spotId,
        battle_id: battleRef.id,
        battle_type: battle.type,
        duration: battle.duration
      });

      return { id: battleRef.id, ...battle };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'king_of_spot',
        action: 'create_battle'
      });
      throw new Error('Failed to create battle');
    }
  }

  async joinBattle(battleId, userId) {
    try {
      const battleRef = doc(db, 'kingOfSpotBattles', battleId);
      
      // Add user to participants array
      await updateDoc(battleRef, {
        participants: [...(await this.getBattle(battleId)).participants, {
          userId,
          joinedAt: new Date(),
          submissions: 0,
          bestScore: 0
        }],
        updatedAt: serverTimestamp()
      });

      analyticsService.logEvent('king_spot_battle_joined', {
        category: EventCategory.CHALLENGE,
        battle_id: battleId,
        user_id: userId
      });

      return true;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'king_of_spot',
        action: 'join_battle'
      });
      throw new Error('Failed to join battle');
    }
  }

  async submitToBattle(battleId, submission) {
    try {
      // Analyze the trick first
      const analysis = await aiTrickJudge.analyzeClip(submission.videoUri, submission);
      
      const battleSubmission = {
        battleId,
        userId: submission.userId,
        videoUri: submission.videoUri,
        trickName: analysis.trickName,
        scores: analysis.scores,
        styleMetrics: analysis.styleMetrics,
        confidence: analysis.confidence,
        submittedAt: new Date(),
        votes: [],
        verified: analysis.confidence > 0.8
      };

      // Add submission to battle
      const battleRef = doc(db, 'kingOfSpotBattles', battleId);
      const battle = await this.getBattle(battleId);
      
      await updateDoc(battleRef, {
        submissions: [...battle.submissions, battleSubmission],
        updatedAt: serverTimestamp()
      });

      // Update leaderboard
      await this.updateLeaderboard(battleId);

      analyticsService.logEvent('king_spot_submission', {
        category: EventCategory.CHALLENGE,
        battle_id: battleId,
        trick_name: analysis.trickName,
        total_score: analysis.scores.total
      });

      return battleSubmission;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'king_of_spot',
        action: 'submit_to_battle'
      });
      throw new Error('Failed to submit to battle');
    }
  }

  async updateLeaderboard(battleId) {
    try {
      const battle = await this.getBattle(battleId);
      
      // Calculate leaderboard based on submissions
      const userScores = new Map();
      
      battle.submissions.forEach(submission => {
        const currentBest = userScores.get(submission.userId) || 0;
        if (submission.scores.total > currentBest) {
          userScores.set(submission.userId, {
            userId: submission.userId,
            bestScore: submission.scores.total,
            bestTrick: submission.trickName,
            submissionCount: battle.submissions.filter(s => s.userId === submission.userId).length
          });
        }
      });

      // Sort by score
      const leaderboard = Array.from(userScores.values())
        .sort((a, b) => b.bestScore - a.bestScore);

      const battleRef = doc(db, 'kingOfSpotBattles', battleId);
      await updateDoc(battleRef, {
        leaderboard,
        updatedAt: serverTimestamp()
      });

      return leaderboard;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'king_of_spot',
        action: 'update_leaderboard'
      });
      return [];
    }
  }

  async getBattle(battleId) {
    try {
      const battleRef = doc(db, 'kingOfSpotBattles', battleId);
      const battleSnap = await battleRef.get();
      
      if (!battleSnap.exists()) {
        throw new Error('Battle not found');
      }

      return { id: battleSnap.id, ...battleSnap.data() };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'king_of_spot',
        action: 'get_battle'
      });
      return null;
    }
  }

  async getActiveBattles(spotId = null) {
    try {
      let q = query(
        collection(db, 'kingOfSpotBattles'),
        where('status', '==', 'open'),
        orderBy('createdAt', 'desc'),
        limit(20)
      );

      if (spotId) {
        q = query(
          collection(db, 'kingOfSpotBattles'),
          where('spotId', '==', spotId),
          where('status', '==', 'open'),
          orderBy('createdAt', 'desc')
        );
      }

      const snapshot = await q.get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'king_of_spot',
        action: 'get_active_battles'
      });
      return [];
    }
  }

  subscribeToBattle(battleId, callback) {
    try {
      const battleRef = doc(db, 'kingOfSpotBattles', battleId);
      
      const unsubscribe = onSnapshot(battleRef, (doc) => {
        if (doc.exists()) {
          callback({ id: doc.id, ...doc.data() });
        }
      });

      this.battleListeners.set(battleId, unsubscribe);
      return unsubscribe;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'king_of_spot',
        action: 'subscribe_to_battle'
      });
      return () => {};
    }
  }

  async endBattle(battleId) {
    try {
      const battle = await this.getBattle(battleId);
      const winner = battle.leaderboard[0];
      
      const rewards = await this.calculateRewards(battle, winner);
      
      const battleRef = doc(db, 'kingOfSpotBattles', battleId);
      await updateDoc(battleRef, {
        status: 'completed',
        winner: winner?.userId,
        rewards,
        endedAt: new Date(),
        updatedAt: serverTimestamp()
      });

      // Award prizes
      if (winner) {
        await this.awardPrizes(winner.userId, rewards);
      }

      analyticsService.logEvent('king_spot_battle_ended', {
        category: EventCategory.CHALLENGE,
        battle_id: battleId,
        winner_id: winner?.userId,
        participant_count: battle.participants.length,
        submission_count: battle.submissions.length
      });

      return { winner, rewards };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'king_of_spot',
        action: 'end_battle'
      });
      throw new Error('Failed to end battle');
    }
  }

  async calculateRewards(battle, winner) {
    const rewards = {
      badges: [],
      shopDiscounts: [],
      arGraffiti: null,
      points: 0
    };

    if (winner) {
      rewards.badges.push({
        id: 'king_of_spot',
        name: 'King of the Spot',
        description: `Conquered ${battle.spotId}`,
        icon: 'crown',
        rarity: 'legendary'
      });

      rewards.points = 100 + (battle.participants.length * 10);
      
      if (battle.prizes.length > 0) {
        rewards.shopDiscounts = battle.prizes.filter(p => p.type === 'discount');
      }

      // Custom AR graffiti for the spot
      rewards.arGraffiti = {
        spotId: battle.spotId,
        design: 'crown',
        duration: 604800000, // 1 week
        message: `${winner.userId} is King!`
      };
    }

    return rewards;
  }

  async awardPrizes(userId, rewards) {
    try {
      // In production, this would update user's profile with rewards
      analyticsService.logEvent('king_spot_prizes_awarded', {
        category: EventCategory.CHALLENGE,
        user_id: userId,
        badges_count: rewards.badges.length,
        points: rewards.points
      });

      return true;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'king_of_spot',
        action: 'award_prizes'
      });
      return false;
    }
  }

  async voteOnSubmission(battleId, submissionId, userId, vote) {
    try {
      const battle = await this.getBattle(battleId);
      const submissionIndex = battle.submissions.findIndex(s => s.id === submissionId);
      
      if (submissionIndex === -1) {
        throw new Error('Submission not found');
      }

      const submission = battle.submissions[submissionIndex];
      const existingVoteIndex = submission.votes.findIndex(v => v.userId === userId);
      
      if (existingVoteIndex >= 0) {
        submission.votes[existingVoteIndex] = { userId, vote, votedAt: new Date() };
      } else {
        submission.votes.push({ userId, vote, votedAt: new Date() });
      }

      battle.submissions[submissionIndex] = submission;
      
      const battleRef = doc(db, 'kingOfSpotBattles', battleId);
      await updateDoc(battleRef, {
        submissions: battle.submissions,
        updatedAt: serverTimestamp()
      });

      return true;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'king_of_spot',
        action: 'vote_on_submission'
      });
      throw new Error('Failed to vote on submission');
    }
  }

  cleanup() {
    this.battleListeners.forEach(unsubscribe => unsubscribe());
    this.battleListeners.clear();
  }
}

export default new KingOfSpotService();
