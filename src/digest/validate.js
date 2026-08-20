/**
 * Anti-hallucination checks run on every generated digest before it's written
 * to disk. Grounded in what actually broke during the Phase 0 bake-off:
 * fabrications in sports writing are overwhelmingly numeric (yards, contract
 * values, jersey numbers) or a name attached to a claim the sources don't
 * support — both are checkable in code. Relationship errors ("player X used to
 * play here" when he never did) are NOT reliably checkable this way, since
 * every name and number in the sentence can be real; that failure mode is why
 * review.js exists as a required human gate rather than a formality.
 */

const sourceText = (e) => `${e.title || ''} ${e.excerpt || ''} ${e.text || ''}`;

// Models write inline "[3, 11, 12]" citation markers in the prose — desirable,
// since it ties each sentence to its sources rather than the whole paragraph —
// but they're citation keys, not facts, and must come out before any factual
// check or they get read as numerals.
const stripCites = (s) => String(s).replace(/\[[\d,\s]+\]/g, ' ');

const numbersIn = (s) => new Set((String(s).match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(/[.,]$/, '')));

/**
 * Capitalised words that aren't sentence-initial — mostly names and teams. Must
 * allow an internal capital (McNichols, DeAndre) or a real surname like it is
 * invisible to the check on both sides — the model garbling "McNichols" into
 * "McNicholog" was caught by eye in review, not by this function, because the
 * first version of this regex couldn't match either spelling. The lookahead
 * for a lowercase letter excludes bare acronyms (NFL, MCL, IR), which would
 * otherwise spam warnings on nearly every thread.
 *
 * A trailing possessive is stripped before the result is used as a key, not
 * kept as part of it — a source saying "Biadasz's" and generated prose saying
 * "Biadasz suffered..." are the same name, and comparing the raw tokens would
 * flag that as an unsourced name on every possessive in the corpus.
 */
function properNounsIn(s) {
  const out = new Set();
  for (const sentence of String(s).split(/(?<=[.!?])\s+/)) {
    const words = sentence.split(/\s+/);
    words.forEach((w, i) => {
      const clean = w.replace(/^[^\p{L}]+|[^\p{L}’]+$/gu, '');
      if (i > 0 && /^[A-Z](?=.*[a-z])[A-Za-z’']{2,}$/.test(clean)) {
        out.add(clean.replace(/['’]s$/i, ''));
      }
    });
  }
  return out;
}

export function validate(corpus, digest) {
  const problems = [];
  const warnings = [];

  if (!digest || !Array.isArray(digest.threads)) {
    return { problems: ['response has no threads array'], warnings };
  }

  // `prose` is what gets the name check — a Title Case heading ("Defensive
  // Line and Linebacker Injuries") is capitalised by convention, not reference.
  const blocks = [
    ...digest.threads.map((t, i) => ({
      where: `thread ${i + 1}`,
      text: `${t.title || ''} ${t.body || ''}`,
      prose: t.body || '',
      cites: t.cites || [],
    })),
    ...(digest.alsoNoted || []).map((a, i) => ({
      where: `alsoNoted ${i + 1}`,
      text: a.text || '',
      prose: a.text || '',
      cites: a.cites || [],
    })),
  ];

  // Union of the whole corpus, for checking the lede (allowed to generalise
  // across the week rather than citing specific items) and for downgrading a
  // number/name that's real but simply undercited to a warning instead of a
  // hard failure.
  const allNumbers = new Set();
  const allNouns = new Set();
  for (const e of corpus.entries) {
    for (const x of numbersIn(sourceText(e))) allNumbers.add(x);
    for (const x of properNounsIn(sourceText(e))) allNouns.add(x);
  }

  for (const b of blocks) {
    const prose = stripCites(b.text);
    const proseOnly = stripCites(b.prose);

    if (!b.cites.length) problems.push(`${b.where}: no citations`);

    const unknown = b.cites.filter((n) => !corpus.byIndex.has(n));
    if (unknown.length) problems.push(`${b.where}: cites nonexistent source(s) ${unknown.join(', ')}`);

    if (/https?:\/\/|www\.|\.com\b/i.test(prose)) problems.push(`${b.where}: contains a URL/domain`);

    const allowedNums = new Set();
    const allowedNouns = new Set();
    for (const n of b.cites) {
      const e = corpus.byIndex.get(n);
      if (!e) continue;
      for (const num of numbersIn(sourceText(e))) allowedNums.add(num);
      for (const noun of properNounsIn(sourceText(e))) allowedNouns.add(noun);
    }

    for (const num of numbersIn(prose)) {
      if (allowedNums.has(num)) continue;
      if (allNumbers.has(num)) warnings.push(`${b.where}: number "${num}" is in the corpus but not in its cited sources`);
      else problems.push(`${b.where}: number "${num}" appears in NO source — likely fabricated`);
    }
    for (const noun of properNounsIn(proseOnly)) {
      if (allowedNouns.has(noun) || allNouns.has(noun)) continue;
      warnings.push(`${b.where}: name "${noun}" appears in no source`);
    }
  }

  for (const num of numbersIn(stripCites(`${digest.headline || ''} ${digest.lede || ''}`))) {
    if (!allNumbers.has(num)) problems.push(`lede/headline: number "${num}" appears in NO source`);
  }

  return { problems, warnings };
}
