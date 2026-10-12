<#
 SCRIPT-VERSION: v1  (Oct 12 2026, the studio map)

 Ships branch oct10/studio-map: the studio map round of Oct 10 to 12 2026
 (docs\rounds\2026-10-12-studio-map.md is the round). AJ, Oct 10 2026: "take
 it away i like your ideas"; Oct 11 2026: "yes id love an interactive map
 because the trainers know where all the machines are they dont remember
 them alphabetically." Built on master as it is on GitHub (5a0bf7ea, the
 partition and the rules' trim). In it:

   - firestore.rules: a model's size (modelSizeValid), a unit's size on the
     roster (rosterUnitSizeOk, the roster rule in resolve-once form), and the
     layout (match /floorPlans/{planId}: current and five draft slots, rev
     up by one a write, nothing deleted). It only ADDS access: the old app
     never reads or writes floorPlans or unit.size;
   - no index, no Cloud Function, no server change, no Mindbody call, no
     new setting; machineCareValid is byte for byte master's;
   - the app: sizes, the room as boxes, Arrange the floor, remodel plans
     with machines still to buy, the one machine card, the map first on My
     Studio -> Machines, and the team's cleaning checklist;
   - a seed script (scripts\seed-imagine-strength-models.ts) for the twenty
     Imagine Strength models, run once after the app is live.

 THREE STAGES. The rules go FIRST because this round only adds access (the
 house order: indexes, rules tests, rules, push, Render):

   prepare  changes nothing in production and nothing in git (it reads
            GitHub with git ls-remote and the live rules with the key, and
            writes only logs\, dist\ and build\): the partition live (the
            live rules are master's, 5a0bf7ea, or already this branch's), the
            branch and a clean tree, LF line ends, the case check, functions\,
            render.yaml, firestore.indexes.json, server\, server.ts,
            package.json and its lock unchanged, the round's rules in the file
            (rosterUnitSizeOk, modelSizeValid, the floorPlans match with
            'boxes' and no 'outline'), machineCareValid byte for byte
            master's, the studio settings holding no layoutSpacingIn or
            layoutPathIn, the rules lint, the typecheck COUNT (2), the suite in
            Eastern time, the builds, the first screen's budget, no perf lab
            marker in dist\, the rules tests, the Firebase login. Ends
            PREPARE PASSED.

   golive   refuses unless the branch is exactly what prepare tested, asks for
            GO, then: the restore tag restore/2026-10-12-before-studio-map at
            master; firestore.indexes.json deployed (no change, the house
            order); the rules tests again; firestore.rules deployed and
            checked LIVE (match /floorPlans/{planId}); git push
            oct10/studio-map:master, fast-forward only. Prints Render's three
            presses and "Next: -Stage seed once version.json names the
            commit."

   seed     refuses unless Render serves the branch's commit, then the
            Imagine Strength models' dry run (reads only), GO, the same with
            --commit, and the in-app step for AJ.

 Run from the branch's own folder, .claude\worktrees\studio-map (it is on the
 branch already; do not switch branches by hand). IN ORDER:

   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-studio-map.ps1 -Stage prepare
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-studio-map.ps1 -Stage golive
   (Render, by hand: Manual Deploy on the web service, Manual Build on both crons)
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-studio-map.ps1 -Stage seed

 This script neither checks nor edits CLAUDE.md: that file is rewritten on
 another branch (oct9/claude-md). The lines this round adds to it are in the
 round document, "For CLAUDE.md (applied at ship time)".

 To undo: git push --force origin restore/2026-10-12-before-studio-map:master
 and Render's three presses. The rules can stay (they only add access; the
 old app never touches floorPlans or unit.size). The seed has --remove.
 Cleaning marks made with the new app stay valid for the old one: they are
 the same machineCare fields its care sheet writes.

 ASCII only on purpose (Windows PowerShell 5.1 reads a script as ANSI).
#>

