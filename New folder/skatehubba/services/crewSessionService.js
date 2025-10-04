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
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { analyticsService, EventCategory } from './analytics';
import GlobalErrorHandler from './errorHandler';

class CrewSessionService {
  constructor() {
    this.activeCrews = new Map();
    this.activeSessions = new Map();
    this.crewListeners = new Map();
    this.sessionListeners = new Map();
  }

  // Crew Management
  async createCrew(crewData) {
    try {
      const crew = {
        name: crewData.name,
        description: crewData.description || '',
        isPrivate: crewData.isPrivate || false,
        creatorId: crewData.creatorId,
        members: [{
          userId: crewData.creatorId,
          role: 'admin',
          joinedAt: new Date(),
          verified: true
        }],
        inviteCodes: [],
        stats: {
          totalSessions: 0,
          totalTricks: 0,
          totalScore: 0,
          bestSession: null
        },
        badges: [],
        settings: {
          requireApproval: crewData.isPrivate,
          allowInvites: true,
          sessionNotifications: true
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const crewRef = await addDoc(collection(db, 'crews'), crew);
      
      analyticsService.logEvent('crew_created', {
        category: EventCategory.PROFILE,
        crew_id: crewRef.id,
        is_private: crew.isPrivate
      });

      return { id: crewRef.id, ...crew };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'crew_session',
        action: 'create_crew'
      });
      throw new Error('Failed to create crew');
    }
  }

