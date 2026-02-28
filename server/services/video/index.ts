/**
 * Video Transcoding Service
 *
 * Provides server-side video validation via ffprobe, transcoding to
 * standardised format (H.264/AAC MP4), and thumbnail generation.
 *
 * Prerequisites: ffmpeg and ffprobe must be installed on the host.
 *
 * Architecture:
 *   1. probeVideo()            — extract real duration, codec, resolution via ffprobe
 *   2. transcodeVideo()        — normalise to H.264 MP4 with size limits
 *   3. generateThumbnail()     — extract first frame as JPEG thumbnail
 *   4. transcodeMultiQuality() — produce multiple resolution renditions
 *   5. processVideoJob()       — orchestrates probe → transcode → thumbnail → DB update
 *
 * @module services/video
 */

export type {
  ProbeResult,
  TranscodeOptions,
  TranscodeResult,
  QualityTier,
  QualityPreset,
  MultiQualityResult,
} from "./types";

export { QUALITY_PRESETS, DEFAULT_QUALITY } from "./quality";

export { probeVideo } from "./ffprobe";
export { transcodeVideo, generateThumbnail } from "./ffmpeg";
export { transcodeMultiQuality } from "./multiQuality";
export { processVideoJob } from "./transcoder";
export { checkFfmpegAvailable } from "./utils";
