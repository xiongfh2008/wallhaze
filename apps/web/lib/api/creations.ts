/** Credentialed backend adapter. Missing API configuration returns unavailable. */

import { apiRequest, resolveApiBaseUrl, type ApiResult } from "./client";

/** Cloud creation record (backend contract since R05). */
export interface CloudCreation {
  id: string;
  createdAt: string;
  prompt: string;
  motionPrompt?: string | null;
  styleId: string | null;
  device: string;
  ratio: string | null;
  width: number | null;
  height: number | null;
  mediaType: "image" | "video";
  durationSeconds: number | null;
  /** Backend-served signed image URL, or null for videos. */
  imageUrl: string | null;
  /** Backend-served signed MP4 URL, or null for images. */
  videoUrl?: string | null;
  videoDownloadUrl?: string | null;
  posterUrl?: string | null;
  /** Job state; only "succeeded" records have media bytes. */
  status: "queued" | "running" | "succeeded" | "failed";
  /** True for a development mock output (no AI call, no Credits charged). */
  mock: boolean;
  /** Server-computed lifecycle for cloud media. */
  completedAt?: string | null;
  expiresAt?: string | null;
  retentionStatus?:
    | "legacy"
    | "active"
    | "expired"
    | "deleting"
    | "deleted"
    | "delete_failed"
    | null;
  /** True once the 30-day window ended or the cloud object was removed. */
  expired?: boolean;
}

export interface CloudCreationPage {
  items: CloudCreation[];
  nextCursor: string | null;
}

/**
 * Service gate for cloud creations. Flipping this is part of the future
 * Creations API integration — never from UI code.
 */
export const CREATION_SERVICES_CONFIGURED = Boolean(resolveApiBaseUrl());


export interface CreationsAdapter {
  listCreations(cursor?: string, mediaType?: "image" | "video"): Promise<ApiResult<CloudCreationPage>>;
  getCreation(id: string): Promise<ApiResult<CloudCreation>>;
  /** Reserved: deletes the CLOUD record only (after confirmation in UI). */
  deleteCreation(id: string): Promise<ApiResult<null>>;
  /** Reserved: resolves to a short-lived download URL from the backend. */
  downloadCreation(id: string): Promise<ApiResult<{ url: string; mediaType?: "image" | "video" }>>;
}

class GatedCreationsAdapter implements CreationsAdapter {
  async listCreations(
    _cursor?: string,
    mediaType?: "image" | "video"
  ): Promise<ApiResult<CloudCreationPage>> {
    const params = new URLSearchParams();
    if (_cursor) params.set("cursor", _cursor);
    if (mediaType) params.set("mediaType", mediaType);
    const query = params.toString();
    return apiRequest(`/v1/creations${query ? `?${query}` : ""}`);
  }

  async getCreation(_id: string): Promise<ApiResult<CloudCreation>> {
    return apiRequest(`/v1/creations/${encodeURIComponent(_id)}`);
  }

  async deleteCreation(_id: string): Promise<ApiResult<null>> {
    return apiRequest(`/v1/creations/${encodeURIComponent(_id)}/delete`, { method: "POST", body: {} });
  }

  async downloadCreation(
    _id: string
  ): Promise<ApiResult<{ url: string; mediaType?: "image" | "video" }>> {
    return apiRequest(`/v1/creations/${encodeURIComponent(_id)}/download`);
  }
}

/** App-wide singleton. Tests may construct their own GatedCreationsAdapter. */
export const creationsAdapter: CreationsAdapter = new GatedCreationsAdapter();
