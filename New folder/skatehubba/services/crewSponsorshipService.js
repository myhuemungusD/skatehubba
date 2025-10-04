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

class CrewSponsorshipService {
  constructor() {
    this.activeCrews = new Map();
    this.sponsorshipPrograms = new Map();
    this.crewBattles = new Map();
    this.sponsorshipMatching = new Map();
  }

  // ADVANCED CREW MANAGEMENT

  async createCrew(founderId, crewData) {
    try {
      const {
        name,
        description,
        type = 'local', // 'local', 'global', 'sponsored', 'competition'
        privacy = 'public', // 'public', 'private', 'invite_only'
        maxMembers = 20,
        requirements = {},
        culture = {},
        goals = []
      } = crewData;

      const crew = {
        id: `crew_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        
        // Basic Info
        info: {
          name,
          description,
          type,
          privacy,
          foundedDate: new Date(),
          founderId,
          maxMembers,
          currentMembers: 1
        },
        
        // Membership
        members: [{
          userId: founderId,
          role: 'founder',
          joinedAt: serverTimestamp(),
          status: 'active',
          contributions: {
            videosShared: 0,
            tricksLanded: 0,
            eventsAttended: 0,
            challengesWon: 0
          }
        }],
        
        officers: [founderId], // Founder + any promoted officers
        
        // Requirements & Culture
        requirements: {
          minSkillLevel: requirements.minSkillLevel || 'beginner',
          minAge: requirements.minAge || 13,
          location: requirements.location || null,
          skillSpecialties: requirements.specialties || [],
          activityLevel: requirements.activityLevel || 'casual',
          values: requirements.values || []
        },
        
        culture: {
          vibe: culture.vibe || 'supportive', // 'supportive', 'competitive', 'creative', 'hardcore'
          primaryStyle: culture.style || 'street',
          meetupFrequency: culture.meetups || 'weekly',
          communicationStyle: culture.communication || 'friendly',
          inclusivity: culture.inclusivity || 'welcoming'
        },
        
        // Goals & Activities
        goals: {
          primary: goals.primary || 'skill_development',
          secondary: goals.secondary || [],
          currentFocus: goals.currentFocus || 'building_community',
          achievements: []
        },
        
        // Crew Statistics
        stats: {
          totalTricks: 0,
          totalVideos: 0,
          totalEvents: 0,
          avgSkillLevel: 0,
          reputation: 100,
          wins: 0,
          losses: 0,
          crewRating: 1000 // ELO-style rating
        },
        
        // Sponsorship Status
        sponsorship: {
          status: 'independent', // 'independent', 'seeking', 'sponsored'
          currentSponsors: [],
          sponsorshipHistory: [],
          sponsorshipValue: 0,
          marketability: await this.calculateCrewMarketability(founderId)
        },
        
        // Activities & Challenges
        activities: {
          currentChallenges: [],
          upcomingEvents: [],
          recentSessions: [],
          achievements: [],
          rivalries: []
        },
        
        // Content & Media
        media: {
          profileImage: crewData.profileImage || null,
          bannerImage: crewData.bannerImage || null,
          featuredVideos: [],
          gallery: [],
          highlights: []
        },
        
        // Settings
        settings: {
          autoAcceptRequests: crewData.autoAccept || false,
          allowInvites: crewData.allowInvites !== false,
          publicStats: crewData.publicStats !== false,
          notifications: {
            newMembers: true,
            challenges: true,
            achievements: true,
            rivalries: true
          }
        },
        
        createdAt: serverTimestamp(),
        lastActivity: serverTimestamp(),
        status: 'active'
      };

      const docRef = await addDoc(collection(db, 'crews'), crew);
      crew.id = docRef.id;

      // Create initial crew activity feed
      await this.createCrewActivityFeed(crew.id);

      // Initialize crew challenges
      await this.initializeCrewChallenges(crew.id);

      analyticsService.logEvent('crew_created', {
        category: EventCategory.SOCIAL,
        crew_id: crew.id,
        founder_id: founderId,
        crew_type: type,
        max_members: maxMembers
      });

      return crew;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'crew_sponsorship',
        action: 'create_crew'
      });
      throw error;
    }
  }

  async joinCrew(crewId, userId, applicationData = {}) {
    try {
      const crewRef = doc(db, 'crews', crewId);
      
      return await runTransaction(db, async (transaction) => {
        const crewSnap = await transaction.get(crewRef);
        if (!crewSnap.exists()) throw new Error('Crew not found');

        const crew = crewSnap.data();
        
        // Check if user is already a member
        if (crew.members.some(member => member.userId === userId)) {
          throw new Error('Already a member of this crew');
        }
        
        // Check crew capacity
        if (crew.members.length >= crew.info.maxMembers) {
          throw new Error('Crew is at maximum capacity');
        }
        
        // Check requirements
        const meetsRequirements = await this.checkCrewRequirements(userId, crew.requirements);
        if (!meetsRequirements.eligible) {
          throw new Error(`Requirements not met: ${meetsRequirements.reason}`);
        }

        const newMember = {
          userId,
          role: 'member',
          joinedAt: serverTimestamp(),
          status: crew.settings.autoAcceptRequests ? 'active' : 'pending',
          application: applicationData,
          contributions: {
            videosShared: 0,
            tricksLanded: 0,
            eventsAttended: 0,
            challengesWon: 0
          }
        };

        // Add member to crew
        const updatedMembers = [...crew.members, newMember];
        
        transaction.update(crewRef, {
          members: updatedMembers,
          'info.currentMembers': updatedMembers.filter(m => m.status === 'active').length,
          lastActivity: serverTimestamp()
        });

        // Send notifications
        if (crew.settings.autoAcceptRequests) {
          await this.notifyCrewNewMember(crewId, userId);
        } else {
          await this.notifyCrewOfficersNewApplication(crewId, userId, applicationData);
        }

        // Update crew stats
        await this.updateCrewStats(crewId);

        analyticsService.logEvent('crew_joined', {
          category: EventCategory.SOCIAL,
          crew_id: crewId,
          user_id: userId,
          auto_accepted: crew.settings.autoAcceptRequests
        });

        return { success: true, status: newMember.status };
      });
    } catch (error) {
      throw error;
    }
  }

  // CREW BATTLES & COMPETITIONS

  async createCrewBattle(challengingCrewId, challengedCrewId, battleData) {
    try {
      const {
        battleType = 'trick_battle', // 'trick_battle', 'video_battle', 'spot_takeover', 'endurance'
        format = 'best_of_5',
        stakes = {},
        conditions = {},
        timeLimit = 7 * 24 * 60 * 60 * 1000, // 7 days
        judgeType = 'community'
      } = battleData;

      const battle = {
        id: `crew_battle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        
        // Battle Info
        info: {
          type: battleType,
          format,
          status: 'challenged', // 'challenged', 'accepted', 'active', 'completed', 'declined'
          challengingCrewId,
          challengedCrewId,
          createdAt: serverTimestamp(),
          acceptDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours to accept
          battleDeadline: new Date(Date.now() + timeLimit)
        },
        
        // Battle Format
        format: {
          rounds: this.getBattleRounds(format, battleType),
          scoring: this.getBattleScoring(battleType),
          judgeType,
          tieBreaker: this.getTieBreaker(battleType),
          submissionRules: this.getSubmissionRules(battleType)
        },
        
        // Stakes & Rewards
        stakes: {
          type: stakes.type || 'reputation', // 'reputation', 'currency', 'items', 'custom'
          amount: stakes.amount || 0,
          winner: stakes.winner || { reputation: 100, hubbaBucks: 500 },
          loser: stakes.loser || { reputation: -50 },
          additional: stakes.additional || []
        },
        
        // Conditions
        conditions: {
          location: conditions.location || 'any',
          timeOfDay: conditions.timeOfDay || 'any',
          weather: conditions.weather || 'any',
          equipment: conditions.equipment || 'standard',
          specialRules: conditions.special || []
        },
        
        // Battle Progress
        progress: {
          currentRound: 0,
          challengingCrewScore: 0,
          challengedCrewScore: 0,
          submissions: [],
          judgeScores: [],
          spectatorVotes: 0
        },
        
        // Participants
        participants: {
          challengingCrew: {
            selectedMembers: [],
            captain: null,
            strategy: null,
            confidence: 0
          },
          challengedCrew: {
            selectedMembers: [],
            captain: null,
            strategy: null,
            confidence: 0
          }
        },
        
        // Media & Social
        media: {
          featuredContent: [],
          liveStream: null,
          highlights: [],
          socialBuzz: 0,
          viewerCount: 0
        },
        
        // Results
        results: {
          winner: null,
          finalScore: null,
          mvp: null,
          highlights: [],
          statistics: {},
          aftermath: {}
        }
      };

      const docRef = await addDoc(collection(db, 'crewBattles'), battle);
      battle.id = docRef.id;

      // Notify challenged crew
      await this.notifyCrewBattleChallenge(challengedCrewId, battle);

      // Create hype on social feeds
      await this.createBattleHype(battle);

      // Open betting/predictions if applicable
      if (stakes.type !== 'reputation') {
        await this.openBattlePredictions(battle.id);
      }

      analyticsService.logEvent('crew_battle_created', {
        category: EventCategory.COMPETITIONS,
        battle_id: battle.id,
        challenging_crew: challengingCrewId,
        challenged_crew: challengedCrewId,
        battle_type: battleType
      });

      return battle;
    } catch (error) {
      throw error;
    }
  }

