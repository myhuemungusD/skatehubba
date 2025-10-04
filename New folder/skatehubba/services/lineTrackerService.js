import { db } from './firebase';
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs,
  getDoc,
  query, 
  where, 
  orderBy, 
  limit,
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { analyticsService, EventCategory } from './analytics';
import GlobalErrorHandler from './errorHandler';

class LineTrackerService {
  constructor() {
    this.activeLines = new Map();
    this.leaderboards = new Map();
    this.lineAttempts = new Map();
    this.globalStats = new Map();
  }

  // Line Creation and Management
  async createLine(creatorId, lineData) {
    try {
      const line = {
        creatorId,
        name: lineData.name,
        description: lineData.description || '',
        spotId: lineData.spotId,
        spotName: lineData.spotName,
        difficulty: lineData.difficulty || 'medium', // easy, medium, hard, expert, legendary
        tricks: lineData.tricks || [], // Array of trick objects with positions
        checkpoints: lineData.checkpoints || [],
        metadata: {
          estimatedDuration: lineData.estimatedDuration || 30,
          requiredSkillLevel: lineData.requiredSkillLevel || 'intermediate',
          spotType: lineData.spotType, // street, park, vert, etc.
          weather: lineData.weather,
          timeOfDay: lineData.timeOfDay
        },
        validation: {
          isVerified: false,
          verificationVideo: lineData.verificationVideo,
          verifiedBy: null,
          verifiedAt: null
        },
        stats: {
          totalAttempts: 0,
          completions: 0,
          successRate: 0,
          averageScore: 0,
          bestScore: 0,
          bestTime: null,
          uniqueAttemptors: 0
        },
        leaderboard: [],
        tags: lineData.tags || [],
        isPublic: lineData.isPublic !== false,
        status: 'pending_verification',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const lineRef = await addDoc(collection(db, 'lines'), line);
      
      analyticsService.logEvent('line_created', {
        category: EventCategory.CHALLENGE,
        user_id: creatorId,
        line_id: lineRef.id,
        difficulty: line.difficulty,
        tricks_count: line.tricks.length,
        spot_type: line.metadata.spotType
      });

      return { id: lineRef.id, ...line };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'line_tracker',
        action: 'create_line'
      });
      throw new Error('Failed to create line');
    }
  }

  async verifyLine(lineId, verificationData) {
    try {
      const verification = {
        isVerified: true,
        verifiedBy: verificationData.verifierId,
        verificationVideo: verificationData.videoUrl,
        verificationNotes: verificationData.notes,
        verifiedAt: new Date()
      };

      const lineRef = doc(db, 'lines', lineId);
      await updateDoc(lineRef, {
        validation: verification,
        status: 'active',
        updatedAt: new Date()
      });

      analyticsService.logEvent('line_verified', {
        category: EventCategory.CHALLENGE,
        line_id: lineId,
        verifier_id: verificationData.verifierId
      });

      return true;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'line_tracker',
        action: 'verify_line'
      });
      return false;
    }
  }

  // Line Attempts and Scoring
  async submitAttempt(userId, lineId, attemptData) {
    try {
      const line = await this.getLine(lineId);
      
      if (!line || line.status !== 'active') {
        throw new Error('Line not found or not active');
      }

      const attempt = {
        userId,
        lineId,
        videoUrl: attemptData.videoUrl,
        completedTricks: attemptData.completedTricks || [],
        checkpointsReached: attemptData.checkpointsReached || [],
        totalTime: attemptData.totalTime,
        isCompleted: attemptData.isCompleted || false,
        score: 0,
        breakdown: {
          tricksScore: 0,
          styleScore: 0,
          speedScore: 0,
          creativityScore: 0,
          penalties: 0
        },
        judges: attemptData.judges || [],
        communityVotes: [],
        metadata: {
          weather: attemptData.weather,
          timeOfDay: attemptData.timeOfDay,
          equipment: attemptData.equipment,
          cameraAngles: attemptData.cameraAngles || []
        },
        status: 'pending_review',
        submittedAt: new Date()
      };

      // Calculate score
      attempt.score = await this.calculateAttemptScore(attempt, line);

      const attemptRef = await addDoc(collection(db, 'lineAttempts'), attempt);
      
      // Update line statistics
      await this.updateLineStats(lineId, attempt);

      analyticsService.logEvent('line_attempt_submitted', {
        category: EventCategory.CHALLENGE,
        user_id: userId,
        line_id: lineId,
        is_completed: attempt.isCompleted,
        score: attempt.score,
        total_time: attempt.totalTime
      });

      return { id: attemptRef.id, ...attempt };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'line_tracker',
        action: 'submit_attempt'
      });
      throw new Error('Failed to submit attempt');
    }
  }

  async calculateAttemptScore(attempt, line) {
    let totalScore = 0;
    const maxScore = 1000;

    // Tricks Score (40% of total)
    const tricksScore = this.calculateTricksScore(attempt.completedTricks, line.tricks);
    attempt.breakdown.tricksScore = tricksScore;
    totalScore += tricksScore * 0.4;

    // Style Score (30% of total) - based on community/AI judging
    const styleScore = this.calculateStyleScore(attempt);
    attempt.breakdown.styleScore = styleScore;
    totalScore += styleScore * 0.3;

    // Speed Score (20% of total)
    const speedScore = this.calculateSpeedScore(attempt.totalTime, line.metadata.estimatedDuration);
    attempt.breakdown.speedScore = speedScore;
    totalScore += speedScore * 0.2;

    // Creativity Score (10% of total)
    const creativityScore = this.calculateCreativityScore(attempt, line);
    attempt.breakdown.creativityScore = creativityScore;
    totalScore += creativityScore * 0.1;

    // Apply penalties
    const penalties = this.calculatePenalties(attempt, line);
    attempt.breakdown.penalties = penalties;
    totalScore -= penalties;

    return Math.max(0, Math.min(maxScore, Math.round(totalScore)));
  }

  calculateTricksScore(completedTricks, lineTricks) {
    if (lineTricks.length === 0) return 0;

    let score = 0;
    const maxTricksScore = 400;

    completedTricks.forEach(trick => {
      const lineTrick = lineTricks.find(lt => lt.id === trick.trickId);
      if (lineTrick) {
        const difficultyMultiplier = this.getDifficultyMultiplier(lineTrick.difficulty);
        const cleanness = trick.cleanness || 0.8; // How clean the trick was (0-1)
        score += lineTrick.baseScore * difficultyMultiplier * cleanness;
      }
    });

    return Math.min(maxTricksScore, score);
  }

  calculateStyleScore(attempt) {
    // Simulated style scoring - in real app would use AI analysis
    const baseStyle = Math.random() * 100 + 100; // 100-200 base
    const judgeBonus = attempt.judges.length > 0 ? 50 : 0;
    return Math.min(300, baseStyle + judgeBonus);
  }

  calculateSpeedScore(actualTime, estimatedTime) {
    if (!actualTime || !estimatedTime) return 0;
    
    const ratio = estimatedTime / actualTime;
    if (ratio >= 1.2) return 200; // Significantly faster
    if (ratio >= 1.0) return 150; // On time or faster
    if (ratio >= 0.8) return 100; // Slightly slower
    return 50; // Much slower
  }

  calculateCreativityScore(attempt, line) {
    let creativity = 0;
    
    // Bonus for additional tricks not in the line
    const extraTricks = attempt.completedTricks.filter(trick => 
      !line.tricks.some(lt => lt.id === trick.trickId)
    );
    creativity += extraTricks.length * 20;

    // Bonus for unique approach/style
    creativity += Math.random() * 60; // Simulated creativity assessment

    return Math.min(100, creativity);
  }

  calculatePenalties(attempt, line) {
    let penalties = 0;

    // Missed mandatory checkpoints
    const missedCheckpoints = line.checkpoints.filter(cp => 
      cp.mandatory && !attempt.checkpointsReached.includes(cp.id)
    );
    penalties += missedCheckpoints.length * 50;

    // Failed tricks
    const failedTricks = line.tricks.filter(trick => 
      !attempt.completedTricks.some(ct => ct.trickId === trick.id)
    );
    penalties += failedTricks.length * 25;

    return penalties;
  }

  getDifficultyMultiplier(difficulty) {
    const multipliers = {
      'very_easy': 0.5,
      'easy': 0.7,
      'medium': 1.0,
      'hard': 1.3,
      'very_hard': 1.6,
      'expert': 2.0,
      'legendary': 2.5
    };
    return multipliers[difficulty] || 1.0;
  }

  // Leaderboard Management
  async updateLineStats(lineId, attempt) {
    try {
      const line = await this.getLine(lineId);
      
      if (!line) return;

      // Update basic stats
      line.stats.totalAttempts += 1;
      if (attempt.isCompleted) {
        line.stats.completions += 1;
      }
      
      line.stats.successRate = (line.stats.completions / line.stats.totalAttempts) * 100;
      
      // Update scores
      if (attempt.score > line.stats.bestScore) {
        line.stats.bestScore = attempt.score;
      }
      
      // Update time
      if (attempt.totalTime && (!line.stats.bestTime || attempt.totalTime < line.stats.bestTime)) {
        line.stats.bestTime = attempt.totalTime;
      }

      // Update leaderboard
      await this.updateLeaderboard(lineId, attempt);

      const lineRef = doc(db, 'lines', lineId);
      await updateDoc(lineRef, {
        stats: line.stats,
        updatedAt: new Date()
      });

    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'line_tracker',
        action: 'update_line_stats'
      });
    }
  }

  async updateLeaderboard(lineId, attempt) {
    try {
      const line = await this.getLine(lineId);
      
      let leaderboard = line.leaderboard || [];
      
      // Find existing entry for user
      const existingIndex = leaderboard.findIndex(entry => entry.userId === attempt.userId);
      
      const newEntry = {
        userId: attempt.userId,
        attemptId: attempt.id,
        score: attempt.score,
        totalTime: attempt.totalTime,
        isCompleted: attempt.isCompleted,
        rank: 0,
        achievedAt: new Date()
      };

      if (existingIndex >= 0) {
        // Update if new score is better
        if (attempt.score > leaderboard[existingIndex].score) {
          leaderboard[existingIndex] = newEntry;
        }
      } else {
        leaderboard.push(newEntry);
      }

      // Sort and assign ranks
      leaderboard.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.totalTime - b.totalTime; // Lower time is better for tie-breaking
      });

      leaderboard.forEach((entry, index) => {
        entry.rank = index + 1;
      });

      // Keep only top 100
      leaderboard = leaderboard.slice(0, 100);

      const lineRef = doc(db, 'lines', lineId);
      await updateDoc(lineRef, {
        leaderboard: leaderboard,
        updatedAt: new Date()
      });

      return leaderboard;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'line_tracker',
        action: 'update_leaderboard'
      });
      return [];
    }
  }

  async getGlobalLeaderboard(timeframe = 'all_time', category = 'overall') {
    try {
      const startDate = this.getTimeframeStartDate(timeframe);
      
      let q = query(
        collection(db, 'lineAttempts'),
        where('submittedAt', '>=', startDate),
        where('isCompleted', '==', true)
      );

      if (category !== 'overall') {
        // Filter by category (difficulty, spot type, etc.)
        // This would require additional indexing in a real implementation
      }

      q = query(q, orderBy('score', 'desc'), limit(100));

      const snapshot = await getDocs(q);
      const attempts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Group by user and take best attempt
      const userBestAttempts = new Map();
      
      attempts.forEach(attempt => {
        const existing = userBestAttempts.get(attempt.userId);
        if (!existing || attempt.score > existing.score) {
          userBestAttempts.set(attempt.userId, attempt);
        }
      });

      const leaderboard = Array.from(userBestAttempts.values())
        .sort((a, b) => b.score - a.score)
        .map((attempt, index) => ({
          rank: index + 1,
          userId: attempt.userId,
          score: attempt.score,
          lineId: attempt.lineId,
          achievedAt: attempt.submittedAt
        }));

      return leaderboard;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'line_tracker',
        action: 'get_global_leaderboard'
      });
      return [];
    }
  }

  async getUserRankings(userId) {
    try {
      // Get user's best attempts for each line
      const q = query(
        collection(db, 'lineAttempts'),
        where('userId', '==', userId),
        where('isCompleted', '==', true),
        orderBy('score', 'desc')
      );

      const snapshot = await getDocs(q);
      const attempts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Group by line and take best attempt
      const lineResults = new Map();
      
      attempts.forEach(attempt => {
        const existing = lineResults.get(attempt.lineId);
        if (!existing || attempt.score > existing.score) {
          lineResults.set(attempt.lineId, attempt);
        }
      });

      const rankings = Array.from(lineResults.values());

      // Calculate overall stats
      const stats = {
        totalLinesCompleted: rankings.length,
        averageScore: rankings.reduce((sum, r) => sum + r.score, 0) / rankings.length || 0,
        bestScore: Math.max(...rankings.map(r => r.score), 0),
        totalScore: rankings.reduce((sum, r) => sum + r.score, 0)
      };

      return {
        rankings,
        stats
      };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'line_tracker',
        action: 'get_user_rankings'
      });
      return { rankings: [], stats: {} };
    }
  }

  // Line Discovery
  async discoverLines(filters = {}) {
    try {
      let q = collection(db, 'lines');
      
      // Apply filters
      q = query(q, where('status', '==', 'active'));
      
      if (filters.difficulty) {
        q = query(q, where('difficulty', '==', filters.difficulty));
      }
      
      if (filters.spotType) {
        q = query(q, where('metadata.spotType', '==', filters.spotType));
      }
      
      if (filters.location) {
        // Geographic queries would need special indexing
        q = query(q, where('spotId', '==', filters.spotId));
      }

      // Sort by popularity or newest
      const sortBy = filters.sortBy || 'popularity';
      if (sortBy === 'newest') {
        q = query(q, orderBy('createdAt', 'desc'));
      } else {
        q = query(q, orderBy('stats.totalAttempts', 'desc'));
      }

      q = query(q, limit(50));

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'line_tracker',
        action: 'discover_lines'
      });
      return [];
    }
  }

  async getTrendingLines(timeframe = '7days') {
    try {
      const startDate = this.getTimeframeStartDate(timeframe);
      
      // Get recent attempts to determine trending lines
      const q = query(
        collection(db, 'lineAttempts'),
        where('submittedAt', '>=', startDate),
        orderBy('submittedAt', 'desc')
      );

      const snapshot = await getDocs(q);
      const attempts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Count attempts per line
      const lineCounts = new Map();
      attempts.forEach(attempt => {
        const count = lineCounts.get(attempt.lineId) || 0;
        lineCounts.set(attempt.lineId, count + 1);
      });

      // Get top trending lines
      const trendingLineIds = Array.from(lineCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(entry => entry[0]);

      // Fetch line details
      const trendingLines = await Promise.all(
        trendingLineIds.map(lineId => this.getLine(lineId))
      );

      return trendingLines.filter(line => line !== null);
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'line_tracker',
        action: 'get_trending_lines'
      });
      return [];
    }
  }

  // Utility Functions
  async getLine(lineId) {
    try {
      const lineRef = doc(db, 'lines', lineId);
      const lineSnap = await getDoc(lineRef);
      return lineSnap.exists() ? { id: lineSnap.id, ...lineSnap.data() } : null;
    } catch (error) {
      return null;
    }
  }

  getTimeframeStartDate(timeframe) {
    const now = new Date();
    switch (timeframe) {
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7days':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30days':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case '90days':
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      case 'year':
        return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      default:
        return new Date('1900-01-01'); // All time
    }
  }

  async getLineLeaderboard(lineId, limit = 50) {
    try {
      const line = await this.getLine(lineId);
      if (!line) return [];

      return line.leaderboard.slice(0, limit);
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'line_tracker',
        action: 'get_line_leaderboard'
      });
      return [];
    }
  }
}

export default new LineTrackerService();
