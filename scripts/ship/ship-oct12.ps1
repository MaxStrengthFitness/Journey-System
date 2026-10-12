<#
 SCRIPT-VERSION: v1  (Oct 12 2026, the Oct 12 release; master at 5a0bf7ea)

 Ships branch oct12/release: four branches built on Oct 11 to 12 2026, merged
 into one release (docs\rounds\2026-10-12-release.md is the release):

   - oct10/studio-map     the studio map (docs\rounds\2026-10-12-studio-map.md):
                          rules for sizes and floorPlans, a seed;
   - oct12/sessions-fixes the session fixes (docs\rounds\2026-10-12-sessions.md):
                          a finish counted once, rules, one index;
   - oct12/staff-webhook  the staff webhook (docs\rounds\2026-10-12-staff-webhook.md):
                          ONE Cloud Function, one index;
   - oct12/loose-ends     two dead files, doc lines, the Academy content;
   plus f67b9813 (the reset script sweeps orphaned finish markers).

 It replaces ship-studio-map.ps1, ship-sessions.ps1 and ship-staff-webhook.ps1
 (kept for the record). Their checks that still hold on the merged branch are
 here. Dropped on purpose, because they cannot hold on a merged branch:
   - "only the round's files changed" (staff webhook): the release changes
     about 260 files; kept instead for functions\ alone (only the webhook's
     six files);
   - "firestore.indexes.json unchanged" (studio map) and "master's indexes
     plus exactly one" (staff webhook): now master's plus exactly the TWO;
   - "functions\src unchanged" (sessions): now only the webhook's files;
   - each script's own restore tag and master base: one tag for the release.

 THREE STAGES, IN ORDER, from this folder (.claude\worktrees\release-oct12):

   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-oct12.ps1 -Stage prepare
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-oct12.ps1 -Stage golive
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-oct12.ps1 -Stage seed

 prepare  changes nothing in production and nothing on GitHub (it fetches,
          reads the live rules with the key, and writes only logs\, dist\ and
          build\): the branch, a clean tree, master on GitHub, LF, the case
          check, the rules and index files, functions\ only in the webhook's
          files, CLAUDE.md and render.yaml unchanged, the rules lint, the
          typecheck COUNT (2), the suite, the functions typecheck and tests,
          the index guard, the production build and its budget, no perf-lab
          marker, the rules tests, the live rules, the Firebase login.
          Ends PREPARE PASSED.

 golive   GO; the restore tag restore/2026-10-12-before-oct12-release =
          5a0bf7ea; the indexes; the rules tests again; the rules, checked
          LIVE; PUSH, then git push origin oct12/release:master; Render by hand
          (Manual Deploy on the web service, Manual Build on BOTH crons), and
          LOADED once version.json names the commit; then ONE Cloud Function,
          functions:mindbodyWebhook; then the read-only staff report; the
          checks after; the undo lines (kept in the log).

 seed     the twenty Imagine Strength models: a dry run, GO, --commit, the dry
          run again; then the in-app Sizes step at Solon and Strongsville.

 This script neither checks the text of nor edits CLAUDE.md beyond "unchanged":
 oct9/claude-md rewrites it, and the release document carries its lines.

 ASCII only on purpose (Windows PowerShell 5.1 reads a script as ANSI).
#>

param([Parameter(Mandatory = $true, Position = 0)][ValidateSet('prepare', 'golive', 'seed')][string]$Stage)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-oct12.log'
# What prepare tested: "<branch sha> <origin master sha>". golive and seed read it.
$PreparedFile = Join-Path $Root 'logs\ship-oct12.prepared'
# master's firestore.rules before the release, written for the live check.
$BaseRulesFile = Join-Path $Root 'logs\ship-oct12.base.rules'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$Branch = 'oct12/release'
$Folder = '.claude\worktrees\release-oct12'
$RestoreTag = 'restore/2026-10-12-before-oct12-release'
# master on GitHub when the release was built (Oct 11 2026): the franchise
# partition and the rules' trim, live. Every branch in the release is on it.
$MasterBase = '5a0bf7ea'
# The last Cloud Functions deploy (ship-speed.ps1, Oct 6 2026). master's
# functions\ must still be exactly this, so the restore tag is what runs today.
$LiveFunctionsAt = '3735f38e'
# 2 since the Hub fixes (Oct 1): clinical-review/charts.tsx and EditTrainerModal.tsx.
$TscBaseline = 2
$Project = 'prod'
$GcpProject = 'gen-lang-client-0731527386'
$Db = 'ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa'
$AppUrl = 'https://maxstrength-app-beta.onrender.com'
$DeployFunction = 'functions:mindbodyWebhook'
# The rules of both rounds, which must be in the file deployed...
$RulesMarks = @(
  'match /floorPlans/{planId}', 'function rosterUnitSizeOk(', 'function modelSizeValid(',
  'match /finish/{docId}', 'function finishOnceOk(', 'function countedOnceOk(',
  'function finishFromHolder(', 'function finishedHolderKept(', 'function logSessionReach(',
  'function machineSettingsClientOk(', 'function roleRunsOwnStudios('
)
# ...and in the ruleset live afterwards.
$LiveRulesMarks = @('match /floorPlans/{planId}', 'rosterUnitSizeOk', 'modelSizeValid', 'match /finish/{docId}', 'finishOnceOk', 'countedOnceOk', 'finishFromHolder', 'finishedHolderKept', 'logSessionReach', 'machineSettingsClientOk')
# The partition's rule, which must already be live (the map's rules call trainerLeads with owned studios).
$PartitionMark = 'roleRunsOwnStudios'
# The two composites the release adds to master's: "<group>|<scope>|<field>:<order or arrayConfig>,...".
$NewIndexKeys = @(
  'sessions|COLLECTION|hostedAtStudioId:ASCENDING,status:ASCENDING,createdAt:DESCENDING',
  'trainers|COLLECTION|mindbodyStaffId:ASCENDING,accessibleStudioIds:CONTAINS'
)
$SessionsIndexSpec = 'sessions(hostedAtStudioId, status, createdAt desc)'
# The only files under functions\ the release may change (the staff webhook).
$FunctionsAllowed = @(
  'functions/src/mindbody/index.ts', 'functions/src/mindbody/index.test.ts',
  'functions/src/mindbody/staffResolver.ts', 'functions/src/mindbody/staffResolver.test.ts',
  'functions/src/mindbody/staffSite.ts', 'functions/src/mindbody/staffSite.test.ts'
)
$Started = Get-Date