  async acceptCrewBattle(battleId, acceptingCrewId, acceptanceData = {}) {
    try {
      const battleRef = doc(db, 'crewBattles', battleId);
      
      return await runTransaction(db, async (transaction) => {
        const battleSnap = await transaction.get(battleRef);
        if (!battleSnap.exists()) throw new Error('Battle not found');

        const battle = battleSnap.data();
        
        if (battle.info.challengedCrewId !== acceptingCrewId) {
          throw new Error('Not authorized to accept this battle');
        }
        
        if (battle.info.status !== 'challenged') {
          throw new Error('Battle is no longer available');
        }
        
        if (new Date() > battle.info.acceptDeadline.toDate()) {
          throw new Error('Accept deadline has passed');
        }

        // Update battle status
        transaction.update(battleRef, {
          'info.status': 'accepted',
          'info.acceptedAt': serverTimestamp(),
          'participants.challengedCrew': {
            ...battle.participants.challengedCrew,
            ...acceptanceData,
            acceptedAt: serverTimestamp()
          },
          'info.battleStartDate': new Date()
        });

        // Schedule battle start
        await this.scheduleBattleStart(battleId);

        // Notify both crews
        await this.notifyBattleAccepted(battle);

        // Create live event for battle
        await this.createBattleLiveEvent(battle);

        return { success: true };
      });
    } catch (error) {
      throw error;
    }
  }

