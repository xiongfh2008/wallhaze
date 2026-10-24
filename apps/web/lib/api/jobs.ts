/**
 * Async generation job client (R05/R07).
 *
 * The Studio no longer waits on a synchronous paid call: it creates a job
 * (credits reserved server-side), then polls the owner-scoped job status
 * until the worker settles it. Errors stay typed — the flow maps them to
 * honest UI states.
 */

import type { GenerationJobRequest } from "@wallhaze/contracts";
import { apiRequest, type ApiResult } from "./client";

export interface GenerationJobCreated {
  jobId: string;
  status: string;
  priceCredits: number;
  mediaType?: "image" | "video";
  generationMode?: string;
  durationSeconds?: number | null;
}

export interface GenerationJobStatus {
  jobId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  errorCode: string | null;
  priceCredits: number;
  mediaType?: "image" | "video";
  imageUrl: string | null;
  videoUrl?: string | null;
  videoDownloadUrl?: string | null;
  posterUrl?: string | null;
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  mime?: string | null;
  /** Development mock output: placeholder image/video, no AI call, no charge. */
  mock: boolean;
  createdAt: string;
}

/** Creates one paid generation job (server reserves the credits). */
export async function createGenerationJob(
  input: GenerationJobRequest,
  idempotencyKey: string,
  options: { signal?: AbortSignal } = {}
): Promise<ApiResult<GenerationJobCreated>> {
  return apiRequest<GenerationJobCreated>("/v1/generations/jobs", {
    method: "POST",
    body: input,
    headers: { "Idempotency-Key": idempotencyKey },
    signal: options.signal,
  });
}

/** Reads the current state of one owned job. */
export async function getGenerationJob(
  jobId: string,
  options: { signal?: AbortSignal } = {}
): Promise<ApiResult<GenerationJobStatus>> {
  return apiRequest<GenerationJobStatus>(
    `/v1/generations/jobs/${encodeURIComponent(jobId)}`,
    { signal: options.signal }
  );
}
