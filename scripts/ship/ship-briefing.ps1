<#
 SCRIPT-VERSION: v1  (Oct 17 2026, the pre-session briefing round)

 Ships branch claude/briefing-round-b4c953. AJ, Oct 16 2026: adding one
 machine on the briefing "is like five or six clicks ... maybe two at max,
 three. But definitely not more than four." His handoff (Oct 17) and his
 answers ("1b 2a 3a", then "Build phase 4, the just-for-me notes, now").
 docs\rounds\2026-10-17-briefing.md is the round.

 It also carries the two commits the round was built on, from the live
 review (Oct 16): the dev server's speed fix (vite.config.ts, the dev server
 only) and Admins -> Studios -> Waiting to be let in.

 WHAT GOES TO PRODUCTION (golive, after GO):
   1. the restore tag restore/2026-10-17-before-briefing at master;
   2. git push origin claude/briefing-round-b4c953:master, fast-forward only;
   3. then YOU press, on Render: Manual Deploy on the WEB SERVICE, and Manual
      Build on BOTH cron jobs (journey-cron-renewals,
      journey-cron-leaderboards), as every release.
 No rules, no index, no Cloud Function, no Mindbody change, no data written
 by the ship. Nothing contacts anyone. The "just for me" notes live in each
 trainer's own Relay notebook, which the rules already keep private, so there
 is no Firebase step.

 Run it from THIS worktree's folder, in PowerShell, IN ORDER:

   cd C:\Users\austi\Projects\Journey-System-Beta-master\.claude\worktrees\briefing-round-b4c953
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-briefing.ps1 -Stage prepare
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-briefing.ps1 -Stage golive

 prepare  changes nothing in production. It fetches from GitHub, checks the
          branch still fast-forwards master and touches only the app, its
          tests and documents (never firestore.rules, the indexes, functions
          or the server), LF and the case check, then the typecheck COUNT
          (2), the whole suite, and a production build with the first
          screen's size budget. Ends PREPARE PASSED. About 10 to 20 minutes.

 golive   refuses unless prepare passed on exactly this branch and master;
          asks for GO; does 1-2 above; prints the Render steps and the undo.

 To undo: a revert on master (golive prints it), never a force push.

 ASCII only on purpose (Windows PowerShell 5.1 reads a script as ANSI).
#>

param([Parameter(Mandatory = $true, Position = 0)][ValidateSet('prepare', 'golive')][string]$Stage)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-briefing.log'
$PreparedFile = Join-Path $Root 'logs\ship-briefing.prepared'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$ShipBranch = 'claude/briefing-round-b4c953'
# The last code commit (phase 4), which must be on the branch, and the master it was built on.
$CodeCommit = '151f4bae'
$BuiltOn = '9b36d4d5'
$RestoreTag = 'restore/2026-10-17-before-briefing'
$TscBaseline = 2
# What this branch may change: the app, its tests and documents, the preview,
# the dev server's settings, this script. Anything else (firestore.rules, the
# indexes, functions, the server, the packages) means it is not the round
# Claude built.
$Allowed = '^(src/|docs/|CLAUDE\.md$|tests/firestore\.rules\.test\.ts$|harness/briefing/|vite\.config\.ts$|scripts/ship/ship-briefing\.ps1$)'

function Log {
  param([string]$m, [string]$c = 'Gray')
  $l = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m
  Write-Host $l -ForegroundColor $c
  Add-Content -Path $LogFile -Value $l -Encoding utf8
}

function Run {
  param([string]$label, [string]$cmd)
  Log "--- $label ---" 'Cyan'
  Log "> $cmd"
  $out = & cmd /c "$cmd 2>&1"
  $code = $LASTEXITCODE
  $out | ForEach-Object { Add-Content -Path $LogFile -Value $_ -Encoding utf8 }
  $out | Select-Object -Last 18 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
  Log "$label exit code: $code" $(if ($code -eq 0) { 'Green' } else { 'Yellow' })
  return @{ Code = $code; Output = $out }
}