  // SPONSORSHIP MATCHING & MANAGEMENT

  async createSponsorshipProgram(sponsorId, programData) {
    try {
      const {
        programName,
        sponsorType = 'brand', // 'brand', 'shop', 'individual', 'company'
        targetType = 'crew', // 'crew', 'individual', 'both'
        tier = 'local', // 'local', 'regional', 'national', 'international'
        benefits = {},
        requirements = {},
        duration = 365, // days
        budget = {}
      } = programData;

      const program = {
        id: `sponsorship_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sponsorId,
        
        // Program Details
        info: {
          name: programName,
          description: programData.description || '',
          sponsorType,
          targetType,
          tier,
          status: 'active',
          featured: false
        },
        
        // Benefits Package
        benefits: {
          monetary: {
            monthlyStipend: benefits.stipend || 0,
            performanceBonus: benefits.bonus || {},
            expenseReimbursement: benefits.expenses || 0,
            prizeMoney: benefits.prizes || 0
          },
          products: {
            freeGear: benefits.gear || [],
            exclusiveAccess: benefits.exclusive || [],
            customProducts: benefits.custom || false,
            discounts: benefits.discounts || {}
          },
          opportunities: {
            events: benefits.events || [],
            media: benefits.media || [],
            networking: benefits.networking || false,
            mentorship: benefits.mentorship || false
          },
          exposure: {
            socialMedia: benefits.social || false,
            website: benefits.website || false,
            advertising: benefits.advertising || false,
            documentary: benefits.documentary || false
          }
        },
        
        // Requirements
        requirements: {
          performance: {
            minSkillLevel: requirements.skillLevel || 'intermediate',
            contentFrequency: requirements.content || 'weekly',
            eventParticipation: requirements.events || 0,
            socialEngagement: requirements.social || 1000
          },
          demographics: {
            ageRange: requirements.age || [13, 35],
            location: requirements.location || [],
            followerCount: requirements.followers || 500,
            audienceType: requirements.audience || 'skateboarding'
          },
          brand: {
            alignment: requirements.alignment || 'moderate',
            exclusivity: requirements.exclusivity || false,
            contentGuidelines: requirements.guidelines || {},
            behaviorStandards: requirements.behavior || {}
          },
          commitment: {
            duration: duration,
            exclusivityPeriod: requirements.exclusivity || 0,
            terminationClause: requirements.termination || {},
            renewalOptions: requirements.renewal || {}
          }
        },
        
        // Selection Criteria
        selection: {
          process: programData.selectionProcess || 'application',
          criteria: {
            skillWeight: 0.3,
            engagementWeight: 0.25,
            alignmentWeight: 0.2,
            potentialWeight: 0.15,
            locationWeight: 0.1
          },
          capacity: programData.maxSponsees || 10,
          currentCount: 0,
          applicationDeadline: programData.deadline || null
        },
        
        // Budget & Economics
        budget: {
          total: budget.total || 0,
          allocated: 0,
          remaining: budget.total || 0,
          breakdown: budget.breakdown || {},
          performanceIncentives: budget.incentives || {}
        },
        
        // Analytics
        metrics: {
          applications: 0,
          accepted: 0,
          roi: 0,
          engagement: 0,
          brandAwareness: 0,
          conversions: 0
        },
        
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'sponsorshipPrograms'), program);
      program.id = docRef.id;

      // Auto-match with suitable crews/individuals
      await this.matchSponsorshipCandidates(program);

      analyticsService.logEvent('sponsorship_program_created', {
        category: EventCategory.BUSINESS,
        sponsor_id: sponsorId,
        program_type: targetType,
        tier: tier,
        budget: budget.total
      });

      return program;
    } catch (error) {
      throw error;
    }
  }

  async applyForSponsorship(programId, applicantId, applicantType, applicationData) {
    try {
      const {
        proposal,
        portfolio,
        demographics,
        goals,
        timeline,
        customTerms = {}
      } = applicationData;

      // Get applicant profile
      const applicantProfile = await this.getApplicantProfile(applicantId, applicantType);
      
      const application = {
        id: `app_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        programId,
        applicantId,
        applicantType, // 'crew' or 'individual'
        
        // Applicant Information
        applicant: {
          profile: applicantProfile,
          stats: await this.getApplicantStats(applicantId, applicantType),
          marketability: await this.calculateApplicantMarketability(applicantId, applicantType),
          brandAlignment: await this.assessBrandAlignment(applicantId, programId)
        },
        
        // Application Content
        application: {
          proposal: {
            vision: proposal.vision,
            goals: proposal.goals,
            timeline: proposal.timeline,
            deliverables: proposal.deliverables,
            uniqueValue: proposal.uniqueValue
          },
          portfolio: {
            videos: portfolio.videos || [],
            achievements: portfolio.achievements || [],
            testimonials: portfolio.testimonials || [],
            metrics: portfolio.metrics || {}
          },
          demographics: {
            audience: demographics.audience || {},
            engagement: demographics.engagement || {},
            growth: demographics.growth || {},
            alignment: demographics.alignment || {}
          },
          customTerms: {
            compensation: customTerms.compensation || null,
            duration: customTerms.duration || null,
            exclusivity: customTerms.exclusivity || null,
            additional: customTerms.additional || []
          }
        },
        
        // Assessment Scores
        assessment: {
          skillScore: await this.assessSkillLevel(applicantId, applicantType),
          engagementScore: await this.assessEngagement(applicantId, applicantType),
          alignmentScore: await this.assessAlignment(applicantId, programId),
          potentialScore: await this.assessPotential(applicantId, applicantType),
          overallScore: 0,
          recommendation: null
        },
        
        status: 'pending', // 'pending', 'under_review', 'shortlisted', 'accepted', 'rejected'
        submittedAt: serverTimestamp(),
        
        // Follow-up
        followUp: {
          interviewScheduled: false,
          additionalInfoRequested: false,
          decisionExpected: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days
        }
      };

      // Calculate overall assessment score
      application.assessment.overallScore = this.calculateOverallAssessmentScore(application.assessment);
      application.assessment.recommendation = this.generateAssessmentRecommendation(application.assessment);

      await addDoc(collection(db, 'sponsorshipApplications'), application);

      // Update program metrics
      await this.updateProgramMetrics(programId, 'application');

      // Notify sponsor of new application
      await this.notifySponsorNewApplication(programId, application);

      // Auto-score if high enough
      if (application.assessment.overallScore > 85) {
        await this.autoShortlistApplication(application.id);
      }

      analyticsService.logEvent('sponsorship_application_submitted', {
        category: EventCategory.BUSINESS,
        program_id: programId,
        applicant_id: applicantId,
        applicant_type: applicantType,
        overall_score: application.assessment.overallScore
      });

      return application;
    } catch (error) {
      throw error;
    }
  }

