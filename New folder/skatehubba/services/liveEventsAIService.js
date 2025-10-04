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
  onSnapshot,
  runTransaction,
  serverTimestamp
} from 'firebase/firestore';
import { analyticsService, EventCategory } from './analytics';
import GlobalErrorHandler from './errorHandler';

class LiveEventsAIService {
  constructor() {
    this.activeEvents = new Map();
    this.aiProcessingQueue = new Map();
    this.liveJudging = new Map();
    this.voiceChannels = new Map();
  }

  // LIVE EVENT SYSTEM

  async createLiveEvent(eventData) {
    try {
      const {
        type, // 'king_of_spot', 'online_comp', 'crew_battle', 'session_lobby'
        title,
        description,
        spotId,
        startTime,
        duration = 3600000, // 1 hour default
        maxParticipants = 20,
        entryFee = 0,
        prizePool = {},
        rules = {},
        judgeMode = 'community', // 'community', 'ai', 'pro_judge'
        streamingEnabled = true
      } = eventData;

      const event = {
        id: `live_event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        title,
        description,
        spotId,
        startTime,
        endTime: new Date(startTime.getTime() + duration),
        maxParticipants,
        entryFee,
        prizePool,
        rules,
        judgeMode,
        streamingEnabled,
        status: 'scheduled',
        
        participants: [],
        submissions: [],
        leaderboard: [],
        liveChat: [],
        viewerCount: 0,
        
        // Live streaming info
        stream: {
          rtmpUrl: `rtmp://stream.skatehubba.com/live/${this.generateStreamKey()}`,
          webRtcRoom: `event_${Date.now()}`,
          chatEnabled: true,
          recordingEnabled: true
        },
        
        // AI integration
        aiSettings: {
          autoAnalysis: type === 'online_comp',
          realTimeScoring: true,
          trickDetection: true,
          styleAnalysis: judgeMode === 'ai'
        },
        
        createdAt: serverTimestamp(),
        lastActivity: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'liveEvents'), event);
      event.id = docRef.id;

      // Schedule event notifications
      await this.scheduleEventNotifications(event);

      analyticsService.logEvent('live_event_created', {
        category: EventCategory.EVENTS,
        event_type: type,
        event_id: docRef.id,
        max_participants: maxParticipants,
        has_prize_pool: Object.keys(prizePool).length > 0
      });

