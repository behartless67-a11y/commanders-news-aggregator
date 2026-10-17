import { SOCIAL_ACCOUNTS } from '../../config/social.js';
import { fetchLivePosts } from '../../src/lib/live-social.js';
import { keepSocialPost } from '../../src/lib/social-filter.js';
import { socialFeedPost } from '../../src/site/templates.js';

/**
 * The beat reporters' newest posts, live, for the Social Feed page during a
 * game. A reader on r/Commanders (Oct 16) uses that page instead of X on game
 * days and pointed out the lag: the page only changes when the site
 * rebuilds, every 15 minutes in a game window. Rebuilding more often means
 * more deploys, which cost; this costs nothing.
 *
 * GET returns { generatedAt, posts: [{ id, publishedAt, html }] }, newest
 * first, each post already rendered by the same socialFeedPost() the page
 * uses, so a live post looks exactly like a built one. site.js polls it once
 * a minute, only while a game window is open and only while the tab is
 * visible.
 *
 * Same accounts, same mirror (mastodon.social's public API, see
 * config/social.js) and same keepSocialPost() bar as the scheduled
 * collection; the fetching itself is src/lib/live-social.js, shared with
 * /api/ticker. Nicki Jhabvala isn't here: her posts come from a browser
 * session on Ben's machine, not the mirror, and stay on that schedule.
 *
 * The CDN holds each answer for a minute, so however many readers are
 * watching, this runs about once a minute: roughly 15 timeline requests to
 * mastodon.social, well inside its public rate limit.
 */
const MAX_POSTS = 40;

export default async () => {
  const live = await fetchLivePosts(SOCIAL_ACCOUNTS.filter((a) => !a.viaBrowser));
  const posts = live
    .filter(({ post, account }) => keepSocialPost(post, account.alwaysRelevant))
    .slice(0, MAX_POSTS)
    .map(({ post }) => post);

  return new Response(JSON.stringify({
    generatedAt: new Date().toISOString(),
    posts: posts.map((p) => ({ id: p.id, publishedAt: p.publishedAt, html: socialFeedPost(p, false) })),
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
      'Netlify-CDN-Cache-Control': 'public, max-age=60',
    },
  });
};