  // CREW ACHIEVEMENT & PROGRESSION

  async unlockCrewAchievement(crewId, achievementType, context = {}) {
    try {
      const achievements = {
        'first_battle_win': {
          title: '🏆 Battle Victors',
          description: 'Won your first crew battle',
          rewards: { reputation: 200, hubbaBucks: 1000 },
          rarity: 'common'
        },
        'perfect_battle': {
          title: '💯 Flawless Victory',
          description: 'Won a battle without losing a single round',
          rewards: { reputation: 500, hubbaBucks: 2500, badge: 'perfect_crew' },
          rarity: 'rare'
        },
        'sponsored_crew': {
          title: '💰 Sponsored Squad',
          description: 'Secured your first sponsorship deal',
          rewards: { reputation: 300, hubbaBucks: 1500, badge: 'sponsored' },
          rarity: 'uncommon'
        },
        'viral_video': {
          title: '🔥 Viral Legends',
          description: 'Crew video reached 100k views',
          rewards: { reputation: 400, hubbaBucks: 2000 },
          rarity: 'uncommon'
        },
        'crew_dynasty': {
          title: '👑 Dynasty Builders',
          description: 'Maintained top 10 ranking for 6 months',
          rewards: { reputation: 1000, hubbaBucks: 5000, badge: 'dynasty' },
          rarity: 'legendary'
        }
      };

      const achievement = achievements[achievementType];
      if (!achievement) throw new Error('Achievement not found');

      // Check if already unlocked
      const existingAchievement = await this.checkExistingAchievement(crewId, achievementType);
      if (existingAchievement) return existingAchievement;

      const crewAchievement = {
        crewId,
        type: achievementType,
        title: achievement.title,
        description: achievement.description,
        rarity: achievement.rarity,
        rewards: achievement.rewards,
        context,
        unlockedAt: serverTimestamp(),
        celebrationViewed: false
      };

      await addDoc(collection(db, 'crewAchievements'), crewAchievement);

      // Apply rewards
      await this.applyCrewRewards(crewId, achievement.rewards);

      // Notify crew members
      await this.notifyCrewAchievement(crewId, crewAchievement);

      // Update crew stats
      await this.updateCrewAchievementStats(crewId, achievement);

      return crewAchievement;
    } catch (error) {
      throw error;
    }
  }

