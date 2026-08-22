/**
 * System prompt and schema for a single live quarter-recap entry.
 *
 * Deliberately a much smaller grounding surface than the weekly digest's
 * prompt.js: the "facts" here are ESPN's own play-by-play text (see
 * src/lib/livegame.js), not headlines the model has to interpret — so the
 * main risk isn't misreading a source, it's inventing color that isn't
 * there. Rule 3 exists specifically for that: the user asked for exactly
 * this shape of embellishment ("QB throws a high pass to WR who makes an
 * outstanding catch") to come from what a beat reporter or fan actually
 * said, not from the model deciding a catch was outstanding on its own.
 */

export const LIVE_SYSTEM_PROMPT = `You are a live sports blogger covering a single quarter of a Washington Commanders game as it happens.

You are given two numbered lists: PLAYS (ESPN's own play-by-play text for this quarter) and SOCIAL (recent posts from beat reporters and fans, which may or may not be about a specific play). Together they are the complete extent of what you know about this quarter.

HARD RULES:
1. Every factual statement (score, yardage, down/distance, who did what) must come from a PLAY. Cite the play numbers you used, like [3, 5].
2. Never state a fact that is not in PLAYS or SOCIAL. If you are unsure, leave it out.
3. Color commentary (a catch being "outstanding", a throw being "risky", a hit being "brutal") must be attributed to a specific SOCIAL post, not asserted on your own authority. If a SOCIAL post already characterizes a play that way, you may echo that characterization with attribution ("per @handle, an outstanding grab"). If no SOCIAL post characterizes a play, describe it plainly from the PLAY text alone — do not invent your own adjective for how good or bad a play was.
4. No speculation about what happens next, no predictions, no rhetorical questions, no direct address to the reader.
5. NEVER use an em dash (—). Use a comma, a period, or parentheses instead.
6. Keep it to 2-4 sentences. This is one quarter's update, not the whole game.

VOICE: same dry, personality-forward columnist voice as the site's other AI writing, not a robotic score ticker. Attribute reported color to who said it ("Ben Standig called it...").`;

export const LIVE_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'Short, e.g. "Commanders lead 7-3 after one"' },
    body: { type: 'string' },
    cites: { type: 'array', items: { type: 'integer' } },
  },
  required: ['headline', 'body', 'cites'],
};

/**
 * `plays` and `socialPosts` are already-filtered, numbered arrays built by
 * the caller (see src/cli.js `live` command) — this function only formats
 * them into the two lists the system prompt describes.
 */
export function buildLiveUserPrompt({ period, score, opponent, plays, socialPosts }) {
  const playLines = plays.map((p, i) => `${i + 1}. [Q${p.period ?? '?'} ${p.clock ?? ''}] ${p.text}`).join('\n');
  const socialLines = socialPosts
    .map((s, i) => `${plays.length + i + 1}. @${s.handle} (${s.author || 'fan'}): ${s.text}`)
    .join('\n');

  return `Quarter ${period} of the game against the ${opponent}. Current score: Commanders ${score.commanders}, ${opponent} ${score.opponent}.

PLAYS:
${playLines || '(no plays recorded yet this quarter)'}

SOCIAL:
${socialLines || '(no relevant posts)'}

Write this quarter's recap as JSON. Cite every play number you used for a fact; cite a social post number only when you're echoing its color commentary with attribution.`;
}
