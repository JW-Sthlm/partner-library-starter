/**
 * Tag schema for link entries in the library.
 *
 * This is the single source of truth for what metadata every link must carry.
 * Customize these values to match your library's taxonomy. The values below
 * are illustrative — replace them with what makes sense for your audience.
 *
 * Used by:
 * - scripts/validate-metadata.ts (CI gate on PRs)
 * - scripts/generate-browse-data.ts (build-time index for the Browse page)
 * - scripts/research-agent.ts (LLM relevance prompts can reference these values)
 * - .github/agents/smart-review.agent.md (the review agent reads this schema)
 */

export const tagSchema = {
  track: {
    label: 'Track',
    required: true,
    multiple: true,
    values: ['track-a', 'track-b', 'cross-cutting'] as const,
    color: '#3b82f6', // blue
  },
  contentType: {
    label: 'Content Type',
    required: true,
    multiple: false,
    values: [
      'documentation',
      'blog',
      'repo',
      'webinar',
      'course',
      'recording',
      'sample',
      'architecture',
      'tool',
      'whitepaper',
    ] as const,
    color: '#8b5cf6', // purple
  },
  audience: {
    label: 'Audience',
    required: true,
    multiple: true,
    values: [
      'architect',
      'developer',
      'operator',
      'lead',
    ] as const,
    color: '#10b981', // green
  },
  shareability: {
    label: 'Shareability',
    required: true,
    multiple: false,
    values: ['public', 'community-only', 'restricted'] as const,
    color: '#ef4444', // red
  },
  maturity: {
    label: 'Maturity',
    required: true,
    multiple: false,
    values: ['foundational', 'recommended', 'advanced', 'experimental'] as const,
    color: '#f59e0b', // amber
  },
  product: {
    label: 'Product / Capability',
    required: false,
    multiple: true,
    freeText: true,
    color: '#6366f1', // indigo
  },
  pattern: {
    label: 'Pattern',
    required: false,
    multiple: true,
    freeText: true,
    color: '#ec4899', // pink
  },
  owner: {
    label: 'Owner / Curator',
    required: true,
    multiple: false,
    freeText: true,
    color: '#6b7280', // gray
  },
  lastReviewed: {
    label: 'Last Reviewed',
    required: true,
    multiple: false,
    freeText: true, // ISO date string
    color: '#6b7280', // gray
  },
} as const;

export type TagKey = keyof typeof tagSchema;

/** Required tag keys that must appear on every link entry */
export const requiredTags: TagKey[] = Object.entries(tagSchema)
  .filter(([, v]) => v.required)
  .map(([k]) => k as TagKey);

/** Tag keys that accept only predefined values (not free-text) */
export const enumTags: TagKey[] = Object.entries(tagSchema)
  .filter(([, v]) => !('freeText' in v) || !v.freeText)
  .map(([k]) => k as TagKey);
