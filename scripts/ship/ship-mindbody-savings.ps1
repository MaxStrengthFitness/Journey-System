<#
 SCRIPT-VERSION: v3  (Oct 12 2026, the Mindbody savings round)
   v3: the round's tests run with --dir src (v2 also ran ~600 copies in
   other folders, three of which could not find the Firebase config).
   v2: master on GitHub moved to ad89bf78 (the CI timezone fix, ci.yml only)
   after the round was built on 499fd656. Claude merged it into the branch on
   the PC (2fc91005); the round's own files are unchanged.

 Ships branch oct12/mindbody-savings: one Mindbody read of a site shared for
 two minutes, every studio on a site pulling at the same slot, and a count of
 what the 30-minute check finds that the webhook had not. AJ, Oct 12 2026:
 "We need to attempt to make our Mindbody costs as low as possible without
 sacrificing data and information." docs\rounds\2026-10-12-mindbody-savings.md
 is the round.

 The branch arrives as a git bundle (Claude built it in the cloud and could
 not push it): backups\mindbody-savings-ship\mindbody-savings.bundle. The
 bundle carries the exact commits, so their ids here match the cloud's.

 WHAT GOES TO PRODUCTION, in this order (golive, after GO):
   1. firestore.rules (npx firebase deploy --only firestore:rules --project
      prod). It only ADDS access (studios/{s}/sync/near-YYYY-MM-DD, three
      numbers), so the running app is unaffected;
   2. git push origin oct12/mindbody-savings:master, fast-forward only;
   3. then YOU press Manual Deploy on Render's WEB SERVICE (the app and the
      Mindbody proxy changed). The two cron jobs did not change.
 No Cloud Function, no index, no data migration, no Mindbody subscription
 change. Nothing contacts anyone.

 Run from the project folder (C:\Users\austi\Projects\Journey-System-Beta-master),
 in PowerShell, IN ORDER:

   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-mindbody-savings.ps1 -Stage prepare
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-mindbody-savings.ps1 -Stage golive

 prepare  changes nothing in production. It fetches from GitHub, checks
          master is still where the round was built, brings the branch in
          from the bundle and switches to it (your folder ends on the
          branch), then runs the typecheck COUNT (2), the round's tests and
          npm run test:rules. Ends PREPARE PASSED.

 golive   refuses unless prepare passed on exactly this branch and master;
          compares the LIVE rules with master's when gcloud can read them;
          asks for GO; does 1-2 above; prints the Render step and the
          rollback.

 To undo: git push origin ad89bf78:master is NOT how (never force). Undo is a
 revert on master, which golive prints; the rules change only adds access and
 needs no undo.

 ASCII only on purpose (Windows PowerShell 5.1 reads a script as ANSI).
#>

param([Parameter(Mandatory = $true, Position = 0)][ValidateSet('prepare', 'golive')][string]$Stage)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-mindbody-savings.log'
$PreparedFile = Join-Path $Root 'logs\ship-mindbody-savings.prepared'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$ShipBranch = 'oct12/mindbody-savings'
$BundlePath = Join-Path $Root 'backups\mindbody-savings-ship\mindbody-savings.bundle'
# GitHub master the branch fast-forwards, and the branch with it merged in (v2).
$BaseSha = 'ad89bf783c395d5edaea603d7993b818079534bf'
$BranchExpected = '2fc91005d807e2508c585e469142554842ca0c6b'
# The round's own commits, which an undo reverts (the merge is not one of them).
$RoundFrom = '499fd656'
$RoundTo = '69a557d3'
$TscBaseline = 2
$Project = 'prod'
$Db = 'ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa'
$GcpProject = 'gen-lang-client-0731527386'
$RoundTests = @(
  'src/lib/mindbody-appointment-cache.test.ts',
  'src/lib/mindbody-api-sync.test.ts',
  'src/features/admin/syncPolicy.test.ts',
  'src/features/admin/syncPolicy.slots.test.ts',
  'src/features/admin/useAutoSync.schedule.render.test.tsx',
  'src/features/admin/useAutoSync.coverage.render.test.tsx',
  'src/features/admin/useScheduleRefresh.render.test.tsx',
  'src/features/admin/mindbody'
)

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

function Get-Port8080 {
  $conn = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $conn) { return $null }
  return Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
}

