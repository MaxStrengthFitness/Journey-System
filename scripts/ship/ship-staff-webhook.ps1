<#
 DO NOT RUN THIS ONE. This round ships inside the Oct 12 release, with
 scripts\ship\ship-oct12.ps1 (docs\rounds\2026-10-12-release.md). This script
 is kept for the record only.

 SCRIPT-VERSION: v1  (Oct 12 2026, the staff webhook)

 Ships branch oct12/staff-webhook: the Mindbody webhook matches a staff update
 only to a trainer whose staff number is on the update's site, and looks a
 booking's trainer up at the booking's studio. AJ, Oct 12 2026: "2 and 3 I will
 trust your decision please be sure!" docs/rounds/2026-10-12-staff-webhook.md
 is the round.

 WHAT GOES TO PRODUCTION, in this order (golive, after GO):
   1. the restore tag restore/before-staff-webhook-<today> = master as it is
      now, pushed to GitHub;
   2. the indexes (npx firebase deploy --only firestore:indexes --project
      prod --non-interactive, which never deletes an index): ONE new index,
      trainers (mindbodyStaffId, accessibleStudioIds CONTAINS);
   3. git push origin HEAD:master, fast-forward only (the code and the docs;
      Render does not deploy on a push, and the app is unchanged anyway);
   4. ONE Cloud Function: npx firebase deploy --only
      functions:mindbodyWebhook --project prod. Never a plain --only
      functions: that would also deploy the staff-photo pair, which is not
      live, and ask about every deleted function.
 No rules, no app, no server, no cron change: nothing to press on Render. No
 Mindbody call is added; nothing contacts anyone.

 Run from the branch's own folder, .claude\worktrees\staff-webhook (it is on
 the branch already; do not switch branches by hand). IN ORDER:

   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-staff-webhook.ps1 -Stage prepare
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-staff-webhook.ps1 -Stage golive

 prepare  changes nothing in production and nothing in git (it writes only
          logs\): the branch, a clean tree, the fetch, that the branch
          fast-forwards master, that master's functions\ is the live one
          (unchanged since 3735f38e, the last functions deploy), that the
          branch changes only the files this round names, the Firebase
          login, the restore tag free, no Windows line ends, the case check,
          firestore.indexes.json (parses, no field overrides, master's
          indexes plus exactly one), the functions typecheck and tests, the
          index guard (every query has its index) and the app's typecheck
          COUNT (2). It records what it tested in
          logs\ship-staff-webhook.prepared. Ends PREPARE PASSED.

 golive   refuses unless the branch and master are exactly what prepare
          recorded; runs the READ-ONLY check scripts\check-staff-sites.ts
          when it finds a service-account key (it writes nothing; it lists
          shared staff numbers, Mindbody details from elsewhere, and the
          trainers whose staff updates will now wait in Limbo); asks for GO;
          then does 1-4 above and stops at the first failure (each stop says
          what is already live). Then it prints the checks and the rollback.

 To undo the function: deploy it again from a checkout of the restore tag
 (golive prints the commands, junctions included). The index needs no undo.
 Nothing about what is stored changed, so there is no data to undo.

 ASCII only on purpose (Windows PowerShell 5.1 reads a script as ANSI).
#>

param([Parameter(Mandatory = $true, Position = 0)][ValidateSet('prepare', 'golive')][string]$Stage)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-staff-webhook.log'
# What prepare tested: "<branch sha> <origin/master sha>". golive reads it.
$PreparedFile = Join-Path $Root 'logs\ship-staff-webhook.prepared'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$Branch = 'oct12/staff-webhook'
$RestoreTag = "restore/before-staff-webhook-$(Get-Date -Format 'yyyy-MM-dd')"
# The last functions deploy (ship-speed.ps1 golive, Oct 6 2026). master's
# functions\ must still be exactly this, or something else changed the
# functions since and the restore tag would not be what runs today.
$LiveFunctionsAt = '3735f38e'
# 2 since the Hub fixes (Oct 1): clinical-review/charts.tsx and
# EditTrainerModal.tsx. More is new.
$TscBaseline = 2
$DeployFunction = 'functions:mindbodyWebhook'
$Project = 'prod'
$Db = 'ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa'
$GcpProject = 'gen-lang-client-0731527386'
# Every path this round may change. Anything else on the branch: stop.
$AllowedPaths = @(
  'functions/src/mindbody/index.ts',
  'functions/src/mindbody/index.test.ts',
  'functions/src/mindbody/staffResolver.ts',
  'functions/src/mindbody/staffResolver.test.ts',
  'functions/src/mindbody/staffSite.ts',
  'functions/src/mindbody/staffSite.test.ts',
  'firestore.indexes.json',
  'scripts/check-staff-sites.ts',
  'scripts/ship/ship-staff-webhook.ps1'
)
$Started = Get-Date

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