function Stop-Here {
  param([string]$why)
  Log "STOP: $why" 'Red'
  Log "Nothing further was done. The log is $LogFile" 'Red'
  exit 1
}

function Must {
  param($result, [string]$what)
  if ($result.Code -ne 0) { Stop-Here "$what failed (above, and in the log). Nothing is pushed. Ask Claude with the log." }
}

Log "ship-briefing $Stage" 'White'

$top = (& git --no-optional-locks rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not (Test-Path 'package.json') -or ((Resolve-Path $top).Path -ne (Get-Location).Path)) { Stop-Here 'run this from the top of the briefing-round-b4c953 worktree folder.' }
$cur = "$(& git --no-optional-locks symbolic-ref --quiet --short HEAD)".Trim()
if ($cur -ne $ShipBranch) { Stop-Here "this folder is on '$cur', not $ShipBranch. Run it from .claude\worktrees\briefing-round-b4c953." }

Log 'Fetching from GitHub (reads only)' 'Cyan'
& git fetch -q origin
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not reach GitHub.' }
$MasterSha = (& git --no-optional-locks rev-parse origin/master).Trim()
$BranchSha = (& git --no-optional-locks rev-parse HEAD).Trim()

if ($Stage -eq 'prepare') {
  if (Test-Path $PreparedFile) { Remove-Item -Force $PreparedFile }

  & git --no-optional-locks merge-base --is-ancestor $CodeCommit HEAD
  if ($LASTEXITCODE -ne 0) { Stop-Here "the code commit $CodeCommit is not on this branch. Ask Claude." }
  & git --no-optional-locks merge-base --is-ancestor $MasterSha HEAD
  if ($LASTEXITCODE -ne 0) { Stop-Here "master on GitHub moved since this was built on $BuiltOn (now $($MasterSha.Substring(0, 8))). Ask Claude to bring master into the branch." }
  Log "The branch fast-forwards master ($($MasterSha.Substring(0, 8)))." 'Green'

  $dirty = @(& git --no-optional-locks status --porcelain --untracked-files=no | Where-Object { $_ })
  if ($dirty.Count -gt 0) {
    $dirty | ForEach-Object { Log "   $_" 'Red' }
    Stop-Here 'files in this folder are changed and not committed (above). Ask Claude.'
  }
  $changed = @(& git --no-optional-locks diff --name-only "$MasterSha..HEAD" | Where-Object { $_ })
  $outside = @($changed | Where-Object { $_ -notmatch $Allowed })
  if ($outside.Count -gt 0) {
    $outside | ForEach-Object { Log "   $_" 'Red' }
    Stop-Here 'the branch changes files outside the app, its tests and documents (above). That is not the round Claude built. Ask Claude.'
  }
  Log "The branch changes $($changed.Count) file(s): the app, its tests and documents; never the rules, indexes, functions or server." 'Green'

  $crlf = @(& git --no-optional-locks ls-files --eol | Where-Object { "$_" -match 'w/crlf' })
  if ($crlf.Count -gt 0) {
    $crlf | Select-Object -First 10 | ForEach-Object { Log "   $_" 'Red' }
    Stop-Here "$($crlf.Count) file(s) in this folder have Windows line ends (CRLF), and the suite fails on them. Ask Claude to convert them to LF; nothing is wrong with the code."
  }
  Log 'Line ends: every file in this folder is LF.' 'Green'
  $dups = @(& git --no-optional-locks ls-files | ForEach-Object { $_.ToLowerInvariant() } | Group-Object | Where-Object { $_.Count -gt 1 })
  if ($dups.Count -gt 0) { $dups | ForEach-Object { Log "   $($_.Name)" 'Red' }; Stop-Here 'two tracked files differ only by case.' }
  Log 'Case check: no two files differ only by case.' 'Green'

  if (-not (Test-Path 'node_modules\.bin')) { Stop-Here 'node_modules is missing in this folder (it is a link to the main folder''s). Ask Claude.' }
  if (-not (Test-Path 'firebase-applet-config.json')) { Stop-Here 'firebase-applet-config.json is missing in this folder (copy it from the main folder). Ask Claude.' }

  $tsc = Run 'typecheck (count)' 'npx tsc --noEmit'
  $count = @($tsc.Output | Where-Object { "$_" -match 'error TS' }).Count
  if ($count -gt $TscBaseline) { Stop-Here "typecheck shows $count errors; the baseline is $TscBaseline." }
  Log "Typecheck: $count error(s), the baseline." 'Green'

  $env:TZ = 'America/New_York'
  Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
  Remove-Item Env:VITE_PERF_LAB -ErrorAction SilentlyContinue
  # A longer per-test limit: a few file-walking tests can pass vitest's default
  # 5 s on a loaded PC, and a timeout is not a failure of the app.
  $vt = Run 'the suite (TZ=America/New_York)' 'npx vitest run --dir src --testTimeout=30000'
  Must $vt 'the test suite'

  # A PRODUCTION build into an empty dist\, and the first screen's budget.
  if (Test-Path 'dist') { Remove-Item -Recurse -Force 'dist' }
  $env:NODE_ENV = 'production'
  try {
    $bd = Run 'build (the app, NODE_ENV=production)' 'npx vite build'
    Must $bd 'the app build'
    $budget = Run 'the first screen''s size budget' 'npm run check:bundle'
    Must $budget 'the size budget (the first screen must stay under 480 KB gzip)'
  } finally {
    Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
  }
  if (Test-Path 'dist\PERF-LAB-BUILD.txt') { Stop-Here 'dist\ is a perf lab build. It must never ship. Ask Claude.' }

  Set-Content -Path $PreparedFile -Value "$BranchSha $MasterSha" -Encoding ascii
  Log 'PREPARE PASSED. Nothing in production changed. Next: the golive stage.' 'Green'
  exit 0
}

