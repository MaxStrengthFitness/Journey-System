<#
 SCRIPT-VERSION: v1  (Oct 14 2026, privacy Round 0, strangers out)

 Ships branch privacy/0-strangers-out: Round 0 of the privacy lock. AJ, Oct
 14 2026: "Let's make sure that everything's strict and safe right now. I'm
 concerned about maybe something breaking, but I trust you." and "I don't
 want it to affect our app". docs\rounds\2026-10-14-strangers-out.md is the
 round.

 WHAT GOES TO PRODUCTION (golive, after GO), in this order:
   1. the restore tag restore/2026-10-14-before-privacy-0 = aa846261 (master
      before this round), pushed to GitHub;
   2. firestore.rules (npx firebase deploy --only firestore:rules --project
      prod; the named database is firebase.json's), checked LIVE afterwards
      with scripts\check-live-rules.ts (read only);
   3. git push origin privacy/0-strangers-out:master, fast-forward only,
      only while master on GitHub is still aa846261.
 NO Render step: the app does not change. No index, no Cloud Function (two
 comments in functions\src changed, nothing to deploy), no Mindbody call, no
 data written. Nothing contacts anyone.

 Who notices: nobody who has been let in (a trainer record), at any studio.
 A Google account that was never let in sees the access screen, as before,
 and can no longer read any client's or studio's records.

 Run it in PowerShell, IN ORDER, from the folder that has the branch. The
 script lives on the branch, so that is the branch's own folder while it is
 there:

   cd C:\Users\austi\Projects\Journey-System-Beta-master\.claude\worktrees\privacy-0
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-privacy-0.ps1 -Stage prepare
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-privacy-0.ps1 -Stage golive

 If that folder is gone, use the project folder instead, switched to the
 branch first:

   cd C:\Users\austi\Projects\Journey-System-Beta-master
   git switch privacy/0-strangers-out
   (then the same two lines)

 (prepare switches the folder it runs in to the branch when it is not on it
 and the branch is not open anywhere else; when it is open in another
 folder, it says which, and you run it there.)

 prepare  changes nothing in production and nothing on GitHub: it fetches,
          checks master on GitHub is still aa846261 (or the branch already
          holds it), that the branch is exactly the round Claude built, a
          clean tree, LF line ends, only the round's files changed (the
          functions\ changes comments only), the typecheck COUNT (2), the
          round's tests, the rules lint, npm run test:rules; then, after you
          type AUDIT, the read-only audit with the service account
          (scripts\privacy-audit.ts), which must say item 0 = 0 and item
          12 = 0; then you type YES for the Microsoft question below; then
          the Firebase login. Ends PREPARE PASSED.

 golive   refuses unless prepare passed on exactly this branch and master;
          checks the LIVE rules are master's (read only); asks for GO;
          does 1-3 above; prints the check to make and the undo.

 THE MICROSOFT QUESTION. The rules make a trainer record the door, and a
 stranger's one way to one is claiming a placeholder whose email matches
 theirs. That is safe while Microsoft sign-in lets in only company
 accounts: the Azure app registration must be single-tenant ("Accounts in
 this organizational directory only"), as the app's own comment says, or
 Microsoft sign-in must not be switched on yet. Not sure? Stop and ask.

 TO UNDO: the rules from restore/2026-10-14-before-privacy-0 first
 (docs\ops\DEPLOYS-AND-ROLLBACK.md, "The rules"); then, if wanted, a revert
 on master. Ask Claude first.

 ASCII only on purpose (Windows PowerShell 5.1 reads a script as ANSI).
#>

param([Parameter(Mandatory = $true, Position = 0)][ValidateSet('prepare', 'golive')][string]$Stage)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-privacy-0.log'
# What prepare tested: "<branch sha> <origin master sha>". golive reads it.
$PreparedFile = Join-Path $Root 'logs\ship-privacy-0.prepared'
# master's firestore.rules before this round, written for the live check.
$BaseRulesFile = Join-Path $Root 'logs\ship-privacy-0.base.rules'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$Branch = 'privacy/0-strangers-out'
$Folder = '.claude\worktrees\privacy-0'
# GitHub master the round was built on, and the round's last commit before
# this script's own (the script's commit may follow it, touching only itself).
$BaseSha = 'aa84626196b1759911afae10b04ab526a0c2a0f7'
$BranchExpected = 'f0f89468ac5b10679718d40e5a39ba9fb922e293'
$ScriptPath = 'scripts/ship/ship-privacy-0.ps1'
$RestoreTag = 'restore/2026-10-14-before-privacy-0'
$TscBaseline = 2
$Project = 'prod'
$GcpProject = 'gen-lang-client-0731527386'
$Db = 'ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa'
# What the branch may change; anything else is not the round Claude built.
$Allowed = '^(firestore\.rules$|tests/|docs/|src/features/privacy/|scripts/privacy-audit\.ts$|scripts/ship/ship-privacy-0\.ps1$|functions/src/claims\.ts$|functions/src/claims-logic\.ts$)'
# The round's rules, which must be in the file and, afterwards, live.
$RulesMarks = @('function isLetIn(', 'function sessionTenancyKept(', 'function sessionClientMoved(', 'function approvalsStayReal(')
$Started = Get-Date

# The main checkout (the key lives there): the parent of git's common folder.
$commonDir = (& git --no-optional-locks rev-parse --path-format=absolute --git-common-dir)
if ($LASTEXITCODE -eq 0 -and $commonDir) { $MainRoot = Split-Path -Parent ($commonDir.Trim() -replace '/', '\') } else { $MainRoot = $Root }
$KeyPath = @((Join-Path $Root 'service-account.json'), (Join-Path $MainRoot 'service-account.json')) | Where-Object { Test-Path $_ } | Select-Object -First 1
$HaveKey = [bool]$KeyPath

function Log {
  param([string]$m, [string]$c = 'Gray')
  $l = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m
  Write-Host $l -ForegroundColor $c
  Add-Content -Path $LogFile -Value $l -Encoding utf8
}

function Run {
  param([string]$label, [string]$cmd, [int]$show = 18)
  Log "--- $label ---" 'Cyan'
  Log "> $cmd"
  $out = & cmd /c "$cmd 2>&1"
  $code = $LASTEXITCODE
  $out | ForEach-Object { Add-Content -Path $LogFile -Value $_ -Encoding utf8 }
  $out | Select-Object -Last $show | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
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
  if ($r.Code -ne 0) { Stop-Here "$what failed (above, and in the log). Ask Claude with the log." }
}

# master on GitHub, read with ls-remote (nothing written to git).
function Get-RemoteMaster {
  $line = & git --no-optional-locks ls-remote origin refs/heads/master
  if ($LASTEXITCODE -ne 0 -or -not $line) { return $null }
  return ("$line" -split '\s+')[0].Trim()
}

function Get-Port8080 {
  $conn = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $conn) { return $null }
  return Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
}

# The read-only live check: 0 the live ruleset is $rulesPath's (and holds
# every -expect), 3 it differs, 2 no release, 1 it could not run.
function Check-LiveRules {
  param([string]$label, [string]$rulesPath, [string[]]$expect = @())
  $cmd = "npx tsx scripts/check-live-rules.ts --key `"$KeyPath`" --project $GcpProject --database $Db --rules `"$rulesPath`""
  foreach ($e in $expect) { $cmd += " --expect `"$e`"" }
  return (Run $label $cmd).Code
}

Log "ship-privacy-0 $Stage" 'White'

$top = (& git --no-optional-locks rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not (Test-Path 'package.json') -or ((Resolve-Path $top).Path -ne (Get-Location).Path)) { Stop-Here 'run this from the top of the project folder, or of the branch''s folder.' }

Log 'Fetching from GitHub (reads only)' 'Cyan'
& git fetch -q origin
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not reach GitHub.' }
$MasterSha = Get-RemoteMaster
if (-not $MasterSha) { Stop-Here 'could not ask GitHub where master is.' }

# ==== prepare ===========================================================================
if ($Stage -eq 'prepare') {
  if (Test-Path $PreparedFile) { Remove-Item -Force $PreparedFile }

  & git --no-optional-locks rev-parse --verify --quiet "refs/heads/$Branch" | Out-Null
  if ($LASTEXITCODE -ne 0) { Stop-Here "this checkout has no branch $Branch. Ask Claude." }
  $BranchSha = (& git --no-optional-locks rev-parse "refs/heads/$Branch").Trim()

  # Exactly the round Claude built: its last commit, or that and this script's own commit.
  if ($BranchSha -ne $BranchExpected) {
    $parent = (& git --no-optional-locks rev-parse "$BranchSha^").Trim()
    $touched = @(& git --no-optional-locks diff --name-only $parent $BranchSha | Where-Object { $_ })
    if ($parent -ne $BranchExpected -or $touched.Count -ne 1 -or $touched[0] -ne $ScriptPath) {
      Stop-Here "$Branch is $($BranchSha.Substring(0, 8)), not the round Claude built ($($BranchExpected.Substring(0, 8)), or one commit after it changing only $ScriptPath). Ask Claude."
    }
  }
  Log "Branch $Branch is the round Claude built ($($BranchSha.Substring(0, 8)))." 'Green'

  # master on GitHub: still the base, or already held by the branch.
  & git --no-optional-locks merge-base --is-ancestor $MasterSha $BranchSha
  if ($LASTEXITCODE -ne 0) { Stop-Here "master on GitHub moved since the round was built (now $($MasterSha.Substring(0, 8)), built on $($BaseSha.Substring(0, 8))) and the branch does not hold it. Ask Claude to bring master into the branch." }
  if ($MasterSha -ne $BaseSha -and $MasterSha -ne $BranchSha) { Stop-Here "master on GitHub is $($MasterSha.Substring(0, 8)): neither $($BaseSha.Substring(0, 8)) (before this round) nor this branch. Ask Claude." }
  Log "master on GitHub is $($MasterSha.Substring(0, 8)); the branch fast-forwards it." 'Green'

  # The folder must be on the branch. From the project folder, switch to it,
  # unless another folder (the branch's worktree) has it open.
  $cur = "$(& git --no-optional-locks symbolic-ref --quiet --short HEAD)".Trim()
  if ($cur -ne $Branch) {
    $openAt = $null
    $wt = $null
    foreach ($line in (& git --no-optional-locks worktree list --porcelain)) {
      if ($line -like 'worktree *') { $wt = $line.Substring(9) }
      if ($line -eq "branch refs/heads/$Branch") { $openAt = $wt }
    }
    if ($openAt) { Stop-Here "the branch is open in another folder: $openAt. Run this script from there (cd to it first); nothing was changed." }
    $sw = Run "switch this folder to $Branch" "git switch $Branch"
    if ($sw.Code -ne 0) { Stop-Here "git would not switch to $Branch (above): usually a file you changed. Ask Claude; nothing was changed." }
  }
  Log "This folder is on $Branch." 'Green'

  $dirty = @(& git --no-optional-locks status --porcelain --untracked-files=no -- src server server.ts tests firestore.rules firestore.indexes.json firebase.json scripts functions package.json package-lock.json render.yaml | Where-Object { $_ })
  if ($dirty.Count -gt 0) {
    $dirty | ForEach-Object { Log "   $_" 'Red' }
    Stop-Here 'files the round tests or ships are changed in this folder and not committed (above). If git shows every file as changed but git diff shows nothing, that is line ends, not code. Ask Claude.'
  }
  $untracked = @(& git --no-optional-locks status --porcelain -- src tests scripts functions\src | Where-Object { "$_" -like '`?`? *' })
  if ($untracked.Count -gt 0) {
    $untracked | ForEach-Object { Log "   $_" 'Red' }
    Stop-Here 'files git does not track would be tested here but not shipped (above). Ask Claude.'
  }

  # Only the round's files changed, and functions\ in comments only.
  $changed = @(& git --no-optional-locks diff --name-only $BaseSha HEAD | Where-Object { $_ })
  $outside = @($changed | Where-Object { $_ -notmatch $Allowed })
  if ($outside.Count -gt 0) {
    $outside | ForEach-Object { Log "   $_" 'Red' }
    Stop-Here 'the branch changes files outside the round (above). That is not the round Claude built. Ask Claude.'
  }
  $fnLines = @(& git --no-optional-locks diff -U0 $BaseSha HEAD -- functions/src | Where-Object { ($_ -match '^[+-]') -and ($_ -notmatch '^(\+\+\+|---)') })
  $fnCode = @($fnLines | Where-Object { $_ -notmatch '^[+-]\s*(\*|//|/\*)' })
  if ($fnCode.Count -gt 0) {
    $fnCode | ForEach-Object { Log "   $_" 'Red' }
    Stop-Here 'functions\src changed outside comments (above). This round deploys no Cloud Function. Ask Claude.'
  }
  Log "The branch changes $($changed.Count) file(s), all the round's; functions\src in $($fnLines.Count) comment line(s) only, nothing to deploy there." 'Green'
  foreach ($mark in $RulesMarks) {
    if (-not (Select-String -Path 'firestore.rules' -SimpleMatch -Pattern $mark -Quiet)) { Stop-Here "firestore.rules does not hold '$mark'. Ask Claude." }
  }

  $crlf = @(& git --no-optional-locks ls-files --eol | Where-Object { "$_" -match 'w/crlf' })
  if ($crlf.Count -gt 0) {
    $crlf | Select-Object -First 10 | ForEach-Object { Log "   $_" 'Red' }
    Stop-Here "$($crlf.Count) file(s) in this folder have Windows line ends (CRLF), and the tests fail on them. Ask Claude to convert them to LF; nothing is wrong with the code."
  }
  Log 'Line ends: every file in this folder is LF.' 'Green'
  if (-not (Test-Path 'node_modules\.bin')) { Stop-Here 'node_modules is missing in this folder. Ask Claude (never npm install in a worktree: its node_modules is a link).' }
  if (-not (Test-Path 'firebase-applet-config.json')) { Stop-Here 'firebase-applet-config.json is missing in this folder (copy it from the project folder). Ask Claude.' }

  $tsc = Run 'typecheck (count)' 'npx tsc --noEmit'
  $count = @($tsc.Output | Where-Object { "$_" -match 'error TS' }).Count
  if ($count -gt $TscBaseline) { Stop-Here "typecheck shows $count errors; the baseline is $TscBaseline." }
  Log "Typecheck: $count error(s), the baseline." 'Green'

  $env:TZ = 'America/New_York'
  # --dir: the names are filters, and without it they also match the copies
  # in .claude\worktrees (the savings round's lesson).
  $t = Run "the round's tests (the audit's pure half)" 'npx vitest run --dir src --testTimeout=30000 src/features/privacy'
  Must $t "the round's tests"
  $lint = Run 'the rules lint and the comment proof' 'npx vitest run --dir tests firestore.rules.lint.test.ts rules-source.test.ts'
  Must $lint 'the rules lint'

  $held = Get-Port8080
  if ($held) {
    Log "Port 8080 is held by $($held.ProcessName) (PID $($held.Id)), started $($held.StartTime)." 'Yellow'
    if ($held.ProcessName -ne 'java') { Stop-Here 'something other than an old emulator holds port 8080. Close it and run prepare again.' }
    $answer = Read-Host 'That is almost certainly an emulator an earlier run left behind. Type STOP to stop it (Enter to stop here)'
    if ($answer -ne 'STOP') { Stop-Here 'port 8080 is taken.' }
    Stop-Process -Id $held.Id -Force
    Start-Sleep -Seconds 2
    if (Get-Port8080) { Stop-Here 'port 8080 is still taken.' }
  }
  $runStarted = Get-Date
  $rt = Run 'rules tests (about two minutes)' 'npm run test:rules' 30
  $left = Get-Port8080
  if ($left -and $left.ProcessName -eq 'java' -and $left.StartTime -gt $runStarted) {
    Log "Stopping the emulator this run left on port 8080 (PID $($left.Id))." 'Yellow'
    Stop-Process -Id $left.Id -Force -ErrorAction SilentlyContinue
  }
  if ($rt.Code -ne 0) { Stop-Here 'test:rules failed (it needs a JDK, 21 or newer). Nothing is live; ask Claude with the log.' }
  $passed = @($rt.Output | Where-Object { "$_" -match 'Tests\s+\d+ passed' }) | Select-Object -Last 1
  Log "Rules tests: $passed (Claude's run: 586)." 'Green'

  # The audit: read only, production, the service account.
  if (-not $HaveKey) { Stop-Here "the service-account key is not in this folder or $MainRoot (service-account.json). The audit needs it. Ask Claude." }
  Write-Host ''
  Write-Host 'THE AUDIT reads production with the service account and writes NOTHING: every trainer record' -ForegroundColor Yellow
  Write-Host '  against Firebase sign-in (item 0), and real clients tied to Demo Mode (item 12). It prints counts,' -ForegroundColor Yellow
  Write-Host '  and the ids and emails only of what needs a person. Both must be 0.' -ForegroundColor Yellow
  if ((Read-Host 'Type AUDIT to run it (anything else stops here)') -ne 'AUDIT') { Stop-Here 'the audit was not run.' }
  $audit = Run 'the privacy audit (read only)' "npx tsx scripts/privacy-audit.ts --key `"$KeyPath`" --project $GcpProject --database $Db" 60
  $gate = @($audit.Output | Where-Object { "$_" -match '^GATE ' }) | Select-Object -Last 1
  Log "The audit says: $gate" 'White'
  if ($audit.Code -eq 3) { Stop-Here 'the audit found records the rules would treat wrongly (item 0 or item 12 above is not 0). Nothing is live. Ask Claude with the log.' }
  if ($audit.Code -ne 0 -or "$gate" -notmatch '^GATE item0=0 item12=0 PASS$') { Stop-Here 'the audit could not run, or did not say PASS. Nothing is live. Ask Claude with the log.' }
  Log 'The audit: item 0 = 0 and item 12 = 0.' 'Green'

  Write-Host ''
  Write-Host 'THE MICROSOFT QUESTION. Is Microsoft sign-in held to company accounts? In the Azure portal, the' -ForegroundColor Yellow
  Write-Host '  app registration Journey signs in with (App registrations -> the app -> Authentication), "Supported' -ForegroundColor Yellow
  Write-Host '  account types" must say "Accounts in this organizational directory only" (single tenant). If' -ForegroundColor Yellow
  Write-Host '  Microsoft sign-in is not switched on yet (IT has not approved logins), that is a yes too.' -ForegroundColor Yellow
  if ((Read-Host 'Type YES if it is single-tenant or not switched on yet (anything else stops here)') -ne 'YES') { Stop-Here 'the Microsoft question was not answered YES. Nothing is live; ask Claude.' }
  Log 'AJ typed YES: Microsoft sign-in is single-tenant, or not switched on yet.' 'White'

  $fl = Run 'Firebase login' 'npx firebase login:list'
  Must $fl 'the Firebase login check'
  if (-not (@($fl.Output) -match '@')) { Stop-Here 'no Firebase login on this PC. Run: npx firebase login, then prepare again.' }

  Set-Content -Path $PreparedFile -Value "$BranchSha $MasterSha" -Encoding ascii
  Log 'PREPARE PASSED. Nothing in production changed. Next:' 'Green'
  Log '  powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-privacy-0.ps1 -Stage golive' 'Cyan'
  exit 0
}

# ==== golive ============================================================================
if (-not (Test-Path $PreparedFile)) { Stop-Here 'prepare has not passed on this PC. Run prepare first.' }
$BranchSha = (& git --no-optional-locks rev-parse "refs/heads/$Branch").Trim()
$recorded = (Get-Content $PreparedFile -Raw).Trim()
if ($recorded -ne "$BranchSha $MasterSha") { Stop-Here 'the branch or master changed since prepare passed. Run prepare again.' }
$cur = "$(& git --no-optional-locks symbolic-ref --quiet --short HEAD)".Trim()
if ($cur -ne $Branch) { Stop-Here "this folder is on '$cur', not $Branch. Run prepare again (or run from the branch's folder)." }
# The deploy sends THIS folder's firestore.rules.
& git --no-optional-locks diff --quiet HEAD -- firestore.rules firebase.json
if ($LASTEXITCODE -ne 0) { Stop-Here 'firestore.rules or firebase.json has uncommitted changes in this folder. Ask Claude.' }
if (-not $HaveKey) { Stop-Here "the service-account key is not in this folder or $MainRoot. The live check needs it. Ask Claude." }

# The live rules must be master's (else this deploy would undo someone's), or
# already this branch's (golive ran before and stopped after the deploy).
& cmd /c "git --no-optional-locks show ${BaseSha}:firestore.rules > `"$BaseRulesFile`" 2>&1"
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not write master''s firestore.rules to logs\ for the live check. Ask Claude.' }
$AlreadyLive = $false
$lc = Check-LiveRules "the live rules against master's (read only)" $BaseRulesFile
if ($lc -eq 0) {
  Log "The rules LIVE on $Db are master's ($($BaseSha.Substring(0, 8))). Good." 'Green'
} elseif ($lc -eq 3) {
  $lb = Check-LiveRules 'the live rules against this branch''s (read only)' 'firestore.rules'
  if ($lb -eq 0) { $AlreadyLive = $true; Log 'The rules LIVE are already this branch''s: no deploy needed, only the push.' 'Green' }
  else { Stop-Here "the rules LIVE on $Db are neither master's nor this branch's: rules were deployed from somewhere else, and this deploy would replace them. Ask Claude." }
} else {
  Stop-Here "could not read the live rules (exit $lc). Nothing was deployed. Ask Claude with the log."
}

Write-Host ''
Write-Host 'Privacy Round 0, strangers out. This makes the restore tag, deploys firestore.rules to PRODUCTION' -ForegroundColor Yellow
Write-Host '  (unless they are live already) and pushes the branch to master. No Render step: the app does not change.' -ForegroundColor Yellow
Write-Host 'Nobody who has been let in notices anything; a Google account never let in reads no client record.' -ForegroundColor Yellow
Write-Host ''
if ((Read-Host 'AJ: type GO to go live (anything else stops here)') -ne 'GO') { Log 'Nothing deployed, tagged or pushed.' 'Yellow'; exit 0 }
Log 'AJ typed GO: privacy Round 0, golive.' 'White'

# 1. The restore point: master BEFORE this round.
$tagOnGitHub = & git --no-optional-locks ls-remote --tags origin "refs/tags/$RestoreTag"
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not ask GitHub for its tags. Nothing was deployed.' }
if (-not $tagOnGitHub) {
  if (-not (& git --no-optional-locks tag -l $RestoreTag)) {
    & git tag $RestoreTag $BaseSha
    if ($LASTEXITCODE -ne 0) { Stop-Here "could not make the restore tag $RestoreTag. Nothing was deployed." }
  } elseif ((& git --no-optional-locks rev-parse "$RestoreTag^{commit}").Trim() -ne $BaseSha) {
    Stop-Here "the restore tag $RestoreTag on this PC is not $($BaseSha.Substring(0, 8)). Ask Claude; nothing was deployed."
  }
  $tp = Run "push the restore tag $RestoreTag" "git push origin refs/tags/$RestoreTag"
  Must $tp 'pushing the restore tag (nothing was deployed)'
} elseif ((("$tagOnGitHub" -split '\s+')[0]) -ne $BaseSha) {
  Stop-Here "the restore tag $RestoreTag on GitHub is not $($BaseSha.Substring(0, 8)). Ask Claude; nothing was deployed."
}
Log "Restore point on GitHub: $RestoreTag = $($BaseSha.Substring(0, 8))" 'Green'

# 2. The rules, then checked live.
if (-not $AlreadyLive) {
  $rules = Run "deploy firestore.rules (project $Project)" "npx firebase deploy --only firestore:rules --project $Project"
  if ($rules.Code -ne 0) { Stop-Here 'the rules deploy failed. The rules are master''s as before (Firebase console -> Firestore -> the named database -> Rules shows what is live). Ask Claude.' }
  if (-not (@($rules.Output) -match 'released rules')) { Stop-Here 'the rules deploy did not say it released the rules. Ask Claude (Firebase console -> Firestore -> the named database -> Rules shows what is live).' }
}
$live = Check-LiveRules 'the live rules against this branch''s (read only)' 'firestore.rules' @('function isLetIn(', 'function sessionTenancyKept(')
if ($live -ne 0) { Stop-Here "the ruleset live on $Db is not this branch's firestore.rules (exit $live; the log shows where they part). Nothing was pushed. Ask Claude." }
Log "The ruleset LIVE on $Db is this branch's firestore.rules." 'Green'

# 3. The push, fast-forward only, and only while master is still the base.
$MasterNow = Get-RemoteMaster
if (-not $MasterNow) { Stop-Here 'could not reach GitHub before the push. The rules ARE live (nothing an iPad does changes); run golive again to push.' }
if ($MasterNow -eq $BranchSha) {
  Log 'master on GitHub is already this commit: nothing to push.' 'Green'
} elseif ($MasterNow -eq $BaseSha) {
  $push = Run "git push origin ${Branch}:master" "git push origin ${Branch}:master"
  if ($push.Code -ne 0) { Stop-Here 'the push failed. The rules ARE live (nothing an iPad does changes); run golive again to push, or ask Claude.' }
} else {
  Stop-Here "master on GitHub moved while golive ran (now $($MasterNow.Substring(0, 8))). The rules ARE live; nothing was pushed. Ask Claude."
}

Log "DONE. The rules are live and master on GitHub is $($BranchSha.Substring(0, 8))." 'Green'
Log '' 'White'
Log 'No Render step: the app did not change.' 'White'
Log 'THE CHECK, now (every rule lets an administrator through first, so your own walk cannot see this):' 'White'
Log '  1. Signed in as a Life Transformer at a live studio, on an iPad: open a client''s Notes and Pulse,' 'White'
Log '     a session''s sets, and Relay''s Board; and, as a studio leader, Operations -> Today.' 'White'
Log '     Everything shows as before, with no red "Firestore Action Failed" toast.' 'White'
Log '  2. Signed in with a Google account that was never let in: the access screen, as before, with no' 'White'
Log '     red toast. That account can no longer read any client''s or studio''s records.' 'White'
Log '' 'White'
Log 'TO UNDO (ask Claude first): the rules from the restore tag FIRST, as docs\ops\DEPLOYS-AND-ROLLBACK.md' 'White'
Log "  says under `"The rules`": git worktree add ..\rules-rollback $RestoreTag, then in it" 'White'
Log "  npx firebase deploy --only firestore:rules --project $Project. Then, if wanted, a revert on master." 'White'
$elapsed = [int]((Get-Date) - $Started).TotalMinutes
Log "Done in about $elapsed minute(s)." 'Green'
exit 0
