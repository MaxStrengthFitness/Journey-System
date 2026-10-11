<#
 SCRIPT-VERSION: v1  (Oct 10 2026, the franchise partition)

 Ships branch oct10/franchise-partition: the franchise partition of Oct 10
 2026, ROADMAP Gate B (docs\rounds\2026-10-10-franchise-partition.md is the
 round). AJ, Oct 10 2026: "take it away i like your ideas" (the proposal
 page's 1a 2a 3a; 3a: the partition first). A franchise owner leads their home
 studio and the studios an administrator marked them as owning
 (trainers/{uid}.ownedStudioIds), exactly as a studio leader leads theirs, and
 nothing anywhere else. Built on master as it is on GitHub (c11151dc, the
 rooms round's ship). In it:

   - firestore.rules: every company-wide franchise branch gone; the owner
     beside the leaders in the two leader helpers; identity (a studio's
     Mindbody link, network and owner, a network's studios and owners,
     anyone's ownedStudioIds) administrators' only; the caller's role from
     their own trainer document on every write that hands out authority;
     access requests and notices per studio;
   - one new index, access_requests (status, studioId), for the leader's
     second access-request query;
   - the app: the one answer for "which studios does this person run", the
     staff editor's limits, the Mindbody link locked on My Studio, the Owns
     control on Admins, the announcement reach and the network focus;
   - the server: the Mindbody proxy's gate (src\lib\staff-access.ts,
     server\auth.ts, server.ts) scopes a franchise owner to their studios'
     sites. No Mindbody route, call, credential or cadence changes.

 THE ORDER IS REVERSED on purpose. This round takes access away, so the new
 app goes live BEFORE the narrowed rules: the old app under the new rules is
 refused (the leader's status-only access-request listener, an old bundle's
 Mindbody Site edit); the new app under the old rules is safe (every new
 query is narrower and the old rules allow all of it). So three stages:

   prepare  changes nothing in production and nothing in git (it reads GitHub
            with git ls-remote and the live rules with the key, and writes
            only logs\, dist\ and build\): the branch, a clean tree, that
            master on GitHub is c11151dc or already the branch's head, that
            the branch fast-forwards c11151dc, that functions\ and
            render.yaml did NOT change while firestore.rules,
            firestore.indexes.json, src\lib\staff-access.ts, server\auth.ts
            and server.ts DID, the round's rules in the file, the new index
            in the file and no field overrides, the Firebase login, the
            restore tag free or already c11151dc, the live rules (c11151dc's
            or this branch's), package.json and its lock unchanged, no
            Windows line ends, the case check, the typecheck COUNT (2), the
            suite in Eastern time, the functions typecheck and tests, the
            builds (app, crons, server), the size budget, no perf lab marker
            in the build, the rules lint test, and the rules tests. It
            records what it tested in logs\ship-partition.prepared. Ends
            PREPARE PASSED.

   golive   refuses unless the branch is exactly what prepare tested and
            master is c11151dc or the branch's head, asks for GO, then:
              1. the index (npx firebase deploy --only firestore:indexes
                 --project prod --non-interactive; never --force);
              2. the restore tag restore/2026-10-10-before-partition =
                 c11151dc, pushed if it is not there yet;
              3. git push origin oct10/franchise-partition:master,
                 fast-forward only, ONLY while master on GitHub is still
                 c11151dc (asked again just before).
            IT DOES NOT DEPLOY THE RULES. It prints Render's three presses.

   rules    refuses unless master on GitHub is the branch's head and Render
            serves it (version.json names the commit), asks AJ to type
            LOADED once the Studio Leader's iPad has loaded the new build
            (its boot report in Render's logs, or one trip to the Hub), then
            GO, then: the rules tests again, firestore.rules deployed, and
            the LIVE check (scripts\check-live-rules.ts with the key; on a
            fallback AJ types LIVE after finding the round's rule in the
            console).

 BY HAND, between golive and rules: git pull --ff-only in the project folder;
 Render -> Manual Deploy on the web service, check version.json, then Manual
 Build on journey-cron-renewals and journey-cron-leaderboards. No Cloud
 Function; no Mindbody call, timer or cadence change; nothing contacts
 anyone.

 Run from the branch's own folder, .claude\worktrees\partition (it is on the
 branch already; do not switch branches by hand). IN ORDER:

   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-partition.ps1 -Stage prepare
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-partition.ps1 -Stage golive
   (Render, by hand; then the Studio Leader's iPad loads the new build)
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-partition.ps1 -Stage rules

 To undo, the reverse of the way in: once the rules stage has run, the rules
 from restore/2026-10-10-before-partition FIRST (docs\ops\DEPLOYS-AND-
 ROLLBACK.md, "The rules"), because the old app is refused under the new
 rules; then git push --force origin restore/2026-10-10-before-partition:master
 and Render's three presses. Before the rules stage, the push and Render
 alone. The index can stay.

 ASCII only on purpose (Windows PowerShell 5.1 reads a script as ANSI).
#>

param([Parameter(Mandatory = $true, Position = 0)][ValidateSet('prepare', 'golive', 'rules')][string]$Stage)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-partition.log'
# What prepare tested: "<branch sha> <origin master sha>". golive and rules read it.
$PreparedFile = Join-Path $Root 'logs\ship-partition.prepared'
# master's firestore.rules before this round, written for the live check.
$BaseRulesFile = Join-Path $Root 'logs\ship-partition.base.rules'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$Branch = 'oct10/franchise-partition'
$Folder = '.claude\worktrees\partition'
$RestoreTag = 'restore/2026-10-10-before-partition'
# master on GitHub once the rooms round shipped (Oct 10 2026), merged into
# this branch. If anything else lands on master first, the branch takes it in
# and this line moves with it (ask Claude).
$MasterBase = 'c11151dc'
# 2 since the Hub fixes (Oct 1): clinical-review/charts.tsx and
# EditTrainerModal.tsx. This round keeps the same two. More is new.
$TscBaseline = 2
$Project = 'prod'
$GcpProject = 'gen-lang-client-0731527386'
$Db = 'ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa'
$AppUrl = 'https://maxstrength-app-beta.onrender.com'
# The round's rules, which must be in the file deployed...
$RulesMarks = @('function roleRunsOwnStudios(', 'function othersDocChangeAllowed(', 'function authorityRole(', 'function networkFocusByOwner(')
# ...the company-wide helpers this round deletes, which must not be...
$GoneMarks = @('function isFranchiseOwnerOnly(', 'function isFranchiseOwner(', 'function grantChangeAllowed(')
# ...and what must be in the ruleset live afterwards.
$LiveRulesMarks = @('roleRunsOwnStudios', 'othersDocChangeAllowed')
# The leader's second access-request query's index.
$NewIndexFields = 'status:ASCENDING,studioId:ASCENDING'
$NewIndexSpec = 'access_requests(status, studioId)'
# The service-account key, in the project folder three levels up (a worktree
# has no copy). Only the read-only live check uses it; it prints no secret.
$ProjectFolder = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $Root))
$KeyPath = Join-Path $ProjectFolder 'service-account.json'
$HaveKey = Test-Path $KeyPath
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

# master on GitHub, read with ls-remote (no fetch, nothing written to git).
function Get-RemoteMaster {
  $line = & git --no-optional-locks ls-remote origin refs/heads/master
  if ($LASTEXITCODE -ne 0 -or -not $line) { return $null }
  return ("$line" -split '\s+')[0].Trim()
}

# The process listening on the rules emulator's port, or $null.
function Get-Port8080 {
  $conn = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $conn) { return $null }
  return Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
}

# npm run test:rules, with the emulator port freed first and afterwards.
# $whatIsLive says, on a stop, what is already in production.
function Run-RulesTests {
  param([string]$whatIsLive)
  $held = Get-Port8080
  if ($held) {
    Log "Port 8080 is held by $($held.ProcessName) (PID $($held.Id)), started $($held.StartTime)." 'Yellow'
    if ($held.ProcessName -ne 'java') { Stop-Here "something other than an old emulator holds port 8080. Close it and run this stage again. $whatIsLive" }
    $answer = Read-Host 'That is almost certainly an emulator an earlier run left behind. Type STOP to stop it (Enter to stop here)'
    if ($answer -ne 'STOP') { Stop-Here "port 8080 is taken. $whatIsLive" }
    Stop-Process -Id $held.Id -Force
    Start-Sleep -Seconds 2
    if (Get-Port8080) { Stop-Here "port 8080 is still taken. $whatIsLive" }
  }
  $runStarted = Get-Date
  $rt = Run 'rules tests' 'npm run test:rules'
  $left = Get-Port8080
  if ($left -and $left.ProcessName -eq 'java' -and $left.StartTime -gt $runStarted) {
    Log "Stopping the emulator this run left on port 8080 (PID $($left.Id))." 'Yellow'
    Stop-Process -Id $left.Id -Force -ErrorAction SilentlyContinue
  }
  if ($rt.Code -ne 0) { Stop-Here "test:rules failed (it needs a JDK, 21 or newer). $whatIsLive" }
}

# The read-only live check (scripts\check-live-rules.ts): GETs only, the key
# from the project folder. 0 the live ruleset is $rulesPath's (and holds every
# -expect, and every -index is built), 3 it differs, 4 the rules match but an
# index is missing or building, 2 no release, 1 it could not run; -1 no key.
function Check-LiveRules {
  param([string]$label, [string]$rulesPath, [string[]]$expect = @(), [string[]]$index = @())
  if (-not $HaveKey) { return -1 }
  $cmd = "npx tsx scripts/check-live-rules.ts --key `"$KeyPath`" --project $GcpProject --database $Db --rules `"$rulesPath`""
  foreach ($e in $expect) { $cmd += " --expect $e" }
  foreach ($i in $index) { $cmd += " --index `"$i`"" }
  $r = Run $label $cmd
  return $r.Code
}

# Writes master's rules before this round to logs\ for the live check.
function Write-BaseRules {
  & cmd /c "git --no-optional-locks show ${BaseSha}:firestore.rules > `"$BaseRulesFile`" 2>&1"
  if ($LASTEXITCODE -ne 0) { Stop-Here "could not write $MasterBase's firestore.rules to logs\ for the live check. Ask Claude." }
}

Log "ship-partition $Stage" 'White'

# ---- the branch's own worktree folder ------------------------------------------------
$top = (& git --no-optional-locks rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not (Test-Path 'package.json') -or -not (Test-Path 'scripts\ship\ship-partition.ps1') -or ((Resolve-Path $top).Path -ne (Get-Location).Path)) { Stop-Here "run this from the top of the branch's folder, $Folder." }
foreach ($f in @('src\lib\staff-access.ts', 'server\auth.ts', 'src\features\admin\staff\edit-limits.ts', 'src\features\admin\staff\request-readers.ts', 'src\features\admins\studios\studio-membership.ts', 'tests\firestore.rules.lint.test.ts', 'scripts\check-live-rules.ts', 'scripts\check-bundle-budget.mjs', 'docs\rounds\2026-10-10-franchise-partition.md')) {
  if (-not (Test-Path $f)) { Stop-Here "$f is missing from this folder. Ask Claude." }
}

$head = (& git --no-optional-locks symbolic-ref --quiet --short HEAD)
if ($LASTEXITCODE -ne 0 -or "$head".Trim() -ne $Branch) { Stop-Here "this folder is on '$head', not $Branch. Run it from $Folder, or ask Claude; do not switch branches by hand." }
$dirty = (& git --no-optional-locks status --porcelain --untracked-files=no -- src docs server server.ts scripts tests functions public harness index.html firestore.rules firestore.indexes.json firebase.json package.json package-lock.json vite.config.ts render.yaml CLAUDE.md ROADMAP.md .github) | Where-Object { $_ }
if ($dirty) {
  Log 'Uncommitted changes:' 'Red'
  $dirty | Select-Object -First 20 | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'the branch has uncommitted changes. Everything that ships must be committed first (if git shows every file as changed but git diff shows nothing, ask Claude: that is line ends, not code).'
}
$untracked = (& git --no-optional-locks status --porcelain -- src tests server public scripts functions\src) | Where-Object { "$_" -like '`?`? *' }
if ($untracked) {
  Log 'Files git does not track:' 'Red'
  $untracked | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'untracked files would be tested here but not shipped. Commit or remove them first.'
}

Log 'Asking GitHub where master is (git ls-remote, reads only)' 'Cyan'
$MasterSha = Get-RemoteMaster
if (-not $MasterSha) { Stop-Here 'could not reach GitHub.' }
$BaseSha = (& git --no-optional-locks rev-parse "$MasterBase^{commit}").Trim()
if ($LASTEXITCODE -ne 0) { Stop-Here "this checkout does not know $MasterBase (master before this round). Ask Claude." }
$BranchSha = (& git --no-optional-locks rev-parse $Branch).Trim()
$BranchShort = $BranchSha.Substring(0, 7)

# master is either still the round's base (golive pushes the branch) or
# already the branch's head (golive ran; rules may follow). Anything else
# went to master since and was not tested with this.
if ($MasterSha -eq $BaseSha) {
  $MasterPushed = $false
  Log "master on GitHub is $MasterBase, before this round." 'Green'
} elseif ($MasterSha -eq $BranchSha) {
  $MasterPushed = $true
  Log "master on GitHub is already this branch's head ($BranchShort)." 'Green'
} else {
  Stop-Here "master on GitHub is $($MasterSha.Substring(0, 8)): neither $MasterBase (before this round) nor this branch's head ($BranchShort). Something else went to master. Ask Claude to bring it into $Branch and test again first."
}

& git --no-optional-locks merge-base --is-ancestor $BaseSha $Branch
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch does not build on $MasterBase, so it would not fast-forward master. Ask Claude." }
$inRound = (& git --no-optional-locks rev-list --count "$BaseSha..$Branch").Trim()
Log "$inRound commit(s) in this round (on top of $MasterBase):" 'Green'
& git --no-optional-locks log --oneline "$BaseSha..$Branch" | ForEach-Object { Log "   $_" }

# What this round changes, and what it must not. Measured against the BASE,
# never master, which may already be the branch.
foreach ($p in @('firestore.rules', 'firestore.indexes.json', 'src/lib/staff-access.ts', 'server/auth.ts', 'server.ts')) {
  & git --no-optional-locks diff --quiet $BaseSha $Branch -- $p
  if ($LASTEXITCODE -eq 0) { Stop-Here "$p is the same as $MasterBase's, but this round changes it. Ask Claude." }
}
foreach ($p in @('functions', 'render.yaml', 'package.json', 'package-lock.json')) {
  & git --no-optional-locks diff --quiet $BaseSha $Branch -- $p
  if ($LASTEXITCODE -ne 0) { Stop-Here "$p changed in this round, and this round changes no Cloud Function, Render setting or dependency. Ask Claude." }
}
foreach ($mark in $RulesMarks) {
  if (-not (Select-String -Path 'firestore.rules' -SimpleMatch -Pattern $mark -Quiet)) { Stop-Here "firestore.rules does not hold '$mark'. Ask Claude." }
}
foreach ($mark in $GoneMarks) {
  if (Select-String -Path 'firestore.rules' -SimpleMatch -Pattern $mark -Quiet) { Stop-Here "firestore.rules still holds '$mark', which this round deletes. Ask Claude." }
}
Log "Against ${MasterBase}: the rules, the indexes and the server's three files CHANGED; functions\, render.yaml, package.json and its lock did not." 'Green'

# ==== prepare ===========================================================================
if ($Stage -eq 'prepare') {
  if (Test-Path $PreparedFile) { Remove-Item -Force $PreparedFile }

  Log 'What changes, by folder:' 'Yellow'
  & git --no-optional-locks diff --stat $BaseSha $Branch | Select-Object -Last 1 | ForEach-Object { Log "   $_" 'Yellow' }
  & git --no-optional-locks diff --dirstat=files,3 $BaseSha $Branch | ForEach-Object { Log "   $_" 'Yellow' }
  Log 'The rules and the index (golive deploys the index; the rules stage deploys the rules):' 'Yellow'
  & git --no-optional-locks diff --stat $BaseSha $Branch -- firestore.rules firestore.indexes.json | ForEach-Object { Log "   $_" 'Yellow' }
  Log 'The server (deployed by hand on Render with the web service):' 'Yellow'
  & git --no-optional-locks diff --stat $BaseSha $Branch -- server server.ts src/lib/staff-access.ts | ForEach-Object { Log "   $_" 'Yellow' }

  $fl = Run 'Firebase login' 'npx firebase login:list'
  Must $fl 'the Firebase login check'
  if (-not (@($fl.Output) -match '@')) { Stop-Here 'no Firebase login on this PC. Run: npx firebase login, then prepare again.' }

  # The restore point golive will make: free, or already master BEFORE the round.
  $tagOnGitHub = & git --no-optional-locks ls-remote --tags origin "refs/tags/$RestoreTag"
  if ($LASTEXITCODE -ne 0) { Stop-Here 'could not ask GitHub for its tags.' }
  if ($tagOnGitHub) {
    if ((("$tagOnGitHub" -split '\s+')[0]) -ne $BaseSha) { Stop-Here "the restore tag $RestoreTag on GitHub is not $MasterBase. Ask Claude." }
    Log "Restore tag $RestoreTag is already on GitHub at $MasterBase." 'Green'
  } else {
    if (& git --no-optional-locks tag -l $RestoreTag) {
      $tagSha = (& git --no-optional-locks rev-parse "$RestoreTag^{commit}").Trim()
      if ($tagSha -ne $BaseSha) { Stop-Here "the restore tag $RestoreTag on this PC is not $MasterBase. Ask Claude to remove it." }
    }
    Log "Restore tag ${RestoreTag}: golive makes it at $MasterBase (master before this round)." 'Green'
  }

  # The rules live now, read only: master's, or already this branch's (the
  # rules stage ran). Anything else was deployed from somewhere else.
  if ($HaveKey) {
    Write-BaseRules
    $lc = Check-LiveRules "the live rules against $MasterBase's (read only)" $BaseRulesFile
    if ($lc -eq 0) {
      Log "The rules LIVE on $Db are $MasterBase's. The rules stage replaces them, after Render." 'Green'
    } elseif ($lc -eq 3) {
      $lb = Check-LiveRules 'the live rules against this branch''s (read only)' 'firestore.rules'
      if ($lb -eq 0) { Log "The rules LIVE are already this branch's." 'Green' }
      elseif ($lb -eq 3) { Stop-Here "the rules LIVE on $Db are neither $MasterBase's nor this branch's: rules were deployed from somewhere else, and the rules stage would replace them. Ask Claude." }
      else { Log "Could not compare the live rules with this branch's (exit $lb). The rules stage asks for the console check." 'Yellow' }
    } else {
      Log "Could not read the live rules (exit $lc). The rules stage asks for the console check." 'Yellow'
    }
  } else {
    Log "The service-account key is not at $KeyPath, so the live rules were not read. The rules stage asks for the console check." 'Yellow'
  }

  # The lock: package.json and package-lock.json are unchanged since the base
  # (checked above), so the project folder needs no npm ci. Never an npm
  # command that installs here: this folder's node_modules is a junction to
  # the project folder's, and emptying one empties the other.
  Log 'Lock: package.json and package-lock.json are unchanged, so no npm ci is needed after the pull.' 'Green'

  $crlf = @(& git --no-optional-locks ls-files --eol | Where-Object { "$_" -match 'w/crlf' })
  if ($crlf.Count -gt 0) {
    $crlf | Select-Object -First 10 | ForEach-Object { Log "   $_" 'Red' }
    Stop-Here "$($crlf.Count) file(s) in this folder have Windows line ends (CRLF), and the suite fails on them. Ask Claude to convert them to LF."
  }
  Log 'Line ends: every file in this folder is LF.' 'Green'
  $dups = @(& git --no-optional-locks ls-files | ForEach-Object { $_.ToLowerInvariant() } | Group-Object | Where-Object { $_.Count -gt 1 })
  if ($dups.Count -gt 0) { $dups | ForEach-Object { Log "   $($_.Name)" 'Red' }; Stop-Here 'two tracked files differ only by case.' }
  Log 'Case check: no two files differ only by case.' 'Green'

  # firestore.indexes.json must parse, hold no field overrides (the Enterprise
  # edition refuses them and the deploy would stop half way), and hold the
  # leader's second access-request query's index.
  try {
    $ixJson = Get-Content -Path 'firestore.indexes.json' -Raw | ConvertFrom-Json
  } catch {
    Stop-Here "firestore.indexes.json does not parse: $($_.Exception.Message)"
  }
  $ixCount = @($ixJson.indexes).Count
  $ixOverrides = @($ixJson.fieldOverrides | Where-Object { $_ }).Count
  Log "firestore.indexes.json: $ixCount composite indexes, $ixOverrides field overrides." $(if ($ixOverrides -eq 0 -and $ixCount -gt 0) { 'Green' } else { 'Red' })
  if ($ixCount -eq 0) { Stop-Here 'firestore.indexes.json holds no indexes. Ask Claude.' }
  if ($ixOverrides -gt 0) { Stop-Here 'firestore.indexes.json has field overrides, which the Enterprise edition refuses. Ask Claude.' }
  $newIx = @($ixJson.indexes | Where-Object { $_.collectionGroup -eq 'access_requests' -and $_.queryScope -eq 'COLLECTION' -and ((@($_.fields | ForEach-Object { "$($_.fieldPath):$($_.order)" }) -join ',') -eq $NewIndexFields) })
  if ($newIx.Count -ne 1) { Stop-Here "firestore.indexes.json does not hold $NewIndexSpec. Ask Claude." }
  Log "firestore.indexes.json holds $NewIndexSpec." 'Green'

  $tsc = Run 'typecheck' 'npx tsc --noEmit'
  $errs = @($tsc.Output | Where-Object { "$_" -match 'error TS' }).Count
  Log "tsc errors: $errs (baseline $TscBaseline)" $(if ($errs -eq $TscBaseline) { 'Green' } else { 'Red' })
  if ($errs -gt $TscBaseline) { Stop-Here 'more typecheck errors than the baseline.' }
  if ($errs -lt $TscBaseline) { Log "Fewer typecheck errors than the baseline ($errs): not a failure, but tell Claude so the baseline moves." 'Yellow' }

  $env:TZ = 'America/New_York'
  # A longer per-test limit: a few file-walking tests can pass vitest's
  # default 5 s on a loaded PC, and a timeout is not a failure of the app.
  $vt = Run 'the suite (TZ=America/New_York)' 'npx vitest run --dir src --testTimeout=30000'
  Must $vt 'the test suite'
  Push-Location 'functions'
  try { $ftc = Run 'the functions typecheck' 'npx tsc --noEmit -p .' } finally { Pop-Location }
  Must $ftc 'the functions typecheck'
  $ft = Run 'the functions tests (TZ=America/New_York)' 'npx vitest run --dir functions/src'
  Must $ft 'the functions tests'

  # A production build: NODE_ENV unset (a "test" build ships React's
  # development files, and the budget refuses it), and never a lab build.
  Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
  Remove-Item Env:VITE_PERF_LAB -ErrorAction SilentlyContinue
  # vite.config.ts keeps dist\ between builds (emptyOutDir false), so an
  # earlier development or test build's files would still sit there and the
  # marker scan below would read them as this build's (Oct 10 2026, this
  # round's first prepare). dist\ is git-ignored build output and Render
  # starts from an empty one: clear it so the scan sees only this build.
  if (Test-Path 'dist') { Remove-Item -Recurse -Force 'dist' }
  $bd = Run 'build (the app)' 'npx vite build'
  Must $bd 'the app build'
  $bb = Run 'build (the crons)' 'npm run build:backend'
  Must $bb 'the crons build'
  $bs = Run 'build (the server)' 'npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=build/server.cjs'
  Must $bs 'the server build'
  $budget = Run 'the first screen''s size budget' 'node scripts/check-bundle-budget.mjs dist'
  Must $budget 'the size budget (the first screen must stay under 480 KB gzip)'

  if (Test-Path 'dist\PERF-LAB-BUILD.txt') { Stop-Here 'dist\ is a perf lab build. It must never ship. Ask Claude.' }
  $marks = @('__perfLab', 'demo-perf-lab', '127.0.0.1:8085', '127.0.0.1:9099', 'connectFirestoreEmulator', 'connectAuthEmulator', 'PC build')
  $built = @(Get-ChildItem -Path 'dist' -Recurse -File -Include '*.js', '*.css', '*.html')
  if ($built.Count -eq 0) { Stop-Here 'dist\ holds no built files. Ask Claude.' }
  $found = @($built | Select-String -SimpleMatch -Pattern $marks -List)
  if ($found.Count -gt 0) {
    $found | Select-Object -First 10 | ForEach-Object { Log "   $($_.Path): $($_.Pattern)" 'Red' }
    Stop-Here 'the production build carries the perf lab''s emulator code or the PC build''s mark. Ask Claude.'
  }
  Log "No perf lab marker and no PC-build mark in the $($built.Count) built files." 'Green'

  # The rules lint (no emulator): every function called is defined, so none
  # of the deleted helpers is still called anywhere.
  $lint = Run 'the rules lint test' 'npx vitest run tests/firestore.rules.lint.test.ts'
  Must $lint 'the rules lint test'

  Run-RulesTests 'Nothing is deployed or pushed.'

  Set-Content -Path $PreparedFile -Value "$BranchSha $MasterSha" -Encoding ascii
  Log "Tested: $Branch at $BranchShort, master on GitHub at $($MasterSha.Substring(0, 7))." 'Green'
  Log 'THE PLAN:' 'White'
  Log "  golive: 1. the index ($NewIndexSpec), --non-interactive, never --force." 'White'
  Log "          2. the restore tag $RestoreTag = $MasterBase, pushed if not on GitHub yet." 'White'
  if ($MasterPushed) { Log '          3. (no push: master is already the branch''s head)' 'White' } else { Log "          3. git push origin ${Branch}:master (fast-forward only), if master on GitHub is still $MasterBase." 'White' }
  Log '  by hand: git pull --ff-only in the project folder; Render''s three presses; the leader''s iPad loads the build.' 'White'
  Log '  rules:  the rules tests again, firestore.rules deployed, checked LIVE.' 'White'
  Log 'PREPARE PASSED. Next: powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-partition.ps1 -Stage golive' 'Green'
  exit 0
}

# ---- golive and rules: only what prepare tested ------------------------------------
if (-not (Test-Path $PreparedFile)) { Stop-Here 'prepare has not passed on this PC. Run prepare first.' }
$prepared = ((Get-Content -Path $PreparedFile -Raw).Trim()) -split '\s+'
if ($prepared.Count -ne 2 -or $prepared[0] -ne $BranchSha) { Stop-Here "$Branch has changed since prepare passed, so this commit has not been tested. Run prepare again." }
# The deploys send THIS folder's firestore.rules and firestore.indexes.json.
& git --no-optional-locks diff --quiet HEAD -- firestore.rules firestore.indexes.json
if ($LASTEXITCODE -ne 0) { Stop-Here 'firestore.rules or firestore.indexes.json has uncommitted changes in this folder. Ask Claude.' }

# ==== golive ============================================================================
if ($Stage -eq 'golive') {
  Write-Host ''
  Write-Host 'The franchise partition (ROADMAP Gate B; AJ: "take it away i like your ideas").' -ForegroundColor Yellow
  Write-Host 'This deploys ONE index to PRODUCTION (access_requests: status, studioId), makes the restore tag,' -ForegroundColor Yellow
  if ($MasterPushed) { Write-Host '  and pushes nothing (master is already this commit).' -ForegroundColor Yellow } else { Write-Host '  then pushes to master.' -ForegroundColor Yellow }
  Write-Host 'It does NOT deploy the rules: the app goes live first (Render, by hand), then -Stage rules.' -ForegroundColor Yellow
  Write-Host 'No Cloud Function; no Mindbody call; nothing contacts anyone.' -ForegroundColor Yellow
  Write-Host ''
  if ((Read-Host 'AJ: type GO to deploy the index, tag and push') -ne 'GO') { Log 'Nothing deployed, tagged or pushed.' 'Yellow'; exit 0 }
  Log 'AJ typed GO: the franchise partition, golive.' 'White'

  # 1. The index. It builds in the background; until it is Enabled the
  #    leader's second query scans, as any query without its index does, so
  #    nothing breaks. --non-interactive never deletes an index; never
  #    --force (it would delete the webhook logs' two TTL policies).
  $idx = Run "deploy firestore.indexes.json (project $Project)" "npx firebase deploy --only firestore:indexes --project $Project --non-interactive"
  if ($idx.Code -ne 0) { Stop-Here 'the index deploy failed. The live app and its rules are unchanged and nothing was pushed.' }
  if (-not (@($idx.Output) -match 'Deploy complete')) { Stop-Here 'the index deploy did not say "Deploy complete". Nothing was pushed. Ask Claude (Firebase console -> Firestore -> the named database -> Indexes).' }
  Log 'Index deployed (it finishes building by itself). A note about "2 field overrides ... not present" is expected: those are the TTL policies.' 'Green'

  # 2. The restore point: master BEFORE this round, whatever master is now.
  $tagOnGitHub = & git --no-optional-locks ls-remote --tags origin "refs/tags/$RestoreTag"
  if ($LASTEXITCODE -ne 0) { Stop-Here 'could not ask GitHub for its tags. The index is deployed (harmless); nothing was pushed.' }
  if (-not $tagOnGitHub) {
    if (-not (& git --no-optional-locks tag -l $RestoreTag)) {
      & git tag $RestoreTag $BaseSha
      if ($LASTEXITCODE -ne 0) { Stop-Here "could not make the restore tag $RestoreTag. The index is deployed (harmless); nothing was pushed." }
    } elseif ((& git --no-optional-locks rev-parse "$RestoreTag^{commit}").Trim() -ne $BaseSha) {
      Stop-Here "the restore tag $RestoreTag on this PC is not $MasterBase. Ask Claude; the index is deployed (harmless), nothing was pushed."
    }
    $tp = Run "push the restore tag $RestoreTag" "git push origin refs/tags/$RestoreTag"
    Must $tp 'pushing the restore tag (the index is deployed, harmless; nothing was pushed to master)'
  } elseif ((("$tagOnGitHub" -split '\s+')[0]) -ne $BaseSha) {
    Stop-Here "the restore tag $RestoreTag on GitHub is not $MasterBase. Ask Claude; the index is deployed (harmless), nothing was pushed."
  }
  Log "Restore point on GitHub: $RestoreTag = $($BaseSha.Substring(0, 7))" 'Green'

  # 3. The push, fast-forward only, and only while master is still the base.
  $MasterNow = Get-RemoteMaster
  if (-not $MasterNow) { Stop-Here 'could not reach GitHub before the push. The index is deployed (harmless); the app is unchanged. Run golive again once GitHub answers.' }
  if ($MasterNow -eq $BranchSha) {
    Log 'master on GitHub is already this commit: nothing to push.' 'Green'
  } elseif ($MasterNow -eq $BaseSha) {
    & git --no-optional-locks merge-base --is-ancestor $BaseSha $Branch
    if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch no longer fast-forwards master. The index is deployed (harmless); the app is unchanged. Ask Claude." }
    $push = Run "git push origin ${Branch}:master" "git push origin ${Branch}:master"
    Must $push 'the push. The index is deployed (harmless); the app is unchanged'
  } else {
    Stop-Here "master on GitHub moved while golive ran (now $($MasterNow.Substring(0, 8))). The index is deployed (harmless); nothing was pushed. Ask Claude."
  }

  Log "DONE. master on GitHub = $BranchShort. The app is NOT live yet (Render deploys nothing on a push), and the rules are master's as before." 'Green'
  Log '' 'White'
  Log 'NOW, BY HAND, in this order:' 'White'
  Log "1. In the project folder ($ProjectFolder), PowerShell:" 'White'
  Log '     git pull --ff-only' 'Cyan'
  Log '   (no npm ci: package.json and its lock did not change). Close any npm run dev first.' 'White'
  Log '2. Render -> maxstrength-app-beta -> Manual Deploy -> Deploy latest commit. Wait until it says Live, then:' 'White'
  Log "     curl.exe -s $AppUrl/version.json" 'Cyan'
  Log "   It names a build ending in -$BranchShort (if it still names the old one, wait a minute and ask again)." 'White'
  Log '3. Render -> journey-cron-renewals -> Manual Build, then the same on journey-cron-leaderboards' 'White'
  Log '   (a cron left out keeps running its old commit; keep all three on one).' 'White'
  Log '4. The Studio Leader''s iPad loads the new build: one trip to the Hub, or a reload. Proof: their next' 'White'
  Log '   cold open''s boot report in Render''s logs names the new build. Until then their iPad is on the old' 'White'
  Log '   one, which the new rules would refuse in two places (an error toast on Team and People & access).' 'White'
  Log '5. Then the rules:' 'White'
  Log '     powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-partition.ps1 -Stage rules' 'Cyan'
  Log '' 'White'
  Log 'TO UNDO (ask Claude first):' 'White'
  Log "  git push --force origin ${RestoreTag}:master, then Render's three presses. The index can stay." 'White'
  $elapsed = [int]((Get-Date) - $Started).TotalMinutes
  Log "Done in about $elapsed minute(s)." 'Green'
  exit 0
}

# ==== rules =============================================================================
if (-not $MasterPushed) { Stop-Here "master on GitHub is still ${MasterBase}: golive has not pushed this round. Run golive first." }

# Render must serve this commit: version.json is {"build": "<time>-<commit7>"}.
Log "Asking Render which build it serves ($AppUrl/version.json, read only)" 'Cyan'
try {
  $ver = Invoke-RestMethod -Uri "$AppUrl/version.json" -Headers @{ 'Cache-Control' = 'no-cache' } -TimeoutSec 20
} catch {
  Stop-Here "could not read $AppUrl/version.json ($($_.Exception.Message)). The rules are unchanged. Try again in a minute."
}
$build = "$($ver.build)".Trim()
Log "Render serves build '$build'." 'White'
if (-not $build.EndsWith("-$BranchShort")) { Stop-Here "Render does not serve $BranchShort yet. Press Manual Deploy on the web service (and Manual Build on both crons), wait until it is Live, then run this stage again. The rules are unchanged." }
Log "Render serves this round's commit ($BranchShort)." 'Green'

# The live rules before the deploy: master's, or already this branch's.
if ($HaveKey) {
  Write-BaseRules
  $lc = Check-LiveRules "the live rules against $MasterBase's (read only)" $BaseRulesFile
  if ($lc -eq 3) {
    $lb = Check-LiveRules 'the live rules against this branch''s (read only)' 'firestore.rules'
    if ($lb -eq 3) { Stop-Here "the rules LIVE on $Db are neither $MasterBase's nor this branch's: rules were deployed from somewhere else, and this stage would replace them. Ask Claude." }
  }
}

Write-Host ''
Write-Host 'The rules take access away. The old app on an iPad is refused in two places under them: the' -ForegroundColor Yellow
Write-Host '  leader''s access-request list ("Firestore Action Failed" on My Studio -> Team and People & access)' -ForegroundColor Yellow
Write-Host '  and a Mindbody Site edit. Nothing is lost either way; a reload fixes it.' -ForegroundColor Yellow
Write-Host 'Has the Studio Leader''s iPad loaded this build? (their boot report in Render''s logs names it, or they' -ForegroundColor Yellow
Write-Host '  opened the Hub once, or reloaded). If the evening can''t wait, the cost is that toast, not data.' -ForegroundColor Yellow
Write-Host ''
if ((Read-Host 'Type LOADED to go on') -ne 'LOADED') { Log 'Nothing deployed. Run this stage again once the leader''s iPad is on the new build.' 'Yellow'; exit 0 }
Log 'AJ typed LOADED.' 'White'
if ((Read-Host 'AJ: type GO to run the rules tests again and deploy firestore.rules to PRODUCTION') -ne 'GO') { Log 'Nothing deployed.' 'Yellow'; exit 0 }
Log 'AJ typed GO: the franchise partition, the rules.' 'White'

Run-RulesTests 'The app is live on Render; the rules are master''s as before.'
$rules = Run "deploy firestore.rules (project $Project)" "npx firebase deploy --only firestore:rules --project $Project"
if ($rules.Code -ne 0) { Stop-Here 'the rules deploy failed. The app is live; the rules are master''s as before (Firebase console -> Firestore -> the named database -> Rules shows what is live).' }
if (-not (@($rules.Output) -match 'released rules')) { Stop-Here 'the rules deploy did not say it released the rules. Ask Claude (Firebase console -> Firestore -> the named database -> Rules shows what is live).' }

$live = Check-LiveRules 'the live rules against this branch''s, and the new index (read only)' 'firestore.rules' $LiveRulesMarks @($NewIndexSpec)
if ($live -eq 0) {
  Log "The ruleset LIVE on $Db is this branch's firestore.rules, and $NewIndexSpec is built." 'Green'
} elseif ($live -eq 4) {
  Log "The ruleset LIVE on $Db is this branch's firestore.rules. $NewIndexSpec is still building: until it is, the leader's second query scans; nothing breaks." 'Green'
} elseif ($live -eq 3) {
  Stop-Here "the ruleset live on $Db is not this branch's firestore.rules (the log shows where they part). Ask Claude."
} else {
  if ($live -eq -1) { Log "The key is not at $KeyPath, so the live rules could not be read here." 'Yellow' } else { Log "The live check could not run (exit $live)." 'Yellow' }
  Log "Firebase console -> Firestore -> the named database ($Db) -> Rules: the newest release (today), Ctrl F  function roleRunsOwnStudios" 'Yellow'
  if ((Read-Host 'Type LIVE if it is there (Enter to stop here)') -ne 'LIVE') { Stop-Here 'the live rules were not confirmed. They are deployed; ask Claude.' }
  Log 'AJ confirmed: the live rules hold roleRunsOwnStudios.' 'Green'
}

Log 'DONE. The franchise partition is live: the app on Render and the rules in Firestore.' 'Green'
Log '' 'White'
Log 'Next, by hand, when convenient:' 'White'
Log '1. Operations -> Setup -> People & access, as an administrator: any pending request that names no studio' 'White'
Log '   now reaches administrators only.' 'White'
Log '2. When a franchisee joins: Admins -> Studios -> their studio -> Team -> their row -> Studios ->' 'White'
Log '   "Owns {studio}", and Save. Until then their account runs only its home studio.' 'White'
Log '' 'White'
Log 'TO UNDO (ask Claude first), the reverse of the way in: THE RULES FIRST, from that tag' 'White'
Log "  (docs\ops\DEPLOYS-AND-ROLLBACK.md, `"The rules`", with $RestoreTag), because the old app is refused" 'White'
Log "  under these rules; then git push --force origin ${RestoreTag}:master and Render's three presses." 'White'
Log '  The index can stay.' 'White'
$elapsed = [int]((Get-Date) - $Started).TotalMinutes
Log "Done in about $elapsed minute(s)." 'Green'
exit 0