function Get-LiveRulesSource {
  try {
    $tok = (& gcloud auth print-access-token 2>$null)
    if ($LASTEXITCODE -ne 0 -or -not $tok) { return $null }
    $h = @{ Authorization = "Bearer $("$tok".Trim())"; 'x-goog-user-project' = $GcpProject }
    $rel = Invoke-RestMethod -Method Get -Headers $h -Uri "https://firebaserules.googleapis.com/v1/projects/$GcpProject/releases/cloud.firestore/$Db"
    if (-not $rel.rulesetName) { return $null }
    $rs = Invoke-RestMethod -Method Get -Headers $h -Uri "https://firebaserules.googleapis.com/v1/$($rel.rulesetName)"
    return (@($rs.source.files) | ForEach-Object { $_.content }) -join "`n"
  } catch {
    Log "Could not read the live ruleset: $($_.Exception.Message)" 'Yellow'
    return $null
  }
}

function Squash { param([string]$t) return (($t -replace "`r", '') -replace '\s+', ' ').Trim() }

Log "ship-mindbody-savings $Stage" 'White'

$top = (& git --no-optional-locks rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not (Test-Path 'package.json') -or ((Resolve-Path $top).Path -ne (Get-Location).Path)) { Stop-Here 'run this from the top of the project folder.' }

Log 'Fetching from GitHub (reads only)' 'Cyan'
& git fetch -q origin
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not reach GitHub.' }
$MasterSha = (& git --no-optional-locks rev-parse origin/master).Trim()

if ($Stage -eq 'prepare') {
  if (Test-Path $PreparedFile) { Remove-Item -Force $PreparedFile }

  # The branch: in from the bundle, unless it is already here.
  & git --no-optional-locks rev-parse --verify --quiet "refs/heads/$ShipBranch" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    if (-not (Test-Path $BundlePath)) { Stop-Here "the bundle is missing: $BundlePath. Ask Claude." }
    $v = Run 'check the bundle' "git bundle verify `"$BundlePath`""
    if ($v.Code -ne 0) { Stop-Here 'the bundle does not verify (git bundle verify, above). Ask Claude.' }
    $f = Run 'bring the branch in' "git fetch `"$BundlePath`" ${ShipBranch}:${ShipBranch}"
    if ($f.Code -ne 0) { Stop-Here 'could not bring the branch in from the bundle. Ask Claude.' }
  }
  $BranchSha = (& git --no-optional-locks rev-parse $ShipBranch).Trim()
  if ($BranchSha -ne $BranchExpected) { Stop-Here "$ShipBranch is $BranchSha, not the round Claude built ($BranchExpected). Ask Claude." }
  Log "Branch $ShipBranch is the round Claude built ($($BranchSha.Substring(0, 8)))." 'Green'

  if ($MasterSha -ne $BaseSha) {
    & git --no-optional-locks merge-base --is-ancestor $MasterSha $ShipBranch
    if ($LASTEXITCODE -ne 0) { Stop-Here "master on GitHub moved since the round was built (now $($MasterSha.Substring(0, 8)), built on $($BaseSha.Substring(0, 8))). Ask Claude to bring master into the branch." }
  }
  Log "The branch fast-forwards master ($($MasterSha.Substring(0, 8)))." 'Green'

  # Switch to it. git refuses by itself if a change of yours would be lost.
  $cur = "$(& git --no-optional-locks symbolic-ref --quiet --short HEAD)".Trim()
  if ($cur -ne $ShipBranch) {
    $sw = Run "switch to $ShipBranch" "git switch $ShipBranch"
    if ($sw.Code -ne 0) { Stop-Here "git would not switch to $ShipBranch (above): usually a file you changed. Ask Claude; nothing was changed." }
  }
  $dirty = (& git --no-optional-locks status --porcelain --untracked-files=no -- src server server.ts tests firestore.rules) | Where-Object { $_ }
  if ($dirty) {
    $dirty | ForEach-Object { Log "   $_" 'Red' }
    Stop-Here 'files the round tests are changed on this PC (above). Ask Claude.'
  }

  $tsc = Run 'typecheck (count)' 'npx tsc --noEmit'
  $count = @($tsc.Output | Where-Object { "$_" -match 'error TS' }).Count
  if ($count -gt $TscBaseline) { Stop-Here "typecheck shows $count errors; the baseline is $TscBaseline." }
  Log "Typecheck: $count error(s), the baseline." 'Green'

  $env:TZ = 'America/New_York'
  # --dir src: the names below are filters, and without it they also match the
  # copies in .claude\worktrees and harness scratch folders (v3).
  $t = Run "the round's tests" ("npx vitest run --dir src --testTimeout=30000 " + ($RoundTests -join ' '))
  if ($t.Code -ne 0) { Stop-Here "the round's tests failed (above, and in the log)." }

  $held = Get-Port8080
  if ($held) {
    Log "Port 8080 is held by $($held.ProcessName) (PID $($held.Id))." 'Yellow'
    if ($held.ProcessName -ne 'java') { Stop-Here 'something other than an old emulator holds port 8080. Close it and run prepare again.' }
    $answer = Read-Host 'That is almost certainly an emulator an earlier run left behind. Type STOP to stop it (Enter to stop here)'
    if ($answer -ne 'STOP') { Stop-Here 'port 8080 is taken.' }
    Stop-Process -Id $held.Id -Force
    Start-Sleep -Seconds 2
  }
  $runStarted = Get-Date
  $rt = Run 'rules tests' 'npm run test:rules'
  $left = Get-Port8080
  if ($left -and $left.ProcessName -eq 'java' -and $left.StartTime -gt $runStarted) {
    Stop-Process -Id $left.Id -Force -ErrorAction SilentlyContinue
  }
  if ($rt.Code -ne 0) { Stop-Here 'test:rules failed (it needs JDK 21). Nothing is live; ask Claude with the log.' }

  Set-Content -Path $PreparedFile -Value "$BranchSha $MasterSha" -Encoding ascii
  Log 'PREPARE PASSED. Nothing in production changed. Next: the golive stage.' 'Green'
  exit 0
}