# A command whose questions must be seen and answered (the functions deploy
# can ask how long to keep container images): straight to the console, not
# captured, so nothing waits invisibly. Its output is not in the log.
function Run-Visible {
  param([string]$label, [string]$cmd)
  Log "--- $label (output on screen, not in the log) ---" 'Cyan'
  Log "> $cmd"
  & cmd /c $cmd
  $code = $LASTEXITCODE
  Log "$label exit code: $code" $(if ($code -eq 0) { 'Green' } else { 'Yellow' })
  return @{ Code = $code; Output = @() }
}

function Stop-Here {
  param([string]$why)
  Log "STOP: $why" 'Red'
  Log "Nothing further was done. The log is $LogFile" 'Red'
  exit 1
}

function Must {
  param([hashtable]$r, [string]$what)
  if ($r.Code -ne 0) { Stop-Here "$what failed." }
}

Log "ship-staff-webhook $Stage" 'White'

$top = (& git --no-optional-locks rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not (Test-Path 'package.json') -or -not (Test-Path 'scripts\ship\ship-staff-webhook.ps1') -or ((Resolve-Path $top).Path -ne (Get-Location).Path)) { Stop-Here 'run this from the top of the branch''s folder, .claude\worktrees\staff-webhook.' }

# The main checkout (where node_modules, functions\node_modules and the
# service-account key live): the parent of git's common folder.
$commonDir = (& git --no-optional-locks rev-parse --path-format=absolute --git-common-dir 2>$null)
$MainRoot = if ($LASTEXITCODE -eq 0 -and $commonDir) { Split-Path -Parent ($commonDir.Trim() -replace '/', '\') } else { $Root }

# ---- in the branch's folder, on the branch ------------------------------------------
$head = (& git --no-optional-locks symbolic-ref --quiet --short HEAD)
if ($LASTEXITCODE -ne 0 -or "$head".Trim() -ne $Branch) { Stop-Here "this folder is on '$head', not $Branch. Run it from .claude\worktrees\staff-webhook, or ask Claude; do not switch branches by hand." }
$dirty = (& git --no-optional-locks status --porcelain --untracked-files=no) | Where-Object { $_ }
if ($dirty) {
  Log 'Uncommitted changes:' 'Red'
  $dirty | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'the branch has uncommitted changes. Everything that ships must be committed first (if git shows every file as changed but git diff shows nothing, ask Claude: that is line ends, not code).'
}
$untracked = (& git --no-optional-locks status --porcelain -- functions\src firestore.indexes.json) | Where-Object { "$_" -like '`?`? *' }
if ($untracked) {
  Log 'Files under functions\src that git does not track:' 'Red'
  $untracked | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'untracked files under functions\src would be deployed here but not shipped. Commit or remove them first.'
}

Log 'Fetching from GitHub (reads only)' 'Cyan'
& git fetch -q origin
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not reach GitHub.' }

$BranchSha = (& git --no-optional-locks rev-parse $Branch).Trim()
$MasterSha = (& git --no-optional-locks rev-parse origin/master).Trim()

& git --no-optional-locks merge-base --is-ancestor origin/master $Branch
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch does not fast-forward master (master moved since the round was built). Ask Claude to bring master into the branch first." }

$ahead = (& git --no-optional-locks rev-list --count "origin/master..$Branch").Trim()
if ([int]$ahead -eq 0) {
  if ($Stage -eq 'golive') {
    Log 'master already has this branch. If golive stopped at the function deploy, the LIVE webhook may still be the old one. To deploy it, from this folder:' 'Yellow'
    Log "   npx firebase deploy --only $DeployFunction --project $Project" 'Yellow'
    Log '(Never a plain --only functions.)' 'Yellow'
    exit 0
  }
  Log 'master already has everything on the branch. Nothing to ship.' 'Green'; exit 0
}
Log "$ahead commit(s) will go to master:" 'Green'
& git --no-optional-locks log --oneline "origin/master..$Branch" | ForEach-Object { Log "   $_" }

# master's functions\ must be the live ones (unchanged since the last deploy).
& git --no-optional-locks cat-file -e "$LiveFunctionsAt^{commit}" 2>$null
if ($LASTEXITCODE -ne 0) { Stop-Here "this checkout does not know $LiveFunctionsAt (the last functions deploy). Ask Claude." }
& git --no-optional-locks diff --quiet $LiveFunctionsAt origin/master -- functions
if ($LASTEXITCODE -ne 0) { Stop-Here "master's functions\ changed since $LiveFunctionsAt (the last functions deploy, Oct 6 2026), so the restore tag would not be what runs today. Ask Claude." }
Log "master's functions\ is the live one (unchanged since $LiveFunctionsAt)." 'Green'

if ($Stage -eq 'prepare') {
  if (Test-Path $PreparedFile) { Remove-Item -Force $PreparedFile }

  # Only the files this round names, plus documents.
  $changed = @(& git --no-optional-locks diff --name-only origin/master $Branch) | Where-Object { $_ }
  $outside = @($changed | Where-Object { ($AllowedPaths -notcontains $_) -and (-not ("$_" -like 'docs/*')) })
  if ($outside.Count -gt 0) {
    $outside | ForEach-Object { Log "   $_" 'Red' }
    Stop-Here 'the branch changes files this round does not name (above). golive would push them, and functions\ ones would deploy. Ask Claude.'
  }
  Log 'The branch changes only the round''s files:' 'Green'
  $changed | ForEach-Object { Log "   $_" }

  $fl = Run 'Firebase login' 'npx firebase login:list'
  Must $fl 'the Firebase login check'
  if (-not (@($fl.Output) -match '@')) { Stop-Here 'no Firebase login on this PC. Run: npx firebase login, then prepare again.' }

  # The restore point golive will make: free, or already master as it is now.
  $tagOnGitHub = & git --no-optional-locks ls-remote --tags origin "refs/tags/$RestoreTag"
  if ($LASTEXITCODE -ne 0) { Stop-Here 'could not ask GitHub for its tags.' }
  if ($tagOnGitHub) {
    $remoteSha = ("$tagOnGitHub" -split '\s+')[0]
    if ($remoteSha -ne $MasterSha) { Stop-Here "the restore tag $RestoreTag on GitHub is not master as it is now. Ask Claude." }
    Log "Restore tag $RestoreTag is already on GitHub at master ($($MasterSha.Substring(0, 7)))." 'Green'
  } else {
    Log "Restore tag $RestoreTag is free; golive makes it (dated the day golive runs) at master ($($MasterSha.Substring(0, 7)))." 'Green'
  }

  # A worktree checked out with core.autocrlf=true writes Windows line ends,
  # and the suite fails on them although nothing is wrong (docs\KNOWN-TRAPS.md,
  # the CRLF trap). Git stores LF either way.
  $crlf = @(& git --no-optional-locks ls-files --eol | Where-Object { "$_" -match 'w/crlf' })
  if ($crlf.Count -gt 0) {
    $crlf | Select-Object -First 10 | ForEach-Object { Log "   $_" 'Red' }
    Stop-Here "$($crlf.Count) file(s) in this folder have Windows line ends (CRLF), and the tests fail on them. Ask Claude to convert them to LF; nothing is wrong with the code."
  }
  Log 'Line ends: every file in this folder is LF.' 'Green'

  $dups = @(& git --no-optional-locks ls-files | ForEach-Object { $_.ToLowerInvariant() } | Group-Object | Where-Object { $_.Count -gt 1 })
  if ($dups.Count -gt 0) {
    $dups | ForEach-Object { Log "   $($_.Name)" 'Red' }
    Stop-Here 'two tracked files differ only by case.'
  }
  Log 'Case check: no two files differ only by case.' 'Green'

  # firestore.indexes.json must parse, hold no field overrides (the
  # Enterprise edition refuses them and the deploy would stop half way), and
  # be master's indexes plus exactly the one this round adds.
  try {
    $ixJson = Get-Content -Path 'firestore.indexes.json' -Raw | ConvertFrom-Json
    $ixMaster = ((& git --no-optional-locks show 'origin/master:firestore.indexes.json') -join "`n") | ConvertFrom-Json
  } catch {
    Stop-Here "firestore.indexes.json does not parse: $($_.Exception.Message)"
  }
  $ixCount = @($ixJson.indexes).Count
  $ixMasterCount = @($ixMaster.indexes).Count
  $ixOverrides = @($ixJson.fieldOverrides | Where-Object { $_ }).Count
  Log "firestore.indexes.json: $ixCount composite indexes (master $ixMasterCount), $ixOverrides field overrides." $(if ($ixOverrides -eq 0 -and $ixCount -eq $ixMasterCount + 1) { 'Green' } else { 'Red' })
  if ($ixOverrides -gt 0) { Stop-Here 'firestore.indexes.json has field overrides, which the Enterprise edition refuses. Ask Claude.' }
  if ($ixCount -ne $ixMasterCount + 1) { Stop-Here "firestore.indexes.json should be master's $ixMasterCount indexes plus one (trainers: mindbodyStaffId, accessibleStudioIds). Ask Claude." }
  $ixNew = @($ixJson.indexes | Where-Object { $_.collectionGroup -eq 'trainers' -and @($_.fields).Count -eq 2 -and $_.fields[0].fieldPath -eq 'mindbodyStaffId' -and $_.fields[1].fieldPath -eq 'accessibleStudioIds' -and $_.fields[1].arrayConfig -eq 'CONTAINS' })
  if ($ixNew.Count -ne 1) { Stop-Here 'the new index trainers (mindbodyStaffId, accessibleStudioIds CONTAINS) is not in firestore.indexes.json. Ask Claude.' }
  Log 'The new index is there: trainers (mindbodyStaffId, accessibleStudioIds CONTAINS).' 'Green'

  $env:TZ = 'America/New_York'

  # The function golive deploys: its own typecheck and tests.
  $ftc = Run 'the functions typecheck' 'cd functions && npx tsc --noEmit -p .'
  Must $ftc 'the functions typecheck'
  $ft = Run 'the functions tests (TZ=America/New_York)' 'npx vitest run --dir functions/src'
  Must $ft 'the functions tests'

  # Every query in src, server and functions\src has its index.
  $ig = Run 'the index guard (TZ=America/New_York)' 'npx vitest run src/lib/firestore-indexes.test.ts'
  Must $ig 'the index guard'

  $tsc = Run 'typecheck (the app)' 'npx tsc --noEmit'
  $errs = @($tsc.Output | Where-Object { "$_" -match 'error TS' }).Count
  Log "tsc errors: $errs (baseline $TscBaseline)" $(if ($errs -le $TscBaseline) { 'Green' } else { 'Red' })
  if ($errs -gt $TscBaseline) { Stop-Here 'more typecheck errors than the baseline.' }

  Set-Content -Path $PreparedFile -Value "$BranchSha $MasterSha" -Encoding ascii
  Log "Tested: $Branch at $($BranchSha.Substring(0, 7)), master at $($MasterSha.Substring(0, 7))." 'Green'
  Log 'THE PLAN (golive, in this order, stopping at the first failure):' 'White'
  Log '  0. The read-only check scripts\check-staff-sites.ts (if a service-account key is found), then GO.' 'White'
  Log "  1. Tag master as it is now: restore/before-staff-webhook-<the day golive runs> = $($MasterSha.Substring(0, 7)), and push the tag." 'White'
  Log "  2. npx firebase deploy --only firestore:indexes --project $Project --non-interactive (never deletes an index)." 'White'
  Log '  3. git push origin HEAD:master (fast-forward only).' 'White'
  Log "  4. npx firebase deploy --only $DeployFunction --project $Project" 'White'
  Log '  No Render step: the app is unchanged.' 'White'
  Log 'PREPARE PASSED. Next: powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-staff-webhook.ps1 -Stage golive' 'Green'
  exit 0
}

# ---- golive ------------------------------------------------------------------------
if (-not (Test-Path $PreparedFile)) { Stop-Here 'prepare has not passed on this PC. Run prepare first.' }
$prepared = ((Get-Content -Path $PreparedFile -Raw).Trim()) -split '\s+'
if ($prepared.Count -ne 2 -or $prepared[0] -ne $BranchSha) { Stop-Here "$Branch has changed since prepare passed, so this commit has not been tested. Run prepare again." }
if ($prepared[1] -ne $MasterSha) { Stop-Here "master has moved since prepare passed (tested against $($prepared[1].Substring(0, 7)), now $($MasterSha.Substring(0, 7))). Ask Claude." }
Log "prepare passed on this commit ($($BranchSha.Substring(0, 7))) onto this master ($($MasterSha.Substring(0, 7)))." 'Green'
# The functions deploy builds functions\ from THIS folder.
& git --no-optional-locks diff --quiet HEAD -- functions
if ($LASTEXITCODE -ne 0) { Stop-Here 'there are uncommitted changes under functions\, and they would deploy. Ask Claude.' }

# 0. The read-only check: what the new rule will do with today's trainers.
$key = @((Join-Path $Root 'service-account.json'), (Join-Path $MainRoot 'service-account.json')) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($key) {
  $chk = Run 'the read-only check of trainers'' staff sites (writes nothing)' "npx tsx scripts/check-staff-sites.ts --key `"$key`" --project $GcpProject --database $Db"
  Write-Host ''
  $chk.Output | Where-Object { "$_" -match '^(1\.|2\.|3\.|   |SUMMARY)' } | ForEach-Object { Write-Host "  $_" -ForegroundColor White }
  if ($chk.Code -ne 0) { Log 'The check did not finish (see the log). It is only a report; you may still go ahead.' 'Yellow' }
  Log 'List 3 is the trainers whose Mindbody staff updates will wait in Limbo from now on (their details stop refreshing; nothing wrong is written).' 'Yellow'
  Log 'List 2 is details that may be someone else''s, from before the fix. They correct themselves the next time Mindbody sends that trainer''s own update (with their name). Relinking in Edit Trainer only changes the number; it does not clear them. Ask Claude if any look wrong.' 'Yellow'
} else {
  Log "No service-account.json in $Root or $MainRoot, so the read-only check was skipped. Run it later (docs\rounds\2026-10-12-staff-webhook.md section 6)." 'Yellow'
}

Write-Host ''
Write-Host 'This tags the restore point, then changes PRODUCTION, in order:' -ForegroundColor Yellow
Write-Host '  one new Firestore index (it builds in the background; nothing waits on it),' -ForegroundColor Yellow
Write-Host '  pushes the branch to master (Render does not deploy on a push; the app is unchanged),' -ForegroundColor Yellow
Write-Host "  then deploys ONE Cloud Function, mindbodyWebhook." -ForegroundColor Yellow
Write-Host 'Nothing is asked of or written to Mindbody; nothing contacts anyone.' -ForegroundColor Yellow
if ((Read-Host 'Type GO to tag, deploy and push') -ne 'GO') { Log 'Nothing tagged, deployed or pushed.' 'Yellow'; exit 0 }

# 1. The restore point: master as it is now.
$tagOnGitHub = & git --no-optional-locks ls-remote --tags origin "refs/tags/$RestoreTag"
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not ask GitHub for its tags. Nothing was deployed or pushed.' }
if (-not $tagOnGitHub) {
  $local = & git --no-optional-locks tag -l $RestoreTag
  if (-not $local) {
    & git tag $RestoreTag origin/master
    if ($LASTEXITCODE -ne 0) { Stop-Here "could not make the restore tag $RestoreTag. Nothing was deployed or pushed." }
  } else {
    $tagSha = (& git --no-optional-locks rev-parse "$RestoreTag^{commit}").Trim()
    if ($tagSha -ne $MasterSha) { Stop-Here "the restore tag $RestoreTag on this PC is not master as it is now. Ask Claude to remove it; nothing was deployed or pushed." }
  }
  $tp = Run "push the restore tag $RestoreTag" "git push origin refs/tags/$RestoreTag"
  Must $tp 'pushing the restore tag (nothing was deployed or pushed)'
} else {
  $remoteSha = ("$tagOnGitHub" -split '\s+')[0]
  if ($remoteSha -ne $MasterSha) { Stop-Here "the restore tag $RestoreTag on GitHub is not master as it is now. Ask Claude; nothing was deployed or pushed." }
}
Log "Restore point on GitHub: $RestoreTag = $($MasterSha.Substring(0, 7))" 'Green'

# 2. The index. It builds in the background; until it is Enabled the
#    "also works here" lookup still answers, by reading a little more.
#    --non-interactive: an index in production that is not in the file is
#    left alone, never deleted. Never --force (it would delete the two TTL
#    policies the file does not hold).
$idx = Run "deploy firestore.indexes.json (project $Project)" "npx firebase deploy --only firestore:indexes --project $Project --non-interactive"
if ($idx.Code -ne 0) { Stop-Here 'the index deploy failed. The function is unchanged and nothing was pushed.' }
Log 'Index deployed to production (it finishes building by itself).' 'Green'

# 3. The push, fast-forward only (git refuses anything else without --force,
#    which this script never passes). Checked again against GitHub first.
& git fetch -q origin
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not reach GitHub before the push. The index is deployed (harmless); the function is unchanged. Run golive again once GitHub answers.' }
if ((& git --no-optional-locks rev-parse origin/master).Trim() -ne $MasterSha) { Stop-Here 'master moved while golive ran. The index is deployed (harmless); the function is unchanged. Ask Claude.' }
& git --no-optional-locks merge-base --is-ancestor origin/master HEAD
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch no longer fast-forwards master. The index is deployed (harmless); the function is unchanged. Ask Claude." }
$push = Run 'git push origin HEAD:master' 'git push origin HEAD:master'
Must $push 'the push. The index is deployed (harmless); the function is unchanged'

# 4. The one function, by name.
$fd = Run-Visible 'deploy the webhook function' "npx firebase deploy --only $DeployFunction --project $Project"
if ($fd.Code -ne 0) { Stop-Here "the function deploy failed. The index is deployed and master has the code, but the LIVE webhook is still the old one. Run: npx firebase deploy --only $DeployFunction --project $Project  from this folder once it is fixed (ask Claude)." }
Log "Deployed: $DeployFunction" 'Green'

$restoreDir = Join-Path (Split-Path -Parent $MainRoot) 'journey-restore-staff-webhook'
Log "GOLIVE COMPLETE. master = $((& git --no-optional-locks rev-parse --short origin/master).Trim()); $DeployFunction is live." 'Green'
Log 'No Render step: the app, the server and the crons are unchanged.' 'Green'
Log '' 'White'
Log 'NOW, BY HAND (ten minutes; docs\rounds\2026-10-12-staff-webhook.md section 8):' 'White'
Log '1. Firebase console -> Functions -> mindbodyWebhook -> Logs: no errors on the next bookings.' 'White'
Log '2. Admins -> Machinery -> Limbo: any new staff rows read as plain sentences (who holds the number, and why nothing was written).' 'White'
Log '3. Admins -> Machinery -> Mindbody sync: every studio healthy.' 'White'
Log '4. Watch the next booking the front desk makes or moves for a linked trainer: their name shows on the Hub within a minute. (Do not make a booking just to test; Mindbody may email the client.)' 'White'
Log '5. Firebase console -> Firestore -> the named database -> Indexes: the new trainers index says Enabled (minutes).' 'White'
Log '' 'White'
Log "TO UNDO the function (the index needs no undo; nothing stored changed), in PowerShell from $MainRoot :" 'White'
Log '   git fetch origin --tags' 'White'
Log "   git worktree add `"$restoreDir`" $RestoreTag" 'White'
Log "   cmd /c mklink /J `"$restoreDir\node_modules`" `"$MainRoot\node_modules`"" 'White'
Log "   cmd /c mklink /J `"$restoreDir\functions\node_modules`" `"$MainRoot\functions\node_modules`"" 'White'
Log "   cd `"$restoreDir`"" 'White'
Log "   npx firebase deploy --only $DeployFunction --project $Project" 'White'
Log '   (npm ci and npm ci --prefix functions in that folder do the same as the two links, more slowly.)' 'White'
Log '   Never a plain --only functions. Reverting master afterwards is optional (ask Claude).' 'White'
$elapsed = [int]((Get-Date) - $Started).TotalMinutes
Log "Done in about $elapsed minute(s)." 'Green'
exit 0
