// Should this run deploy? Compares the fingerprint the build just wrote
// (dist/build-hash.txt, see src/site/build-hash.js) with the one the live
// site is serving. Same fingerprint: the deploy would publish nothing new,
// so skip it (15 Netlify credits saved). Different, or the live copy can't
// be read for any reason: deploy, because a wasted deploy is cheap and a
// missed one is not.
//
// Writes `changed=true|false` to $GITHUB_OUTPUT when run in Actions, and
// prints the decision either way. FORCE_DEPLOY=true always deploys.
import fs from 'node:fs';

const SITE = (process.env.SITE_URL || 'https://theburgundywire.com').replace(/\/$/, '');

function decide(changed, why) {
  console.log(`${changed ? 'deploy' : 'skip deploy'}: ${why}`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}

const local = fs.existsSync('dist/build-hash.txt') ? fs.readFileSync('dist/build-hash.txt', 'utf8').trim() : '';

if (process.env.FORCE_DEPLOY === 'true') {
  decide(true, 'FORCE_DEPLOY is set');
} else if (!local) {
  decide(true, 'no dist/build-hash.txt from this build');
} else {
  let live = '';
  try {
    const res = await fetch(`${SITE}/build-hash.txt?t=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) live = (await res.text()).trim();
  } catch {
    live = '';
  }
  if (!/^[0-9a-f]{64}$/.test(live)) decide(true, 'could not read the live fingerprint');
  else if (live === local) decide(false, `the live site already has ${local.slice(0, 10)}`);
  else decide(true, `live ${live.slice(0, 10)}, new ${local.slice(0, 10)}`);
}
