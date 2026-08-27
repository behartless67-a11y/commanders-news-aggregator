import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { sendAlertEmail } from '../src/lib/alert.js';

// Outside the repo entirely, so `git reset --hard` (run every invocation,
// see below) never touches it — this is the one piece of state that has to
// survive across runs regardless of what's happening to the checkout.
const ALERT_FLAG = 'C:/tmp/x-scrape-alert.flag';

/**
 * Runs Nicki's X-browser scrape, then ships whatever it wrote straight to
 * production — commit, push, deploy — with no human in the loop. This is
 * the one collector that can only run on a machine holding a real logged-in
 * browser session (see docs/x-browser-scraping.md), which a GitHub Actions
 * runner can't provide. Every other collector already ships this way via
 * its own GitHub Actions workflow (nightly.yml/social.yml/gameday.yml) —
 * this is the same shape, just triggered by a local Windows Scheduled Task
 * instead of cron.
 *
 * The game-day preview draft used to run through this same script, but
 * moved to .github/workflows/preview.yml once it switched to Bedrock/Claude
 * (see preview-generate.js) — that doesn't need a local Ollama session, so
 * it runs the same way every other cloud-model step does, in CI.
 *
 * Deliberately runs from its own dedicated clone (see the Task Scheduler
 * setup in docs/x-browser-scraping.md), never the interactive dev checkout
 * this project is normally edited in — `git reset --hard` runs on every
 * invocation, which would silently destroy uncommitted work if this ever
 * pointed at a directory a human also edits in.
 *
 * Usage: node scripts/ship.js x-scrape
 */

const MODE = process.argv[2];
if (MODE !== 'x-scrape') {
  console.error('usage: node scripts/ship.js x-scrape');
  process.exit(1);
}

const COMMANDS = {
  'x-scrape': { run: 'node src/cli.js x-scrape', message: 'Automated: Nicki X update' },
};

function sh(cmd) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { stdio: 'inherit' });
}

function shQuiet(cmd) {
  return execSync(cmd, { stdio: 'pipe' }).toString();
}

function hasStagedChanges() {
  try {
    execSync('git diff --cached --quiet');
    return false;
  } catch {
    return true;
  }
}

/**
 * Runs the actual work command, tolerating a non-zero exit — x-scrape uses
 * that specifically to signal a dead session (see cli.js), which still may
 * have found nothing new to ship but isn't itself a reason to abort before
 * checking.
 */
function runWork() {
  try {
    sh(COMMANDS[MODE].run);
    return 0;
  } catch (err) {
    return err.status ?? 1;
  }
}

function commitAndPush(attempt) {
  sh('git add data/');
  if (!hasStagedChanges()) {
    console.log('no data changes — nothing to ship');
    return false;
  }
  sh(`git commit -m "${COMMANDS[MODE].message}"`);
  try {
    sh('git push origin master');
    return true;
  } catch (err) {
    // nightly.yml/social.yml/gameday.yml push on their own schedule too
    // (see the concurrency-group comment in those workflows) — a rejected
    // push here just means one of them won the race, not a real failure.
    // Safe to reset and retry once: x-scrape is a fresh idempotent re-scrape
    // (see mergeSocial — re-adding an already-known post is a no-op), and
    // preview's generatePreview() already no-ops if a draft for today's
    // gameKey exists, so at worst this costs one extra, harmless Ollama call.
    if (attempt > 0) throw err;
    console.warn('push rejected — fetching latest and retrying once');
    sh('git fetch origin');
    sh('git reset --hard origin/master');
    runWork();
    return commitAndPush(attempt + 1);
  }
}

sh('git fetch origin');
sh('git reset --hard origin/master');
const exitCode = runWork();
const shipped = commitAndPush(0);

if (shipped) {
  sh('gh workflow run nightly.yml');
  console.log('shipped — triggered nightly.yml to build and deploy');
}

/**
 * Edge-triggered, not level-triggered: only the transition into "broken"
 * sends mail, so a session that's been dead for three days doesn't mean
 * three days of emails every two hours. The flag file is the memory of
 * which side of that transition the last run landed on.
 */
async function handleSessionAlert() {
  const wasAlreadyBroken = fs.existsSync(ALERT_FLAG);
  if (exitCode !== 0 && !wasAlreadyBroken) {
    const sent = await sendAlertEmail({
      subject: 'Burgundy Wire: Nicki X scraper session expired',
      message:
        'The X-browser scraper (npm run x-scrape) reported a dead session. ' +
        'Log in again in the C:/tmp/chrome-x-scraper Chrome profile — see docs/x-browser-scraping.md.',
    });
    if (sent) fs.writeFileSync(ALERT_FLAG, new Date().toISOString());
  } else if (exitCode === 0 && wasAlreadyBroken) {
    fs.unlinkSync(ALERT_FLAG);
  }
}

await handleSessionAlert();

process.exit(exitCode);