  async joinCrew(crewId, userId, inviteCode = null) {
    try {
      const crew = await this.getCrew(crewId);
      
      if (!crew) {
        throw new Error('Crew not found');
      }

      if (crew.isPrivate && !inviteCode) {
        throw new Error('Invite code required for private crew');
      }

      if (crew.members.some(m => m.userId === userId)) {
        throw new Error('Already a member of this crew');
      }

      const newMember = {
        userId,
        role: 'member',
        joinedAt: new Date(),
        verified: !crew.settings.requireApproval,
        inviteCode
      };

      const crewRef = doc(db, 'crews', crewId);
      await updateDoc(crewRef, {
        members: arrayUnion(newMember),
        updatedAt: serverTimestamp()
      });

      analyticsService.logEvent('crew_joined', {
        category: EventCategory.PROFILE,
        crew_id: crewId,
        user_id: userId
      });

      return true;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'crew_session',
        action: 'join_crew'
      });
      throw error;
    }
  }

  async createSession(sessionData) {
    try {
      const session = {
        crewId: sessionData.crewId,
        creatorId: sessionData.creatorId,
        title: sessionData.title || 'Crew Session',
        description: sessionData.description || '',
        spotId: sessionData.spotId,
        spotLocation: sessionData.spotLocation,
        type: sessionData.type || 'freestyle', // freestyle, challenge, collab
        isLive: sessionData.isLive || false,
        startTime: sessionData.startTime || new Date(),
        endTime: sessionData.endTime,
        participants: [{
          userId: sessionData.creatorId,
          joinedAt: new Date(),
          role: 'host'
        }],
        clips: [],
        challenges: sessionData.challenges || [],
        chat: [],
        votes: [],
        collaborativeEdit: {
          enabled: sessionData.enableCollabEdit || false,
          clips: [],
          timeline: [],
          contributors: []
        },
        settings: {
          allowSpectators: sessionData.allowSpectators || true,
          maxParticipants: sessionData.maxParticipants || 10,
          votingEnabled: sessionData.votingEnabled || true,
          autoRecord: sessionData.autoRecord || false
        },
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const sessionRef = await addDoc(collection(db, 'crewSessions'), session);
      
      analyticsService.logEvent('crew_session_created', {
        category: EventCategory.SESSION,
        session_id: sessionRef.id,
        crew_id: sessionData.crewId,
        session_type: session.type,
        is_live: session.isLive
      });

      return { id: sessionRef.id, ...session };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'crew_session',
        action: 'create_session'
      });
      throw new Error('Failed to create session');
    }
  }

  async joinSession(sessionId, userId) {
    try {
      const session = await this.getSession(sessionId);
      
      if (!session) {
        throw new Error('Session not found');
      }

      if (session.participants.length >= session.settings.maxParticipants) {
        throw new Error('Session is full');
      }

      if (session.participants.some(p => p.userId === userId)) {
        throw new Error('Already in session');
      }

      const participant = {
        userId,
        joinedAt: new Date(),
        role: 'participant'
      };

      const sessionRef = doc(db, 'crewSessions', sessionId);
      await updateDoc(sessionRef, {
        participants: arrayUnion(participant),
        updatedAt: serverTimestamp()
      });

      analyticsService.logEvent('crew_session_joined', {
        category: EventCategory.SESSION,
        session_id: sessionId,
        user_id: userId
      });

      return true;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'crew_session',
        action: 'join_session'
      });
      throw error;
    }
  }

  async submitClipToSession(sessionId, clipData) {
    try {
      const sessionClip = {
        id: Date.now().toString(),
        userId: clipData.userId,
        videoUri: clipData.videoUri,
        title: clipData.title,
        description: clipData.description,
        trickName: clipData.trickName,
        timestamp: new Date(),
        votes: [],
        approved: false,
        inCollabEdit: false
      };

      const sessionRef = doc(db, 'crewSessions', sessionId);
      await updateDoc(sessionRef, {
        clips: arrayUnion(sessionClip),
        updatedAt: serverTimestamp()
      });

      analyticsService.logEvent('session_clip_submitted', {
        category: EventCategory.SESSION,
        session_id: sessionId,
        user_id: clipData.userId,
        trick_name: clipData.trickName
      });

      return sessionClip;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'crew_session',
        action: 'submit_clip'
      });
      throw new Error('Failed to submit clip');
    }
  }

  async sendChatMessage(sessionId, userId, message, type = 'text') {
    try {
      const chatMessage = {
        id: Date.now().toString(),
        userId,
        message,
        type, // text, emote, system
        timestamp: new Date()
      };

      const sessionRef = doc(db, 'crewSessions', sessionId);
      await updateDoc(sessionRef, {
        chat: arrayUnion(chatMessage),
        updatedAt: serverTimestamp()
      });

      return chatMessage;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'crew_session',
        action: 'send_chat'
      });
      throw new Error('Failed to send message');
    }
  }

  async voteOnClip(sessionId, clipId, userId, vote) {
    try {
      const session = await this.getSession(sessionId);
      const clipIndex = session.clips.findIndex(c => c.id === clipId);
      
      if (clipIndex === -1) {
        throw new Error('Clip not found');
      }

      const clip = session.clips[clipIndex];
      const existingVoteIndex = clip.votes.findIndex(v => v.userId === userId);
      
      if (existingVoteIndex >= 0) {
        clip.votes[existingVoteIndex] = { userId, vote, timestamp: new Date() };
      } else {
        clip.votes.push({ userId, vote, timestamp: new Date() });
      }

      session.clips[clipIndex] = clip;
      
      const sessionRef = doc(db, 'crewSessions', sessionId);
      await updateDoc(sessionRef, {
        clips: session.clips,
        updatedAt: serverTimestamp()
      });

      return true;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'crew_session',
        action: 'vote_on_clip'
      });
      throw new Error('Failed to vote on clip');
    }
  }

  async addToCollaborativeEdit(sessionId, clipId, userId) {
    try {
      const session = await this.getSession(sessionId);
      
      if (!session.collaborativeEdit.enabled) {
        throw new Error('Collaborative editing not enabled');
      }

      const clip = session.clips.find(c => c.id === clipId);
      if (!clip) {
        throw new Error('Clip not found');
      }

      const sessionRef = doc(db, 'crewSessions', sessionId);
      await updateDoc(sessionRef, {
        'collaborativeEdit.clips': arrayUnion(clipId),
        'collaborativeEdit.contributors': arrayUnion(userId),
        updatedAt: serverTimestamp()
      });

      analyticsService.logEvent('collab_edit_clip_added', {
        category: EventCategory.SESSION,
        session_id: sessionId,
        clip_id: clipId,
        user_id: userId
      });

      return true;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'crew_session',
        action: 'add_to_collab_edit'
      });
      throw new Error('Failed to add clip to collaborative edit');
    }
  }

  async finalizeCollaborativeEdit(sessionId, editData) {
    try {
      const finalEdit = {
        id: Date.now().toString(),
        sessionId,
        clips: editData.clips,
        timeline: editData.timeline,
        effects: editData.effects || [],
        music: editData.music || null,
        contributors: editData.contributors,
        createdAt: new Date(),
        title: editData.title || 'Crew Session Edit'
      };

      // Save the collaborative edit
      const editRef = await addDoc(collection(db, 'collaborativeEdits'), finalEdit);
      
      // Update session
      const sessionRef = doc(db, 'crewSessions', sessionId);
      await updateDoc(sessionRef, {
        'collaborativeEdit.finalEdit': editRef.id,
        status: 'completed',
        updatedAt: serverTimestamp()
      });

      analyticsService.logEvent('collab_edit_finalized', {
        category: EventCategory.SESSION,
        session_id: sessionId,
        edit_id: editRef.id,
        clips_count: editData.clips.length,
        contributors_count: editData.contributors.length
      });

      return { id: editRef.id, ...finalEdit };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'crew_session',
        action: 'finalize_collab_edit'
      });
      throw new Error('Failed to finalize collaborative edit');
    }
  }

  // Real-time subscriptions
  subscribeToSession(sessionId, callback) {
    try {
      const sessionRef = doc(db, 'crewSessions', sessionId);
      
      const unsubscribe = onSnapshot(sessionRef, (doc) => {
        if (doc.exists()) {
          callback({ id: doc.id, ...doc.data() });
        }
      });

      this.sessionListeners.set(sessionId, unsubscribe);
      return unsubscribe;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'crew_session',
        action: 'subscribe_to_session'
      });
      return () => {};
    }
  }

  subscribeToCrew(crewId, callback) {
    try {
      const crewRef = doc(db, 'crews', crewId);
      
      const unsubscribe = onSnapshot(crewRef, (doc) => {
        if (doc.exists()) {
          callback({ id: doc.id, ...doc.data() });
        }
      });

      this.crewListeners.set(crewId, unsubscribe);
      return unsubscribe;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'crew_session',
        action: 'subscribe_to_crew'
      });
      return () => {};
    }
  }

  async getCrew(crewId) {
    try {
      const crewRef = doc(db, 'crews', crewId);
      const crewSnap = await crewRef.get();
      
      if (!crewSnap.exists()) {
        return null;
      }

      return { id: crewSnap.id, ...crewSnap.data() };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'crew_session',
        action: 'get_crew'
      });
      return null;
    }
  }

  async getSession(sessionId) {
    try {
      const sessionRef = doc(db, 'crewSessions', sessionId);
      const sessionSnap = await sessionRef.get();
      
      if (!sessionSnap.exists()) {
        return null;
      }

      return { id: sessionSnap.id, ...sessionSnap.data() };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'crew_session',
        action: 'get_session'
      });
      return null;
    }
  }

  async getUserCrews(userId) {
    try {
      const q = query(
        collection(db, 'crews'),
        where('members', 'array-contains-any', [{ userId }])
      );

      const snapshot = await q.get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'crew_session',
        action: 'get_user_crews'
      });
      return [];
    }
  }

  cleanup() {
    this.crewListeners.forEach(unsubscribe => unsubscribe());
    this.sessionListeners.forEach(unsubscribe => unsubscribe());
    this.crewListeners.clear();
    this.sessionListeners.clear();
  }
}

export default new CrewSessionService();
