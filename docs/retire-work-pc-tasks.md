# Retire the two Task Scheduler jobs on the work machine

Written Oct 28, 2026. If you are reading this on the work machine (or pasting it into Claude there), skip to **What to do on the work machine**.

> **Done, Oct 28, 2026.** Ben deleted both tasks on the work machine the same afternoon. Kept for the record and for the "how to tell if it comes back" check at the bottom.

## What's wrong

Two Windows Task Scheduler jobs, registered in early September per [scheduled-generation.md](scheduled-generation.md), still run `scheduled-post.ps1` from the repo clone on the work machine:

| Job (name as typed in Task Scheduler) | Trigger | Argument |
|---|---|---|
| Game preview draft | Daily, 7:00 AM Eastern | `-Task preview` |
| Weekly Blog draft | Fridays, 2:00 PM Eastern | `-Task digest` |

Both were superseded weeks ago. Previews and digests are hand-written now (the Bedrock account is gone, and `preview.yml` was disabled Sept 19), and every deploy runs from GitHub Actions, gated on whether the built site changed (`src/site/build-hash.js`, `scripts/needs-deploy.mjs`). Nobody turned the two jobs off.

The script does `git pull`, `npm run build`, then `netlify deploy --prod`. That clone has no `SITE_URL` set, and until Oct 28 the build fell back to `http://localhost:8080`. So every morning at 7:01 Eastern (and Fridays at 2:01 PM), the live site was replaced with a build in which every canonical tag, `og:url`, the sitemap, the RSS feed, `robots.txt` and the structured data said localhost. GitHub's next deploy put the right URLs back a few hours later, and the next morning it happened again.

The cost:

- Google saw localhost canonicals on theburgundywire.com for roughly 3 to 4 hours a day, every day, for weeks. That is the most likely reason posts don't rank for their own titles.
- 15 Netlify credits for the rogue deploy, plus 15 more because the next GitHub run sees a changed site and redeploys: about 30 a day, roughly 900 a month out of the plan's 3,000.

Evidence: Netlify's deploy list (`netlify api listSiteDeploys`) shows a production deploy at 11:01 UTC every day back to at least Oct 22 that lines up with no GitHub Actions run. Those deploys carry localhost canonicals; the GitHub deploys from the same mornings carry the right URLs. The Friday 18:02 UTC deploys match the digest job.

## What's already done in the repo (Oct 28)

- `src/site/build.js` now defaults `SITE_URL` to `https://theburgundywire.com`. A build anywhere produces real URLs unless `SITE_URL` is set to something else on purpose.
- `scheduled-post.ps1` is retired. It prints a note, disables any Task Scheduler job whose action points at it, and exits without pulling, building or deploying. Because the old script pulls before it runs, the first run after this change still executes the old copy once (it builds with the new production default, so no more localhost); every run after that is a no-op.

## What to do on the work machine (about 5 minutes)

1. Open **Task Scheduler**. In the Task Scheduler Library, find the two tasks whose action runs `powershell.exe ... scheduled-post.ps1`. They were probably named **Game preview draft** and **Weekly Blog draft**. Right-click each and **Delete**. (If the retired script already disabled them, they'll show as Disabled; delete them anyway.)

   PowerShell equivalent, run as the user that owns the tasks:

   ```powershell
   Get-ScheduledTask | Where-Object { ($_.Actions | ForEach-Object { $_.Arguments }) -match 'scheduled-post\.ps1' } | Unregister-ScheduledTask -Confirm:$false
   ```

2. **Leave the Nicki X scrape task alone.** It runs `node scripts/ship.js x-scrape` every 2 hours from its own clone. It commits and pushes; it has not deployed since Oct 22.

3. In the clone the deleted tasks used, run `git pull origin master` so it has the retired script and the new default. (Find the clone from the task's "Start in" folder before deleting it.)

4. Optional but tidy: in that clone, `netlify logout`. Nothing on the work machine should deploy anymore.

5. Verify the next morning, after 7:05 AM Eastern:

   ```powershell
   curl.exe -s https://theburgundywire.com/ | Select-String canonical
   netlify api listSiteDeploys --data '{"site_id":"ec82d31e-ef1c-4e9d-aef6-931ac3af4090","per_page":5}'
   ```

   The canonical must say `theburgundywire.com`, and there should be no deploy at 11:01 UTC (7:01 AM EDT) that doesn't match a run under the repo's Actions tab.

## How to tell if it ever comes back

- `curl -s https://theburgundywire.com/build-hash.txt` should match the hash printed by the latest GitHub Actions build ("built dist/ (hash)").
- Any production deploy in Netlify that doesn't line up with a GitHub Actions run is a machine deploying on its own. The only sanctioned deploys come from `.github/workflows/`.