      return { success: true, eventId: docRef.id, event };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'live_events_ai',
        action: 'create_live_event'
      });
      throw error;
    }
  }

  // KING OF THE SPOT BATTLES

  async startKingOfSpotBattle(spotId, initiatorId) {
    try {
      const spot = await this.getSpotInfo(spotId);
      if (!spot) throw new Error('Spot not found');

      const battle = await this.createLiveEvent({
        type: 'king_of_spot',
        title: `👑 King of ${spot.name}`,
        description: `Live battle at ${spot.name}! Best trick wins the crown!`,
        spotId,
        startTime: new Date(),
        duration: 1800000, // 30 minutes
        maxParticipants: 8,
        entryFee: 100, // Hubba Bucks
        prizePool: {
          winner: { hubbaBucks: 500, xp: 1000, badge: 'king_of_spot' },
          runnerUp: { hubbaBucks: 200, xp: 500 },
          participation: { xp: 100 }
        },
        rules: {
          timeLimit: 120, // 2 minutes per turn
          attemptsAllowed: 3,
          judgeMode: 'community',
          trickRepeatAllowed: false
        },
        judgeMode: 'community'
      });

      // Auto-join initiator
      await this.joinLiveEvent(battle.eventId, initiatorId);

      // Broadcast to nearby users
      await this.notifyNearbyUsers(spotId, battle);

      return battle;
    } catch (error) {
      throw error;
    }
  }

  async joinLiveEvent(eventId, userId) {
    try {
      const eventRef = doc(db, 'liveEvents', eventId);
      
      return await runTransaction(db, async (transaction) => {
        const eventSnap = await transaction.get(eventRef);
        if (!eventSnap.exists()) throw new Error('Event not found');

        const event = eventSnap.data();
        
        // Check if event is joinable
        if (event.status !== 'scheduled' && event.status !== 'active') {
          throw new Error('Event not available for joining');
        }
        
        if (event.participants.length >= event.maxParticipants) {
          throw new Error('Event is full');
        }
        
        if (event.participants.includes(userId)) {
          throw new Error('Already joined this event');
        }

        // Add participant
        const updatedParticipants = [...event.participants, userId];
        
        transaction.update(eventRef, {
          participants: updatedParticipants,
          lastActivity: serverTimestamp()
        });

        // Start event if minimum participants reached
        if (updatedParticipants.length >= 2 && event.status === 'scheduled') {
          transaction.update(eventRef, { status: 'active' });
        }

        // Deduct entry fee if applicable
        if (event.entryFee > 0) {
          const userRef = doc(db, 'userProfiles', userId);
          const userSnap = await transaction.get(userRef);
          const userData = userSnap.data();
          
          if ((userData.hubbaBucks || 0) < event.entryFee) {
            throw new Error('Insufficient Hubba Bucks for entry fee');
          }
          
          transaction.update(userRef, {
            hubbaBucks: (userData.hubbaBucks || 0) - event.entryFee
          });
        }

        analyticsService.logEvent('live_event_joined', {
          category: EventCategory.EVENTS,
          event_id: eventId,
          user_id: userId,
          event_type: event.type
        });

        return { success: true };
      });
    } catch (error) {
      throw error;
    }
  }

  // SESSION LOBBIES WITH VOICE/VIDEO

  async createSessionLobby(hostUserId, sessionData) {
    try {
      const {
        title = 'Skate Session',
        location,
        maxParticipants = 6,
        isPublic = true,
        features = {
          voiceChat: true,
          videoStream: true,
          screenShare: true,
          liveJudging: true
        }
      } = sessionData;

      const lobby = await this.createLiveEvent({
        type: 'session_lobby',
        title,
        description: 'Live session with voice and video chat',
        spotId: location?.spotId || null,
        startTime: new Date(),
        duration: 7200000, // 2 hours
        maxParticipants,
        streamingEnabled: true,
        judgeMode: 'community'
      });

      // Set up WebRTC room
      const webRtcConfig = await this.setupWebRTCRoom(lobby.eventId, features);
      
      // Update event with WebRTC details
      await updateDoc(doc(db, 'liveEvents', lobby.eventId), {
        webRtcConfig,
        features,
        isPublic
      });

      return { ...lobby, webRtcConfig };
    } catch (error) {
      throw error;
    }
  }

  async setupWebRTCRoom(eventId, features) {
    return {
      roomId: `session_${eventId}`,
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { 
          urls: 'turn:turn.skatehubba.com:3478',
          username: 'skatehubba',
          credential: 'sk8hubba2025'
        }
      ],
      features: {
        audio: features.voiceChat,
        video: features.videoStream,
        screenShare: features.screenShare,
        dataChannel: true // For live reactions, chat
      },
      quality: {
        video: { width: 1280, height: 720, framerate: 30 },
        audio: { sampleRate: 48000, channels: 2 }
      }
    };
  }

  // AI VIDEO ANALYSIS

  async analyzeSkateVideo(videoData) {
    try {
      const {
        videoUrl,
        userId,
        sessionId,
        submissionType = 'trick_attempt', // 'trick_attempt', 'line', 'session_clip'
        requestedAnalysis = ['tricks', 'style', 'landing', 'difficulty']
      } = videoData;

      const analysisId = `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Queue for AI processing
      const analysisJob = {
        id: analysisId,
        videoUrl,
        userId,
        sessionId,
        submissionType,
        requestedAnalysis,
        status: 'queued',
        queuedAt: serverTimestamp(),
        estimatedCompletion: new Date(Date.now() + 60000), // 1 minute estimate
        results: null
      };

      await addDoc(collection(db, 'aiAnalysisJobs'), analysisJob);

      // Simulate AI processing (in production, this would be actual AI)
      setTimeout(() => this.processVideoAnalysis(analysisId), 5000);

      return { success: true, analysisId, estimatedTime: 60 };
    } catch (error) {
      throw error;
    }
  }

  async processVideoAnalysis(analysisId) {
    try {
      // Simulate AI analysis results
      const results = {
        tricksDetected: await this.detectTricks(),
        styleAnalysis: await this.analyzeStyle(),
        technicalScores: await this.calculateTechnicalScores(),
        landingAnalysis: await this.analyzeLanding(),
        overallRating: 0,
        confidence: 0.85,
        processingTime: 4.2
      };

      // Calculate overall rating
      results.overallRating = this.calculateOverallRating(results);

      // Update analysis job with results
      const jobQuery = query(
        collection(db, 'aiAnalysisJobs'),
        where('id', '==', analysisId)
      );
      
      const jobSnapshot = await getDocs(jobQuery);
      if (!jobSnapshot.empty) {
        const jobDoc = jobSnapshot.docs[0];
        await updateDoc(jobDoc.ref, {
          status: 'completed',
          results,
          completedAt: serverTimestamp()
        });

        // Notify user of completed analysis
        await this.notifyAnalysisComplete(jobDoc.data().userId, analysisId, results);
      }

    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'ai_analysis',
        action: 'process_video_analysis'
      });
    }
  }

  async detectTricks() {
    // Simulated AI trick detection
    const tricks = [
      {
        name: 'kickflip',
        confidence: 0.92,
        timestamp: 2.3,
        difficulty: 6,
        style: 'clean',
        landed: true
      },
      {
        name: 'manual',
        confidence: 0.78,
        timestamp: 4.1,
        difficulty: 4,
        duration: 1.8,
        balance: 'good'
      }
    ];

    return tricks;
  }

  async analyzeStyle() {
    return {
      overallStyle: 8.2,
      categories: {
        flow: 8.5,
        creativity: 7.8,
        technicality: 8.0,
        steez: 8.5
      },
      characteristics: ['smooth', 'confident', 'stylish'],
      improvements: ['Work on switch stance', 'Try more transition tricks']
    };
  }

  async calculateTechnicalScores() {
    return {
      popHeight: 7.2,
      boardControl: 8.1,
      footwork: 7.8,
      timing: 8.5,
      commitment: 9.0
    };
  }

  async analyzeLanding() {
    return {
      landed: true,
      rollaway: 'clean',
      balance: 'stable',
      impact: 'smooth',
      score: 8.7
    };
  }

  calculateOverallRating(results) {
    const weights = {
      tricks: 0.3,
      style: 0.25,
      technical: 0.25,
      landing: 0.2
    };

    let totalScore = 0;
    
    // Average trick scores
    const trickScore = results.tricksDetected.reduce((sum, trick) => 
      sum + (trick.confidence * trick.difficulty), 0
    ) / results.tricksDetected.length;

    totalScore += trickScore * weights.tricks;
    totalScore += results.styleAnalysis.overallStyle * weights.style;
    totalScore += Object.values(results.technicalScores).reduce((a, b) => a + b, 0) / 5 * weights.technical;
    totalScore += results.landingAnalysis.score * weights.landing;

    return Math.round(totalScore * 10) / 10; // Round to 1 decimal
  }

  // SPONSOR ME AI PROFILE

  async generateSponsorProfile(userId) {
    try {
      // Get user's videos and analysis
      const videosQuery = query(
        collection(db, 'userVideos'),
        where('userId', '==', userId),
        orderBy('uploadedAt', 'desc'),
        limit(20)
      );

      const videosSnapshot = await getDocs(videosQuery);
      const videos = videosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Get AI analysis for videos
      const analysisResults = await this.getVideoAnalyses(videos.map(v => v.id));

      const profile = {
        userId,
        generatedAt: serverTimestamp(),
        stats: {
          totalVideos: videos.length,
          averageRating: this.calculateAverageRating(analysisResults),
          trickCount: this.countUniqueTricks(analysisResults),
          consistencyScore: this.calculateConsistency(analysisResults),
          progressionRate: this.calculateProgression(analysisResults)
        },
        highlights: {
          bestTricks: this.getBestTricks(analysisResults),
          bestLines: this.getBestLines(analysisResults),
          styleProfile: this.generateStyleProfile(analysisResults),
          strengthsAndWeaknesses: this.analyzeStrengthsWeaknesses(analysisResults)
        },
        portfolio: {
          featuredVideos: videos.slice(0, 5),
          trickBreakdown: this.generateTrickBreakdown(analysisResults),
          progressTimeline: this.generateProgressTimeline(videos, analysisResults)
        },
        marketability: {
          socialEngagement: await this.calculateSocialEngagement(userId),
          communityRating: await this.getCommunityRating(userId),
          brandAlignment: this.assessBrandAlignment(analysisResults),
          sponsorshipReadiness: this.calculateSponsorshipReadiness(analysisResults)
        }
      };

      // Save profile
      await addDoc(collection(db, 'sponsorProfiles'), profile);

      analyticsService.logEvent('sponsor_profile_generated', {
        category: EventCategory.AI,
        user_id: userId,
        total_videos: videos.length,
        average_rating: profile.stats.averageRating
      });

      return profile;
    } catch (error) {
      throw error;
    }
  }

  // LIVE JUDGING SYSTEM

  async initializeLiveJudging(eventId, judgeType = 'community') {
    try {
      const judgingSession = {
        eventId,
        judgeType,
        activeJudges: [],
        judgingCriteria: {
          difficulty: { weight: 0.3, description: 'Technical complexity' },
          execution: { weight: 0.25, description: 'Clean landing and flow' },
          style: { weight: 0.25, description: 'Personal flair and steez' },
          creativity: { weight: 0.2, description: 'Originality and innovation' }
        },
        currentSubmission: null,
        judgingActive: false,
        timeRemaining: 0
      };

      this.liveJudging.set(eventId, judgingSession);

      if (judgeType === 'community') {
        await this.openCommunityJudging(eventId);
      }

      return judgingSession;
    } catch (error) {
      throw error;
    }
  }

  async submitJudgeScore(eventId, judgeId, submissionId, scores) {
    try {
      const judgingSession = this.liveJudging.get(eventId);
      if (!judgingSession) throw new Error('No active judging session');

      const judgeScore = {
        judgeId,
        submissionId,
        scores, // { difficulty: 8, execution: 7, style: 9, creativity: 8 }
        submittedAt: serverTimestamp(),
        totalScore: this.calculateWeightedScore(scores, judgingSession.judgingCriteria)
      };

      await addDoc(collection(db, 'judgeScores'), judgeScore);

      // Check if all judges have scored
      const allScores = await this.getSubmissionScores(submissionId);
      if (allScores.length >= judgingSession.activeJudges.length) {
        await this.finalizeSubmissionScore(submissionId, allScores);
      }

      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  // UTILITY FUNCTIONS

  generateStreamKey() {
    return Math.random().toString(36).substr(2, 16);
  }

  async scheduleEventNotifications(event) {
    // Schedule notifications for 15 min before, at start, etc.
    const notifications = [
      { time: new Date(event.startTime.getTime() - 900000), message: '15 minutes until event starts!' },
      { time: event.startTime, message: 'Event is starting now!' }
    ];

    for (const notification of notifications) {
      // In production, use a job scheduler
      setTimeout(() => {
        this.sendEventNotification(event, notification.message);
      }, notification.time.getTime() - Date.now());
    }
  }

  async notifyNearbyUsers(spotId, event) {
    // Notify users within geofence of the spot
    // Implementation would query users by location
  }

  async getSpotInfo(spotId) {
    const spotRef = doc(db, 'geofencedSpots', spotId);
    const spotSnap = await getDoc(spotRef);
    return spotSnap.exists() ? { id: spotSnap.id, ...spotSnap.data() } : null;
  }

  async notifyAnalysisComplete(userId, analysisId, results) {
    const notification = {
      userId,
      type: 'ai_analysis_complete',
      title: 'Video Analysis Complete! 🤖',
      message: `Your video scored ${results.overallRating}/10! Tap to see detailed breakdown.`,
      data: { analysisId, overallRating: results.overallRating },
      createdAt: serverTimestamp()
    };

    await addDoc(collection(db, 'notifications'), notification);
  }

  async getVideoAnalyses(videoIds) {
    // Get AI analysis results for videos
    return []; // Simplified
  }

  calculateAverageRating(analyses) {
    if (analyses.length === 0) return 0;
    return analyses.reduce((sum, a) => sum + (a.results?.overallRating || 0), 0) / analyses.length;
  }

  countUniqueTricks(analyses) {
    const tricks = new Set();
    analyses.forEach(analysis => {
      analysis.results?.tricksDetected?.forEach(trick => tricks.add(trick.name));
    });
    return tricks.size;
  }

  calculateConsistency(analyses) {
    // Calculate how consistent the skater's performance is
    if (analyses.length < 2) return 0;
    
    const ratings = analyses.map(a => a.results?.overallRating || 0);
    const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    const variance = ratings.reduce((sum, rating) => sum + Math.pow(rating - mean, 2), 0) / ratings.length;
    
    // Lower variance = higher consistency (invert and scale)
    return Math.max(0, 10 - Math.sqrt(variance));
  }

  calculateProgression(analyses) {
    // Analyze improvement over time
    if (analyses.length < 3) return 0;
    
    const recentAvg = analyses.slice(0, 3).reduce((sum, a) => sum + (a.results?.overallRating || 0), 0) / 3;
    const olderAvg = analyses.slice(-3).reduce((sum, a) => sum + (a.results?.overallRating || 0), 0) / 3;
    
    return Math.max(0, recentAvg - olderAvg);
  }

  getBestTricks(analyses) {
    const allTricks = [];
    analyses.forEach(analysis => {
      analysis.results?.tricksDetected?.forEach(trick => allTricks.push(trick));
    });
    
    return allTricks
      .sort((a, b) => (b.confidence * b.difficulty) - (a.confidence * a.difficulty))
      .slice(0, 5);
  }

  getBestLines(analyses) {
    return analyses
      .filter(a => a.submissionType === 'line')
      .sort((a, b) => (b.results?.overallRating || 0) - (a.results?.overallRating || 0))
      .slice(0, 3);
  }

  generateStyleProfile(analyses) {
    // Aggregate style characteristics
    const styles = {};
    analyses.forEach(analysis => {
      analysis.results?.styleAnalysis?.characteristics?.forEach(style => {
        styles[style] = (styles[style] || 0) + 1;
      });
    });
    
    return Object.entries(styles)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([style, count]) => ({ style, frequency: count }));
  }

  analyzeStrengthsWeaknesses(analyses) {
    // Analyze patterns in technical scores
    const categories = ['popHeight', 'boardControl', 'footwork', 'timing', 'commitment'];
    const averages = {};
    
    categories.forEach(category => {
      const scores = analyses
        .map(a => a.results?.technicalScores?.[category])
        .filter(score => score !== undefined);
      
      averages[category] = scores.length > 0 ? 
        scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    });
    
    const sorted = Object.entries(averages).sort(([,a], [,b]) => b - a);
    
    return {
      strengths: sorted.slice(0, 2).map(([category, score]) => ({ category, score })),
      weaknesses: sorted.slice(-2).map(([category, score]) => ({ category, score }))
    };
  }

  generateTrickBreakdown(analyses) {
    const trickCounts = {};
    analyses.forEach(analysis => {
      analysis.results?.tricksDetected?.forEach(trick => {
        trickCounts[trick.name] = (trickCounts[trick.name] || 0) + 1;
      });
    });
    
    return Object.entries(trickCounts)
      .sort(([,a], [,b]) => b - a)
      .map(([trick, count]) => ({ trick, count }));
  }

  generateProgressTimeline(videos, analyses) {
    return videos.map((video, index) => ({
      date: video.uploadedAt,
      rating: analyses[index]?.results?.overallRating || 0,
      tricks: analyses[index]?.results?.tricksDetected?.length || 0
    })).reverse(); // Chronological order
  }

  async calculateSocialEngagement(userId) {
    // Calculate likes, comments, shares across videos
    return { score: 7.5, trend: 'increasing' };
  }

  async getCommunityRating(userId) {
    // Get average community ratings/votes
    return { score: 8.2, totalVotes: 156 };
  }

  assessBrandAlignment(analyses) {
    // Analyze style for brand compatibility
    return {
      streetStyle: 8.5,
      technical: 7.2,
      creative: 8.8,
      consistent: 7.9
    };
  }

  calculateSponsorshipReadiness(analyses) {
    // Overall assessment of sponsorship potential
    const factors = {
      skillLevel: this.calculateAverageRating(analyses),
      consistency: this.calculateConsistency(analyses),
      progression: this.calculateProgression(analyses),
      uniqueTricks: this.countUniqueTricks(analyses)
    };
    
    const weights = { skillLevel: 0.4, consistency: 0.3, progression: 0.2, uniqueTricks: 0.1 };
    
    return Object.entries(factors).reduce((sum, [factor, value]) => 
      sum + (value * weights[factor]), 0
    );
  }

  calculateWeightedScore(scores, criteria) {
    return Object.entries(scores).reduce((total, [category, score]) => {
      const weight = criteria[category]?.weight || 0;
      return total + (score * weight);
    }, 0);
  }

  async getSubmissionScores(submissionId) {
    const scoresQuery = query(
      collection(db, 'judgeScores'),
      where('submissionId', '==', submissionId)
    );
    
    const scoresSnapshot = await getDocs(scoresQuery);
    return scoresSnapshot.docs.map(doc => doc.data());
  }

  async finalizeSubmissionScore(submissionId, allScores) {
    const averageScore = allScores.reduce((sum, score) => sum + score.totalScore, 0) / allScores.length;
    
    await updateDoc(doc(db, 'eventSubmissions', submissionId), {
      finalScore: averageScore,
      judgeScores: allScores,
      scoringComplete: true,
      scoredAt: serverTimestamp()
    });
  }

  async openCommunityJudging(eventId) {
    // Open judging to community members watching the event
    const judgingSession = this.liveJudging.get(eventId);
    if (judgingSession) {
      judgingSession.judgingActive = true;
      judgingSession.timeRemaining = 60; // 60 seconds to judge
    }
  }

  async sendEventNotification(event, message) {
    // Send notifications to all participants
    for (const participantId of event.participants) {
      const notification = {
        userId: participantId,
        type: 'event_update',
        title: event.title,
        message,
        data: { eventId: event.id },
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'notifications'), notification);
    }
  }

  cleanup() {
    this.activeEvents.clear();
    this.aiProcessingQueue.clear();
    this.liveJudging.clear();
    this.voiceChannels.clear();
  }
}

export default new LiveEventsAIService();
