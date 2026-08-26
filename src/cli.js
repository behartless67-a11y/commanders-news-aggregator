#!/usr/bin/env node
import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { SOURCES, enabledSources } from '../config/sources.js';
import { collectAll, collectSocialAll } from './collectors/index.js';
import { log } from './lib/log.js';
import { loadItems, loadState, loadSocial } from './lib/store.js';
import { buildSite } from './site/build.js';
import { generateDigest } from './digest/generate.js';
import { digestList, digestReview, digestSetStatus } from './digest/review.js';
import { generatePreview, listPreviews, setPreviewStatus } from './digest/preview-generate.js';
import { fetchRoster, attachStats, saveRosterCache, loadRosterCache } from './lib/roster.js';
import { fetchDepthChart, saveDepthChartCache } from './lib/depthchart.js';
import { fetchSchedule, saveScheduleCache, loadScheduleCache } from './lib/schedule.js';
import { fetchBettingLine, saveBettingCache } from './lib/betting.js';
import { fetchNfcEastStandings, saveStandingsCache } from './lib/standings.js';
import { fetchInjuries, saveInjuriesCache } from './lib/injuries.js';
import { fetchTeamStats, saveTeamStatsCache } from './lib/teamstats.js';
import { updateLiveGame } from './digest/live-generate.js';
import { isGameWindowActive } from './lib/gamewindow.js';

const USAGE = `
Commanders headline river

  npm run collect            read every enabled source, store new items
  npm run social             read the social ticker accounts and hashtags
  npm run build              render the static site into dist/
  npm run run                collect, social, then build, then print status
  npm run serve              serve dist/ on http://localhost:8080
  npm run sources            list configured sources
  npm run doctor             check every source and report what is broken
  node src/cli.js status     item counts and last run info
  npm run roster             refresh the cached ESPN roster (name, jersey, position, photo)
  npm run roster-stats       refresh cached season stats per player (weekly, ESPN)
  npm run depth-chart        refresh the cached commanders.com depth chart
  npm run schedule           refresh the cached commanders.com schedule
  npm run betting            refresh the cached next-game betting line (ESPN/DraftKings)
  npm run standings          refresh the cached NFC East standings (ESPN)
  npm run injuries           refresh the cached injury report (Sleeper's public players API)
  npm run team-stats         refresh cached team offense/defense totals (ESPN; --season=YYYY)
  npm run live               check for a live game and write a quarter recap if one just ended (Bedrock/Claude)
  node src/cli.js gamecheck  print true/false: is a Commanders game in its live window right now

  npm run digest             write this week's AI recap draft (needs Ollama running)
  npm run digest:list        list every recap and its status
  npm run digest:review -- <week>    print a draft with every citation resolved
  npm run digest:approve -- <week>   mark a draft published — build then picks it up
  npm run digest:reject -- <week>    mark a draft rejected

  npm run preview             write tomorrow's game preview draft, if a game is tomorrow (needs Ollama running)
  npm run preview:list        list every preview and its status
  npm run preview:approve -- <gameKey>   mark a preview published — build then picks it up
  npm run preview:reject -- <gameKey>    mark a preview rejected

Flags
  --only=id,id               limit collect/doctor to specific source ids
  --port=N                   port for serve (default 8080)
  --force                    with digest, regenerate even if today's draft exists
`;

function parseArgs(argv) {
  const flags = {};
  for (const arg of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (match) flags[match[1]] = match[2] ?? true;
  }
  return flags;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

async function serve(port) {
  const root = path.resolve(process.env.DIST_DIR || 'dist');
  if (!fs.existsSync(root)) {
    log.error(`${root} does not exist — run \`npm run build\` first`);
    process.exitCode = 1;
    return;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      let filePath = path.join(root, requested);
      if (!filePath.startsWith(root)) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
      const body = await fsp.readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404</h1>');
    }
  });

  server.listen(port, () => log.ok(`serving ${root} at http://localhost:${port}`));
}

async function listSources() {
  const items = await loadItems();
  const counts = {};
  for (const item of Object.values(items)) {
    counts[item.sourceId] = (counts[item.sourceId] || 0) + 1;
  }
  const rows = SOURCES.map((s) => ({
    id: s.id,
    category: s.category,
    state: s.enabled === false ? 'parked' : 'active',
    items: counts[s.id] || 0,
  }));
  console.table(rows);
}