# The main checkout (node_modules, functions\node_modules and the key live
# there): the parent of git's common folder.
$commonDir = (& git --no-optional-locks rev-parse --path-format=absolute --git-common-dir 2>$null)
if ($LASTEXITCODE -eq 0 -and $commonDir) { $MainRoot = Split-Path -Parent ($commonDir.Trim() -replace '/', '\') } else { $MainRoot = $Root }
# The service-account key: this folder, else the main checkout. Read-only checks
# and the seed use it; nothing prints a secret.
$KeyPath = @((Join-Path $Root 'service-account.json'), (Join-Path $MainRoot 'service-account.json')) | Where-Object { Test-Path $_ } | Select-Object -First 1
$HaveKey = [bool]$KeyPath

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

# A command whose questions must be seen and answered (the functions deploy can
# ask how long to keep container images): straight to the console, not
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

# The read-only live check (scripts\check-live-rules.ts): GETs only. 0 the live
# ruleset is $rulesPath's (and holds every -expect), 3 it differs or lacks an
# -expect, 2 no release, 1 it could not run; -1 no key.
function Check-LiveRules {
  param([string]$label, [string]$rulesPath, [string[]]$expect = @())
  if (-not $HaveKey) { return -1 }
  $cmd = "npx tsx scripts/check-live-rules.ts --key `"$KeyPath`" --project $GcpProject --database $Db --rules `"$rulesPath`""
  foreach ($e in $expect) { $cmd += " --expect `"$e`"" }
  $r = Run $label $cmd
  return $r.Code
}

# One function of a rules text, from its 'function <name>(' to its closing brace at four spaces.
function Get-RulesFunction {
  param([string]$text, [string]$name)
  $t = $text -replace "`r`n", "`n"
  $i = $t.IndexOf("function $name(")
  if ($i -lt 0) { return $null }
  $j = $t.IndexOf("`n    }", $i)
  if ($j -lt 0) { return $null }
  return $t.Substring($i, $j + 6 - $i)
}

# Every composite index of a parsed firestore.indexes.json, one string each.
function Get-IndexKeys {
  param($json)
  $keys = @()
  foreach ($ix in @($json.indexes)) {
    $f = @($ix.fields | ForEach-Object { if ($_.arrayConfig) { "$($_.fieldPath):$($_.arrayConfig)" } else { "$($_.fieldPath):$($_.order)" } }) -join ','
    $keys += "$($ix.collectionGroup)|$($ix.queryScope)|$f"
  }
  return , $keys
}

# firestore.rules holds both rounds' rules, the floorPlans block is boxes, and
# machineCareValid is byte for byte master's. A rules file without the finish
# path would refuse every new Finish's marker; refused outright, never asked.
function Assert-RulesFile {
  param([string]$whatIsLive)
  $rulesText = Get-Content -Path 'firestore.rules' -Raw
  foreach ($mark in $RulesMarks) {
    if (-not $rulesText.Contains($mark)) { Stop-Here "firestore.rules does not hold '$mark'. $whatIsLive Ask Claude." }
  }
  $fpStart = $rulesText.IndexOf('match /floorPlans/{planId}')
  $fpEnd = $rulesText.IndexOf('allow delete: if false;', $fpStart)
  if ($fpEnd -lt 0) { Stop-Here "the floorPlans block in firestore.rules has no 'allow delete: if false;'. $whatIsLive Ask Claude." }
  $fpBlock = $rulesText.Substring($fpStart, $fpEnd - $fpStart)
  if (-not $fpBlock.Contains("'boxes'")) { Stop-Here "the floorPlans block does not name 'boxes'. $whatIsLive Ask Claude." }
  if ($fpBlock.Contains("'outline'")) { Stop-Here "the floorPlans block still names 'outline' (the room before Oct 11). $whatIsLive Ask Claude." }
  $baseRulesText = (& git --no-optional-locks show "${BaseSha}:firestore.rules") -join "`n"
  $careHere = Get-RulesFunction $rulesText 'machineCareValid'
  $careBase = Get-RulesFunction $baseRulesText 'machineCareValid'
  if (-not $careHere -or -not $careBase) { Stop-Here "could not find machineCareValid in the rules. $whatIsLive Ask Claude." }
  if ($careHere -cne $careBase) { Stop-Here "machineCareValid differs from $MasterBase's, and this release must not change it. $whatIsLive Ask Claude." }
}

# firestore.indexes.json parses, has no field overrides (the Enterprise edition
# refuses them), and is master's composites plus exactly the release's two.
function Assert-Indexes {
  param([string]$whatIsLive)
  try {
    $ixJson = Get-Content -Path 'firestore.indexes.json' -Raw | ConvertFrom-Json
    $ixMaster = ((& git --no-optional-locks show "${BaseSha}:firestore.indexes.json") -join "`n") | ConvertFrom-Json
  } catch {
    Stop-Here "firestore.indexes.json does not parse: $($_.Exception.Message) $whatIsLive"
  }
  $overrides = @($ixJson.fieldOverrides | Where-Object { $_ }).Count
  if ($overrides -gt 0) { Stop-Here "firestore.indexes.json has field overrides, which the Enterprise edition refuses. $whatIsLive Ask Claude." }
  $here = Get-IndexKeys $ixJson
  $base = Get-IndexKeys $ixMaster
  $lost = @($base | Where-Object { $here -notcontains $_ })
  if ($lost.Count -gt 0) {
    $lost | ForEach-Object { Log "   missing: $_" 'Red' }
    Stop-Here "firestore.indexes.json lost indexes master has (above). $whatIsLive Ask Claude."
  }
  $added = @($here | Where-Object { $base -notcontains $_ } | Sort-Object)
  $want = @($NewIndexKeys | Sort-Object)
  if ($here.Count -ne $base.Count + 2 -or (($added -join ';') -ne ($want -join ';'))) {
    $added | ForEach-Object { Log "   added: $_" 'Red' }
    Stop-Here "firestore.indexes.json should be master's $($base.Count) composites plus exactly the two of the release (sessions: hostedAtStudioId, status, createdAt desc; trainers: mindbodyStaffId, accessibleStudioIds CONTAINS). It has $($here.Count). $whatIsLive Ask Claude."
  }
  Log "firestore.indexes.json: master's $($base.Count) composites plus the release's two ($($here.Count)), no field overrides." 'Green'
}

# Every local oct9/oct10/oct11/oct12 branch that changes firestore.rules beyond
# the base must already be in this branch: its rules shipped after these would
# drop the finish path, and these shipped after it would drop its rules.
function Assert-RulesBranchesMerged {
  param([string]$whatIsLive)
  $others = @(& git --no-optional-locks for-each-ref --format='%(refname:short)' refs/heads/oct9 refs/heads/oct10 refs/heads/oct11 refs/heads/oct12 | Where-Object { $_ -and $_ -ne $Branch })
  $unmerged = @()
  foreach ($b in $others) {
    & git --no-optional-locks diff --quiet "$BaseSha...$b" -- firestore.rules
    if ($LASTEXITCODE -eq 0) { continue }
    & git --no-optional-locks merge-base --is-ancestor $b $Branch
    if ($LASTEXITCODE -ne 0) { $unmerged += $b }
  }
  if ($unmerged.Count -gt 0) {
    $unmerged | ForEach-Object { Log "   $_ changes firestore.rules and is not in $Branch" 'Red' }
    Stop-Here "branches that change firestore.rules are not merged into $Branch. Ask Claude to merge them first, so one rules file holds them all. $whatIsLive"
  }
  Log "Rules branches: none outside this release ($($others.Count) oct9-oct12 branch(es) looked at)." 'Green'
}

# The build Render serves, from version.json ({"build": "<time>-<commit7>"}), or $null.
function Get-LiveBuild {
  try {
    $ver = Invoke-RestMethod -Uri "$AppUrl/version.json" -Headers @{ 'Cache-Control' = 'no-cache' } -TimeoutSec 20
    return "$($ver.build)".Trim()
  } catch {
    Log "Could not read $AppUrl/version.json ($($_.Exception.Message))." 'Yellow'
    return $null
  }
}

# The undo, printed and kept in the log.
function Write-UndoLines {
  $restoreDir = Join-Path (Split-Path -Parent $MainRoot) 'journey-restore-oct12'
  Log '' 'White'
  Log 'TO UNDO (ask Claude first; undo the smallest thing that fixes it):' 'White'
  Log "  The app: on Render, the web service's Events -> the last good deploy -> Rollback, and each cron's Builds the same;" 'White'
  Log "    or: git push --force origin ${RestoreTag}:master   then Manual Deploy (web) and Manual Build (both crons)." 'White'
  Log '  The rules can STAY after the app goes back: the old app never writes the finish marker or floorPlans,' 'White'
  Log '    and nothing it does in normal use is refused. NEVER put the old rules back while the new app is live' 'White'
  Log '    (its Finish needs the marker path, its map needs floorPlans): the app first, the iPads loaded, then the rules,' 'White'
  Log '    from a worktree at the tag (docs\ops\DEPLOYS-AND-ROLLBACK.md, "The rules").' 'White'
  Log '  The indexes: no undo.' 'White'
  Log "  The webhook function, in PowerShell from $MainRoot :" 'White'
  Log '     git fetch origin --tags' 'White'
  Log "     git worktree add `"$restoreDir`" $RestoreTag" 'White'
  Log "     cmd /c mklink /J `"$restoreDir\node_modules`" `"$MainRoot\node_modules`"" 'White'
  Log "     cmd /c mklink /J `"$restoreDir\functions\node_modules`" `"$MainRoot\functions\node_modules`"" 'White'
  Log "     cd `"$restoreDir`"" 'White'
  Log "     npx firebase deploy --only $DeployFunction --project $Project" 'White'
  Log '     (never a plain --only functions; master still has the fix, so tell Claude afterwards).' 'White'
  Log '  The seed: the seed command with --remove (a dry run), then --remove --commit.' 'White'
}

Log "ship-oct12 $Stage" 'White'

# ---- the release's own worktree folder ---------------------------------------------
$top = (& git --no-optional-locks rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not (Test-Path 'package.json') -or -not (Test-Path 'scripts\ship\ship-oct12.ps1') -or ((Resolve-Path $top).Path -ne (Get-Location).Path)) { Stop-Here "run this from the top of the release's folder, $Folder." }
foreach ($f in @('docs\rounds\2026-10-12-release.md', 'docs\rounds\2026-10-12-sessions.md', 'docs\rounds\2026-10-12-studio-map.md', 'docs\rounds\2026-10-12-staff-webhook.md', 'src\features\session-record\finish-once.ts', 'src\features\studio-map\layout.ts', 'src\features\machine-card\MachineCard.tsx', 'functions\src\mindbody\staffSite.ts', 'scripts\seed-imagine-strength-models.ts', 'scripts\check-staff-sites.ts', 'scripts\check-live-rules.ts', 'scripts\check-bundle-budget.mjs', 'tests\firestore.rules.lint.test.ts', 'tests\rules-source.test.ts', 'src\lib\firestore-indexes.test.ts')) {
  if (-not (Test-Path $f)) { Stop-Here "$f is missing from this folder. Ask Claude." }
}

$head = (& git --no-optional-locks symbolic-ref --quiet --short HEAD)
if ($LASTEXITCODE -ne 0 -or "$head".Trim() -ne $Branch) { Stop-Here "this folder is on '$head', not $Branch. Run it from $Folder, or ask Claude; do not switch branches by hand." }
$dirty = (& git --no-optional-locks status --porcelain --untracked-files=no) | Where-Object { $_ }
if ($dirty) {
  Log 'Uncommitted changes:' 'Red'
  $dirty | Select-Object -First 20 | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'the branch has uncommitted changes. Everything that ships must be committed first (if git shows every file as changed but git diff shows nothing, ask Claude: that is line ends, not code).'
}
$untracked = (& git --no-optional-locks status --porcelain -- src tests server public scripts functions\src harness) | Where-Object { "$_" -like '`?`? *' }
if ($untracked) {
  Log 'Files git does not track:' 'Red'
  $untracked | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'untracked files would be tested (or deployed, under functions\src) here but not shipped. Commit or remove them first.'
}

Log 'Fetching from GitHub (reads only)' 'Cyan'
& git fetch -q origin
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not reach GitHub.' }
$MasterSha = (& git --no-optional-locks rev-parse origin/master).Trim()
$BaseSha = (& git --no-optional-locks rev-parse "$MasterBase^{commit}").Trim()
if ($LASTEXITCODE -ne 0) { Stop-Here "this checkout does not know $MasterBase (master before the release). Ask Claude." }
$BranchSha = (& git --no-optional-locks rev-parse $Branch).Trim()
$BranchShort = $BranchSha.Substring(0, 7)

# master is either still the base (golive pushes the release) or already the
# release's head (golive ran its push). Anything else went to master since
# and was not tested with this.
if ($MasterSha -eq $BaseSha) {
  $MasterPushed = $false
  Log "master on GitHub is $MasterBase (live), before the release." 'Green'
} elseif ($MasterSha -eq $BranchSha) {
  $MasterPushed = $true
  Log "master on GitHub is already the release's head ($BranchShort). That does NOT mean the release is live (see below)." 'Yellow'
} else {
  & git --no-optional-locks log --oneline "$BaseSha..origin/master" | Select-Object -First 15 | ForEach-Object { Log "   on master since ${MasterBase}: $_" 'Red' }
  Stop-Here "master on GitHub is $($MasterSha.Substring(0, 8)): neither $MasterBase nor the release's head ($BranchShort). Something else went to master (perhaps one of the three old ship scripts). Ask Claude to bring it into $Branch and test again first."
}

& git --no-optional-locks merge-base --is-ancestor $BaseSha $Branch
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch does not build on $MasterBase, so it would not fast-forward master. Ask Claude." }
$inRelease = (& git --no-optional-locks rev-list --count "$BaseSha..$Branch").Trim()
Log "$inRelease commit(s) in the release on top of $MasterBase (merges included)." 'Green'

# master's functions\ must be the live ones, so the restore tag is what runs today.
& git --no-optional-locks cat-file -e "$LiveFunctionsAt^{commit}" 2>$null
if ($LASTEXITCODE -ne 0) { Stop-Here "this checkout does not know $LiveFunctionsAt (the last functions deploy). Ask Claude." }
& git --no-optional-locks diff --quiet $LiveFunctionsAt $BaseSha -- functions
if ($LASTEXITCODE -ne 0) { Stop-Here "functions\ changed between $LiveFunctionsAt (the last functions deploy, Oct 6 2026) and $MasterBase, so the restore tag would not be the live webhook. Ask Claude." }

# What the release changes, and what it must not. Measured against the BASE,
# never master, which may already be the release.
$changedFn = @(& git --no-optional-locks diff --name-only $BaseSha $Branch -- functions | Where-Object { $_ })
$outsideFn = @($changedFn | Where-Object { $FunctionsAllowed -notcontains $_ })
if ($outsideFn.Count -gt 0) {
  $outsideFn | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'functions\ changed outside the staff webhook''s six files (above). The one-function deploy would carry them. Ask Claude.'
}
foreach ($p in @('CLAUDE.md', 'render.yaml', 'package.json', 'package-lock.json', 'server', 'server.ts', 'firebase.json')) {
  & git --no-optional-locks diff --quiet $BaseSha $Branch -- $p
  if ($LASTEXITCODE -ne 0) { Stop-Here "$p changed in the release, and it must not (CLAUDE.md is rewritten on oct9/claude-md; the rest would change Render, the dependencies or the deploy). Ask Claude." }
}
& git --no-optional-locks diff --quiet $BaseSha $Branch -- firestore.rules
if ($LASTEXITCODE -eq 0) { Stop-Here "firestore.rules is the same as $MasterBase's, but the release adds to it. Ask Claude." }
Assert-RulesFile 'Nothing is deployed or pushed.'
Assert-Indexes 'Nothing is deployed or pushed.'
Assert-RulesBranchesMerged 'Nothing is deployed or pushed.'
$registry = Get-Content -Path 'src\features\studio-settings\registry.ts' -Raw
foreach ($gone in @('layoutSpacingIn', 'layoutPathIn')) {
  if ($registry.Contains($gone)) { Stop-Here "the studio settings still hold $gone, which the studio map dropped. Ask Claude." }
}
Log "Against ${MasterBase}: firestore.rules (both rounds; machineCareValid the same) and the two indexes changed; functions\ only in the webhook's files ($($changedFn.Count)); CLAUDE.md, render.yaml, server, package.json and its lock did not." 'Green'

# ==== prepare ===========================================================================
if ($Stage -eq 'prepare') {
  if (Test-Path $PreparedFile) { Remove-Item -Force $PreparedFile }

  Log 'What changes, by folder:' 'Yellow'
  & git --no-optional-locks diff --stat $BaseSha $Branch | Select-Object -Last 1 | ForEach-Object { Log "   $_" 'Yellow' }
  & git --no-optional-locks diff --dirstat=files,3 $BaseSha $Branch | ForEach-Object { Log "   $_" 'Yellow' }
  Log 'The rules, the indexes and functions\ (golive deploys them):' 'Yellow'
  & git --no-optional-locks diff --stat $BaseSha $Branch -- firestore.rules firestore.indexes.json functions | ForEach-Object { Log "   $_" 'Yellow' }

  $fl = Run 'Firebase login' 'npx firebase login:list'
  Must $fl 'the Firebase login check'
  if (-not (@($fl.Output) -match '@')) { Stop-Here 'no Firebase login on this PC. Run: npx firebase login, then prepare again.' }

  # The restore point golive will make: free, or already the base.
  $tagOnGitHub = & git --no-optional-locks ls-remote --tags origin "refs/tags/$RestoreTag"
  if ($LASTEXITCODE -ne 0) { Stop-Here 'could not ask GitHub for its tags.' }
  if ($tagOnGitHub) {
    if ((("$tagOnGitHub" -split '\s+')[0]) -ne $BaseSha) { Stop-Here "the restore tag $RestoreTag on GitHub is not $MasterBase. Ask Claude." }
    Log "Restore tag $RestoreTag is already on GitHub at $MasterBase." 'Green'
  } else {
    if (& git --no-optional-locks tag -l $RestoreTag) {
      if ((& git --no-optional-locks rev-parse "$RestoreTag^{commit}").Trim() -ne $BaseSha) { Stop-Here "the restore tag $RestoreTag on this PC is not $MasterBase. Ask Claude to remove it." }
    }
    Log "Restore tag ${RestoreTag}: golive makes it at $MasterBase (master before the release)." 'Green'
  }

  # THE PARTITION MUST BE LIVE (the map's rules call trainerLeads with owned
  # studios): the live rules are master's, or already this release's.
  if ($HaveKey) {
    & cmd /c "git --no-optional-locks show ${BaseSha}:firestore.rules > `"$BaseRulesFile`" 2>&1"
    if ($LASTEXITCODE -ne 0) { Stop-Here "could not write $MasterBase's firestore.rules to logs\ for the live check. Ask Claude." }
    $lc = Check-LiveRules "the live rules against $MasterBase's (read only)" $BaseRulesFile @($PartitionMark)
    if ($lc -eq 0) {
      Log "The rules LIVE on $Db are $MasterBase's, the partition's. golive replaces them with the release's." 'Green'
    } elseif ($lc -eq 3) {
      $lb = Check-LiveRules 'the live rules against the release''s (read only)' 'firestore.rules' @($PartitionMark)
      if ($lb -eq 0) { Log "The rules LIVE are already the release's. golive deploys them again (no change) and checks them." 'Green' }
      elseif ($lb -eq 3) { Stop-Here "the rules LIVE on $Db are neither $MasterBase's nor the release's: rules were deployed from somewhere else (perhaps an old ship script), and golive would replace them. Ask Claude." }
      else { Stop-Here "could not compare the live rules with the release's (exit $lb). Ask Claude." }
    } else {
      Stop-Here "could not read the live rules (exit $lc), so whether the partition is live is unknown. Ask Claude."
    }
  } else {
    Log "No service-account.json in $Root or $MainRoot, so the live rules can't be read here." 'Yellow'
    Log "Firebase console -> Firestore -> the named database ($Db) -> Rules: the newest release, Ctrl F  function roleRunsOwnStudios" 'Yellow'
    if ((Read-Host 'Type PARTITION if it is there (the partition is live; Enter to stop here)') -ne 'PARTITION') { Stop-Here 'the partition was not confirmed live. It must be, first.' }
    Log 'AJ confirmed: the live rules hold roleRunsOwnStudios (the partition).' 'Green'
  }

  # A worktree checked out with core.autocrlf=true writes Windows line ends,
  # and the suite fails on them although nothing is wrong (KNOWN-TRAPS, CRLF).
  $crlf = @(& git --no-optional-locks ls-files --eol | Where-Object { "$_" -match 'w/crlf' })
  if ($crlf.Count -gt 0) {
    $crlf | Select-Object -First 10 | ForEach-Object { Log "   $_" 'Red' }
    Stop-Here "$($crlf.Count) file(s) in this folder have Windows line ends (CRLF), and the suite fails on them. Ask Claude to convert them to LF; nothing is wrong with the code."
  }
  Log 'Line ends: every file in this folder is LF.' 'Green'
  $dups = @(& git --no-optional-locks ls-files | ForEach-Object { $_.ToLowerInvariant() } | Group-Object | Where-Object { $_.Count -gt 1 })
  if ($dups.Count -gt 0) { $dups | ForEach-Object { Log "   $($_.Name)" 'Red' }; Stop-Here 'two tracked files differ only by case.' }
  Log 'Case check: no two files differ only by case.' 'Green'

  # The rules lint (no emulator): the file's size, every function called is
  # defined, the finish path, the floorPlans block, machineCare as on master.
  $lint = Run 'the rules lint' 'npx vitest run tests/firestore.rules.lint.test.ts tests/rules-source.test.ts'
  Must $lint 'the rules lint'

  $tsc = Run 'typecheck (the app)' 'npx tsc --noEmit'
  $errs = @($tsc.Output | Where-Object { "$_" -match 'error TS' }).Count
  Log "tsc errors: $errs (baseline $TscBaseline)" $(if ($errs -eq $TscBaseline) { 'Green' } else { 'Red' })
  if ($errs -gt $TscBaseline) { Stop-Here 'more typecheck errors than the baseline.' }
  if ($errs -lt $TscBaseline) { Log "Fewer typecheck errors than the baseline ($errs): not a failure, but tell Claude so the baseline moves." 'Yellow' }

  $env:TZ = 'America/New_York'
  Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
  Remove-Item Env:VITE_PERF_LAB -ErrorAction SilentlyContinue
  # A longer per-test limit: a few file-walking tests can pass vitest's default
  # 5 s on a loaded PC, and a timeout is not a failure of the app.
  $vt = Run 'the suite (TZ=America/New_York)' 'npx vitest run --dir src --testTimeout=30000'
  Must $vt 'the test suite'

  # The function golive deploys: its own typecheck and tests.
  Push-Location 'functions'
  try {
    $ftc = Run 'the functions typecheck' 'npx tsc --noEmit -p .'
  } finally {
    Pop-Location
  }
  Must $ftc 'the functions typecheck'
  $ft = Run 'the functions tests (TZ=America/New_York)' 'npx vitest run --dir functions/src'
  Must $ft 'the functions tests'

  # Every query in src, server and functions\src has its index. (It does not
  # hold the trainers index in place, see the staff webhook's round section 3:
  # Assert-Indexes above does.)
  $ig = Run 'the index guard (TZ=America/New_York)' 'npx vitest run src/lib/firestore-indexes.test.ts'
  Must $ig 'the index guard'

  # A PRODUCTION build (NODE_ENV=production; a "test" build ships React's
  # development files and the budget refuses it), never a lab build, into an
  # empty dist\ (vite keeps dist\ between builds, and the marker scan below
  # must see only this build; Render starts from an empty one).
  if (Test-Path 'dist') { Remove-Item -Recurse -Force 'dist' }
  $env:NODE_ENV = 'production'
  try {
    $bd = Run 'build (the app, NODE_ENV=production)' 'npx vite build'
    Must $bd 'the app build'
    $bb = Run 'build (the crons)' 'npm run build:backend'
    Must $bb 'the crons build'
    $bs = Run 'build (the server)' 'npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=build/server.cjs'
    Must $bs 'the server build'
    $budget = Run 'the first screen''s size budget' 'npm run check:bundle'
    Must $budget 'the size budget (the first screen must stay under 480 KB gzip)'
  } finally {
    Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
  }
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

  Run-RulesTests 'Nothing is deployed or pushed.'

  Set-Content -Path $PreparedFile -Value "$BranchSha $MasterSha" -Encoding ascii
  Log "Tested: $Branch at $BranchShort, master on GitHub at $($MasterSha.Substring(0, 7))." 'Green'
  Log 'THE PLAN (golive, in this order, stopping at the first failure):' 'White'
  Log "  1. GO. The restore tag $RestoreTag = $MasterBase, pushed if not on GitHub yet." 'White'
  Log "  2. npx firebase deploy --only firestore:indexes --project $Project --non-interactive (two new; never deletes one)." 'White'
  Log '  3. npm run test:rules again; npx firebase deploy --only firestore:rules; checked LIVE.' 'White'
  if ($MasterPushed) { Log '  4. (no push: master is already the release)' 'White' } else { Log "  4. PUSH, then git push origin ${Branch}:master (fast-forward only)." 'White' }
  Log '  5. Render by hand: Manual Deploy (web), Manual Build (BOTH crons); LOADED once version.json names the commit.' 'White'
  Log "  6. npx firebase deploy --only $DeployFunction --project $Project (ONE function)." 'White'
  Log '  7. The read-only staff report, the checks after, the undo lines.' 'White'
  Log '  Then: -Stage seed (the Imagine Strength models), then Sizes at Solon and Strongsville.' 'White'
  Log 'PREPARE PASSED. Next: powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-oct12.ps1 -Stage golive' 'Green'
  exit 0
}

# ---- golive and seed: only what prepare tested -------------------------------------
if (-not (Test-Path $PreparedFile)) { Stop-Here 'prepare has not passed on this PC. Run prepare first.' }
$prepared = ((Get-Content -Path $PreparedFile -Raw).Trim()) -split '\s+'
if ($prepared.Count -ne 2 -or $prepared[0] -ne $BranchSha) { Stop-Here "$Branch has changed since prepare passed, so this commit has not been tested. Run prepare again." }
Log "prepare passed on this commit ($BranchShort)." 'Green'

# ==== golive ============================================================================
if ($Stage -eq 'golive') {
  Write-Host ''
  Write-Host 'THE OCT 12 RELEASE: the studio map, the session fixes, the staff webhook and the loose ends.' -ForegroundColor Yellow
  if ($MasterPushed) {
    Write-Host 'master on GitHub ALREADY holds this release (an earlier golive pushed it). That does not mean it is live.' -ForegroundColor Yellow
    Write-Host 'What may still be undone from that run, and is done again or asked about here:' -ForegroundColor Yellow
    Write-Host '  - the indexes and the rules (deployed again: no change if they are already there);' -ForegroundColor Yellow
    Write-Host '  - Render: the web service and BOTH crons on this commit (you confirm, the script reads version.json);' -ForegroundColor Yellow
    Write-Host '  - the Cloud Function mindbodyWebhook (deployed again: harmless if it is already this code);' -ForegroundColor Yellow
    Write-Host '  - the seed (-Stage seed) and the Sizes step in the app.' -ForegroundColor Yellow
  } else {
    Write-Host 'This changes PRODUCTION, in order: the restore tag; two new indexes; the RULES (after the rules tests pass again),' -ForegroundColor Yellow
    Write-Host '  checked live; then, after you type PUSH, master on GitHub. Then Render by hand, then ONE Cloud Function.' -ForegroundColor Yellow
  }
  Write-Host 'The rules add the finish marker, floorPlans and sizes, and narrow who writes sets and settings. iPads still on' -ForegroundColor Yellow
  Write-Host '  the old version are not refused (docs\rounds\2026-10-12-sessions.md section 4).' -ForegroundColor Yellow
  Write-Host 'No Mindbody call is added; nothing contacts anyone. Deploy before the studios open.' -ForegroundColor Yellow
  Write-Host ''
  if ((Read-Host 'AJ: type GO to start') -ne 'GO') { Log 'Nothing tagged, deployed or pushed.' 'Yellow'; exit 0 }
  Log 'AJ typed GO: the Oct 12 release, golive.' 'White'

  # The deploys send THIS folder's rules, indexes and functions\.
  & git --no-optional-locks diff --quiet HEAD -- firestore.rules firestore.indexes.json functions
  if ($LASTEXITCODE -ne 0) { Stop-Here 'firestore.rules, firestore.indexes.json or functions\ has uncommitted changes in this folder. Nothing was done. Ask Claude.' }

  # 1. The restore point: master BEFORE the release, whatever master is now.
  $tagOnGitHub = & git --no-optional-locks ls-remote --tags origin "refs/tags/$RestoreTag"
  if ($LASTEXITCODE -ne 0) { Stop-Here 'could not ask GitHub for its tags. Nothing was deployed or pushed.' }
  if (-not $tagOnGitHub) {
    if (-not (& git --no-optional-locks tag -l $RestoreTag)) {
      & git tag $RestoreTag $BaseSha
      if ($LASTEXITCODE -ne 0) { Stop-Here "could not make the restore tag $RestoreTag. Nothing was deployed or pushed." }
    } elseif ((& git --no-optional-locks rev-parse "$RestoreTag^{commit}").Trim() -ne $BaseSha) {
      Stop-Here "the restore tag $RestoreTag on this PC is not $MasterBase. Ask Claude; nothing was deployed or pushed."
    }
    $tp = Run "push the restore tag $RestoreTag" "git push origin refs/tags/$RestoreTag"
    Must $tp 'pushing the restore tag (nothing was deployed or pushed to master)'
  } elseif ((("$tagOnGitHub" -split '\s+')[0]) -ne $BaseSha) {
    Stop-Here "the restore tag $RestoreTag on GitHub is not $MasterBase. Ask Claude; nothing was deployed or pushed."
  }
  Log "Restore point on GitHub: $RestoreTag = $($BaseSha.Substring(0, 7))" 'Green'

  # 2. The indexes. They build in the background; until then the queries still
  #    answer. --non-interactive never deletes an index; never --force (it
  #    would delete the webhook logs' two TTL policies).
  $idx = Run "deploy firestore.indexes.json (project $Project)" "npx firebase deploy --only firestore:indexes --project $Project --non-interactive"
  if ($idx.Code -ne 0) { Stop-Here 'the index deploy failed. The live app, its rules and the function are unchanged and nothing was pushed.' }
  if (-not (@($idx.Output) -match 'Deploy complete')) { Stop-Here 'the index deploy did not say "Deploy complete". Nothing else was done. Ask Claude.' }
  Log 'Indexes deployed (they finish building by themselves). A note about "2 field overrides ... not present" is expected: those are the TTL policies.' 'Green'

  # 3. The rules: the file and the branches once more, the tests again (AJ's
  #    run counts), the deploy, then a check that what is LIVE is this file.
  $live3 = 'The indexes are deployed (harmless); the rules, the app and the function are as before; nothing was pushed.'
  Assert-RulesFile $live3
  Assert-RulesBranchesMerged $live3
  Run-RulesTests $live3
  $rules = Run "deploy firestore.rules (project $Project)" "npx firebase deploy --only firestore:rules --project $Project"
  if ($rules.Code -ne 0) { Stop-Here "the rules deploy failed. $live3 (Firebase console -> Firestore -> the named database -> Rules shows what is live.)" }
  if (-not (@($rules.Output) -match 'released rules')) { Stop-Here 'the rules deploy did not say it released the rules. The indexes are deployed; nothing was pushed. Ask Claude (Firebase console -> Firestore -> the named database -> Rules shows what is live).' }
  $live = Check-LiveRules 'the live rules against the release''s (read only)' 'firestore.rules' $LiveRulesMarks
  if ($live -eq 0) {
    Log "The ruleset LIVE on $Db is the release's firestore.rules, with every mark of both rounds." 'Green'
  } elseif ($live -eq 3) {
    Stop-Here "the ruleset live on $Db is not the release's firestore.rules (the log shows where they part). The indexes and possibly the rules are deployed (the old app is not refused by them); nothing was pushed. Ask Claude."
  } else {
    if ($live -eq -1) { Log 'No service-account key here, so the live rules could not be read.' 'Yellow' } else { Log "The live check could not run (exit $live)." 'Yellow' }
    Log "Firebase console -> Firestore -> the named database ($Db) -> Rules: the newest release (today). Ctrl F each:" 'Yellow'
    Log '   match /floorPlans/{planId}    match /finish/{docId}    finishFromHolder    logSessionReach' 'Yellow'
    if ((Read-Host 'Type LIVE if all four are there (Enter to stop here)') -ne 'LIVE') { Stop-Here 'the live rules were not confirmed. The indexes and rules are deployed (the old app is not refused by them); nothing was pushed. Run golive again once they are (ask Claude).' }
    Log 'AJ confirmed: the live rules hold the release''s marks.' 'Green'
  }

  # 4. The push, fast-forward only, and only while master on GitHub is still
  #    the base: asked again, just before.
  & git fetch -q origin
  if ($LASTEXITCODE -ne 0) { Stop-Here 'could not reach GitHub before the push. The indexes and rules are deployed (harmless); the app and the function are unchanged. Run golive again once GitHub answers.' }
  $MasterNow = (& git --no-optional-locks rev-parse origin/master).Trim()
  if ($MasterNow -eq $BranchSha) {
    Log "master on GitHub is already this release ($BranchShort): no push. Render and the function are still to confirm below." 'Yellow'
  } elseif ($MasterNow -eq $BaseSha) {
    & git --no-optional-locks merge-base --is-ancestor $BaseSha $Branch
    if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch no longer fast-forwards master. The indexes and rules are deployed (harmless); the app is unchanged. Ask Claude." }
    Write-Host ''
    Write-Host "Next: git push origin ${Branch}:master. What is on master is what trainers get at the next Render deploy." -ForegroundColor Yellow
    if ((Read-Host 'AJ: type PUSH to push the release to master') -ne 'PUSH') { Stop-Here 'not pushed (you did not type PUSH). The indexes and rules are deployed and harmless to the live app. Run golive again to push.' }
    $push = Run "git push origin ${Branch}:master" "git push origin ${Branch}:master"
    Must $push 'the push. The indexes and rules are deployed (harmless); the app and the function are unchanged'
  } else {
    Stop-Here "master on GitHub moved while golive ran (now $($MasterNow.Substring(0, 8))). The indexes and rules are deployed (harmless); nothing was pushed. Ask Claude."
  }

  # 5. Render, by hand. A push deploys NOTHING there.
  Log '' 'White'
  Log 'NOW, ON RENDER (dashboard.render.com), in this order:' 'White'
  Log '  a. maxstrength-app-beta -> Manual Deploy -> Deploy latest commit. Wait until it says Live.' 'White'
  Log '  b. journey-cron-renewals -> Manual Build. It MUST be rebuilt: it now counts only finished sessions as visits.' 'White'
  Log '  c. journey-cron-leaderboards -> Manual Build. (A cron left out keeps running its old commit.)' 'White'
  Log "  d. Check: curl.exe -s $AppUrl/version.json   names a build ending in -$BranchShort, and each cron's" 'White'
  Log '     page says its last deploy is the same commit.' 'White'
  Log '  Before the studios open: a wipe chore ticked on the old version today reads "None wiped yet today" on the new Board.' 'White'
  while ($true) {
    $ans = Read-Host "Type LOADED once the web service and both crons are on $BranchShort (STOP to stop here)"
    if ($ans -eq 'STOP') { Stop-Here "stopped before the function. master has the release and the rules are live; the webhook is still the old one. Run golive again (it skips the push) to go on." }
    if ($ans -ne 'LOADED') { continue }
    $build = Get-LiveBuild
    if ($build) {
      Log "Render serves build '$build'." 'White'
      if ($build.EndsWith("-$BranchShort")) { break }
      Log "That is not $BranchShort yet. Wait until the deploy says Live, then type LOADED again." 'Yellow'
    } else {
      $typed = Read-Host "Open $AppUrl/version.json in a browser and type the last seven characters of its build"
      if ("$typed".Trim() -eq $BranchShort) { Log 'AJ read version.json by hand: it names the release.' 'Green'; break }
      Log "That is not $BranchShort. Wait until the deploy says Live, then type LOADED again." 'Yellow'
    }
  }
  Log "Render serves the release ($BranchShort); AJ confirmed both crons." 'Green'

  # 6. ONE Cloud Function, by name. Never a plain --only functions (it would
  #    also deploy the staff-photo functions, which are not live).
  $fd = Run-Visible 'deploy the webhook function' "npx firebase deploy --only $DeployFunction --project $Project"
  if ($fd.Code -ne 0) { Stop-Here "the function deploy failed. The app, the rules and the indexes are live; the LIVE webhook is still the old one (that is safe). Run golive again (it skips the push), or from this folder: npx firebase deploy --only $DeployFunction --project $Project (ask Claude)." }
  Log "Deployed: $DeployFunction" 'Green'

  # 7. The read-only staff report (writes nothing, asks Mindbody nothing).
  if ($HaveKey) {
    $chk = Run 'the read-only check of trainers'' staff sites (writes nothing)' "npx tsx scripts/check-staff-sites.ts --key `"$KeyPath`" --project $GcpProject --database $Db"
    Write-Host ''
    $chk.Output | Where-Object { "$_" -match '^(1\.|2\.|3\.|   |SUMMARY)' } | ForEach-Object { Write-Host "  $_" -ForegroundColor White }
    if ($chk.Code -ne 0) { Log 'The check did not finish (see the log). It is only a report.' 'Yellow' }
    Log 'List 3: trainers whose Mindbody staff updates now wait in Limbo (their details stop refreshing; nothing wrong is written).' 'Yellow'
    Log 'List 2: details that may be someone else''s, from before the fix. They correct themselves on that trainer''s own next update. Ask Claude if any look wrong.' 'Yellow'
  } else {
    Log 'No service-account key, so the read-only staff report was skipped. Run it later (docs\rounds\2026-10-12-staff-webhook.md section 6).' 'Yellow'
  }

  # 8. The checks after, and the undo.
  $IndexCheck = "npx tsx scripts/check-live-rules.ts --key `"$KeyPath`" --project $GcpProject --database $Db --index `"$SessionsIndexSpec`""
  Log '' 'White'
  Log "GOLIVE COMPLETE. master = $BranchShort; the rules, the indexes, the app (Render) and $DeployFunction are live." 'Green'
  Log 'NOW, THE CHECKS (docs\rounds\2026-10-12-release.md section 5):' 'White'
  Log '1. The Hub opens on an iPad (it loads the new version there by itself; front-desk computers: reload).' 'White'
  Log '2. One session started and finished: the Wrap-up comes up, the profile shows it Completed, the count goes up by one.' 'White'
  Log '3. Operations -> Today: any "Not finished" rows each have Open.' 'White'
  Log '4. My Studio -> Machines: the list (the map once a studio is drawn and sized); a tap opens the machine card.' 'White'
  Log '5. Admins -> Machinery -> Limbo: new staff rows read as sentences. Admins -> Machinery -> Mindbody sync: every studio healthy.' 'White'
  Log '6. Firebase console -> Functions -> mindbodyWebhook -> Logs: no errors on the next bookings. Watch the next booking the' 'White'
  Log '   front desk makes or moves for a linked trainer: their name is on the Hub within a minute. NEVER make a booking in' 'White'
  Log '   Mindbody to test it: Mindbody may email the client.' 'White'
  Log '7. The indexes built (minutes). Hours'' index, read only:' 'White'
  Log "     $IndexCheck" 'Cyan'
  Log '   says READY. The trainers index (mindbodyStaffId, accessibleStudioIds): Firebase console -> Firestore -> the named' 'White'
  Log '   database -> Indexes says Enabled (the check above cannot read an array-contains index).' 'White'
  Log 'Next: once version.json names the commit and every administrator and the Solon and Strongsville leaders have' 'White'
  Log 'opened the Hub:  powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-oct12.ps1 -Stage seed' 'Cyan'
  Write-UndoLines
  $elapsed = [int]((Get-Date) - $Started).TotalMinutes
  Log "Done in about $elapsed minute(s)." 'Green'
  exit 0
}

# ==== seed ==============================================================================
if (-not $MasterPushed) { Stop-Here "master on GitHub is still ${MasterBase}: golive has not pushed the release. Run golive first." }

Log "Asking Render which build it serves ($AppUrl/version.json, read only)" 'Cyan'
$build = Get-LiveBuild
if (-not $build) { Stop-Here 'could not read version.json. Nothing was written. Try again in a minute.' }
Log "Render serves build '$build'." 'White'
if (-not $build.EndsWith("-$BranchShort")) { Stop-Here "Render does not serve $BranchShort yet. Press Manual Deploy on the web service (and Manual Build on both crons), wait until it is Live, then run this stage again. Nothing was written." }
Log "Render serves the release ($BranchShort)." 'Green'

if (-not $HaveKey) { Stop-Here "no service-account.json in $Root or $MainRoot. Put it in the project folder (it stays out of git) and run this stage again. Nothing was written." }
$Seed = "npx tsx scripts/seed-imagine-strength-models.ts --key `"$KeyPath`" --project $GcpProject --database $Db --confirm-project $GcpProject"

Log '' 'White'
Log 'BEFORE THE SEED: every administrator, and the Solon and Strongsville leaders, opens the Hub on their iPad' 'Yellow'
Log '  so it loads the new version. An iPad still on the old one can erase what this stage adds: saving a model on' 'Yellow'
Log '  Admins drops its size, and saving a machine in the old editor can take a unit''s model away.' 'Yellow'
Log '' 'White'

$dry = Run 'the Imagine Strength models, dry run (reads only)' $Seed
Must $dry 'the seed''s dry run (nothing was written)'
if (@($dry.Output) -match 'Nothing to write') {
  Log 'The twenty are already there: nothing to write. Go on to the in-app step below.' 'Green'
} else {
  Write-Host ''
  Write-Host 'Read the dry run above (the whole of it is in the log): one "+ mm-imagine-strength-..." line for each' -ForegroundColor Yellow
  Write-Host '  model it would write, each with its size in feet and inches, and "Nothing was written. Add --commit".' -ForegroundColor Yellow
  Write-Host 'It writes machineModels only (create-only; an id already there is skipped). It touches no studio''s machines.' -ForegroundColor Yellow
  Write-Host ''
  if ((Read-Host 'AJ: type GO to write them to PRODUCTION') -ne 'GO') { Log 'Nothing written.' 'Yellow'; exit 0 }
  Log 'AJ typed GO: the Imagine Strength models, --commit.' 'White'
  $wr = Run 'the Imagine Strength models, --commit' "$Seed --commit"
  Must $wr 'the seed (it writes all twenty in one batch, all or nothing)'
  $again = Run 'the dry run again (reads only)' $Seed
  Must $again 'the second dry run'
  if (-not (@($again.Output) -match 'Nothing to write')) { Stop-Here 'the second dry run still has models to write. Ask Claude.' }
  Log 'The twenty Imagine Strength models are recorded (the second dry run: "Nothing to write").' 'Green'
}

Log '' 'White'
Log 'NOW, IN THE APP (nothing is drawn at a size until a leader marks the units):' 'White'
Log '1. On an iPad, as a leader of Solon, then of Strongsville: My Studio -> Machines -> Draw the floor.' 'White'
Log '   Type the studio''s square feet, Draw the room, then the line "N machines have no size yet - Sizes".' 'White'
Log '2. On Sizes every catalog machine starts TICKED (AJ: "Yes, nearly all"). Untick any that is NOT Imagine' 'White'
Log '   Strength (a studio''s own machine starts unticked), then tap "Mark N as Imagine Strength". Undo is on the' 'White'
Log '   message after it. Nothing is written before that tap.' 'White'
Log '3. Place the machines (Place them all lines them along the walls), add the door, the AED and the fire' 'White'
Log '   extinguisher, and Save. A floor shows its list, not its map, until every placed machine has a size.' 'White'
Log '4. westlake and Willoughby (older machines): Sizes, untick, then a model or Measure on each row.' 'White'
Log '' 'White'
Log 'TO UNDO THE SEED (ask Claude first): the same command with --remove (a dry run), then --remove --commit.' 'White'
Log "     $Seed --remove" 'Cyan'
Log '  It removes only the twenty still signed by the seed, and refuses any a studio''s machine still names.' 'White'
$elapsed = [int]((Get-Date) - $Started).TotalMinutes
Log "Done in about $elapsed minute(s)." 'Green'
exit 0