# ---- golive -----------------------------------------------------------------------
if (-not (Test-Path $PreparedFile)) { Stop-Here 'prepare has not passed. Run the prepare stage first.' }
$BranchSha = (& git --no-optional-locks rev-parse $ShipBranch).Trim()
$recorded = (Get-Content $PreparedFile -Raw).Trim()
if ($recorded -ne "$BranchSha $MasterSha") { Stop-Here 'the branch or master changed since prepare passed. Run prepare again.' }
$cur = "$(& git --no-optional-locks symbolic-ref --quiet --short HEAD)".Trim()
if ($cur -ne $ShipBranch) { Stop-Here "this folder is on '$cur', not $ShipBranch. Run prepare again." }

# The live rules must be master's (else this deploy would undo someone's).
$live = Get-LiveRulesSource
$masterRules = (& git --no-optional-locks show "origin/master:firestore.rules") -join "`n"
if ($live -eq $null) {
  Log 'Could not read the LIVE rules (gcloud not signed in?). The check that they are master''s is skipped.' 'Yellow'
} elseif ((Squash $live) -ne (Squash $masterRules)) {
  Stop-Here 'the LIVE rules are not master''s firestore.rules, so deploying this branch''s rules could undo a change someone deployed from elsewhere. Ask Claude.'
} else {
  Log 'The LIVE rules are master''s. Good.' 'Green'
}

Log 'About to: deploy firestore.rules (adds one small permission), then push the branch to master.' 'White'
Log 'Then YOU press Manual Deploy on Render''s web service.' 'White'
$go = Read-Host 'Type GO to go live (anything else stops here)'
if ($go -ne 'GO') { Stop-Here 'not GO.' }

$r = Run "deploy firestore.rules (project $Project)" "npx firebase deploy --only firestore:rules --project $Project"
if ($r.Code -ne 0) { Stop-Here 'the rules deploy failed. Nothing else was done; the app is unchanged.' }

$p = Run 'push to master (fast-forward only)' "git push origin ${ShipBranch}:master"
if ($p.Code -ne 0) { Stop-Here 'the push failed. The rules ARE live (they only add access, so nothing breaks). Run golive again after fixing the push, or ask Claude.' }

Log 'LIVE ON GITHUB. Two more steps by hand:' 'Green'
Log '  1. Render -> the web service -> Manual Deploy -> Deploy latest commit. (The cron jobs did not change.)' 'White'
Log '  2. After it is live, Render -> the web service -> Logs, search staff-appointments.' 'White'
Log '     "shared read (... no Mindbody call)" or "joined a read in flight" is a call saved.' 'White'
Log 'To go back to master in this folder later: git switch master, then git merge --ff-only origin/master.' 'White'
Log "If you ever need to undo the code: git revert --no-edit $RoundFrom..$RoundTo, then push master. Ask Claude first." 'White'
exit 0