  // UTILITY FUNCTIONS

  async calculateCrewMarketability(founderId) {
    const founderProfile = await getDoc(doc(db, 'userProfiles', founderId));
    if (!founderProfile.exists()) return 50;

    const data = founderProfile.data();
    
    let score = 50; // Base score
    
    // Factor in founder's stats
    if (data.followerCount > 1000) score += 20;
    if (data.engagementRate > 0.05) score += 15;
    if (data.skillLevel === 'pro') score += 20;
    if (data.contentQuality > 8) score += 15;
    
    return Math.min(score, 100);
  }

  async checkCrewRequirements(userId, requirements) {
    const userProfile = await getDoc(doc(db, 'userProfiles', userId));
    if (!userProfile.exists()) return { eligible: false, reason: 'User not found' };

    const userData = userProfile.data();
    
    // Check skill level
    const skillLevels = { beginner: 1, intermediate: 2, advanced: 3, pro: 4 };
    const userSkill = skillLevels[userData.skillLevel] || 1;
    const requiredSkill = skillLevels[requirements.minSkillLevel] || 1;
    
    if (userSkill < requiredSkill) {
      return { eligible: false, reason: 'Skill level too low' };
    }
    
    // Check age
    if (requirements.minAge && userData.age < requirements.minAge) {
      return { eligible: false, reason: 'Age requirement not met' };
    }
    
    // Check location (if specified)
    if (requirements.location && userData.location !== requirements.location) {
      return { eligible: false, reason: 'Location requirement not met' };
    }
    
    return { eligible: true };
  }

