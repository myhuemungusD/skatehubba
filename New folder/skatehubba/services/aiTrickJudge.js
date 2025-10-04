import { analyticsService, EventCategory } from './analytics';
import GlobalErrorHandler from './errorHandler';

class AITrickJudge {
  constructor() {
    this.trickDatabase = this.initializeTrickDatabase();
    this.styleMetrics = {
      height: 0,
      steez: 0,
      technicality: 0,
      creativity: 0,
      flow: 0,
      landing: 0
    };
  }

  initializeTrickDatabase() {
    return {
      flip: {
        kickflip: { difficulty: 3, baseScore: 100 },
        heelflip: { difficulty: 3, baseScore: 100 },
        varialflip: { difficulty: 4, baseScore: 120 },
        hardflip: { difficulty: 6, baseScore: 180 },
        inwardheelflip: { difficulty: 7, baseScore: 200 },
        treflip: { difficulty: 8, baseScore: 250 },
        laserflip: { difficulty: 9, baseScore: 300 }
      },
      grind: {
        boardslide: { difficulty: 4, baseScore: 80 },
        lipslide: { difficulty: 5, baseScore: 100 },
        feeblegrind: { difficulty: 5, baseScore: 110 },
        smithgrind: { difficulty: 6, baseScore: 120 },
        crooked: { difficulty: 6, baseScore: 130 },
        backtail: { difficulty: 7, baseScore: 150 },
        frontblunt: { difficulty: 8, baseScore: 180 }
      },
      manual: {
        manual: { difficulty: 3, baseScore: 60 },
        nosemanual: { difficulty: 4, baseScore: 80 },
        casperslide: { difficulty: 7, baseScore: 160 }
      },
      grab: {
        indy: { difficulty: 2, baseScore: 60 },
        melon: { difficulty: 3, baseScore: 80 },
        method: { difficulty: 4, baseScore: 100 },
        stalefish: { difficulty: 4, baseScore: 100 },
        japan: { difficulty: 6, baseScore: 140 }
      }
    };
  }

  async analyzeClip(videoUri, metadata = {}) {
    try {
      analyticsService.logEvent('ai_trick_analysis_started', {
        category: EventCategory.AI,
        video_duration: metadata.duration || 0
      });

      // Simulate AI analysis - in production, this would call a real AI service
      const analysisResult = await this.simulateAIAnalysis(videoUri, metadata);
      
      const trickScore = this.calculateTrickScore(analysisResult);
      const styleScore = this.calculateStyleScore(analysisResult);
      
      const finalResult = {
        ...analysisResult,
        scores: {
          trick: trickScore,
          style: styleScore,
          total: trickScore + styleScore
        },
        confidence: analysisResult.confidence,
        timestamp: new Date().toISOString()
      };

      analyticsService.logEvent('ai_trick_analysis_completed', {
        category: EventCategory.AI,
        trick_detected: analysisResult.trickName,
        total_score: finalResult.scores.total,
        confidence: analysisResult.confidence
      });

      return finalResult;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'ai_trick_judge',
        action: 'analyze_clip'
      });
      throw new Error('Failed to analyze trick');
    }
  }

  async simulateAIAnalysis(videoUri, metadata) {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Simulate AI detection results
    const tricks = Object.keys(this.trickDatabase.flip);
    const randomTrick = tricks[Math.floor(Math.random() * tricks.length)];
    
    return {
      trickName: randomTrick,
      trickType: 'flip',
      confidence: 0.75 + Math.random() * 0.24, // 75-99%
      detectedMotions: [
        'ollieHeight',
        'rotation',
        'catchPosition',
        'landingStability'
      ],
      styleMetrics: {
        height: Math.random() * 10,
        steez: Math.random() * 10,
        technicality: Math.random() * 10,
        creativity: Math.random() * 10,
        flow: Math.random() * 10,
        landing: Math.random() * 10
      },
      suggestedImprovements: this.generateImprovements(),
      alternativeTricks: this.suggestAlternativeTricks(randomTrick)
    };
  }

  calculateTrickScore(analysis) {
    const trickData = this.trickDatabase[analysis.trickType]?.[analysis.trickName];
    if (!trickData) return 50; // Default score for unknown tricks

    const baseScore = trickData.baseScore;
    const confidenceMultiplier = analysis.confidence;
    const landingBonus = analysis.styleMetrics.landing > 7 ? 20 : 0;

    return Math.round(baseScore * confidenceMultiplier + landingBonus);
  }

  calculateStyleScore(analysis) {
    const metrics = analysis.styleMetrics;
    const weights = {
      height: 0.2,
      steez: 0.25,
      technicality: 0.2,
      creativity: 0.15,
      flow: 0.1,
      landing: 0.1
    };

    let styleScore = 0;
    Object.keys(weights).forEach(metric => {
      styleScore += metrics[metric] * weights[metric];
    });

    return Math.round(styleScore * 10); // Scale to 0-100
  }

  generateImprovements() {
    const improvements = [
      'Try to get more height on your ollie',
      'Focus on catching the board with your back foot',
      'Keep your shoulders aligned with the board',
      'Bend your knees more on landing',
      'Try to flick more with your ankle',
      'Keep your weight centered over the board'
    ];

    return improvements.slice(0, Math.floor(Math.random() * 3) + 1);
  }

  suggestAlternativeTricks(currentTrick) {
    const suggestions = {
      kickflip: ['heelflip', 'varialflip', 'frontside flip'],
      heelflip: ['kickflip', 'inward heelflip', 'backside heelflip'],
      treflip: ['laser flip', 'hardflip', 'frontside flip']
    };

    return suggestions[currentTrick] || ['Try variations of this trick'];
  }

  async getTrickLeaderboard(trickName, timeFrame = '7days') {
    try {
      // In production, this would fetch from backend
      return [
        { userId: '1', username: 'ProSkater', score: 95, clip: 'clip1.mp4' },
        { userId: '2', username: 'StyleMaster', score: 92, clip: 'clip2.mp4' },
        { userId: '3', username: 'TechKing', score: 89, clip: 'clip3.mp4' }
      ];
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'ai_trick_judge',
        action: 'get_leaderboard'
      });
      return [];
    }
  }

  async submitTrickForJudging(clipData, userSubmittedTrick = null) {
    try {
      const analysis = await this.analyzeClip(clipData.videoUri, clipData);
      
      // If user suggested a different trick, compare confidence
      if (userSubmittedTrick && userSubmittedTrick !== analysis.trickName) {
        analysis.userSuggestion = userSubmittedTrick;
        analysis.needsVerification = true;
      }

      return {
        ...analysis,
        submissionId: Date.now().toString(),
        status: 'analyzed',
        clipData
      };
    } catch (error) {
      throw new Error('Failed to submit trick for judging');
    }
  }
}

export default new AITrickJudge();
