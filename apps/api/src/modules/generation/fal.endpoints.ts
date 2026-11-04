/**
 * Official fal.ai endpoints for flux-2 klein 4b.
 *
 * Verified against the official model pages:
 * - text-to-image: fal-ai/flux-2/klein/4b
 * - image edit:    fal-ai/flux-2/klein/4b/base/edit (NOT /edit)
 *
 * The edit path previously omitted `/base`, so real reference-image jobs
 * would hit a non-existent endpoint while the mock path still passed.
 */
export const FAL_ENDPOINT = "https://fal.run/fal-ai/flux-2/klein/4b";
export const FAL_EDIT_ENDPOINT = `${FAL_ENDPOINT}/base/edit`;

/**
 * Output-screening model (AIGC stage 2, default backend): single-label NSFW
 * probability per image. Official schema: in {image_url}, out
 * {nsfw_probability} — see fal-nsfw-moderation.ts. Billed per image.
 */
export const FAL_NSFW_ENDPOINT = "https://fal.run/fal-ai/imageutils/nsfw";
