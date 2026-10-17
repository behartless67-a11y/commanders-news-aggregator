import { relevanceSignal } from './relevance.js';
import { daysAgo } from './dates.js';

/**
 * Which social posts are worth showing. Lives here rather than in
 * src/collectors/index.js so the live game-day function
 * (netlify/functions/social-live.js) applies exactly the same bar as the
 * scheduled collection without importing every collector to get it.
 */

/**
 * Social posts age out much faster than articles. A three-day-old headline is
 * still worth reading; a three-day-old "he's practicing today" tweet is not.
 */
const MAX_SOCIAL_AGE_DAYS = Number(process.env.MAX_SOCIAL_AGE_DAYS || 3);

/**
 * Posts shorter than this are almost always a caption on a photo or video
 * ("Early scene:"), which carries nothing once the media is stripped away.
 */
const MIN_SOCIAL_TEXT_CHARS = Number(process.env.MIN_SOCIAL_TEXT_CHARS || 25);

/** Same freshness/length bar for every social source, however it was fetched. */
export function keepSocialPost(post, alwaysRelevant) {
  if (post.text.length < MIN_SOCIAL_TEXT_CHARS) return false;
  if (post.publishedAt && daysAgo(post.publishedAt) > MAX_SOCIAL_AGE_DAYS) return false;
  if (alwaysRelevant) return true;
  return relevanceSignal(`${post.text} ${post.handle}`) !== null;
}
