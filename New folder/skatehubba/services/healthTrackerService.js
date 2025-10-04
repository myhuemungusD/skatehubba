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
  serverTimestamp
} from 'firebase/firestore';
import { analyticsService, EventCategory } from './analytics';
import GlobalErrorHandler from './errorHandler';

class HealthTrackerService {
  constructor() {
    this.healthProfiles = new Map();
    this.injuryRecords = new Map();
    this.progressData = new Map();
    this.workoutPlans = new Map();
  }

  // Health Profile Management
  async createHealthProfile(userId, profileData) {
    try {
      const healthProfile = {
        userId,
        personalInfo: {
          age: profileData.age,
          weight: profileData.weight,
          height: profileData.height,
          skateExperience: profileData.skateExperience || 'beginner', // beginner, intermediate, advanced, pro
          preferredStance: profileData.preferredStance || 'regular' // regular, goofy
        },
        medicalHistory: {
          allergies: profileData.allergies || [],
          medications: profileData.medications || [],
          chronicConditions: profileData.chronicConditions || [],
          emergencyContact: profileData.emergencyContact || {}
        },
        fitnessGoals: {
          primary: profileData.primaryGoal || 'improve_skating',
          secondary: profileData.secondaryGoals || [],
          targetWeight: profileData.targetWeight,
          strengthGoals: profileData.strengthGoals || []
        },
        preferences: {
          workoutIntensity: profileData.workoutIntensity || 'moderate',
          availableWorkoutDays: profileData.availableWorkoutDays || 3,
          preferredWorkoutDuration: profileData.preferredWorkoutDuration || 30,
          injuryPrevention: profileData.injuryPrevention || true
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const profileRef = doc(db, 'healthProfiles', userId);
      await updateDoc(profileRef, healthProfile);

      analyticsService.logEvent('health_profile_created', {
        category: EventCategory.HEALTH,
        user_id: userId,
        experience_level: healthProfile.personalInfo.skateExperience
      });

      return healthProfile;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'health_tracker',
        action: 'create_health_profile'
      });
      throw new Error('Failed to create health profile');
    }
  }