  getBattleRounds(format, battleType) {
    const formats = {
      'best_of_3': 3,
      'best_of_5': 5,
      'best_of_7': 7,
      'single_round': 1,
      'elimination': 8
    };
    
    return Array.from({ length: formats[format] || 5 }, (_, i) => ({
      roundNumber: i + 1,
      status: 'pending',
      theme: this.getRoundTheme(battleType, i + 1),
      submissions: [],
      winner: null
    }));
  }

  getBattleScoring(battleType) {
    const scoringSystems = {
      'trick_battle': {
        criteria: ['difficulty', 'execution', 'creativity', 'style'],
        weights: [0.3, 0.3, 0.25, 0.15],
        maxScore: 10
      },
      'video_battle': {
        criteria: ['cinematography', 'tricks', 'editing', 'music'],
        weights: [0.25, 0.35, 0.25, 0.15],
        maxScore: 10
      },
      'spot_takeover': {
        criteria: ['spot_usage', 'creativity', 'flow', 'variety'],
        weights: [0.25, 0.25, 0.25, 0.25],
        maxScore: 10
      }
    };
    
    return scoringSystems[battleType] || scoringSystems['trick_battle'];
  }

  getTieBreaker(battleType) {
    const tieBreakers = {
      'trick_battle': 'sudden_death_trick',
      'video_battle': 'freestyle_edit',
      'spot_takeover': 'best_line',
      'endurance': 'final_trick'
    };
    
    return tieBreakers[battleType] || 'judge_decision';
  }

  getSubmissionRules(battleType) {
    return {
      maxAttempts: 3,
      timeLimit: 120, // seconds
      requiresLive: battleType === 'trick_battle',
      allowsEditing: battleType === 'video_battle',
      multipleAngles: battleType === 'spot_takeover'
    };
  }

  getRoundTheme(battleType, roundNumber) {
    const themes = {
      'trick_battle': [
        'Flip Tricks',
        'Grinds & Slides',
        'Technical Street',
        'Creative Flow',
        'Signature Move'
      ],
      'video_battle': [
        'Street Lines',
        'Transition Flow',
        'Creative Spots',
        'Technical Display',
        'Style Showcase'
      ]
    };
    
    const typeThemes = themes[battleType] || themes['trick_battle'];
    return typeThemes[roundNumber - 1] || `Round ${roundNumber}`;
  }

  async matchSponsorshipCandidates(program) {
    // Find suitable crews/individuals for the sponsorship program
    const candidatesQuery = query(
      collection(db, program.info.targetType === 'crew' ? 'crews' : 'userProfiles'),
      where('status', '==', 'active'),
      limit(50)
    );
    
    const candidatesSnapshot = await getDocs(candidatesQuery);
    const candidates = candidatesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Score and rank candidates
    const scoredCandidates = await Promise.all(
      candidates.map(async candidate => ({
        ...candidate,
        matchScore: await this.calculateSponsorshipMatchScore(candidate, program)
      }))
    );
    
    // Suggest top matches
    const topMatches = scoredCandidates
      .filter(candidate => candidate.matchScore > 70)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 10);
    
