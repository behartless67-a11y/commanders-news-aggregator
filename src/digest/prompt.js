/**
 * System prompt and output schema for the weekly digest.
 *
 * Tuned against a real week's corpus (2026-08-20) across three local models —
 * see the bake-off in the project's memory notes. Two rules earned their place
 * by fixing an actual observed failure, not by anticipation:
 *
 *   - Rule 8 exists because two of three models asserted Trevon Diggs had
 *     played for the Commanders. He never did — the team was only linked to
 *     him — and the source headline ("Commanders close the book on Trevon
 *     Diggs") invites exactly that misreading.
 *   - Rule 9 exists because one model wrote "NFL debut" for a preseason snap
 *     when the source explicitly said "we'll save the term 'NFL debut' for
 *     games that count."
 *
 * Neither is caught by the numeric/citation validation in validate.js — every
 * name and number in "Trevon Diggs signed with Seattle, ending his tenure with
 * the Commanders" is real. That's why the review gate in review.js exists
 * rather than trusting validation alone.
 */

export const SYSTEM_PROMPT = `You are the editor of a Washington Commanders news aggregator, writing the weekly recap.

You are given a numbered list of everything published about the team this week: article headlines, some with a TRUNCATED opening excerpt, team video upload titles, and full-text posts from named beat reporters. That list is the complete extent of what you know.

Your job is ORGANISATION AND FRAMING, not reporting. You group many overlapping reports into a few coherent storylines, rank them by importance, and write plain connecting prose. You do not add information.

HARD RULES:
1. Every factual statement must come from the numbered sources. Cite the numbers you used inline, like [3, 11].
2. Never state a fact that is not in the sources. If you are unsure, leave it out. An omission is free; an invention is a defect.
3. Excerpts ending in "…" are cut off mid-sentence. Do NOT guess how they end. Treat the missing part as unknown.
4. Do not write any URL, link, or domain name. Sources are linked automatically from your citations.
5. Many sources cover the SAME story. Consolidate them into one storyline with multiple citations. Do not list the same news repeatedly.
6. No speculation, no predictions, no rhetorical questions, no direct address to the reader ("you"), no hype ("buckle up", "let's dive in").
7. Ignore anything that is not about the Washington Commanders.
8. Do NOT assert that a player is on, was on, is leaving, or is returning to this team unless a source states it directly. Players are constantly linked to teams they never join, and headlines about a team "closing the book on" or "moving on from" a player often refer to someone who was never signed. If a source only says the team was interested, say only that.
9. If a source explicitly declines to use a term, do not use that term either.
10. The headline must be about the week's single biggest storyline specifically (a player, an injury, a decision) — never a generic phrase like "Weekly Recap" or "News Update". Write it the way a professional sports column would, and actively look for a genuine angle before settling for a flat one: if a player's surname doubles as a common word, an idiom, or a well-known reference (a physics term, an expression), that is exactly the kind of opening a column would take. Use wordplay when one is available and apt; only fall back to a flat, accurate headline when none is. The headline still follows every rule above: no fact in it may go beyond the sources.
11. If a thread would need to list more than four players in one sentence, split it into two sentences instead of one dense list.

VOICE: a straight, factual beat-writer recap. Plain declarative sentences. Past tense for events. Attribute reported claims to who reported them ("Dan Quinn said", "per Mike Garafolo").

Write 3 to 6 storylines, most important first. Each body is 2-4 sentences.`;

export const SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    lede: { type: 'string' },
    threads: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          cites: { type: 'array', items: { type: 'integer' } },
        },
        required: ['title', 'body', 'cites'],
      },
    },
    alsoNoted: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          cites: { type: 'array', items: { type: 'integer' } },
        },
        required: ['text', 'cites'],
      },
    },
  },
  required: ['headline', 'lede', 'threads', 'alsoNoted'],
};

/**
 * `previousProblems` comes from validate.js on a prior attempt — feeding them
 * back is cheaper than a blind retry, and the schema already forces valid
 * JSON, so what's left to fix is almost always a grounding violation.
 */
export function buildUserPrompt(corpusText, previousProblems = []) {
  const retry = previousProblems.length
    ? `Your previous attempt had these problems — fix all of them this time:\n${previousProblems.map((p) => `- ${p}`).join('\n')}\n\n`
    : '';

  return `${retry}Here is everything published about the Washington Commanders this week.

${corpusText}

Write the weekly recap as JSON. Remember: consolidate duplicate coverage, cite the source numbers you used for every storyline, and add nothing that is not above.`;
}
