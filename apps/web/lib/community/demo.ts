import demoWorksJson from "@/data/community/demo-works.json";
import {
  normalizeCommunityWork,
  type CommunityWork,
} from "@/lib/community";

/**
 * Demo seed visibility (server-side only).
 *
 * Demo works exist to develop and preview the community UI before any real
 * user submission exists. They are NEVER real submissions:
 *
 * - The switch defaults to off and is only honoured OUTSIDE production, so a
 *   production build can never render demo data even if the flag leaks.
 * - Demo works live in their own data file, never in works.json.
 * - Sitemap/SEO/detail static params use real works only; demo pages are
 *   generated exclusively in demo-mode builds/dev server.
 */
export function isCommunityDemoMode(): boolean {
  return (
    process.env.COMMUNITY_DEMO_MODE === "1" &&
    process.env.NODE_ENV !== "production"
  );
}

const DEMO_WORKS = (
  demoWorksJson.works as Parameters<typeof normalizeCommunityWork>[0][]
).map(normalizeCommunityWork);

/** Demo seed works. Never merged into the real submission list. */
export function getDemoWorks(): readonly CommunityWork[] {
  return DEMO_WORKS;
}

export function getDemoWorkBySlug(slug: string): CommunityWork | undefined {
  return DEMO_WORKS.find((work) => work.slug === slug);
}