    for (const match of topMatches) {
      await this.suggestSponsorshipOpportunity(match.id, program.id, match.matchScore);
    }
  }

  async calculateSponsorshipMatchScore(candidate, program) {
    let score = 0;
    
    // Skill level match (30%)
    const skillMatch = this.matchSkillRequirement(candidate, program.requirements.performance.minSkillLevel);
    score += skillMatch * 30;
    
    // Audience size (25%)
    const audienceMatch = this.matchAudienceSize(candidate, program.requirements.demographics.followerCount);
    score += audienceMatch * 25;
    
    // Brand alignment (20%)
    const brandMatch = await this.assessBrandAlignment(candidate.id, program.id);
    score += brandMatch * 20;
    
    // Location compatibility (15%)
    const locationMatch = this.matchLocation(candidate, program.requirements.demographics.location);
    score += locationMatch * 15;
    
    // Engagement quality (10%)
    const engagementMatch = this.matchEngagement(candidate, program.requirements.performance.socialEngagement);
    score += engagementMatch * 10;
    
    return Math.round(score);
  }

  matchSkillRequirement(candidate, requiredSkill) {
    const skillLevels = { beginner: 1, intermediate: 2, advanced: 3, pro: 4 };
    const candidateSkill = skillLevels[candidate.skillLevel] || 1;
    const required = skillLevels[requiredSkill] || 1;
    
    if (candidateSkill >= required) return 1;
    return candidateSkill / required;
  }

  matchAudienceSize(candidate, requiredFollowers) {
    const followers = candidate.followerCount || candidate.stats?.totalFollowers || 0;
    if (followers >= requiredFollowers) return 1;
    return followers / requiredFollowers;
  }

  matchLocation(candidate, requiredLocations) {
    if (!requiredLocations || requiredLocations.length === 0) return 1;
    
    const candidateLocation = candidate.location || candidate.info?.location;
    if (requiredLocations.includes(candidateLocation)) return 1;
    
    return 0.5; // Partial match for different but acceptable locations
  }

  matchEngagement(candidate, requiredEngagement) {
    const engagement = candidate.engagementRate || candidate.stats?.avgEngagement || 0;
    if (engagement >= requiredEngagement) return 1;
    return engagement / requiredEngagement;
  }

  async getApplicantProfile(applicantId, applicantType) {
    const collection = applicantType === 'crew' ? 'crews' : 'userProfiles';
    const profileRef = doc(db, collection, applicantId);
    const profileSnap = await getDoc(profileRef);
    return profileSnap.exists() ? { id: profileSnap.id, ...profileSnap.data() } : null;
  }

  async getApplicantStats(applicantId, applicantType) {
    // Get comprehensive stats for the applicant
    return {
      followers: 2500,
      engagement: 0.055,
      contentFrequency: 4.2,
      skillLevel: 'advanced',
      marketReach: 15000
    };
  }

  async calculateApplicantMarketability(applicantId, applicantType) {
    // Calculate marketability score
    return 78; // 0-100 score
  }

  async assessBrandAlignment(applicantId, programId) {
    // Assess how well applicant aligns with sponsor's brand
    return 82; // 0-100 score
  }

  calculateOverallAssessmentScore(assessment) {
    const weights = {
      skillScore: 0.3,
      engagementScore: 0.25,
      alignmentScore: 0.25,
      potentialScore: 0.2
    };
    
    return Object.entries(weights).reduce((total, [key, weight]) => {
      return total + (assessment[key] * weight);
    }, 0);
  }

  generateAssessmentRecommendation(assessment) {
    const score = assessment.overallScore;
    
    if (score >= 90) return 'Highly recommended - Perfect fit';
    if (score >= 80) return 'Recommended - Strong candidate';
    if (score >= 70) return 'Consider - Good potential';
    if (score >= 60) return 'Review - Some concerns';
    return 'Not recommended - Poor fit';
  }

  // Additional utility functions...
  async createCrewActivityFeed(crewId) { /* Implementation */ }
  async initializeCrewChallenges(crewId) { /* Implementation */ }
  async updateCrewStats(crewId) { /* Implementation */ }
  async notifyCrewNewMember(crewId, userId) { /* Implementation */ }
  async scheduleBattleStart(battleId) { /* Implementation */ }
  async createBattleLiveEvent(battle) { /* Implementation */ }
  async checkExistingAchievement(crewId, type) { /* Implementation */ }
  async applyCrewRewards(crewId, rewards) { /* Implementation */ }

  cleanup() {
    this.activeCrews.clear();
    this.sponsorshipPrograms.clear();
    this.crewBattles.clear();
    this.sponsorshipMatching.clear();
  }
}

export default new CrewSponsorshipService();
