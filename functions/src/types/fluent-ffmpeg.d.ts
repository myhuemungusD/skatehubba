/**
 * Fallback type declaration for fluent-ffmpeg
 * Used when @types/fluent-ffmpeg is incomplete or missing
 */
declare module "fluent-ffmpeg" {
  interface FfprobeFormat {
    duration?: number;
    size?: number;
    bit_rate?: number;
    filename?: string;
    format_name?: string;
    format_long_name?: string;
  }

  interface FfprobeStream {
    index: number;
    codec_name?: string;
    codec_type?: "video" | "audio" | "subtitle" | "data";
    width?: number;
    height?: number;
    duration?: number;
    bit_rate?: number;
  }

  interface FfprobeData {
    format: FfprobeFormat;
    streams: FfprobeStream[];
  }

  type FfprobeCallback = (err: Error | null, data: FfprobeData) => void;

  interface FfmpegCommand {
    ffprobe(callback: FfprobeCallback): void;
    ffprobe(file: string, callback: FfprobeCallback): void;
  }

  interface Ffmpeg {
    (input?: string): FfmpegCommand;
    ffprobe(file: string, callback: FfprobeCallback): void;
    setFfprobePath(path: string): void;
    setFfmpegPath(path: string): void;
  }

  const ffmpeg: Ffmpeg;
  export = ffmpeg;
}
