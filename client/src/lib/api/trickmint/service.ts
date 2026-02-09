/**
 * TrickMint API Service
 *
 * Client-side API calls for the video upload pipeline.
 */

import { apiRequest } from "../client";
import type {
  UploadUrlResponse,
  ConfirmUploadRequest,
  SubmitDirectRequest,
  ClipResponse,
  ClipListResponse,
  TrickClip,
} from "./types";

export const trickmintApi = {
  /**
   * Request signed upload URLs for direct-to-storage upload.
   */
  async requestUploadUrl(
    fileExtension: "webm" | "mp4" | "mov" = "webm"
  ): Promise<UploadUrlResponse> {
    return apiRequest<UploadUrlResponse>({
      method: "POST",
      path: "/api/trickmint/request-upload",
      body: { fileExtension },
    });
  },

  /**
   * Confirm a signed URL upload after the file has been uploaded to storage.
   */
  async confirmUpload(data: ConfirmUploadRequest): Promise<ClipResponse> {
    return apiRequest<ClipResponse>({
      method: "POST",
      path: "/api/trickmint/confirm-upload",
      body: data,
    });
  },

  /**
   * Submit a direct Firebase SDK upload (client uploads to Firebase, sends URL to server).
   */
  async submitDirect(data: SubmitDirectRequest): Promise<ClipResponse> {
    return apiRequest<ClipResponse>({
      method: "POST",
      path: "/api/trickmint/submit",
      body: data,
    });
  },

  /**
   * Get the authenticated user's clips.
   */
  async getMyClips(limit = 20, offset = 0): Promise<ClipListResponse> {
    return apiRequest<ClipListResponse>({
      method: "GET",
      path: `/api/trickmint/my-clips?limit=${limit}&offset=${offset}`,
    });
  },

  /**
   * Get the public feed of trick clips.
   */
  async getFeed(limit = 20, offset = 0): Promise<ClipListResponse> {
    return apiRequest<ClipListResponse>({
      method: "GET",
      path: `/api/trickmint/feed?limit=${limit}&offset=${offset}`,
    });
  },

  /**
   * Get a single clip by ID.
   */
  async getClip(id: number): Promise<{ clip: TrickClip }> {
    return apiRequest<{ clip: TrickClip }>({
      method: "GET",
      path: `/api/trickmint/${id}`,
    });
  },

  /**
   * Delete own clip.
   */
  async deleteClip(id: number): Promise<{ message: string }> {
    return apiRequest<{ message: string }>({
      method: "DELETE",
      path: `/api/trickmint/${id}`,
    });
  },
};
