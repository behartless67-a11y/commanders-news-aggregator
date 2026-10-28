param(
  [Parameter(Mandatory=$false)]
  [string]$Task
)

# RETIRED Oct 28, 2026. See docs/retire-work-pc-tasks.md.
#
# This script used to pull, generate a draft, build and `netlify deploy --prod`
# from the work machine (docs/scheduled-generation.md). Both of its Task
# Scheduler jobs were superseded weeks ago: previews and digests are
# hand-written now, and every deploy runs from GitHub Actions, gated on
# whether the built site changed. The jobs kept firing anyway, and because
# that clone has no SITE_URL set, each run published a build whose site URL
# was http://localhost:8080, every morning at 7:01 Eastern.
#
# The Task Scheduler jobs run `git pull` through the old copy of this file
# before anything else, so the first run after this change still executes
# the old script once (with the new production default in build.js, so no
# more localhost). Every run after that lands here, which does nothing but
# turn off any scheduled task still pointing at this file. Delete the tasks
# properly when you get a minute; this is the backstop.

$logDir = "$env:LOCALAPPDATA\BurgundyWireScheduled"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path "$logDir\retired.log" -Append | Out-Null
Write-Output "==== $(Get-Date) - scheduled-post.ps1 is retired; task '$Task' was not run ===="
Write-Output "See docs/retire-work-pc-tasks.md and delete the Task Scheduler job that ran this."

try {
  $mine = Get-ScheduledTask -ErrorAction Stop | Where-Object {
    ($_.Actions | ForEach-Object { "$($_.Execute) $($_.Arguments)" }) -match 'scheduled-post\.ps1'
  }
  if ($mine) {
    foreach ($t in $mine) {
      Disable-ScheduledTask -TaskName $t.TaskName -TaskPath $t.TaskPath -ErrorAction Stop | Out-Null
      Write-Output "Disabled scheduled task: $($t.TaskPath)$($t.TaskName)"
    }
  } else {
    Write-Output "No scheduled task points at this script."
  }
} catch {
  Write-Output "Could not disable the task automatically: $_"
}

Stop-Transcript | Out-Null
exit 0
