param(
  [Parameter(Mandatory=$true)]
  [ValidateSet('digest', 'preview')]
  [string]$Task
)

Set-Location "$PSScriptRoot"

$logDir = "$env:LOCALAPPDATA\BurgundyWireScheduled"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path "$logDir\$Task.log" -Append | Out-Null
Write-Output "==== $(Get-Date) - $Task ===="

git pull origin master --no-edit
if ($LASTEXITCODE -ne 0) { Write-Error "git pull failed"; exit 1 }

npm run $Task
# Exit code from `preview` on a non-game day is 0 (it just logs "nothing to
# do" and returns) — don't treat that as a failure.

npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "build failed"; exit 1 }

git add data/
git diff --cached --quiet
if ($LASTEXITCODE -eq 1) {
  git commit -m "Scheduled $Task run"
  git push origin master
}

netlify deploy --prod --dir=dist

Stop-Transcript | Out-Null