# ---- golive -----------------------------------------------------------------------
if (-not (Test-Path $PreparedFile)) { Stop-Here 'prepare has not passed. Run the prepare stage first.' }
$recorded = (Get-Content $PreparedFile -Raw).Trim()
if ($recorded -ne "$BranchSha $MasterSha") { Stop-Here 'the branch or master changed since prepare passed. Run prepare again.' }

Log 'About to: tag master as the restore point, then push this branch to master.' 'White'
Log 'Then YOU press, on Render: Manual Deploy on the web service, and Manual Build on both cron jobs.' 'White'
$go = Read-Host 'Type GO to go live (anything else stops here)'
if ($go -ne 'GO') { Stop-Here 'not GO.' }

& git --no-optional-locks rev-parse --verify --quiet "refs/tags/$RestoreTag" | Out-Null
if ($LASTEXITCODE -ne 0) {
  $t = Run 'the restore tag' "git tag $RestoreTag $MasterSha"
  Must $t 'the restore tag'
}
$tp = Run 'push the restore tag' "git push origin $RestoreTag"
Must $tp 'pushing the restore tag'

$p = Run 'push to master (fast-forward only)' "git push origin ${ShipBranch}:master"
if ($p.Code -ne 0) { Stop-Here 'the push failed. Nothing is live. Ask Claude with the log.' }

Log 'LIVE ON GITHUB. Three buttons by hand, on Render:' 'Green'
Log '  1. the web service -> Manual Deploy -> Deploy latest commit;' 'White'
Log '  2. journey-cron-renewals -> Manual Build;' 'White'
Log '  3. journey-cron-leaderboards -> Manual Build.' 'White'
Log '  Then open https://maxstrength-app-beta.onrender.com/version.json: it names the new commit.' 'White'
Log '  Check on an iPad, in Demo Mode: a client''s briefing adds a machine in two taps (+ Add a machine, the machine); the Note''s Just for me switch; "How they''ve been doing" opens the last 8 sessions.' 'White'
Log "If you ever need to undo it: git revert --no-edit $($BuiltOn)..$($BranchSha.Substring(0, 8)), then push master. Ask Claude first." 'White'
exit 0