param([Parameter(Mandatory = $true, Position = 0)][ValidateSet('prepare', 'golive', 'seed')][string]$Stage)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-studio-map.log'
# What prepare tested: "<branch sha> <origin master sha>". golive and seed read it.
$PreparedFile = Join-Path $Root 'logs\ship-studio-map.prepared'
# master's firestore.rules before this round, written for the live check.
$BaseRulesFile = Join-Path $Root 'logs\ship-studio-map.base.rules'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$Branch = 'oct10/studio-map'
$Folder = '.claude\worktrees\studio-map'
$RestoreTag = 'restore/2026-10-12-before-studio-map'
# master on GitHub with the partition and the rules' trim (Oct 11 2026). If
# anything else lands on master first, the branch takes it in and this line
# moves with it (ask Claude).
$MasterBase = '5a0bf7ea'
# 2 since the Hub fixes (Oct 1): clinical-review/charts.tsx and
# EditTrainerModal.tsx. This round keeps the same two. More is new.
$TscBaseline = 2
$Project = 'prod'
$GcpProject = 'gen-lang-client-0731527386'
$Db = 'ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa'
$AppUrl = 'https://maxstrength-app-beta.onrender.com'
# The round's rules, which must be in the file deployed...
$RulesMarks = @('function rosterUnitSizeOk(', 'function modelSizeValid(', 'match /floorPlans/{planId}')
# ...and what must be in the ruleset live afterwards.
$LiveRulesMarks = @('match /floorPlans/{planId}', 'rosterUnitSizeOk', 'modelSizeValid')
# The partition's rule, which must already be live (this round's rules call trainerLeads with owned studios).
$PartitionMark = 'roleRunsOwnStudios'
# The service-account key, in the project folder three levels up (a worktree
# has no copy). The live check and the seed use it; neither prints a secret.
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
# -expect), 3 it differs or lacks an -expect, 2 no release, 1 it could not
# run; -1 no key.
function Check-LiveRules {
  param([string]$label, [string]$rulesPath, [string[]]$expect = @())
  if (-not $HaveKey) { return -1 }
  $cmd = "npx tsx scripts/check-live-rules.ts --key `"$KeyPath`" --project $GcpProject --database $Db --rules `"$rulesPath`""
  foreach ($e in $expect) { $cmd += " --expect `"$e`"" }
  $r = Run $label $cmd
  return $r.Code
}

# Writes master's rules before this round to logs\ for the live check.
function Write-BaseRules {
  & cmd /c "git --no-optional-locks show ${BaseSha}:firestore.rules > `"$BaseRulesFile`" 2>&1"
  if ($LASTEXITCODE -ne 0) { Stop-Here "could not write $MasterBase's firestore.rules to logs\ for the live check. Ask Claude." }
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

Log "ship-studio-map $Stage" 'White'

# ---- the branch's own worktree folder ------------------------------------------------
$top = (& git --no-optional-locks rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not (Test-Path 'package.json') -or -not (Test-Path 'scripts\ship\ship-studio-map.ps1') -or ((Resolve-Path $top).Path -ne (Get-Location).Path)) { Stop-Here "run this from the top of the branch's folder, $Folder." }
foreach ($f in @('src\features\studio-map\layout.ts', 'src\features\studio-map\store.ts', 'src\features\studio-map\ui\LayoutView.tsx', 'src\features\studio-map\ui\FloorMapView.tsx', 'src\features\machine-card\MachineCard.tsx', 'src\features\relay\board\cleaning.ts', 'scripts\seed-imagine-strength-models.ts', 'tests\firestore.rules.lint.test.ts', 'scripts\check-live-rules.ts', 'scripts\check-bundle-budget.mjs', 'docs\rounds\2026-10-12-studio-map.md')) {
  if (-not (Test-Path $f)) { Stop-Here "$f is missing from this folder. Ask Claude." }
}

$head = (& git --no-optional-locks symbolic-ref --quiet --short HEAD)
if ($LASTEXITCODE -ne 0 -or "$head".Trim() -ne $Branch) { Stop-Here "this folder is on '$head', not $Branch. Run it from $Folder, or ask Claude; do not switch branches by hand." }
$dirty = (& git --no-optional-locks status --porcelain --untracked-files=no -- src docs server server.ts scripts tests functions public harness index.html firestore.rules firestore.indexes.json firebase.json package.json package-lock.json vite.config.ts render.yaml ROADMAP.md .github) | Where-Object { $_ }
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
# already the branch's head (golive ran; seed may follow). Anything else
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
& git --no-optional-locks diff --quiet $BaseSha $Branch -- firestore.rules
if ($LASTEXITCODE -eq 0) { Stop-Here "firestore.rules is the same as $MasterBase's, but this round adds to it. Ask Claude." }
foreach ($p in @('functions', 'render.yaml', 'firestore.indexes.json', 'server', 'server.ts', 'package.json', 'package-lock.json')) {
  & git --no-optional-locks diff --quiet $BaseSha $Branch -- $p
  if ($LASTEXITCODE -ne 0) { Stop-Here "$p changed in this round, and this round changes no Cloud Function, Render setting, index, server file or dependency. Ask Claude." }
}
$rulesText = Get-Content -Path 'firestore.rules' -Raw
foreach ($mark in $RulesMarks) {
  if (-not $rulesText.Contains($mark)) { Stop-Here "firestore.rules does not hold '$mark'. Ask Claude." }
}
# The layout's block: the room is boxes (Oct 11), never the outline of the first design.
$fpStart = $rulesText.IndexOf('match /floorPlans/{planId}')
$fpEnd = $rulesText.IndexOf('allow delete: if false;', $fpStart)
if ($fpEnd -lt 0) { Stop-Here 'the floorPlans block in firestore.rules has no "allow delete: if false;". Ask Claude.' }
$fpBlock = $rulesText.Substring($fpStart, $fpEnd - $fpStart)
if (-not $fpBlock.Contains("'boxes'")) { Stop-Here "the floorPlans block does not name 'boxes'. Ask Claude." }
if ($fpBlock.Contains("'outline'")) { Stop-Here "the floorPlans block still names 'outline' (the room before Oct 11). Ask Claude." }
# The cleaning checklist writes the care record under master's rule, unchanged.
$baseRulesText = (& git --no-optional-locks show "${BaseSha}:firestore.rules") -join "`n"
$careHere = Get-RulesFunction $rulesText 'machineCareValid'
$careBase = Get-RulesFunction $baseRulesText 'machineCareValid'
if (-not $careHere -or -not $careBase) { Stop-Here 'could not find machineCareValid in the rules. Ask Claude.' }
if ($careHere -cne $careBase) { Stop-Here "machineCareValid differs from $MasterBase's, and this round must not change it. Ask Claude." }
$registry = Get-Content -Path 'src\features\studio-settings\registry.ts' -Raw
foreach ($gone in @('layoutSpacingIn', 'layoutPathIn')) {
  if ($registry.Contains($gone)) { Stop-Here "the studio settings still hold $gone, which this round dropped (no spacing or path check). Ask Claude." }
}
Log "Against ${MasterBase}: firestore.rules CHANGED (sizes and the layout; machineCareValid the same); functions\, render.yaml, the indexes, server\, server.ts, package.json and its lock did not." 'Green'

# ==== prepare ===========================================================================
if ($Stage -eq 'prepare') {
  if (Test-Path $PreparedFile) { Remove-Item -Force $PreparedFile }

  Log 'What changes, by folder:' 'Yellow'
  & git --no-optional-locks diff --stat $BaseSha $Branch | Select-Object -Last 1 | ForEach-Object { Log "   $_" 'Yellow' }
  & git --no-optional-locks diff --dirstat=files,3 $BaseSha $Branch | ForEach-Object { Log "   $_" 'Yellow' }
  Log 'The rules (golive deploys them before the push):' 'Yellow'
  & git --no-optional-locks diff --stat $BaseSha $Branch -- firestore.rules | ForEach-Object { Log "   $_" 'Yellow' }

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

  # THE PARTITION MUST BE LIVE: this round's rules call trainerLeads with a
  # franchise owner's owned studios. The live rules are master's (the
  # partition, trimmed), or already this branch's (golive ran).
  if ($HaveKey) {
    Write-BaseRules
    $lc = Check-LiveRules "the live rules against $MasterBase's (read only)" $BaseRulesFile @($PartitionMark)
    if ($lc -eq 0) {
      Log "The rules LIVE on $Db are $MasterBase's, the partition's. golive adds this round's to them." 'Green'
    } elseif ($lc -eq 3) {
      $lb = Check-LiveRules 'the live rules against this branch''s (read only)' 'firestore.rules' @($PartitionMark)
      if ($lb -eq 0) { Log "The rules LIVE are already this branch's." 'Green' }
      elseif ($lb -eq 3) { Stop-Here "the rules LIVE on $Db are neither $MasterBase's (the partition) nor this branch's. The partition must be live first (scripts\ship\ship-partition.ps1 -Stage rules, then the trim), or rules were deployed from somewhere else. Ask Claude." }
      else { Stop-Here "could not compare the live rules with this branch's (exit $lb). Ask Claude." }
    } else {
      Stop-Here "could not read the live rules (exit $lc), so whether the partition is live is unknown. Ask Claude."
    }
  } else {
    Log "The service-account key is not at $KeyPath, so the live rules can't be read here." 'Yellow'
    Log "Firebase console -> Firestore -> the named database ($Db) -> Rules: the newest release, Ctrl F  function roleRunsOwnStudios" 'Yellow'
    if ((Read-Host 'Type PARTITION if it is there (the partition is live; Enter to stop here)') -ne 'PARTITION') { Stop-Here 'the partition was not confirmed live. It must be, first.' }
    Log 'AJ confirmed: the live rules hold roleRunsOwnStudios (the partition).' 'Green'
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

  # The rules lint (no emulator): the file's size, every function called is
  # defined, and the machine-care match byte for byte as on master.
  $lint = Run 'the rules lint test' 'npx vitest run tests/firestore.rules.lint.test.ts'
  Must $lint 'the rules lint test'

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

  # A production build: NODE_ENV unset (a "test" build ships React's
  # development files, and the budget refuses it), and never a lab build.
  Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
  Remove-Item Env:VITE_PERF_LAB -ErrorAction SilentlyContinue
  # vite.config.ts keeps dist\ between builds (emptyOutDir false), so an
  # earlier development or test build's files would still sit there and the
  # marker scan below would read them as this build's. dist\ is git-ignored
  # build output and Render starts from an empty one: clear it so the scan
  # sees only this build.
  if (Test-Path 'dist') { Remove-Item -Recurse -Force 'dist' }
  $bd = Run 'build (the app)' 'npx vite build'
  Must $bd 'the app build'
  $bb = Run 'build (the crons)' 'npm run build:backend'
  Must $bb 'the crons build'
  $bs = Run 'build (the server)' 'npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=build/server.cjs'
  Must $bs 'the server build'
  $budget = Run 'the first screen''s size budget' 'npm run check:bundle'
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

  Run-RulesTests 'Nothing is deployed or pushed.'

  Set-Content -Path $PreparedFile -Value "$BranchSha $MasterSha" -Encoding ascii
  Log "Tested: $Branch at $BranchShort, master on GitHub at $($MasterSha.Substring(0, 7))." 'Green'
  Log 'THE PLAN:' 'White'
  Log "  golive: 1. the restore tag $RestoreTag = $MasterBase, pushed if not on GitHub yet." 'White'
  Log '          2. firestore.indexes.json (no change; the house order), --non-interactive, never --force.' 'White'
  Log '          3. the rules tests again; firestore.rules deployed; checked LIVE.' 'White'
  if ($MasterPushed) { Log '          4. (no push: master is already the branch''s head)' 'White' } else { Log "          4. git push origin ${Branch}:master (fast-forward only), if master on GitHub is still $MasterBase." 'White' }
  Log '  by hand: git pull --ff-only in the project folder; Render''s three presses.' 'White'
  Log '  seed:   the Imagine Strength models (dry run, GO, --commit), then Sizes on Solon and Strongsville.' 'White'
  Log 'PREPARE PASSED. Next: powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-studio-map.ps1 -Stage golive' 'Green'
  exit 0
}

# ---- golive and seed: only what prepare tested ------------------------------------
if (-not (Test-Path $PreparedFile)) { Stop-Here 'prepare has not passed on this PC. Run prepare first.' }
$prepared = ((Get-Content -Path $PreparedFile -Raw).Trim()) -split '\s+'
if ($prepared.Count -ne 2 -or $prepared[0] -ne $BranchSha) { Stop-Here "$Branch has changed since prepare passed, so this commit has not been tested. Run prepare again." }
# The deploys send THIS folder's firestore.rules and firestore.indexes.json.
& git --no-optional-locks diff --quiet HEAD -- firestore.rules firestore.indexes.json
if ($LASTEXITCODE -ne 0) { Stop-Here 'firestore.rules or firestore.indexes.json has uncommitted changes in this folder. Ask Claude.' }

# ==== golive ============================================================================
if ($Stage -eq 'golive') {
  Write-Host ''
  Write-Host 'The studio map (AJ: "yes id love an interactive map").' -ForegroundColor Yellow
  Write-Host 'This makes the restore tag, deploys the indexes (no change) and the RULES to PRODUCTION (they only add' -ForegroundColor Yellow
  Write-Host '  access: a model''s size, a unit''s size, the layout), checks them live,' -ForegroundColor Yellow
  if ($MasterPushed) { Write-Host '  and pushes nothing (master is already this commit).' -ForegroundColor Yellow } else { Write-Host '  then pushes to master.' -ForegroundColor Yellow }
  Write-Host 'Render deploys nothing on a push: the app goes live when you press Deploy. No Cloud Function; no' -ForegroundColor Yellow
  Write-Host '  Mindbody call; nothing contacts anyone.' -ForegroundColor Yellow
  Write-Host ''
  if ((Read-Host 'AJ: type GO to tag, deploy the indexes and the rules, and push') -ne 'GO') { Log 'Nothing deployed, tagged or pushed.' 'Yellow'; exit 0 }
  Log 'AJ typed GO: the studio map, golive.' 'White'

  # 1. The restore point: master BEFORE this round, whatever master is now.
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

  # 2. The indexes, the house order (this round adds none). --non-interactive
  #    never deletes an index; never --force (it would delete the webhook
  #    logs' two TTL policies).
  $idx = Run "deploy firestore.indexes.json (project $Project)" "npx firebase deploy --only firestore:indexes --project $Project --non-interactive"
  if ($idx.Code -ne 0) { Stop-Here 'the index deploy failed. The live app and its rules are unchanged and nothing was pushed.' }
  if (-not (@($idx.Output) -match 'Deploy complete')) { Stop-Here 'the index deploy did not say "Deploy complete". Nothing was pushed. Ask Claude.' }
  Log 'Indexes deployed (no change). A note about "2 field overrides ... not present" is expected: those are the TTL policies.' 'Green'

  # 3. The rules: tested again, deployed, checked live.
  Run-RulesTests 'The indexes are deployed (no change); the rules and the app are as before; nothing was pushed.'
  $rules = Run "deploy firestore.rules (project $Project)" "npx firebase deploy --only firestore:rules --project $Project"
  if ($rules.Code -ne 0) { Stop-Here 'the rules deploy failed. The app and its rules are as before (Firebase console -> Firestore -> the named database -> Rules shows what is live); nothing was pushed.' }
  if (-not (@($rules.Output) -match 'released rules')) { Stop-Here 'the rules deploy did not say it released the rules. Nothing was pushed. Ask Claude (Firebase console -> Firestore -> the named database -> Rules shows what is live).' }
  $live = Check-LiveRules 'the live rules against this branch''s (read only)' 'firestore.rules' $LiveRulesMarks
  if ($live -eq 0) {
    Log "The ruleset LIVE on $Db is this branch's firestore.rules, with match /floorPlans/{planId}." 'Green'
  } elseif ($live -eq 3) {
    Stop-Here "the ruleset live on $Db is not this branch's firestore.rules (the log shows where they part). Nothing was pushed. Ask Claude."
  } else {
    if ($live -eq -1) { Log "The key is not at $KeyPath, so the live rules could not be read here." 'Yellow' } else { Log "The live check could not run (exit $live)." 'Yellow' }
    Log "Firebase console -> Firestore -> the named database ($Db) -> Rules: the newest release (today), Ctrl F  match /floorPlans/{planId}" 'Yellow'
    if ((Read-Host 'Type LIVE if it is there (Enter to stop here)') -ne 'LIVE') { Stop-Here 'the live rules were not confirmed. They are deployed (they only add access); nothing was pushed. Ask Claude.' }
    Log 'AJ confirmed: the live rules hold match /floorPlans/{planId}.' 'Green'
  }

  # 4. The push, fast-forward only, and only while master is still the base.
  $MasterNow = Get-RemoteMaster
  if (-not $MasterNow) { Stop-Here 'could not reach GitHub before the push. The rules are deployed (they only add access); the app is unchanged. Run golive again once GitHub answers.' }
  if ($MasterNow -eq $BranchSha) {
    Log 'master on GitHub is already this commit: nothing to push.' 'Green'
  } elseif ($MasterNow -eq $BaseSha) {
    & git --no-optional-locks merge-base --is-ancestor $BaseSha $Branch
    if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch no longer fast-forwards master. The rules are deployed (harmless); the app is unchanged. Ask Claude." }
    $push = Run "git push origin ${Branch}:master" "git push origin ${Branch}:master"
    Must $push 'the push. The rules are deployed (harmless); the app is unchanged'
  } else {
    Stop-Here "master on GitHub moved while golive ran (now $($MasterNow.Substring(0, 8))). The rules are deployed (harmless); nothing was pushed. Ask Claude."
  }

  Log "DONE. master on GitHub = $BranchShort, and the rules are live. The app is NOT live yet (Render deploys nothing on a push)." 'Green'
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
  Log '4. The iPads pick the new version up by themselves on the Hub (never over a session or while typing).' 'White'
  Log 'Next: -Stage seed once version.json names the commit:' 'White'
  Log '     powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-studio-map.ps1 -Stage seed' 'Cyan'
  Log '' 'White'
  Log 'TO UNDO (ask Claude first):' 'White'
  Log "  git push --force origin ${RestoreTag}:master, then Render's three presses. The rules can stay." 'White'
  $elapsed = [int]((Get-Date) - $Started).TotalMinutes
  Log "Done in about $elapsed minute(s)." 'Green'
  exit 0
}

# ==== seed ==============================================================================
if (-not $MasterPushed) { Stop-Here "master on GitHub is still ${MasterBase}: golive has not pushed this round. Run golive first." }

# Render must serve this commit: version.json is {"build": "<time>-<commit7>"}.
Log "Asking Render which build it serves ($AppUrl/version.json, read only)" 'Cyan'
try {
  $ver = Invoke-RestMethod -Uri "$AppUrl/version.json" -Headers @{ 'Cache-Control' = 'no-cache' } -TimeoutSec 20
} catch {
  Stop-Here "could not read $AppUrl/version.json ($($_.Exception.Message)). Nothing was written. Try again in a minute."
}
$build = "$($ver.build)".Trim()
Log "Render serves build '$build'." 'White'
if (-not $build.EndsWith("-$BranchShort")) { Stop-Here "Render does not serve $BranchShort yet. Press Manual Deploy on the web service (and Manual Build on both crons), wait until it is Live, then run this stage again. Nothing was written." }
Log "Render serves this round's commit ($BranchShort)." 'Green'

if (-not $HaveKey) { Stop-Here "the service-account key is not at $KeyPath. Put it there (it stays out of git) and run this stage again. Nothing was written." }
$Seed = "npx tsx scripts/seed-imagine-strength-models.ts --key `"$KeyPath`" --project $GcpProject --database $Db --confirm-project $GcpProject"

# The dry run: reads which of the twenty are there, writes nothing.
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
Log '2. On Sizes every catalog machine starts TICKED (your "Yes, nearly all"). Untick any that is NOT Imagine' 'White'
Log '   Strength (a studio''s own machine starts unticked), then tap "Mark N as Imagine Strength". Undo is on the' 'White'
Log '   message after it. Nothing is written before that tap.' 'White'
Log '3. Place the machines (Place them all lines them along the walls), add the door, the AED and the fire' 'White'
Log '   extinguisher, and Save. From then on My Studio -> Machines opens on the map for everyone there.' 'White'
Log '4. westlake and Willoughby (older machines): Sizes, untick, then a model or Measure on each row.' 'White'
Log '' 'White'
Log 'TO UNDO THE SEED (ask Claude first): the same command with --remove (a dry run), then --remove --commit.' 'White'
Log '  It removes only the twenty still signed by the seed, and refuses any a studio''s machine still names.' 'White'
$elapsed = [int]((Get-Date) - $Started).TotalMinutes
Log "Done in about $elapsed minute(s)." 'Green'
exit 0
