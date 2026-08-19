#!/usr/bin/env node
import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { SOURCES, enabledSources } from '../config/sources.js';
import { collectAll } from './collectors/index.js';
import { log } from './lib/log.js';
import { loadItems, loadState } from './lib/store.js';
import { buildSite } from './site/build.js';

const USAGE = `
Commanders headline river

  npm run collect            read every enabled source, store new items
  npm run build              render the static site into dist/
  npm run run                collect, then build, then print status
  npm run serve              serve dist/ on http://localhost:8080
  npm run sources            list configured sources
  npm run doctor             check every source and report what is broken
  node src/cli.js status     item counts and last run info

Flags
  --only=id,id               limit collect/doctor to specific source ids
  --port=N                   port for serve (default 8080)
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
  const state = await loadState();
  const lastCollect = (state.runs || []).find((r) => r.stage === 'collect');

  console.log('');
  console.log(`  items in store    ${Object.keys(items).length}`);
  if (lastCollect) {
    console.log(`  last collect      ${lastCollect.at} (+${lastCollect.added} new)`);
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
    case 'build':
      await buildSite();
      break;
    case 'run':
      log.step('collecting');
      await collectAll({ only });
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
    default:
      console.log(USAGE);
      if (command) process.exitCode = 1;
  }
}

main().catch((err) => {
  log.error(err.stack || err.message);
  process.exitCode = 1;
});
