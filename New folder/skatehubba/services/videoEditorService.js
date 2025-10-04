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

class VideoEditorService {
  constructor() {
    this.activeProjects = new Map();
    this.renderQueue = new Map();
    this.musicLibrary = new Map();
    this.effectsLibrary = new Map();
  }

  // Project Management
  async createProject(userId, projectData) {
    try {
      const project = {
        userId,
        name: projectData.name || 'Untitled Project',
        description: projectData.description || '',
        clips: [],
        timeline: {
          duration: 0,
          tracks: [
            { id: 'video1', type: 'video', clips: [] },
            { id: 'audio1', type: 'audio', clips: [] },
            { id: 'effects1', type: 'effects', clips: [] }
          ]
        },
        settings: {
          resolution: projectData.resolution || '1080p',
          frameRate: projectData.frameRate || 30,
          aspectRatio: projectData.aspectRatio || '16:9'
        },
        soundtrack: {
          enabled: false,
          trackId: null,
          volume: 0.8,
          beatSync: false,
          customBeats: []
        },
        effects: [],
        transitions: [],
        status: 'draft', // draft, rendering, completed
        createdAt: new Date(),
        updatedAt: new Date(),
        renderProgress: 0,
        finalVideoUrl: null
      };

      const projectRef = await addDoc(collection(db, 'videoProjects'), project);
      
      analyticsService.logEvent('video_project_created', {
        category: EventCategory.CONTENT,
        user_id: userId,
        project_id: projectRef.id,
        resolution: project.settings.resolution
      });

      return { id: projectRef.id, ...project };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'video_editor',
        action: 'create_project'
      });
      throw new Error('Failed to create video project');
    }
  }

  // Clip Management
  async addClipToProject(projectId, clipData) {
    try {
      const clip = {
        id: Date.now().toString(),
        videoUrl: clipData.videoUrl,
        duration: clipData.duration,
        startTime: clipData.startTime || 0,
        endTime: clipData.endTime || clipData.duration,
        trimStart: 0,
        trimEnd: clipData.duration,
        position: {
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0
        },
        effects: [],
        filters: {
          brightness: 0,
          contrast: 0,
          saturation: 0,
          blur: 0,
          speed: 1
        },
        metadata: {
          trickName: clipData.trickName,
          location: clipData.location,
          timestamp: clipData.timestamp,
          cameraSettings: clipData.cameraSettings
        }
      };

      const projectRef = doc(db, 'videoProjects', projectId);
      const project = await this.getProject(projectId);
      
      if (!project) {
        throw new Error('Project not found');
      }

      project.clips.push(clip);
      project.timeline.tracks[0].clips.push({
        clipId: clip.id,
        startTime: project.timeline.duration,
        duration: clip.duration
      });
      
      project.timeline.duration += clip.duration;
      project.updatedAt = new Date();

      await updateDoc(projectRef, {
        clips: project.clips,
        timeline: project.timeline,
        updatedAt: project.updatedAt
      });

      analyticsService.logEvent('clip_added_to_project', {
        category: EventCategory.CONTENT,
        project_id: projectId,
        clip_duration: clip.duration,
        trick_name: clip.metadata.trickName
      });

      return clip;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'video_editor',
        action: 'add_clip_to_project'
      });
      throw new Error('Failed to add clip to project');
    }
  }

  async updateClipInTimeline(projectId, clipId, timelineData) {
    try {
      const project = await this.getProject(projectId);
      
      if (!project) {
        throw new Error('Project not found');
      }

      // Update clip in timeline
      const trackIndex = project.timeline.tracks.findIndex(track => 
        track.clips.some(c => c.clipId === clipId)
      );
      
      if (trackIndex >= 0) {
        const clipIndex = project.timeline.tracks[trackIndex].clips.findIndex(c => c.clipId === clipId);
        if (clipIndex >= 0) {
          project.timeline.tracks[trackIndex].clips[clipIndex] = {
            ...project.timeline.tracks[trackIndex].clips[clipIndex],
            ...timelineData
          };
        }
      }

      const projectRef = doc(db, 'videoProjects', projectId);
      await updateDoc(projectRef, {
        timeline: project.timeline,
        updatedAt: new Date()
      });

      return true;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'video_editor',
        action: 'update_clip_timeline'
      });
      return false;
    }
  }

  // Music & Soundtrack Sync
  async getMusicLibrary(filters = {}) {
    try {
      let q = collection(db, 'musicLibrary');
      
      if (filters.genre) {
        q = query(q, where('genre', '==', filters.genre));
      }
      
      if (filters.mood) {
        q = query(q, where('mood', '==', filters.mood));
      }
      
      if (filters.energy) {
        q = query(q, where('energyLevel', '==', filters.energy));
      }

      if (filters.bpm) {
        q = query(q, 
          where('bpm', '>=', filters.bpm.min),
          where('bpm', '<=', filters.bpm.max)
        );
      }

      q = query(q, orderBy('popularity', 'desc'), limit(50));

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'video_editor',
        action: 'get_music_library'
      });
      return [];
    }
  }

  async addSoundtrackToProject(projectId, trackId, syncSettings = {}) {
    try {
      const track = await this.getMusicTrack(trackId);
      const project = await this.getProject(projectId);
      
      if (!track || !project) {
        throw new Error('Track or project not found');
      }

      const soundtrack = {
        enabled: true,
        trackId: trackId,
        volume: syncSettings.volume || 0.8,
        fadeIn: syncSettings.fadeIn || 0,
        fadeOut: syncSettings.fadeOut || 0,
        beatSync: syncSettings.beatSync || false,
        customBeats: syncSettings.customBeats || [],
        startOffset: syncSettings.startOffset || 0,
        loopEnabled: syncSettings.loopEnabled || false
      };

      // If beat sync is enabled, analyze the track
      if (soundtrack.beatSync && track.beatMap) {
        soundtrack.beatMap = track.beatMap;
        soundtrack.suggestedCuts = this.generateBeatSyncCuts(project, track.beatMap);
      }

      const projectRef = doc(db, 'videoProjects', projectId);
      await updateDoc(projectRef, {
        soundtrack: soundtrack,
        updatedAt: new Date()
      });

      analyticsService.logEvent('soundtrack_added', {
        category: EventCategory.CONTENT,
        project_id: projectId,
        track_id: trackId,
        beat_sync: soundtrack.beatSync
      });

      return soundtrack;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'video_editor',
        action: 'add_soundtrack'
      });
      throw new Error('Failed to add soundtrack');
    }
  }

  async enableBeatSync(projectId, beatSyncSettings) {
    try {
      const project = await this.getProject(projectId);
      
      if (!project || !project.soundtrack.trackId) {
        throw new Error('Project or soundtrack not found');
      }

      const track = await this.getMusicTrack(project.soundtrack.trackId);
      
      if (!track.beatMap) {
        // Generate beat map if not available
        track.beatMap = await this.generateBeatMap(track);
      }

      const syncedTimeline = this.syncTimelineToBeats(project.timeline, track.beatMap, beatSyncSettings);
      
      const projectRef = doc(db, 'videoProjects', projectId);
      await updateDoc(projectRef, {
        timeline: syncedTimeline,
        'soundtrack.beatSync': true,
        'soundtrack.beatMap': track.beatMap,
        updatedAt: new Date()
      });

      analyticsService.logEvent('beat_sync_enabled', {
        category: EventCategory.CONTENT,
        project_id: projectId,
        beat_count: track.beatMap?.beats?.length || 0
      });

      return syncedTimeline;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'video_editor',
        action: 'enable_beat_sync'
      });
      throw new Error('Failed to enable beat sync');
    }
  }

  generateBeatMap(track) {
    // Simulate beat detection - in real app, this would use audio analysis
    const beats = [];
    const bpm = track.bpm || 120;
    const beatInterval = 60 / bpm; // seconds per beat
    
    for (let time = 0; time < track.duration; time += beatInterval) {
      beats.push({
        time: time,
        strength: Math.random() * 0.5 + 0.5, // 0.5 to 1.0
        isDownbeat: beats.length % 4 === 0
      });
    }

    return {
      bpm: bpm,
      timeSignature: '4/4',
      beats: beats,
      measures: Math.floor(beats.length / 4)
    };
  }

  syncTimelineToBeats(timeline, beatMap, settings) {
    const syncedTimeline = { ...timeline };
    const { syncType = 'auto', sensitivity = 'medium' } = settings;

    if (syncType === 'auto') {
      // Automatically adjust clip cuts to align with beats
      const strongBeats = beatMap.beats.filter(beat => 
        beat.isDownbeat || beat.strength > 0.8
      );

      syncedTimeline.tracks[0].clips.forEach((clip, index) => {
        const nearestBeat = this.findNearestBeat(clip.startTime, strongBeats);
        if (nearestBeat) {
          clip.startTime = nearestBeat.time;
        }
      });
    }

    return syncedTimeline;
  }

  findNearestBeat(time, beats) {
    let closest = null;
    let minDistance = Infinity;

    beats.forEach(beat => {
      const distance = Math.abs(beat.time - time);
      if (distance < minDistance) {
        minDistance = distance;
        closest = beat;
      }
    });

    return closest;
  }

  // Effects and Filters
  async addEffectToClip(projectId, clipId, effectData) {
    try {
      const project = await this.getProject(projectId);
      const clipIndex = project.clips.findIndex(c => c.id === clipId);
      
      if (clipIndex === -1) {
        throw new Error('Clip not found');
      }

      const effect = {
        id: Date.now().toString(),
        type: effectData.type, // slowmotion, speedup, zoom, pan, etc.
        startTime: effectData.startTime || 0,
        duration: effectData.duration || 1,
        properties: effectData.properties || {},
        intensity: effectData.intensity || 1
      };

      project.clips[clipIndex].effects.push(effect);

      const projectRef = doc(db, 'videoProjects', projectId);
      await updateDoc(projectRef, {
        clips: project.clips,
        updatedAt: new Date()
      });

      analyticsService.logEvent('effect_added', {
        category: EventCategory.CONTENT,
        project_id: projectId,
        clip_id: clipId,
        effect_type: effect.type
      });

      return effect;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'video_editor',
        action: 'add_effect'
      });
      throw new Error('Failed to add effect');
    }
  }

  async addTransition(projectId, fromClipId, toClipId, transitionData) {
    try {
      const transition = {
        id: Date.now().toString(),
        fromClip: fromClipId,
        toClip: toClipId,
        type: transitionData.type, // fade, slide, zoom, etc.
        duration: transitionData.duration || 0.5,
        properties: transitionData.properties || {}
      };

      const projectRef = doc(db, 'videoProjects', projectId);
      const project = await this.getProject(projectId);
      
      project.transitions.push(transition);

      await updateDoc(projectRef, {
        transitions: project.transitions,
        updatedAt: new Date()
      });

      return transition;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'video_editor',
        action: 'add_transition'
      });
      throw new Error('Failed to add transition');
    }
  }

  // Smart Editing Features
  async autoGenerateEdit(projectId, style = 'dynamic') {
    try {
      const project = await this.getProject(projectId);
      
      if (!project || project.clips.length === 0) {
        throw new Error('Project has no clips');
      }

      const autoEdit = this.generateAutoEditSequence(project.clips, style);
      
      // Apply auto-generated sequence to timeline
      project.timeline.tracks[0].clips = autoEdit.sequence;
      project.timeline.duration = autoEdit.totalDuration;

      // Add suggested effects
      autoEdit.effects.forEach(effect => {
        const clipIndex = project.clips.findIndex(c => c.id === effect.clipId);
        if (clipIndex >= 0) {
          project.clips[clipIndex].effects.push(effect);
        }
      });

      const projectRef = doc(db, 'videoProjects', projectId);
      await updateDoc(projectRef, {
        timeline: project.timeline,
        clips: project.clips,
        updatedAt: new Date()
      });

      analyticsService.logEvent('auto_edit_generated', {
        category: EventCategory.CONTENT,
        project_id: projectId,
        style: style,
        clips_count: project.clips.length
      });

      return autoEdit;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'video_editor',
        action: 'auto_generate_edit'
      });
      throw new Error('Failed to generate auto edit');
    }
  }

  generateAutoEditSequence(clips, style) {
    const sequence = [];
    let totalDuration = 0;
    const effects = [];

    clips.forEach((clip, index) => {
      let clipDuration = clip.duration;
      
      // Adjust duration based on style
      switch (style) {
        case 'dynamic':
          clipDuration = Math.min(clip.duration, 3); // Max 3 seconds per clip
          break;
        case 'cinematic':
          clipDuration = Math.min(clip.duration, 5); // Max 5 seconds per clip
          break;
        case 'highlight':
          clipDuration = Math.min(clip.duration, 2); // Max 2 seconds per clip
          break;
      }

      sequence.push({
        clipId: clip.id,
        startTime: totalDuration,
        duration: clipDuration
      });

      // Add style-specific effects
      if (style === 'dynamic' && clip.metadata.trickName) {
        effects.push({
          clipId: clip.id,
          type: 'slowmotion',
          startTime: clipDuration * 0.7,
          duration: clipDuration * 0.3,
          properties: { speed: 0.5 }
        });
      }

      totalDuration += clipDuration;
    });

    return {
      sequence,
      totalDuration,
      effects,
      style
    };
  }

  // Rendering
  async startRender(projectId, renderSettings = {}) {
    try {
      const project = await this.getProject(projectId);
      
      if (!project) {
        throw new Error('Project not found');
      }

      const renderJob = {
        projectId,
        userId: project.userId,
        settings: {
          quality: renderSettings.quality || 'high',
          format: renderSettings.format || 'mp4',
          resolution: renderSettings.resolution || project.settings.resolution,
          frameRate: renderSettings.frameRate || project.settings.frameRate
        },
        status: 'queued',
        progress: 0,
        startedAt: new Date(),
        estimatedDuration: this.estimateRenderTime(project),
        priority: renderSettings.priority || 'normal'
      };

      const renderRef = await addDoc(collection(db, 'renderJobs'), renderJob);
      
      // Update project status
      const projectRef = doc(db, 'videoProjects', projectId);
      await updateDoc(projectRef, {
        status: 'rendering',
        renderJobId: renderRef.id,
        updatedAt: new Date()
      });

      // Start render process (in real app, this would queue the job)
      this.processRenderJob(renderRef.id);

      analyticsService.logEvent('render_started', {
        category: EventCategory.CONTENT,
        project_id: projectId,
        render_job_id: renderRef.id,
        quality: renderJob.settings.quality,
        estimated_duration: renderJob.estimatedDuration
      });

      return { id: renderRef.id, ...renderJob };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'video_editor',
        action: 'start_render'
      });
      throw new Error('Failed to start render');
    }
  }

  async processRenderJob(renderJobId) {
    try {
      // Simulate render progress
      const updateProgress = async (progress) => {
        const renderRef = doc(db, 'renderJobs', renderJobId);
        await updateDoc(renderRef, {
          progress: progress,
          status: progress === 100 ? 'completed' : 'rendering'
        });
      };

      // Simulate render process
      for (let i = 0; i <= 100; i += 10) {
        setTimeout(() => updateProgress(i), i * 1000);
      }

      // Complete render
      setTimeout(async () => {
        const renderRef = doc(db, 'renderJobs', renderJobId);
        const finalVideoUrl = `https://storage.skatehubba.com/renders/${renderJobId}.mp4`;
        
        await updateDoc(renderRef, {
          status: 'completed',
          progress: 100,
          finalVideoUrl: finalVideoUrl,
          completedAt: new Date()
        });

        analyticsService.logEvent('render_completed', {
          category: EventCategory.CONTENT,
          render_job_id: renderJobId
        });
      }, 10000);

    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'video_editor',
        action: 'process_render_job'
      });
    }
  }

  estimateRenderTime(project) {
    // Estimate based on timeline duration, number of effects, etc.
    const baseTime = project.timeline.duration * 2; // 2x real-time base
    const effectsMultiplier = 1 + (project.effects.length * 0.1);
    const clipsMultiplier = 1 + (project.clips.length * 0.05);
    
    return Math.ceil(baseTime * effectsMultiplier * clipsMultiplier);
  }

  // Utility Functions
  async getProject(projectId) {
    try {
      const projectRef = doc(db, 'videoProjects', projectId);
      const projectSnap = await getDoc(projectRef);
      return projectSnap.exists() ? { id: projectSnap.id, ...projectSnap.data() } : null;
    } catch (error) {
      return null;
    }
  }

  async getMusicTrack(trackId) {
    try {
      const trackRef = doc(db, 'musicLibrary', trackId);
      const trackSnap = await getDoc(trackRef);
      return trackSnap.exists() ? { id: trackSnap.id, ...trackSnap.data() } : null;
    } catch (error) {
      return null;
    }
  }

  async getUserProjects(userId) {
    try {
      const q = query(
        collection(db, 'videoProjects'),
        where('userId', '==', userId),
        orderBy('updatedAt', 'desc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'video_editor',
        action: 'get_user_projects'
      });
      return [];
    }
  }
}

export default new VideoEditorService();
