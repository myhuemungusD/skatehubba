/**
 * TrickMint Page
 *
 * Upload your best tricks. Record, review, submit.
 * Shows user's clip library and the public feed.
 */

import { useState, useCallback } from "react";
import {
  Video,
  Upload,
  Trash2,
  Eye,
  Clock,
  Film,
  Play,
  Globe,
  Lock,
  AlertCircle,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/use-toast";
import { VideoRecorder } from "../components/game/VideoRecorder";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { cn } from "../lib/utils";
import { trickmintApi } from "../lib/api/trickmint";
import type { TrickClip } from "../lib/api/trickmint";
import { extractThumbnail } from "../lib/video/thumbnailExtractor";
import type { FirebaseStorage } from "firebase/storage";

// Lazy-loaded Firebase Storage
let storageInstance: FirebaseStorage | null = null;
async function getFirebaseStorage() {
  if (!storageInstance) {
    const { getStorage } = await import("firebase/storage");
    const { app } = await import("../lib/firebase");
    storageInstance = getStorage(app);
  }
  return storageInstance;
}

async function uploadBlob(path: string, blob: Blob): Promise<string> {
  const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
  const storage = await getFirebaseStorage();
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

type Tab = "upload" | "my-clips" | "feed";

const MAX_DURATION_S = 30;

export default function TrickMintPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<Tab>("upload");
  const [trickName, setTrickName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  // ============================================================================
  // Queries
  // ============================================================================

  const myClipsQuery = useQuery({
    queryKey: ["trickmint", "my-clips"],
    queryFn: () => trickmintApi.getMyClips(50, 0),
    enabled: activeTab === "my-clips",
  });

  const feedQuery = useQuery({
    queryKey: ["trickmint", "feed"],
    queryFn: () => trickmintApi.getFeed(50, 0),
    enabled: activeTab === "feed",
  });

  // ============================================================================
  // Mutations
  // ============================================================================

  const deleteMutation = useMutation({
    mutationFn: (clipId: number) => trickmintApi.deleteClip(clipId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trickmint"] });
      toast({ title: "Clip deleted." });
    },
    onError: () => {
      toast({ title: "Failed to delete clip", variant: "destructive" });
    },
  });

  // ============================================================================
  // Upload Handler
  // ============================================================================

  const handleRecordingComplete = useCallback(
    async (blob: Blob, durationMs: number) => {
      const name = trickName.trim();
      if (!name || !user?.uid) return;

      setIsUploading(true);
      setUploadProgress("Extracting thumbnail...");

      try {
        // Extract thumbnail from video
        const thumbnailBlob = await extractThumbnail(blob);

        // Upload video to Firebase Storage
        setUploadProgress("Uploading video...");
        const timestamp = Date.now();
        const videoPath = `trickmint/${user.uid}/${timestamp}.webm`;
        const videoUrl = await uploadBlob(videoPath, blob);

        // Upload thumbnail if extracted
        let thumbnailUrl: string | undefined;
        if (thumbnailBlob) {
          setUploadProgress("Uploading thumbnail...");
          const thumbPath = `trickmint/${user.uid}/${timestamp}_thumb.jpg`;
          thumbnailUrl = await uploadBlob(thumbPath, thumbnailBlob);
        }

        // Submit to server for validation and DB persistence
        setUploadProgress("Saving...");
        await trickmintApi.submitDirect({
          trickName: name,
          description: description.trim() || undefined,
          videoUrl,
          thumbnailUrl,
          videoDurationMs: durationMs,
          fileSizeBytes: blob.size,
          mimeType: blob.type || "video/webm",
          isPublic,
        });

        toast({ title: "Trick uploaded!" });
        setTrickName("");
        setDescription("");
        setUploadProgress("");

        // Refresh clips list
        queryClient.invalidateQueries({ queryKey: ["trickmint"] });
      } catch (err) {
        toast({
          title: "Upload failed",
          description: err instanceof Error ? err.message : "Try again.",
          variant: "destructive",
        });
      } finally {
        setIsUploading(false);
        setUploadProgress("");
      }
    },
    [trickName, description, isPublic, user?.uid, toast, queryClient]
  );

  if (!user) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Sign In Required</h2>
        <p className="text-sm text-neutral-400">You must be logged in to use TrickMint.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center">
          <Film className="w-6 h-6 text-orange-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">TrickMint</h1>
          <p className="text-sm text-neutral-400">Record. Upload. Own it.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-neutral-800/50 rounded-lg p-1">
        {(
          [
            { key: "upload" as Tab, label: "Upload", icon: Upload },
            { key: "my-clips" as Tab, label: "My Clips", icon: Film },
            { key: "feed" as Tab, label: "Feed", icon: Globe },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all",
              activeTab === key ? "bg-orange-500 text-white" : "text-neutral-400 hover:text-white"
            )}
            type="button"
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ====== UPLOAD TAB ====== */}
      {activeTab === "upload" && (
        <div className="space-y-6">
          <div className="p-6 rounded-lg bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border border-orange-500/30">
            <div className="flex items-center gap-2 mb-4">
              <Video className="w-5 h-5 text-orange-400" />
              <h2 className="text-lg font-semibold text-white">Record Your Trick</h2>
            </div>

            <div className="space-y-4">
              {/* Trick Name */}
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Trick Name *
                </label>
                <Input
                  placeholder="Kickflip, Tre Flip, Nollie Heel..."
                  value={trickName}
                  onChange={(e) => setTrickName(e.target.value)}
                  className="bg-neutral-900 border-neutral-700"
                  maxLength={200}
                  disabled={isUploading}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Description (optional)
                </label>
                <Input
                  placeholder="First try, flat ground, etc."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="bg-neutral-900 border-neutral-700"
                  maxLength={1000}
                  disabled={isUploading}
                />
              </div>

              {/* Visibility Toggle */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsPublic(!isPublic)}
                  disabled={isUploading}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                    isPublic
                      ? "bg-green-500/20 text-green-400 border border-green-500/30"
                      : "bg-neutral-800 text-neutral-400 border border-neutral-700"
                  )}
                  type="button"
                >
                  {isPublic ? (
                    <>
                      <Globe className="w-3 h-3" />
                      Public
                    </>
                  ) : (
                    <>
                      <Lock className="w-3 h-3" />
                      Private
                    </>
                  )}
                </button>
                <span className="text-xs text-neutral-500">
                  {isPublic ? "Visible in feed" : "Only you can see this"}
                </span>
              </div>

              {/* Video Recorder */}
              {trickName.trim() ? (
                <VideoRecorder
                  onRecordingComplete={handleRecordingComplete}
                  disabled={isUploading}
                />
              ) : (
                <div className="text-center py-8">
                  <Video className="w-10 h-10 text-neutral-600 mx-auto mb-2" />
                  <p className="text-xs text-neutral-500">
                    Enter a trick name to enable recording.
                  </p>
                </div>
              )}

              {/* Upload Progress */}
              {isUploading && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-neutral-800/50 border border-neutral-700">
                  <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-neutral-300 font-mono">
                    {uploadProgress || "Processing..."}
                  </span>
                </div>
              )}
            </div>

            {/* Limits Info */}
            <div className="mt-4 pt-4 border-t border-neutral-700/50">
              <p className="text-xs text-neutral-500">
                Max {MAX_DURATION_S}s | WebM/MP4 | 50MB limit | Thumbnail auto-generated
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ====== MY CLIPS TAB ====== */}
      {activeTab === "my-clips" && (
        <div className="space-y-4">
          {myClipsQuery.isLoading && (
            <div className="text-center py-12 text-neutral-400 text-sm">Loading clips...</div>
          )}

          {myClipsQuery.data && myClipsQuery.data.clips.length === 0 && (
            <div className="text-center py-12">
              <Film className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
              <p className="text-sm text-neutral-400">No clips yet.</p>
              <p className="text-xs text-neutral-500 mt-1">
                Record your first trick to get started.
              </p>
              <Button
                onClick={() => setActiveTab("upload")}
                className="mt-4 bg-orange-500 hover:bg-orange-600"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload a Trick
              </Button>
            </div>
          )}

          {myClipsQuery.data && myClipsQuery.data.clips.length > 0 && (
            <>
              <div className="text-xs text-neutral-500">
                {myClipsQuery.data.total} clip{myClipsQuery.data.total !== 1 ? "s" : ""}
              </div>
              <ClipGrid
                clips={myClipsQuery.data.clips}
                onVideoClick={setSelectedVideo}
                onDelete={(id) => deleteMutation.mutate(id)}
                showDelete
              />
            </>
          )}
        </div>
      )}

      {/* ====== FEED TAB ====== */}
      {activeTab === "feed" && (
        <div className="space-y-4">
          {feedQuery.isLoading && (
            <div className="text-center py-12 text-neutral-400 text-sm">Loading feed...</div>
          )}

          {feedQuery.data && feedQuery.data.clips.length === 0 && (
            <div className="text-center py-12">
              <Globe className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
              <p className="text-sm text-neutral-400">No public clips yet.</p>
              <p className="text-xs text-neutral-500 mt-1">Be the first to upload.</p>
            </div>
          )}

          {feedQuery.data && feedQuery.data.clips.length > 0 && (
            <ClipGrid clips={feedQuery.data.clips} onVideoClick={setSelectedVideo} />
          )}
        </div>
      )}

      {/* ====== VIDEO PLAYER MODAL ====== */}
      {selectedVideo && (
        <div
          className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-0 sm:p-4"
          onClick={() => setSelectedVideo(null)}
        >
          <div
            className="bg-neutral-900 rounded-none sm:rounded-lg p-2 sm:p-4 w-full sm:max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-medium text-neutral-400">Video</h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedVideo(null)}>
                Close
              </Button>
            </div>
            <div className="aspect-[9/16] bg-black rounded-none sm:rounded-lg overflow-hidden">
              <video
                src={selectedVideo}
                className="w-full h-full object-contain"
                controls
                autoPlay
                playsInline
                controlsList="nodownload noplaybackrate"
                disablePictureInPicture
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Clip Grid Component
// ============================================================================

interface ClipGridProps {
  clips: TrickClip[];
  onVideoClick: (url: string) => void;
  onDelete?: (id: number) => void;
  showDelete?: boolean;
}

function ClipGrid({ clips, onVideoClick, onDelete, showDelete }: ClipGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {clips.map((clip) => (
        <div
          key={clip.id}
          className="rounded-lg border border-neutral-700 bg-neutral-800/50 overflow-hidden group"
        >
          {/* Thumbnail / Play Button */}
          <button
            onClick={() => onVideoClick(clip.videoUrl)}
            className="relative w-full aspect-[9/16] bg-black flex items-center justify-center"
            type="button"
          >
            {clip.thumbnailUrl ? (
              <img
                src={clip.thumbnailUrl}
                alt={clip.trickName}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <Video className="w-8 h-8 text-neutral-600" />
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
              <Play className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            {/* Duration badge */}
            {clip.videoDurationMs && (
              <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-xs text-white font-mono">
                {Math.ceil(clip.videoDurationMs / 1000)}s
              </div>
            )}

            {/* Status badge */}
            {clip.status !== "ready" && (
              <div
                className={cn(
                  "absolute top-1 left-1 px-1.5 py-0.5 rounded text-xs font-medium",
                  clip.status === "processing" && "bg-yellow-500/80 text-black",
                  clip.status === "failed" && "bg-red-500/80 text-white",
                  clip.status === "flagged" && "bg-red-500/80 text-white"
                )}
              >
                {clip.status}
              </div>
            )}
          </button>

          {/* Clip Info */}
          <div className="p-2.5 space-y-1">
            <div className="text-sm font-medium text-white truncate">{clip.trickName}</div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <span className="flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  {clip.views}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDistanceToNow(new Date(clip.createdAt), { addSuffix: true })}
                </span>
              </div>
              {showDelete && onDelete && (
                <button
                  onClick={() => onDelete(clip.id)}
                  className="text-neutral-500 hover:text-red-400 transition-colors p-1"
                  type="button"
                  title="Delete clip"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {clip.userName && (
              <div className="text-xs text-neutral-500 truncate">by {clip.userName}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
