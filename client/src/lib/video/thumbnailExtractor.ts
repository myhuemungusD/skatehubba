/**
 * Client-side thumbnail extraction from video blobs.
 *
 * Extracts the first frame of a recorded video and returns it
 * as a JPEG blob for upload alongside the video.
 */

const THUMBNAIL_WIDTH = 360;
const THUMBNAIL_QUALITY = 0.8;

/**
 * Extract a thumbnail from a video Blob by capturing the first frame.
 * Returns a JPEG blob.
 */
export async function extractThumbnail(
  videoBlob: Blob,
  seekTimeSeconds: number = 0.5
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(videoBlob);

    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 10_000);

    video.onloadedmetadata = () => {
      if (!isFinite(video.duration) || video.duration <= 0) {
        clearTimeout(timeoutId);
        cleanup();
        resolve(null);
        return;
      }
      video.currentTime = Math.min(seekTimeSeconds, video.duration * 0.5);
    };

    video.onseeked = () => {
      clearTimeout(timeoutId);

      try {
        const canvas = document.createElement("canvas");
        const w = video.videoWidth || THUMBNAIL_WIDTH;
        const h = video.videoHeight || THUMBNAIL_WIDTH;
        const aspectRatio = h / w;
        canvas.width = THUMBNAIL_WIDTH;
        canvas.height = Math.round(THUMBNAIL_WIDTH * aspectRatio) || THUMBNAIL_WIDTH;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          resolve(null);
          return;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => {
            cleanup();
            // toBlob can return null on failure (e.g. out of memory)
            resolve(blob);
          },
          "image/jpeg",
          THUMBNAIL_QUALITY
        );
      } catch {
        cleanup();
        resolve(null);
      }
    };

    video.onerror = () => {
      clearTimeout(timeoutId);
      cleanup();
      resolve(null);
    };

    video.src = url;
  });
}