/** Fetch every source and report which produce nothing, so a broken feed is caught before the page thins out. */
async function doctor(only) {
  const sources = enabledSources().filter((s) => !only || only.includes(s.id));
  log.info(`checking ${sources.length} source(s)…`);

  const { perSource } = await collectAll({ only: sources.map((s) => s.id) });

  const broken = [];
  const quiet = [];
  for (const source of sources) {
    const result = perSource[source.id] || {};
    if (result.error) broken.push(`${source.id}: ${result.error}`);
    else if (!result.found) quiet.push(source.id);
  }

  console.log('');
  if (broken.length === 0 && quiet.length === 0) log.ok('every source returned at least one item');
  if (broken.length) {
    log.error(`${broken.length} source(s) threw:`);
    broken.forEach((b) => console.log(`    ${b}`));
  }
  if (quiet.length) {
    log.warn(`${quiet.length} source(s) returned nothing:`);
    quiet.forEach((q) => console.log(`    ${q}`));
  }
}

async function status() {
  const items = await loadItems();
  const social = await loadSocial();
  const state = await loadState();
  const lastCollect = (state.runs || []).find((r) => r.stage === 'collect');
  const lastSocial = (state.runs || []).find((r) => r.stage === 'social');

  console.log('');
  console.log(`  items in store    ${Object.keys(items).length}`);
  console.log(`  social posts      ${Object.keys(social).length}`);
  if (lastCollect) {
    console.log(`  last collect      ${lastCollect.at} (+${lastCollect.added} new)`);
  }
  if (lastSocial) {
    console.log(`  last social       ${lastSocial.at} (+${lastSocial.added} new)`);
  }
  console.log('');
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseArgs(rest);
  const only = typeof flags.only === 'string' ? flags.only.split(',').map((s) => s.trim()) : null;

  switch (command) {
    case 'collect':
      await collectAll({ only });
      break;
    case 'social':
      await collectSocialAll();
      break;
    case 'build':
      await buildSite();
      break;
    case 'run':
      log.step('collecting');
      await collectAll({ only });
      log.step('collecting social');
      await collectSocialAll();
      log.step('building');
      await buildSite();
      await status();
      break;
    case 'serve':
      await serve(Number(flags.port) || 8080);
      break;
    case 'sources':
      await listSources();
      break;
    case 'doctor':
      await doctor(only);
      break;
    case 'status':
      await status();
      break;
    case 'roster': {
      // Basic info only (name, jersey, position, photo) — cheap enough to
      // run every few hours for call-ups and roster moves. Season stats are
      // refreshed on their own weekly schedule (see the 'roster-stats' case
      // and roster-stats.yml), so a stat line already on file is carried
      // forward here rather than being blanked out until next Tuesday.
      const players = await fetchRoster();
      if (players.length) {
        const previous = await loadRosterCache();
        const statsBySlug = new Map(previous.map((p) => [p.slug, p.stats]));
        const merged = players.map((p) => ({ ...p, stats: statsBySlug.get(p.slug) ?? null }));
        await saveRosterCache(merged);
        log.ok(`roster: cached ${merged.length} player(s)`);
      } else {
        log.warn('roster: fetch returned nothing — leaving the existing cache in place');
      }
      break;
    }
    case 'roster-stats': {
      // Deliberately weekly (Tuesday mornings, after Sunday and Monday Night
      // Football have both gone final) rather than on every roster refresh —
      // one ESPN request per player is too heavy to repeat every few hours
      // for a number that only changes once a week anyway.
      const current = await loadRosterCache();
      if (current.length) {
        const withStats = await attachStats(current);
        await saveRosterCache(withStats);
        log.ok(`roster-stats: refreshed stats for ${withStats.length} player(s)`);
      } else {
        log.warn('roster-stats: no cached roster yet — run npm run roster first');
      }
      break;
    }
    case 'depth-chart': {
      const sections = await fetchDepthChart();
      if (sections.length) {
        await saveDepthChartCache(sections);
        log.ok(`depth-chart: cached ${sections.length} section(s)`);
      } else {
        log.warn('depth-chart: fetch returned nothing — leaving the existing cache in place');
      }
      break;
    }
    case 'schedule': {
      const games = await fetchSchedule();
      if (games.length) {
        await saveScheduleCache(games);
        log.ok(`schedule: cached ${games.length} game(s)`);
      } else {
        log.warn('schedule: fetch returned nothing — leaving the existing cache in place');
      }
      break;
    }
    case 'gamecheck': {
      const games = await loadScheduleCache();
      const live = isGameWindowActive(games);
      console.log(live ? 'true' : 'false');
      // Writes a step output for GitHub Actions when run there; a no-op
      // locally, where GITHUB_OUTPUT is unset.
      if (process.env.GITHUB_OUTPUT) {
        await fsp.appendFile(process.env.GITHUB_OUTPUT, `live=${live}\n`);
      }
      break;
    }
    case 'live': {
      const state = await updateLiveGame();
      if (!state) log.info('live: nothing new to publish');
      break;
    }
    case 'betting': {
      const line = await fetchBettingLine();
      if (line) {
        await saveBettingCache(line);
        log.ok(`betting: cached line for Commanders vs ${line.opponent}`);
      } else {
        log.warn('betting: fetch returned nothing (bye week, offseason, or a fetch issue) — leaving the existing cache in place');
      }
      break;
    }
    case 'standings': {
      const standings = await fetchNfcEastStandings();
      if (standings) {
        await saveStandingsCache(standings);
        log.ok(`standings: cached NFC East (${standings.teams.map((t) => `${t.abbr} ${t.overall}`).join(', ')})`);
      } else {
        log.warn('standings: fetch failed — leaving the existing cache in place');
      }
      break;
    }
    case 'injuries': {
      const entries = await fetchInjuries();
      if (entries) {
        await saveInjuriesCache(entries);
        log.ok(`injuries: cached ${entries.length} player(s) currently listed with an injury`);
      } else {
        log.warn('injuries: fetch failed — leaving the existing cache in place');
      }
      break;
    }
    case 'team-stats': {
      // --season is worth having as a flag rather than always using "now":
      // through the preseason the current year has no regular-season totals
      // yet, so the only honest thing to show is last season's, and that
      // choice belongs to whoever runs it.
      const stats = await fetchTeamStats({ season: flags.season ? Number(flags.season) : undefined });
      if (stats) {
        await saveTeamStatsCache(stats);
        const off = stats.offense?.yardsPerGame;
        const def = stats.defense?.yardsPerGame;
        log.ok(
          `team-stats: cached ${stats.season} — offense ${off?.value ?? '?'} yds/gm` +
            `${off?.rankLabel ? ` (${off.rankLabel})` : ''}, ` +
            `defense ${def?.value ?? 'unavailable'}${def ? ` yds/gm allowed over ${stats.defense.games} game(s)` : ''}`,
        );
      } else {
        log.warn('team-stats: fetch failed — leaving the existing cache in place');
      }
      break;
    }
    case 'digest': {
      const sub = rest[0];
      if (sub === 'list') await digestList();
      else if (sub === 'review') await digestReview(rest[1]);
      else if (sub === 'approve') await digestSetStatus(rest[1], 'published');
      else if (sub === 'reject') await digestSetStatus(rest[1], 'rejected');
      else await generateDigest({ force: !!flags.force });
      break;
    }
    case 'preview': {
      const sub = rest[0];
      if (sub === 'list') {
        const records = await listPreviews();
        if (!records.length) log.info('no previews yet — run `npm run preview`');
        else console.table(records.map((r) => ({ gameKey: r.gameKey, opponent: r.opponent, status: r.status, warnings: r.warnings?.length || 0 })));
      } else if (sub === 'approve') await setPreviewStatus(rest[1], 'published');
      else if (sub === 'reject') await setPreviewStatus(rest[1], 'rejected');
      else {
        const record = await generatePreview({ force: !!flags.force });
        if (!record) log.info('preview: nothing to do');
      }
      break;
    }
    default:
      console.log(USAGE);
      if (command) process.exitCode = 1;
  }
}

main().catch((err) => {
  log.error(err.stack || err.message);
  process.exitCode = 1;
});
