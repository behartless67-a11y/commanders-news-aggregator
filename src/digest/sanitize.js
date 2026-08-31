/**
 * Mechanical cleanup applied to every generated digest before validation,
 * regardless of what the prompt asked for.
 *
 * Em dashes are the single biggest tell that a piece of writing is
 * AI-generated — models reach for them constantly even when explicitly told
 * not to, because the instinct is trained in too deep for a system prompt
 * rule to reliably override. Rather than retry and hope, this guarantees it
 * mechanically: an em dash cannot reach the page no matter how many attempts
 * it takes the model to stop producing one. The prompt rule still exists
 * (see prompt.js) because it improves the source text — a comma substituted
 * for a dash the model chose not to use in the first place always reads
 * better than one substituted after the fact.
 */
export function stripEmDash(text) {
  if (!text) return text;
  let out = String(text).replace(/\s*—\s*/g, ', ');
  out = out
    .replace(/,\s*,/g, ',')
    .replace(/,\s*\./g, '.')
    .replace(/\s+,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim();
  out = out.replace(/^,\s*/, '').replace(/,\s*$/, '.');
  return out;
}

export function sanitizeDigest(digest) {
  return {
    ...digest,
    headline: stripEmDash(digest.headline),
    lede: stripEmDash(digest.lede),
    threads: (digest.threads || []).map((t) => ({
      ...t,
      title: stripEmDash(t.title),
      body: stripEmDash(t.body),
    })),
    alsoNoted: (digest.alsoNoted || []).map((a) => ({ ...a, text: stripEmDash(a.text) })),
  };
}

/** Same mechanical cleanup, for the paragraphs[] shape (Monday recap, originals) instead of threads[]. */
export function sanitizeParagraphs(post) {
  return {
    ...post,
    title: stripEmDash(post.title),
    paragraphs: (post.paragraphs || []).map((p) => stripEmDash(p)),
  };
}
