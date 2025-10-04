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

class WellnessTrackingService {
  constructor() {
    this.activeTracking = new Map();
    this.injuryMonitoring = new Map();
    this.recoveryPlans = new Map();
    this.healthMetrics = new Map();
  }

  // COMPREHENSIVE WELLNESS TRACKING

  async initializeWellnessTracking(userId, profileData = {}) {
    try {
      const {
        age,
        weight,
        height,
        skillLevel,
        yearsSkating,
        previousInjuries = [],
        fitnessLevel = 'moderate',
        goals = [],
        preferences = {}
      } = profileData;

      const wellnessProfile = {
        userId,
        
        // Basic Info
        demographics: {
          age,
          weight,
          height,
          bmi: weight && height ? (weight / Math.pow(height / 100, 2)).toFixed(1) : null,
          skillLevel,
          yearsSkating,
          fitnessLevel
        },
        
        // Health History
        healthHistory: {
          previousInjuries: previousInjuries.map(injury => ({
            type: injury.type,
            bodyPart: injury.bodyPart,
            date: injury.date,
            severity: injury.severity,
            recovery: injury.recovery,
            prevention: injury.prevention || []
          })),
          chronicConditions: profileData.chronicConditions || [],
          medications: profileData.medications || [],
          allergies: profileData.allergies || []
        },
        
        // Goals & Preferences
        goals: {
          primary: goals.primary || 'injury_prevention',
          secondary: goals.secondary || [],
          timeline: goals.timeline || '6_months',
          specific: goals.specific || []
        },
        
        preferences: {
          trackingFrequency: preferences.frequency || 'daily',
          reminderTimes: preferences.reminders || ['09:00', '21:00'],
          privacyLevel: preferences.privacy || 'private',
          shareWithCoach: preferences.shareWithCoach || false,
          emergencyContact: preferences.emergencyContact || null
        },
        
        // Current Status
        currentStatus: {
          overallHealth: 'good',
          energyLevel: 75,
          stressLevel: 30,
          sleepQuality: 70,
          injuryRisk: 'low',
          lastAssessment: serverTimestamp()
        },
        
        // Tracking Settings
        tracking: {
          dailyMetrics: true,
          sessionTracking: true,
          recoveryMonitoring: true,
          nutritionTracking: preferences.nutrition || false,
          moodTracking: preferences.mood || true,
          sleepTracking: preferences.sleep || true
        },
        
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'wellnessProfiles'), wellnessProfile);
      wellnessProfile.id = docRef.id;

      // Initialize daily tracking
      await this.createDailyWellnessEntry(userId);

      // Set up personalized recommendations
      await this.generatePersonalizedRecommendations(userId, wellnessProfile);

      analyticsService.logEvent('wellness_tracking_initialized', {
        category: EventCategory.HEALTH,
        user_id: userId,
        age: age,
        skill_level: skillLevel,
        previous_injuries: previousInjuries.length
      });

      return wellnessProfile;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'wellness_tracking',
        action: 'initialize_wellness_tracking'
      });
      throw error;
    }
  }

  async logDailyWellnessMetrics(userId, metricsData) {
    try {
      const {
        date = new Date(),
        physicalMetrics = {},
        mentalMetrics = {},
        skateSpecific = {},
        lifestyle = {},
        notes = ''
      } = metricsData;

      const wellnessEntry = {
        userId,
        date: date instanceof Date ? date : new Date(date),
        
        // Physical Metrics (1-10 scale)
        physical: {
          energyLevel: physicalMetrics.energy || 5,
          bodyAches: physicalMetrics.aches || 0,
          flexibility: physicalMetrics.flexibility || 5,
          strength: physicalMetrics.strength || 5,
          endurance: physicalMetrics.endurance || 5,
          balance: physicalMetrics.balance || 5,
          coordination: physicalMetrics.coordination || 5,
          overallPhysical: this.calculateOverallPhysical(physicalMetrics)
        },
        
        // Mental/Emotional Metrics
        mental: {
          mood: mentalMetrics.mood || 5,
          stressLevel: mentalMetrics.stress || 5,
          motivation: mentalMetrics.motivation || 5,
          confidence: mentalMetrics.confidence || 5,
          focus: mentalMetrics.focus || 5,
          anxiety: mentalMetrics.anxiety || 0,
          overallMental: this.calculateOverallMental(mentalMetrics)
        },
        
        // Skate-Specific Metrics
        skateMetrics: {
          sessionIntensity: skateSpecific.intensity || 'moderate',
          tricksAttempted: skateSpecific.tricks || 0,
          tricksLanded: skateSpecific.landed || 0,
          fallCount: skateSpecific.falls || 0,
          sessionDuration: skateSpecific.duration || 0,
          spotType: skateSpecific.spotType || 'street',
          progressFeeling: skateSpecific.progress || 'neutral'
        },
        
        // Lifestyle Factors
        lifestyle: {
          sleepHours: lifestyle.sleep || 8,
          sleepQuality: lifestyle.sleepQuality || 5,
          hydration: lifestyle.hydration || 5,
          nutrition: lifestyle.nutrition || 5,
          alcoholConsumption: lifestyle.alcohol || 0,
          caffeineIntake: lifestyle.caffeine || 0,
          socialActivity: lifestyle.social || 5
        },
        
        // Pain & Injury Tracking
        painPoints: metricsData.painPoints || [],
        newInjuries: metricsData.newInjuries || [],
        recoveryUpdates: metricsData.recoveryUpdates || [],
        
        // Additional Notes
        notes,
        
        // Auto-calculated Risk Assessments
        riskAssessment: await this.calculateDailyRiskAssessment(userId, metricsData),
        
        loggedAt: serverTimestamp(),
        
        // Compliance
        complianceScore: this.calculateComplianceScore(metricsData),
        dataCompleteness: this.calculateDataCompleteness(metricsData)
      };

      await addDoc(collection(db, 'dailyWellnessEntries'), wellnessEntry);

      // Update wellness profile with latest status
      await this.updateWellnessProfile(userId, wellnessEntry);

      // Check for alerts/recommendations
      await this.checkWellnessAlerts(userId, wellnessEntry);

      analyticsService.logEvent('daily_wellness_logged', {
        category: EventCategory.HEALTH,
        user_id: userId,
        overall_physical: wellnessEntry.physical.overallPhysical,
        overall_mental: wellnessEntry.mental.overallMental,
        fall_count: wellnessEntry.skateMetrics.fallCount
      });

      return wellnessEntry;
    } catch (error) {
      throw error;
    }
  }

  // INJURY PREVENTION & MONITORING

  async reportInjury(userId, injuryData) {
    try {
      const {
        type, // 'acute', 'chronic', 'overuse'
        bodyPart,
        severity, // 1-10 scale
        mechanism, // How injury occurred
        symptoms,
        immediateAction = '',
        skateRelated = true,
        tricksInvolved = [],
        spotConditions = {},
        witnessAccount = ''
      } = injuryData;

      const injury = {
        id: `injury_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        
        // Injury Details
        injury: {
          type,
          bodyPart,
          severity,
          mechanism,
          symptoms: Array.isArray(symptoms) ? symptoms : [symptoms],
          description: injuryData.description || '',
          skateRelated,
          tricksInvolved,
          spotConditions
        },
        
        // Incident Details
        incident: {
          dateTime: new Date(),
          location: injuryData.location || '',
          conditions: spotConditions,
          equipment: injuryData.equipment || {},
          witnessAccount,
          immediateAction,
          medicalAttention: injuryData.medicalAttention || false
        },
        
        // Recovery Tracking
        recovery: {
          status: 'active', // 'active', 'healing', 'recovered', 'chronic'
          estimatedRecovery: this.estimateRecoveryTime(type, bodyPart, severity),
          currentPain: severity,
          functionalLimitations: [],
          treatmentPlan: [],
          medicalFollowup: injuryData.medicalFollowup || false
        },
        
        // Prevention Analysis
        prevention: {
          preventable: null,
          riskFactors: await this.identifyRiskFactors(userId, injuryData),
          recommendations: await this.generateInjuryRecommendations(injuryData),
          equipmentSuggestions: await this.suggestProtectiveEquipment(bodyPart)
        },
        
        // Follow-up Schedule
        followUp: {
          nextCheckIn: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
          checkInFrequency: this.determineCheckInFrequency(severity),
          alertsEnabled: true,
          recoveryMilestones: this.createRecoveryMilestones(type, bodyPart, severity)
        },
        
        reportedAt: serverTimestamp(),
        lastUpdated: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'injuryReports'), injury);
      injury.id = docRef.id;

      // Update user's injury history
      await this.updateInjuryHistory(userId, injury);

      // Create recovery plan
      await this.createRecoveryPlan(userId, injury);

      // Send immediate recommendations
      await this.sendInjuryGuidance(userId, injury);

      // Alert emergency contact if severe
      if (severity >= 8) {
        await this.alertEmergencyContact(userId, injury);
      }

      analyticsService.logEvent('injury_reported', {
        category: EventCategory.HEALTH,
        user_id: userId,
        injury_type: type,
        body_part: bodyPart,
        severity: severity,
        skate_related: skateRelated
      });

      return injury;
    } catch (error) {
      throw error;
    }
  }

  async updateInjuryStatus(injuryId, userId, updateData) {
    try {
      const {
        currentPain,
        symptoms,
        functionalStatus,
        treatmentCompliance,
        notes,
        milestoneReached = null
      } = updateData;

      const injuryRef = doc(db, 'injuryReports', injuryId);
      
      const updateFields = {
        'recovery.currentPain': currentPain,
        'recovery.lastUpdate': serverTimestamp(),
        lastUpdated: serverTimestamp()
      };

      if (symptoms) updateFields['recovery.currentSymptoms'] = symptoms;
      if (functionalStatus) updateFields['recovery.functionalStatus'] = functionalStatus;
      if (treatmentCompliance !== undefined) updateFields['recovery.treatmentCompliance'] = treatmentCompliance;

      await updateDoc(injuryRef, updateFields);

      // Log recovery entry
      const recoveryEntry = {
        injuryId,
        userId,
        currentPain,
        symptoms,
        functionalStatus,
        treatmentCompliance,
        notes,
        milestoneReached,
        loggedAt: serverTimestamp()
      };

      await addDoc(collection(db, 'recoveryEntries'), recoveryEntry);

      // Check if injury is resolved
      if (currentPain <= 1 && functionalStatus === 'full') {
        await this.markInjuryResolved(injuryId);
      }

      // Generate updated recommendations
      await this.updateRecoveryRecommendations(injuryId, recoveryEntry);

      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  // RECOVERY PLANNING

  async createRecoveryPlan(userId, injury) {
    try {
      const recoveryPlan = {
        injuryId: injury.id,
        userId,
        
        // Plan Overview
        plan: {
          type: this.determineRecoveryType(injury),
          duration: injury.recovery.estimatedRecovery,
          phases: await this.createRecoveryPhases(injury),
          goals: await this.setRecoveryGoals(injury)
        },
        
        // Treatment Protocols
        treatment: {
          immediate: await this.getImmediateTreatment(injury),
          ongoing: await this.getOngoingTreatment(injury),
          exercises: await this.getRehabExercises(injury),
          medications: injury.recovery.medications || [],
          therapy: injury.recovery.therapy || []
        },
        
        // Activity Modifications
        modifications: {
          skatingRestrictions: await this.getSkatingRestrictions(injury),
          alternativeActivities: await this.getAlternativeActivities(injury),
          equipmentRecommendations: injury.prevention.equipmentSuggestions,
          techniqueAdjustments: await this.getTechniqueAdjustments(injury)
        },
        
        // Monitoring Schedule
        monitoring: {
          dailyAssessments: this.createDailyAssessments(injury),
          weeklyGoals: this.createWeeklyGoals(injury),
          checkpoints: injury.followUp.recoveryMilestones,
          alertThresholds: this.setAlertThresholds(injury)
        },
        
        // Educational Resources
        education: {
          injuryInfo: await this.getInjuryEducation(injury),
          preventionTips: injury.prevention.recommendations,
          returnToSkateGuidelines: await this.getReturnToSkateGuidelines(injury),
          warningSignsToWatch: await this.getWarningSignsToWatch(injury)
        },
        
        status: 'active',
        createdAt: serverTimestamp(),
        lastReviewed: serverTimestamp()
      };

      await addDoc(collection(db, 'recoveryPlans'), recoveryPlan);

      // Schedule automated check-ins
      await this.scheduleRecoveryCheckIns(recoveryPlan);

      return recoveryPlan;
    } catch (error) {
      throw error;
    }
  }

  // PREVENTIVE ANALYTICS

  async analyzeInjuryRisk(userId) {
    try {
      // Get user's wellness history
      const wellnessHistory = await this.getWellnessHistory(userId, 30); // Last 30 days
      const injuryHistory = await this.getInjuryHistory(userId);
      const userProfile = await this.getWellnessProfile(userId);

      const riskAnalysis = {
        userId,
        analysisDate: new Date(),
        
        // Overall Risk Assessment
        overallRisk: {
          level: 'moderate', // 'low', 'moderate', 'high', 'critical'
          score: 0, // 0-100
          confidence: 0.85,
          primaryFactors: [],
          trend: 'stable' // 'improving', 'stable', 'declining'
        },
        
        // Category-Specific Risks
        categoryRisks: {
          acute: await this.calculateAcuteInjuryRisk(userId, wellnessHistory),
          overuse: await this.calculateOveruseInjuryRisk(userId, wellnessHistory),
          reinjury: await this.calculateReinjuryRisk(userId, injuryHistory),
          fatigue: await this.calculateFatigueRelatedRisk(userId, wellnessHistory)
        },
        
        // Body Part Risk Assessment
        bodyPartRisks: {
          ankles: await this.assessAnkleRisk(userId, wellnessHistory, injuryHistory),
          knees: await this.assessKneeRisk(userId, wellnessHistory, injuryHistory),
          wrists: await this.assessWristRisk(userId, wellnessHistory, injuryHistory),
          head: await this.assessHeadRisk(userId, wellnessHistory, injuryHistory),
          back: await this.assessBackRisk(userId, wellnessHistory, injuryHistory)
        },
        
        // Contributing Factors
        riskFactors: {
          lifestyle: this.analyzeLifestyleFactors(wellnessHistory),
          environmental: this.analyzeEnvironmentalFactors(wellnessHistory),
          behavioral: this.analyzeBehavioralFactors(wellnessHistory),
          physiological: this.analyzePhysiologicalFactors(wellnessHistory, userProfile)
        },
        
        // Recommendations
        recommendations: {
          immediate: [],
          shortTerm: [],
          longTerm: [],
          priority: 'high' // 'low', 'medium', 'high', 'urgent'
        },
        
        // Predictive Insights
        predictions: {
          nextInjuryRisk: await this.predictNextInjuryRisk(userId, wellnessHistory, injuryHistory),
          riskTimeline: await this.createRiskTimeline(userId, wellnessHistory),
          interventionEffectiveness: await this.predictInterventionEffectiveness(userId)
        }
      };

      // Calculate overall risk score
      riskAnalysis.overallRisk.score = this.calculateOverallRiskScore(riskAnalysis);
      riskAnalysis.overallRisk.level = this.categorizeRiskLevel(riskAnalysis.overallRisk.score);

      // Generate specific recommendations
      riskAnalysis.recommendations = await this.generateRiskRecommendations(riskAnalysis);

      // Save analysis
      await addDoc(collection(db, 'riskAnalyses'), riskAnalysis);

      // Send alerts if high risk
      if (riskAnalysis.overallRisk.level === 'high' || riskAnalysis.overallRisk.level === 'critical') {
        await this.sendRiskAlert(userId, riskAnalysis);
      }

      return riskAnalysis;
    } catch (error) {
      throw error;
    }
  }

  // RECOVERY MONITORING

  async trackRecoveryProgress(userId, timeframe = 30) {
    try {
      const recoveryData = await this.getRecoveryData(userId, timeframe);
      
      const progressAnalysis = {
        userId,
        timeframe,
        analysisDate: new Date(),
        
        // Active Injuries
        activeInjuries: recoveryData.activeInjuries.map(injury => ({
          id: injury.id,
          bodyPart: injury.injury.bodyPart,
          daysSinceInjury: this.daysSince(injury.incident.dateTime),
          currentPain: injury.recovery.currentPain,
          expectedPain: this.expectedPainLevel(injury, this.daysSince(injury.incident.dateTime)),
          progressRate: this.calculateProgressRate(injury),
          onTrack: this.isRecoveryOnTrack(injury),
          concerns: this.identifyRecoveryConcerns(injury)
        })),
        
        // Overall Recovery Health
        recoveryHealth: {
          score: 0, // 0-100
          trend: 'improving', // 'improving', 'stable', 'declining'
          compliance: this.calculateRecoveryCompliance(recoveryData),
          effectiveness: this.calculateTreatmentEffectiveness(recoveryData)
        },
        
        // Progress Metrics
        metrics: {
          averagePainReduction: this.calculateAveragePainReduction(recoveryData),
          functionalImprovement: this.calculateFunctionalImprovement(recoveryData),
          milestoneCompletion: this.calculateMilestoneCompletion(recoveryData),
          returnToActivity: this.calculateReturnToActivityReadiness(recoveryData)
        },
        
        // Recommendations
        recommendations: {
          adjustments: await this.recommendTreatmentAdjustments(recoveryData),
          interventions: await this.recommendInterventions(recoveryData),
          modifications: await this.recommendActivityModifications(recoveryData),
          followUp: await this.recommendFollowUp(recoveryData)
        }
      };

      // Calculate overall recovery health score
      progressAnalysis.recoveryHealth.score = this.calculateRecoveryHealthScore(progressAnalysis);

      return progressAnalysis;
    } catch (error) {
      throw error;
    }
  }

  // WELLNESS INSIGHTS & ANALYTICS

  async generateWellnessInsights(userId, period = 90) {
    try {
      const wellnessData = await this.getComprehensiveWellnessData(userId, period);
      
      const insights = {
        userId,
        period,
        generatedAt: new Date(),
        
        // Trend Analysis
        trends: {
          physical: this.analyzeTrends(wellnessData.physicalMetrics),
          mental: this.analyzeTrends(wellnessData.mentalMetrics),
          performance: this.analyzeTrends(wellnessData.performanceMetrics),
          lifestyle: this.analyzeTrends(wellnessData.lifestyleMetrics)
        },
        
        // Pattern Recognition
        patterns: {
          weeklyPatterns: this.identifyWeeklyPatterns(wellnessData),
          seasonalPatterns: this.identifySeasonalPatterns(wellnessData),
          correlations: this.findMetricCorrelations(wellnessData),
          anomalies: this.detectAnomalies(wellnessData)
        },
        
        // Performance Insights
        performance: {
          peakPerformanceFactors: this.identifyPeakPerformanceFactors(wellnessData),
          performanceInhibitors: this.identifyPerformanceInhibitors(wellnessData),
          optimalConditions: this.identifyOptimalConditions(wellnessData),
          improvementOpportunities: this.identifyImprovementOpportunities(wellnessData)
        },
        
        // Health Insights
        health: {
          strengthAreas: this.identifyStrengthAreas(wellnessData),
          concernAreas: this.identifyConcernAreas(wellnessData),
          riskIndicators: this.identifyRiskIndicators(wellnessData),
          healthOptimization: this.suggestHealthOptimizations(wellnessData)
        },
        
        // Personalized Recommendations
        recommendations: {
          daily: await this.generateDailyRecommendations(wellnessData),
          weekly: await this.generateWeeklyRecommendations(wellnessData),
          longTerm: await this.generateLongTermRecommendations(wellnessData),
          interventions: await this.recommendInterventions(wellnessData)
        },
        
        // Goals & Targets
        goals: {
          current: await this.getCurrentGoals(userId),
          suggested: await this.suggestNewGoals(wellnessData),
          progress: await this.assessGoalProgress(userId, wellnessData),
          adjustments: await this.suggestGoalAdjustments(wellnessData)
        }
      };

      // Save insights
      await addDoc(collection(db, 'wellnessInsights'), insights);

      return insights;
    } catch (error) {
      throw error;
    }
  }

  // UTILITY FUNCTIONS

  calculateOverallPhysical(metrics) {
    const weights = {
      energy: 0.3,
      strength: 0.2,
      flexibility: 0.15,
      endurance: 0.15,
      balance: 0.1,
      coordination: 0.1
    };
    
    let total = 0;
    let weightSum = 0;
    
    Object.entries(weights).forEach(([key, weight]) => {
      if (metrics[key] !== undefined) {
        total += metrics[key] * weight;
        weightSum += weight;
      }
    });
    
    return weightSum > 0 ? Math.round(total / weightSum) : 5;
  }

  calculateOverallMental(metrics) {
    const weights = {
      mood: 0.25,
      motivation: 0.25,
      confidence: 0.2,
      focus: 0.15,
      stress: -0.15 // Negative weight for stress
    };
    
    let total = 0;
    let weightSum = 0;
    
    Object.entries(weights).forEach(([key, weight]) => {
      if (metrics[key] !== undefined) {
        const value = key === 'stress' ? 10 - metrics[key] : metrics[key]; // Invert stress
        total += value * Math.abs(weight);
        weightSum += Math.abs(weight);
      }
    });
    
    return weightSum > 0 ? Math.round(total / weightSum) : 5;
  }

  async calculateDailyRiskAssessment(userId, metricsData) {
    let riskScore = 0;
    
    // High fall count increases risk
    if (metricsData.skateSpecific?.falls > 5) riskScore += 20;
    else if (metricsData.skateSpecific?.falls > 2) riskScore += 10;
    
    // Low energy increases risk
    if (metricsData.physicalMetrics?.energy < 3) riskScore += 15;
    
    // High stress increases risk
    if (metricsData.mentalMetrics?.stress > 7) riskScore += 10;
    
    // Poor sleep increases risk
    if (metricsData.lifestyle?.sleepHours < 6) riskScore += 15;
    if (metricsData.lifestyle?.sleepQuality < 4) riskScore += 10;
    
    // Body aches increase risk
    if (metricsData.physicalMetrics?.aches > 5) riskScore += 15;
    
    return {
      score: Math.min(riskScore, 100),
      level: riskScore < 20 ? 'low' : riskScore < 50 ? 'moderate' : 'high',
      factors: this.identifyRiskFactorsFromScore(riskScore, metricsData)
    };
  }

  calculateComplianceScore(metricsData) {
    let fieldsCompleted = 0;
    let totalFields = 0;
    
    // Count completed fields across all categories
    const categories = ['physicalMetrics', 'mentalMetrics', 'skateSpecific', 'lifestyle'];
    
    categories.forEach(category => {
      if (metricsData[category]) {
        Object.values(metricsData[category]).forEach(value => {
          totalFields++;
          if (value !== undefined && value !== null && value !== '') {
            fieldsCompleted++;
          }
        });
      }
    });
    
    return totalFields > 0 ? Math.round((fieldsCompleted / totalFields) * 100) : 0;
  }

  calculateDataCompleteness(metricsData) {
    const requiredFields = [
      'physicalMetrics.energy',
      'mentalMetrics.mood',
      'skateSpecific.intensity',
      'lifestyle.sleepHours'
    ];
    
    let completedRequired = 0;
    
    requiredFields.forEach(field => {
      const value = this.getNestedValue(metricsData, field);
      if (value !== undefined && value !== null && value !== '') {
        completedRequired++;
      }
    });
    
    return (completedRequired / requiredFields.length) * 100;
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  estimateRecoveryTime(type, bodyPart, severity) {
    const baseRecoveryTimes = {
      ankle: 14,
      knee: 21,
      wrist: 10,
      head: 7,
      back: 30
    };
    
    const severityMultiplier = {
      1: 0.3, 2: 0.5, 3: 0.7, 4: 0.9, 5: 1.0,
      6: 1.3, 7: 1.6, 8: 2.0, 9: 2.5, 10: 3.0
    };
    
    const typeMultiplier = {
      acute: 1.0,
      chronic: 2.0,
      overuse: 1.5
    };
    
    const baseDays = baseRecoveryTimes[bodyPart] || 14;
    const adjustedDays = baseDays * severityMultiplier[severity] * typeMultiplier[type];
    
    return Math.round(adjustedDays);
  }

  async identifyRiskFactors(userId, injuryData) {
    const factors = [];
    
    // Get recent wellness data
    const recentWellness = await this.getRecentWellnessData(userId, 7);
    
    if (recentWellness) {
      if (recentWellness.averageSleep < 6) factors.push('sleep_deprivation');
      if (recentWellness.averageStress > 7) factors.push('high_stress');
      if (recentWellness.averageEnergy < 4) factors.push('low_energy');
      if (recentWellness.recentFalls > 10) factors.push('frequent_falls');
    }
    
    // Injury-specific factors
    if (injuryData.tricksInvolved.includes('flip_trick')) factors.push('technical_tricks');
    if (injuryData.spotConditions.wet) factors.push('poor_conditions');
    if (injuryData.equipment.worn) factors.push('equipment_issues');
    
    return factors;
  }

  async generateInjuryRecommendations(injuryData) {
    const recommendations = [];
    
    // Body part specific recommendations
    switch (injuryData.bodyPart) {
      case 'ankle':
        recommendations.push('Ankle strengthening exercises');
        recommendations.push('Balance training');
        recommendations.push('Proper footwear assessment');
        break;
      case 'wrist':
        recommendations.push('Wrist guards for future sessions');
        recommendations.push('Fall technique training');
        recommendations.push('Strength training for arms');
        break;
      case 'knee':
        recommendations.push('Knee stability exercises');
        recommendations.push('Proper warm-up routine');
        recommendations.push('Landing technique review');
        break;
    }
    
    // General recommendations
    if (injuryData.severity > 5) {
      recommendations.push('Seek medical evaluation');
      recommendations.push('Complete rest from skating');
    }
    
    return recommendations;
  }

  async suggestProtectiveEquipment(bodyPart) {
    const equipment = {
      ankle: ['High-top skate shoes', 'Ankle braces', 'Proper socks'],
      wrist: ['Wrist guards', 'Palm protectors', 'Gloves'],
      knee: ['Knee pads', 'Compression sleeves', 'Patella straps'],
      head: ['Helmet', 'Impact-resistant hat'],
      back: ['Back protector', 'Core strengthening gear']
    };
    
    return equipment[bodyPart] || ['General protective gear'];
  }

  determineCheckInFrequency(severity) {
    if (severity >= 8) return 'daily';
    if (severity >= 5) return 'every_other_day';
    return 'weekly';
  }

  createRecoveryMilestones(type, bodyPart, severity) {
    const milestones = [];
    const totalDays = this.estimateRecoveryTime(type, bodyPart, severity);
    
    // 25% milestone
    milestones.push({
      day: Math.round(totalDays * 0.25),
      goal: 'Pain reduction to 50% of initial level',
      assessment: 'pain_level'
    });
    
    // 50% milestone
    milestones.push({
      day: Math.round(totalDays * 0.5),
      goal: 'Basic functional movement restored',
      assessment: 'functional_test'
    });
    
    // 75% milestone
    milestones.push({
      day: Math.round(totalDays * 0.75),
      goal: 'Return to light activity',
      assessment: 'activity_tolerance'
    });
    
    // 100% milestone
    milestones.push({
      day: totalDays,
      goal: 'Full return to skating',
      assessment: 'full_assessment'
    });
    
    return milestones;
  }

  identifyRiskFactorsFromScore(score, metricsData) {
    const factors = [];
    
    if (metricsData.skateSpecific?.falls > 2) factors.push('High fall count');
    if (metricsData.physicalMetrics?.energy < 3) factors.push('Low energy');
    if (metricsData.mentalMetrics?.stress > 7) factors.push('High stress');
    if (metricsData.lifestyle?.sleepHours < 6) factors.push('Poor sleep');
    if (metricsData.physicalMetrics?.aches > 5) factors.push('Body aches');
    
    return factors;
  }

  // Additional utility functions would be implemented here...
  // For brevity, showing key structure and main functionality

  async updateWellnessProfile(userId, entry) {
    // Update user's wellness profile with latest metrics
  }

  async checkWellnessAlerts(userId, entry) {
    // Check for concerning patterns and send alerts
  }

  async getWellnessHistory(userId, days) {
    // Retrieve wellness history for analysis
  }

  async getInjuryHistory(userId) {
    // Retrieve injury history for risk assessment
  }

  async sendInjuryGuidance(userId, injury) {
    // Send immediate care instructions
  }

  async alertEmergencyContact(userId, injury) {
    // Alert emergency contact for severe injuries
  }

  cleanup() {
    this.activeTracking.clear();
    this.injuryMonitoring.clear();
    this.recoveryPlans.clear();
    this.healthMetrics.clear();
  }
}

export default new WellnessTrackingService();
