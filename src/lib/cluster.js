/**
 * Folding duplicate coverage of one story into a single river card.
 *
 * On a busy news day the river showed the same story over and over: Terry
 * McLaurin's hamstring seven times in the top 60, Daniels out / Mariota
 * starting eight times, and Hogs Haven posts again under Yahoo's name. The
 * design review pointed at Techmeme and Memeorandum, which show a story once
 * with the other outlets' links underneath, and that's what this does.
 *
 * Two headlines (published within STORY_WINDOW_HOURS of each other) are the
 * same story when any of these holds:
 *   1. Same headline once a feed's series tag is dropped (a syndicated repost:
 *      "Commanders News – X" on Hogs Haven, "X - Daily Slop" on Yahoo).
 *   2. They name the same two players ("Daniels out, Mariota starts").
 *   3. They name the same player and both are injury news about it
 *      ("McLaurin questionable", "McLaurin's late hamstring concern").
 *   4. They name the same player and share two more meaningful words.
 *   5. No shared player, but most of the wording matches (a reworded repost).
 * Coaches and the GM don't count as a shared player: Dan Quinn is in half the
 * headlines, and "Quinn sets final practice hurdle" is not "Quinn ends
 * London push".
 *
 * A headline joins a story if it matches any headline already in it, so a
 * story can grow through its own coverage; every rule but the last needs a
 * shared player, which keeps that from drifting far.
 *
 * Pure function, no I/O, so it's easy to try against a day's items.
 */

const STORY_WINDOW_HOURS = 48;

// Words that say nothing about which story a headline is.
const STOPWORDS = new Set(`
a an and are as at be been but by can could did do does for from gets get gives give has have how if in into is it its
just more new not now of off on or over says say should so than that the their them then there these they this
to up vs was we what when where which who why will with would you your after ahead against amid back before during
latest still very about all also any being here make makes making most much only other our own same some such too
commanders commander washington nfl team teams game games week weeks season london sunday monday thursday
news report reports update updates breaking watch video live daily slop atwitter
dan quinn adam peters kliff kingsbury joe whitt
`.split(/\s+/).filter(Boolean));

// Injury news, for rule 3. Stemmed loosely by prefix.
const INJURY = /^(injur|hamstring|ankle|knee|elbow|concussion|questionable|doubtful|ruled|out$|unlikely|limited|sidelined|setback|reinjur|ir$|absence|miss)/;

/** "Commanders News – X - Daily Slop" and "X" are the same headline. */
export function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/^(commanders|washington) news\s*[–-]\s*/, '')
    .replace(/\s*[–-]\s*(daily slop|all atwitter)\s*$/, '')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(title) {
  return normalizeTitle(title)
    .split(' ')
    .map((w) => w.replace(/'s$/, '').replace(/'/g, ''))
    .filter((w) => w.length > 1 && !/^\d+$/.test(w));
}

/** Roster players by last name, plus every part of their name to drop from "other words". */
function rosterIndex(players) {
  const byLast = new Map();
  const nameParts = new Map();
  for (const p of players || []) {
    const parts = String(p.name || '').toLowerCase().replace(/[^a-z' -]/g, '').split(/\s+/).filter(Boolean).map((w) => w.replace(/'/g, ''));
    const last = parts.filter((w) => !['jr', 'sr', 'ii', 'iii'].includes(w)).pop();
    if (!last || last.length < 4) continue;
    byLast.set(last, p.name);
    nameParts.set(p.name, parts);
  }
  return { byLast, nameParts };
}

function describe(item, roster) {
  const all = words(item.title);
  const players = new Set(all.filter((w) => roster.byLast.has(w)).map((w) => roster.byLast.get(w)));
  const nameWords = new Set([...players].flatMap((p) => roster.nameParts.get(p) || []));
  const other = all.filter((w) => !nameWords.has(w) && !STOPWORDS.has(w) && w.length > 2);
  return {
    item,
    norm: normalizeTitle(item.title),
    players,
    other,
    injury: other.some((w) => INJURY.test(w)),
    at: Date.parse(item.publishedAt || 0),
  };
}

function sameStory(a, b) {
  if (Math.abs(a.at - b.at) / 3600000 > STORY_WINDOW_HOURS) return false;
  if (a.norm === b.norm) return true;

  const sharedPlayers = [...a.players].filter((p) => b.players.has(p)).length;
  const setA = new Set(a.other);
  const sharedOther = new Set(b.other.filter((w) => setA.has(w))).size;

  if (sharedPlayers >= 2) return true;
  if (sharedPlayers >= 1 && a.injury && b.injury) return true;
  if (sharedPlayers >= 1 && sharedOther >= 2) return true;
  const smaller = Math.min(a.other.length, b.other.length);
  return sharedPlayers === 0 && sharedOther >= 4 && smaller > 0 && sharedOther / smaller >= 0.7;
}

/**
 * Groups `items` (newest first, as the river sorts them) into stories. Each
 * returned item is the story's lead, its newest headline (so the card says
 * the latest thing known: "unlikely to play" over yesterday's "questionable"),
 * sitting where that newest headline sat, with `related` holding the other
 * outlets' items, newest first. Exact repeats of a headline from the same
 * outlet are dropped rather than listed twice. Items that aren't part of any
 * story come back unchanged.
 *
 * The site's own posts (internal) and pinned items are never folded: a Blog
 * post is never "more coverage" of someone else's headline.
 */
export function clusterItems(items, { players = [] } = {}) {
  const roster = rosterIndex(players);
  const meta = items.map((item) => describe(item, roster));
  const story = new Array(items.length).fill(-1); // index of each item's lead
  const members = new Map();

  for (let i = 0; i < meta.length; i++) {
    if (meta[i].item.internal || meta[i].item.pinned) continue;
    if (story[i] === -1) {
      story[i] = i;
      members.set(i, [i]);
    }
    const lead = story[i];
    // Repeat until nothing new joins: a headline checked early can match one
    // that only joined the story later in the same pass.
    for (let grew = true; grew; ) {
      grew = false;
      for (let j = i + 1; j < meta.length; j++) {
        if (story[j] !== -1 || meta[j].item.internal || meta[j].item.pinned) continue;
        // The whole story stays within the window of its lead. Without this
        // a week of Daniels coverage chained into one 29-headline "story", one
        // 48-hour hop at a time.
        if ((meta[lead].at - meta[j].at) / 3600000 > STORY_WINDOW_HOURS) continue;
        if (members.get(lead).some((m) => sameStory(meta[m], meta[j]))) {
          story[j] = lead;
          members.get(lead).push(j);
          grew = true;
        }
      }
    }
  }

  return items
    .map((item, i) => {
      if (story[i] !== -1 && story[i] !== i) return null; // folded into an earlier lead
      const group = members.get(i);
      if (!group || group.length === 1) return item;
      const seen = new Set([`${item.sourceName}|${meta[i].norm}`]);
      const related = [];
      for (const m of group.slice(1)) {
        const key = `${items[m].sourceName}|${meta[m].norm}`;
        if (seen.has(key)) continue;
        seen.add(key);
        related.push(items[m]);
      }
      return related.length ? { ...item, related } : item;
    })
    .filter(Boolean);
}
