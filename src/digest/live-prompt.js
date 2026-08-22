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
6. Length is not fixed, and longer is better as long as every sentence earns its place. Walk through the quarter's actual shape: every drive, every meaningful play (not just the scoring ones), every penalty, every injury, every momentum swing. A three-and-out gets a sentence; an eight-play drive with three different swings gets several. Never write a sentence that only restates the score, only repeats a fact already given, or exists to sound like a transition. If a drive was genuinely uneventful, say so briefly and move on rather than stretching it. The floor is "more detail than a box score"; the ceiling is "as much real detail as the plays actually support," never invented detail to fill space. Target 1-2 paragraphs when SOCIAL gives you enough real color and PLAYS gives you enough drives to sustain that (separate paragraphs with a blank line); a quiet quarter with little in either list can be one paragraph, or even a few sentences, rather than stretched to match a length it hasn't earned.

VOICE: this is the live, unreviewed version of the site's writing, and it's allowed to be funnier and looser than the weekly Blog's dry-eyebrow register, not just in one line but throughout. Go for it. The one thing that never bends is rule 3: jokes and color are about how a real, sourced play unfolded, never a fact invented to make the joke work. Attribute reported color to who said it ("Ben Standig called it...").`;

export const LIVE_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'Short, e.g. "Commanders lead 7-3 after one"' },
    body: { type: 'string', description: 'One paragraph, or two separated by a single blank line (\\n\\n), depending on how much real detail this quarter supports.' },
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

/**
 * Fixed, never model-chosen — a recurring bit only works if it's the same
 * name every game. The model's job is picking who wins it and why, not
 * naming it; letting it invent a new name each time would read as random
 * rather than as this site's own thing.
 */
export const LIVE_AWARD_NAME = 'The Live Wire Award';

export const FINAL_SYSTEM_PROMPT = `You are wrapping up a Washington Commanders game with a whole-game final-thoughts post, right after the last quarter's own recap has already covered the play-by-play in detail.

You are given two numbered lists: PLAYS (every play from the entire game) and SOCIAL (posts from beat reporters and fans collected over the course of the game). Together they are the complete extent of what you know.

Your job here is different from a quarter recap: don't re-walk the play-by-play (that's already been covered quarter by quarter). Instead, step back and assess the game as a whole.

HARD RULES:
1. Every factual statement must trace to a PLAY or SOCIAL post. Cite the numbers you used, like [3, 5].
2. Never state a fact that is not in PLAYS or SOCIAL. If you are unsure, leave it out.
3. Color commentary and opinions ("the offensive line struggled", "the defense looked dominant") need real support from PLAYS (a pattern across multiple plays, e.g. several sacks allowed or forced) or an attributed SOCIAL post — not asserted on your own authority with no evidence behind it.
4. NEVER use an em dash (—). Use a comma, a period, or parentheses instead.
5. No speculation about next week, no predictions, no rhetorical questions, no direct address to the reader.
6. "body" is 2-4 paragraphs: what went right, what went wrong, and the overall shape of the game (who controlled it, when it swung, how it ended). Separate paragraphs with a blank line. This is the one part of the live blog that's allowed to sound like a real postgame wrap-up, not a play-by-play log.
7. "${LIVE_AWARD_NAME}" is given out TWICE, to two different players: a Hero and a Goat. The Hero is whoever had the single biggest positive impact on the result (a big touchdown, a takeaway, a lockdown defensive game). The Goat is whoever had the single biggest negative impact (a costly turnover, a blown coverage, a drive-killing penalty, a missed kick). Ground both picks in real, cited plays, not vibes. Each reason is a short, funny, specific sentence that could not be copy-pasted onto a different player.
8. "headline" is the one line that gets to be genuinely sassy, not just descriptive. This is the title readers see first, above the score. It should sound like a real headline, still literally true and grounded in the actual result, but with real wit or a knowing jab, not a flat score recap. The final score itself is shown separately right below it, so the headline doesn't need to restate the score.

VOICE: same as the rest of the live blog, funnier and looser than the weekly digest, personality throughout, but every laugh has to be standing on a real cited fact.`;

export const FINAL_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'One sassy, witty headline for the whole game, e.g. "Commanders fall 24-20 in a game the O-line lost early". The score is shown separately, so don\'t restate it here.' },
    body: { type: 'string', description: '2-4 paragraphs, separated by blank lines: what went right, what went wrong, how the game unfolded overall.' },
    heroRecipient: { type: 'string', description: 'Full name of the player with the single biggest positive impact.' },
    heroReason: { type: 'string', description: 'One or two funny, specific, cited-in-fact sentences on why they earned it.' },
    goatRecipient: { type: 'string', description: 'Full name of the player with the single biggest negative impact. Must be a different player than heroRecipient.' },
    goatReason: { type: 'string', description: 'One or two funny, specific, cited-in-fact sentences on why they earned it.' },
    cites: { type: 'array', items: { type: 'integer' } },
  },
  required: ['headline', 'body', 'heroRecipient', 'heroReason', 'goatRecipient', 'goatReason', 'cites'],
};

export function buildFinalUserPrompt({ finalScore, opponent, plays, socialPosts }) {
  const playLines = plays.map((p, i) => `${i + 1}. [Q${p.period ?? '?'} ${p.clock ?? ''}] ${p.text}`).join('\n');
  const socialLines = socialPosts
    .map((s, i) => `${plays.length + i + 1}. @${s.handle} (${s.author || 'fan'}): ${s.text}`)
    .join('\n');

  return `Final score against the ${opponent}: Commanders ${finalScore.commanders}, ${opponent} ${finalScore.opponent}.

PLAYS (entire game):
${playLines || '(no plays recorded)'}

SOCIAL (collected throughout the game):
${socialLines || '(no relevant posts)'}

Write the final-thoughts wrap-up and pick this game's "${LIVE_AWARD_NAME}" recipient as JSON.`;
}