  // Injury Tracking
  async reportInjury(userId, injuryData) {
    try {
      const injury = {
        userId,
        type: injuryData.type, // sprain, fracture, bruise, cut, strain, etc.
        bodyPart: injuryData.bodyPart, // ankle, knee, wrist, head, etc.
        severity: injuryData.severity, // minor, moderate, severe
        cause: injuryData.cause, // fall, collision, overuse, etc.
        activity: injuryData.activity, // specific trick or activity
        location: injuryData.location, // where injury occurred
        description: injuryData.description,
        symptoms: injuryData.symptoms || [],
        painLevel: injuryData.painLevel, // 1-10 scale
        treatmentReceived: injuryData.treatmentReceived || [],
        recoveryPlan: {
          restDays: injuryData.restDays || 0,
          physioRequired: injuryData.physioRequired || false,
          modifiedActivity: injuryData.modifiedActivity || false,
          followUpDate: injuryData.followUpDate
        },
        status: 'active', // active, recovering, healed
        reportedAt: new Date(),
        healedAt: null,
        photos: injuryData.photos || [],
        doctorNotes: injuryData.doctorNotes || ''
      };

      const injuryRef = await addDoc(collection(db, 'injuries'), injury);
      
      // Create recovery tracking entry
      await this.createRecoveryPlan(injuryRef.id, injury.recoveryPlan);

      analyticsService.logEvent('injury_reported', {
        category: EventCategory.HEALTH,
        user_id: userId,
        injury_type: injury.type,
        body_part: injury.bodyPart,
        severity: injury.severity,
        cause: injury.cause
      });

      return { id: injuryRef.id, ...injury };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'health_tracker',
        action: 'report_injury'
      });
      throw new Error('Failed to report injury');
    }
  }

  async updateInjuryStatus(injuryId, statusUpdate) {
    try {
      const updates = {
        ...statusUpdate,
        lastUpdated: new Date()
      };

      if (statusUpdate.status === 'healed') {
        updates.healedAt = new Date();
      }

      const injuryRef = doc(db, 'injuries', injuryId);
      await updateDoc(injuryRef, updates);

      analyticsService.logEvent('injury_status_updated', {
        category: EventCategory.HEALTH,
        injury_id: injuryId,
        new_status: statusUpdate.status
      });

      return true;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'health_tracker',
        action: 'update_injury_status'
      });
      return false;
    }
  }

  async createRecoveryPlan(injuryId, planData) {
    try {
      const recoveryPlan = {
        injuryId,
        phases: this.generateRecoveryPhases(planData),
        currentPhase: 0,
        exercises: [],
        restrictions: planData.restrictions || [],
        milestones: [],
        progress: {
          completed: 0,
          total: 0
        },
        createdAt: new Date()
      };

      await addDoc(collection(db, 'recoveryPlans'), recoveryPlan);
      return recoveryPlan;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'health_tracker',
        action: 'create_recovery_plan'
      });
      return null;
    }
  }

  generateRecoveryPhases(planData) {
    const phases = [
      {
        name: 'Rest & Protection',
        duration: Math.min(planData.restDays || 3, 7),
        activities: ['rest', 'ice', 'elevation'],
        restrictions: ['no skating', 'limited movement']
      },
      {
        name: 'Gentle Movement',
        duration: 7,
        activities: ['gentle stretching', 'range of motion'],
        restrictions: ['no high impact']
      },
      {
        name: 'Strengthening',
        duration: 14,
        activities: ['strengthening exercises', 'balance training'],
        restrictions: ['modified skating only']
      },
      {
        name: 'Return to Activity',
        duration: 7,
        activities: ['gradual return', 'skill practice'],
        restrictions: ['avoid aggressive tricks']
      }
    ];

    return phases;
  }

  // Progress Tracking
  async logProgress(userId, progressData) {
    try {
      const progress = {
        userId,
        date: progressData.date || new Date(),
        type: progressData.type, // trick_progress, fitness, recovery, general
        metrics: {
          tricksLanded: progressData.tricksLanded || 0,
          tricksAttempted: progressData.tricksAttempted || 0,
          sessionDuration: progressData.sessionDuration || 0,
          caloriesBurned: progressData.caloriesBurned || 0,
          heartRateAvg: progressData.heartRateAvg || 0,
          painLevel: progressData.painLevel || 0,
          energyLevel: progressData.energyLevel || 5,
          confidence: progressData.confidence || 5
        },
        newTricks: progressData.newTricks || [],
        improvedTricks: progressData.improvedTricks || [],
        struggles: progressData.struggles || [],
        notes: progressData.notes || '',
        mood: progressData.mood || 'neutral',
        weatherConditions: progressData.weatherConditions,
        location: progressData.location,
        sessionRating: progressData.sessionRating || 5
      };

      await addDoc(collection(db, 'progressLogs'), progress);

      analyticsService.logEvent('progress_logged', {
        category: EventCategory.HEALTH,
        user_id: userId,
        progress_type: progress.type,
        session_duration: progress.metrics.sessionDuration,
        tricks_landed: progress.metrics.tricksLanded
      });

      return progress;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'health_tracker',
        action: 'log_progress'
      });
      return null;
    }
  }

  async getProgressSummary(userId, timeframe = '30days') {
    try {
      const startDate = this.getStartDate(timeframe);
      
      const q = query(
        collection(db, 'progressLogs'),
        where('userId', '==', userId),
        where('date', '>=', startDate),
        orderBy('date', 'desc')
      );

      const snapshot = await getDocs(q);
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const summary = this.calculateProgressSummary(logs);
      return summary;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'health_tracker',
        action: 'get_progress_summary'
      });
      return null;
    }
  }

  calculateProgressSummary(logs) {
    const summary = {
      totalSessions: logs.length,
      totalDuration: 0,
      totalTricksLanded: 0,
      totalTricksAttempted: 0,
      averagePainLevel: 0,
      averageEnergyLevel: 0,
      averageConfidence: 0,
      averageSessionRating: 0,
      newTricksCount: 0,
      improvementTrends: {},
      injuryRisk: 'low'
    };

    if (logs.length === 0) return summary;

    logs.forEach(log => {
      summary.totalDuration += log.metrics.sessionDuration || 0;
      summary.totalTricksLanded += log.metrics.tricksLanded || 0;
      summary.totalTricksAttempted += log.metrics.tricksAttempted || 0;
      summary.averagePainLevel += log.metrics.painLevel || 0;
      summary.averageEnergyLevel += log.metrics.energyLevel || 0;
      summary.averageConfidence += log.metrics.confidence || 0;
      summary.averageSessionRating += log.sessionRating || 0;
      summary.newTricksCount += log.newTricks?.length || 0;
    });

    // Calculate averages
    summary.averagePainLevel /= logs.length;
    summary.averageEnergyLevel /= logs.length;
    summary.averageConfidence /= logs.length;
    summary.averageSessionRating /= logs.length;

    // Calculate success rate
    summary.successRate = summary.totalTricksAttempted > 0 
      ? (summary.totalTricksLanded / summary.totalTricksAttempted) * 100 
      : 0;

    // Assess injury risk
    if (summary.averagePainLevel > 6) {
      summary.injuryRisk = 'high';
    } else if (summary.averagePainLevel > 3) {
      summary.injuryRisk = 'moderate';
    }

    return summary;
  }

  // Workout Plans & Exercise Recommendations
  async generateWorkoutPlan(userId, focus = 'general') {
    try {
      const healthProfile = await this.getHealthProfile(userId);
      const recentInjuries = await this.getActiveInjuries(userId);
      
      const workoutPlan = {
        userId,
        focus, // strength, flexibility, cardio, injury_prevention, recovery
        duration: healthProfile?.preferences?.preferredWorkoutDuration || 30,
        intensity: healthProfile?.preferences?.workoutIntensity || 'moderate',
        exercises: this.getExercisesForFocus(focus, recentInjuries),
        schedule: this.generateSchedule(healthProfile?.preferences?.availableWorkoutDays || 3),
        modifications: this.getModifications(recentInjuries),
        createdAt: new Date(),
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      };

      await addDoc(collection(db, 'workoutPlans'), workoutPlan);

      analyticsService.logEvent('workout_plan_generated', {
        category: EventCategory.HEALTH,
        user_id: userId,
        focus: focus,
        duration: workoutPlan.duration,
        intensity: workoutPlan.intensity
      });

      return workoutPlan;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'health_tracker',
        action: 'generate_workout_plan'
      });
      return null;
    }
  }

  getExercisesForFocus(focus, injuries = []) {
    const exerciseDatabase = {
      strength: [
        { name: 'Squats', sets: 3, reps: 15, targetMuscles: ['legs', 'glutes'] },
        { name: 'Push-ups', sets: 3, reps: 12, targetMuscles: ['chest', 'arms'] },
        { name: 'Planks', sets: 3, duration: 30, targetMuscles: ['core'] },
        { name: 'Lunges', sets: 3, reps: 10, targetMuscles: ['legs', 'balance'] }
      ],
      flexibility: [
        { name: 'Hip Flexor Stretch', duration: 30, targetMuscles: ['hips'] },
        { name: 'Hamstring Stretch', duration: 30, targetMuscles: ['hamstrings'] },
        { name: 'Calf Stretch', duration: 30, targetMuscles: ['calves'] },
        { name: 'Shoulder Rolls', reps: 10, targetMuscles: ['shoulders'] }
      ],
      cardio: [
        { name: 'Jumping Jacks', duration: 60, intensity: 'moderate' },
        { name: 'Burpees', sets: 3, reps: 8, intensity: 'high' },
        { name: 'Mountain Climbers', duration: 45, intensity: 'high' },
        { name: 'High Knees', duration: 30, intensity: 'moderate' }
      ],
      injury_prevention: [
        { name: 'Balance Board', duration: 60, targetMuscles: ['ankles', 'core'] },
        { name: 'Resistance Band Exercises', sets: 2, reps: 15, targetMuscles: ['ankles'] },
        { name: 'Proprioception Training', duration: 45, targetMuscles: ['balance'] }
      ]
    };

    let exercises = exerciseDatabase[focus] || exerciseDatabase.strength;
    
    // Filter out exercises that might aggravate injuries
    if (injuries.length > 0) {
      const injuredBodyParts = injuries.map(injury => injury.bodyPart);
      exercises = exercises.filter(exercise => 
        !exercise.targetMuscles.some(muscle => 
          injuredBodyParts.includes(muscle)
        )
      );
    }

    return exercises;
  }

  generateSchedule(daysPerWeek) {
    const scheduleTemplates = {
      3: ['Monday', 'Wednesday', 'Friday'],
      4: ['Monday', 'Tuesday', 'Thursday', 'Friday'],
      5: ['Monday', 'Tuesday', 'Wednesday', 'Friday', 'Saturday'],
      6: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      7: ['Daily']
    };

    return scheduleTemplates[daysPerWeek] || scheduleTemplates[3];
  }

  // Health Insights & Recommendations
  async getHealthInsights(userId) {
    try {
      const healthProfile = await this.getHealthProfile(userId);
      const progressSummary = await this.getProgressSummary(userId);
      const injuries = await this.getUserInjuries(userId);
      
      const insights = {
        riskAssessment: this.assessInjuryRisk(progressSummary, injuries),
        recommendations: this.generateRecommendations(healthProfile, progressSummary, injuries),
        trends: this.analyzeTrends(progressSummary),
        alerts: this.generateHealthAlerts(progressSummary, injuries)
      };

      return insights;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'health_tracker',
        action: 'get_health_insights'
      });
      return null;
    }
  }

  assessInjuryRisk(progressSummary, injuries) {
    let riskScore = 0;
    
    if (progressSummary?.averagePainLevel > 5) riskScore += 3;
    if (progressSummary?.averageEnergyLevel < 3) riskScore += 2;
    if (injuries.filter(i => i.status === 'active').length > 0) riskScore += 4;
    
    if (riskScore >= 6) return { level: 'high', score: riskScore };
    if (riskScore >= 3) return { level: 'moderate', score: riskScore };
    return { level: 'low', score: riskScore };
  }

  generateRecommendations(healthProfile, progressSummary, injuries) {
    const recommendations = [];
    
    if (progressSummary?.averagePainLevel > 4) {
      recommendations.push({
        type: 'rest',
        priority: 'high',
        message: 'Consider taking more rest days to reduce pain levels'
      });
    }
    
    if (progressSummary?.successRate < 30) {
      recommendations.push({
        type: 'technique',
        priority: 'medium',
        message: 'Focus on basic techniques before attempting advanced tricks'
      });
    }
    
    if (injuries.length > 0) {
      recommendations.push({
        type: 'prevention',
        priority: 'high',
        message: 'Implement injury prevention exercises in your routine'
      });
    }
    
    return recommendations;
  }

  // Utility Functions
  async getHealthProfile(userId) {
    try {
      const profileRef = doc(db, 'healthProfiles', userId);
      const profileSnap = await getDoc(profileRef);
      return profileSnap.exists() ? { id: profileSnap.id, ...profileSnap.data() } : null;
    } catch (error) {
      return null;
    }
  }

  async getUserInjuries(userId) {
    try {
      const q = query(
        collection(db, 'injuries'),
        where('userId', '==', userId),
        orderBy('reportedAt', 'desc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      return [];
    }
  }

  async getActiveInjuries(userId) {
    try {
      const q = query(
        collection(db, 'injuries'),
        where('userId', '==', userId),
        where('status', 'in', ['active', 'recovering'])
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      return [];
    }
  }

  getStartDate(timeframe) {
    const now = new Date();
    switch (timeframe) {
      case '7days':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30days':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case '90days':
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }
}

export default new HealthTrackerService();
