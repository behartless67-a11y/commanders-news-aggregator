# Reading X through a logged-in browser

Some Commanders reporters (Nicki Jhabvala, for one) aren't mirrored on the
sportsbots.xyz Mastodon bridge every other social source reads through — see
the header comment in `config/social.js` for why that bridge exists at all.
X has no usable free read API and returns a flat 403 to any logged-out
request, so the only way to read one of these accounts is a real, logged-in
browser session.

## What this is, and isn't

- A dedicated Chrome profile at `C:/tmp/chrome-x-scraper`, logged into a
  **throwaway X account** (not the site owner's real one) that follows only
  the accounts being read.
- `npm run x-scrape` drives that profile headless, dumps the target
  profile's DOM, and merges the result into `data/social.json` — the exact
  same store `npm run social` writes to. Downstream (ticker, relevance
  filter, digest citations) a post collected this way is indistinguishable
  from a Mastodon-bridged one.
- **Local-only, on purpose.** This never runs from `collectAll`/
  `collectSocialAll`, and never from a GitHub Actions workflow — a CI runner
  has no logged-in browser session to read. It only works on whichever
  machine actually holds that Chrome profile.

## What this doesn't fix

Scraping still runs as the throwaway account, making real requests to a
real X session. It's lower-risk than using the owner's own account, but
it's not risk-free: X's ToS doesn't sanction automated collection, and a
scraper is the most brittle collector in this project — X's markup has no
stability guarantee and can change without notice.

## One-time setup

```
mkdir -p /c/tmp/chrome-x-scraper
"/c/Program Files/Google/Chrome/Application/chrome.exe" \
  --user-data-dir="/c/tmp/chrome-x-scraper" --no-first-run \
  "https://x.com/login"
```

Log in with the throwaway account in the window that opens, then **close
it fully** (not just minimize — see the gotcha below). Add accounts to
follow/read in `config/social.js`'s `SOCIAL_BROWSER_ACCOUNTS`.

## Running it

```
npm run x-scrape
```

## Gotchas, found the hard way

- **The Chrome window has to actually exit, not just look closed.** The
  first time through, closing the window left the whole process tree
  (browser + gpu-process + renderers + crashpad-handler) alive in the
  background — `tasklist` shows nothing distinguishable by name among a
  browser's other 50 chrome.exe processes, but the profile's `Cookies` file
  stays locked, and every subsequent launch prints `Opening in existing
  browser session.` and silently no-ops instead of actually running
  headless. Confirm nothing's still attached to the profile before
  troubleshooting anything else:
  ```
  powershell -Command "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { \$_.CommandLine -like '*chrome-x-scraper*' } | Select-Object ProcessId,CommandLine"
  ```
  If that lists anything, `Stop-Process -Id <id> -Force` each one (killing
  the root PID cascades the helpers).
- **An unclean exit poisons the next headless launch a different way.**
  Chrome writes `"exit_type":"Crashed"` into
  `Default/Preferences` whenever it doesn't shut down cleanly, and headless
  mode has no crash-recovery UI to show, so it exits immediately (code 21)
  instead. Fix by hand if it recurs:
  ```js
  const fs = require('fs');
  const p = 'C:/tmp/chrome-x-scraper/Default/Preferences';
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  data.profile.exit_type = 'Normal';
  data.profile.exited_cleanly = true;
  fs.writeFileSync(p, JSON.stringify(data));
  ```
- **If the session expires**, `npm run x-scrape` logs a warning
  (`looks logged out — session may have expired`) rather than failing
  loudly, and simply returns no posts. Repeat the one-time setup to log
  back in.
- **Pinned and reposted posts are skipped deliberately** — a pinned post is
  often stale by the time it would resurface here, and a repost's real
  author isn't the account being read. See the check in
  `src/collectors/xbrowser.js`.
