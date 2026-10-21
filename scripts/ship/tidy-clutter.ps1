<#
 tidy-clutter.ps1  -  clear the working copy's leftovers (Oct 18 2026)
 SCRIPT-VERSION: v6 (v2: long-path-safe delete, a failure no longer stops the run; v3: branch --delete, since -d was being eaten as PowerShell's -Debug; v4: a branch whose every commit has a twin in master counts as merged - git cherry; v5: never follows a junction; v6: no robocopy, no cmd, no recursive delete, and anything git can't vouch for is kept - see JUNCTIONS and KEPT below)

 JUNCTIONS (v5 and v6, Oct 19 2026). Every session worktree's node_modules
 is a JUNCTION to the main checkout's node_modules. Up to v4, removing a
 worktree ran Remove-Item -Recurse and then robocopy /MIR over it, and
 robocopy /MIR deletes everything inside a junction it meets - with or
 without /XJ (tested on this PC, Oct 19). On Oct 18 at about 11:10 PM that
 emptied the main node_modules and broke tsc, vitest and vite in every
 session until npm ci was run again.
 Now a tree is walked without ever entering a junction or symlink; every
 link found is removed ITSELF first (a non-recursive delete, which cannot
 empty anything); the tree is walked again and left alone if a link is still
 there or a folder could not be read; and only then is it deleted folder by
 folder, deepest first: right before a folder's files go, that folder and
 every folder above it are checked to still be plain folders, its files are
 deleted one at a time, and the folder goes only once it is empty. robocopy,
 cmd and every recursive delete are gone. (The one gap left is a program
 swapping a folder for a link in the same instant it is checked; nothing on
 this PC does that inside an idle worktree.) A failure stops that one item,
 says so, and the run carries on. If something is left, leave it: don't
 delete it by hand with Remove-Item, robocopy or Explorer while a link may
 be inside - ask a Claude session.

 KEPT (v6). A worktree is removed only when git can vouch for everything in
 it. Kept and listed: dirty (untracked files counted even if a setting hides
 them), on an unmerged branch (a merge commit's own changes count), detached,
 locked in git, recently touched, a folder that is itself a link, anything
 git ignores that is not a known throwaway (build output, config copies,
 debug logs, the node_modules link - so a harness/ round folder, logs/,
 backups/ or "Claude outputs/" keeps it), and any backups/, logs/ or
 "Claude outputs/" folder anywhere inside. A folder git no longer lists is
 removed only if it has no .git of its own, nothing of those kinds, and has
 sat idle; one with a .git (moved by hand, copied, or a separate clone) is
 kept, and while one moved by hand within .claude/worktrees still points
 at its old entry, git worktree prune waits (so that run's branches wait
 too). A worktree moved somewhere else entirely can't be seen. A name ending in a dot or a space is never
 touched (Windows would open a different folder).

   powershell -ExecutionPolicy Bypass -File .\scripts\ship\tidy-clutter.ps1 report
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\tidy-clutter.ps1 apply

 report  touches nothing (not even git's index). Lists every worktree it would
         remove and every one it keeps, with the reason, and the branches.
 apply   removes it. Nothing it touches is tracked by git, so there is no commit
         and nothing to push; the running app is unaffected.

 WHAT IT CLEARS
   1. Session worktrees under .claude/worktrees/ whose branch is already in
      origin/master, whose files are clean and which nobody has touched for
      -Days days (default 3), as KEPT above allows. Then `git worktree prune`.
   2. Root litter named in docs/ops/REPO-HYGIENE.md: archives (.tar.gz, .zip),
      git-log dumps and search captures (*.txt), run logs (*.log), the stale
      live-rules snapshot, the applied patch folders (patches-*), _to_delete/,
      .claude-stage/, the stale build outputs (build/, dist/) and the 8 MB zip
      in docs/. All are gitignored or untracked.
   3. .git/stale-locks/ (lock files renamed aside on the connected-folder mount).
   4. Local branches merged into origin/master: every commit checked first
      (InMaster), then git branch --delete --force. master,
      demo-mode-foundation and any branch a kept worktree has checked out stay.
      Then git remote prune origin (drops origin/* names for branches already
      deleted on GitHub; it asks GitHub, so it needs the network).

 NOT TOUCHED: backups/ (data-script backups), logs/, "Claude outputs/"
 (screenshots - the only visual record of several rounds), harness/perf-lab/,
 anything under src/ server/ functions/ tests/ docs/ except the one zip.
#>

param(
  [Parameter(Position = 0)][ValidateSet('report', 'apply')][string]$Stage = 'report',
  [int]$Days = 3
)

$ErrorActionPreference = 'Stop'
$Apply = ($Stage -eq 'apply')
# report writes nothing, not even the index refresh a plain git status makes (this process only)
$env:GIT_OPTIONAL_LOCKS = '0'
function Say([string]$m, [string]$c = 'Gray') { Write-Host $m -ForegroundColor $c }

$GitExe = (Get-Command git -CommandType Application | Select-Object -First 1).Source
if (-not $GitExe) { throw 'git was not found on PATH.' }
# git writes UTF-8; Windows PowerShell 5.1 reads it with the console's code
# page (437) unless told otherwise, which garbles a non-ASCII folder name.
function GitOut {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  $enc = $null
  try { $enc = [Console]::OutputEncoding; [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false) } catch { $enc = $null }
  try { $out = & $GitExe @GitArgs 2>&1; $code = $LASTEXITCODE }
  finally { if ($enc) { try { [Console]::OutputEncoding = $enc } catch { } }; $ErrorActionPreference = $prev }
  return @{ Code = $code; Lines = @($out | ForEach-Object { "$_" }) }
}

# Long paths: .NET on Windows PowerShell 5.1 reads past 260 characters only
# with the \\?\ prefix (which also turns off path clean-up, hence the slashes).
function LongPath([string]$p) {
  if ($p.StartsWith('\\?\')) { return $p }
  $p = $p -replace '/', '\'
  if ($p.StartsWith('\\')) { return '\\?\UNC\' + $p.Substring(2) }
  return '\\?\' + $p
}
function ShortPath([string]$p) {
  if ($p.StartsWith('\\?\UNC\')) { return '\\' + $p.Substring(8) }
  if ($p.StartsWith('\\?\')) { return $p.Substring(4) }
  return $p
}
# Is anything at this path (a dangling link counts)? Test-Path says no to an
# existing path over 260 characters, so it is not used for this. Only "not
# found" is no; anything else (access denied) is taken as yes, the safe side.
function Exists([string]$p) {
  try { [void][IO.File]::GetAttributes((LongPath $p)); return $true }
  catch {
    $x = $_.Exception
    while ($x) { if ($x -is [IO.FileNotFoundException] -or $x -is [IO.DirectoryNotFoundException]) { return $false }; $x = $x.InnerException }
    return $true
  }
}
function IsLink([string]$p) {
  try { return (([int][IO.File]::GetAttributes((LongPath $p)) -band [int][IO.FileAttributes]::ReparsePoint) -ne 0) } catch { return $false }
}
function IsRealDir([string]$p) {
  try { $a = [int][IO.File]::GetAttributes((LongPath $p)) } catch { return $false }
  return ((($a -band [int][IO.FileAttributes]::Directory) -ne 0) -and (($a -band [int][IO.FileAttributes]::ReparsePoint) -eq 0))
}
# Clear only read-only: a hard link shares its attributes with a file elsewhere.
function ClearReadOnly([string]$p) {
  $a = [int][IO.File]::GetAttributes($p) -band (-bnot [int][IO.FileAttributes]::ReadOnly)
  if ($a -eq 0) { $a = [int][IO.FileAttributes]::Normal }
  # ToObject, not a cast: a cast refuses bits .NET has no name for (OneDrive's pinned/unpinned)
  [IO.File]::SetAttributes($p, [Enum]::ToObject([IO.FileAttributes], $a))
}
# Windows drops a trailing dot or space from a folder name when it cleans a
# path up, so 'busy ' would open 'busy'. Such a name is never acted on.
function HasTrailingDot([string]$p) {
  return (@(($p -replace '/', '\').TrimEnd('\').Split('\') | Where-Object { $_ -match '[. ]$' -and $_ -notmatch '^\.{1,2}$' }).Count -gt 0)
}

# Walk a tree WITHOUT ever entering a junction or symlink. Returns the links
# found (Links), the folders top first (Dirs), the newest file time outside
# the links (Newest), whether every folder could be read (Complete) and
# whether the top is gone (Missing).
function WalkTree([string]$path) {
  $links = New-Object System.Collections.Generic.List[string]
  $dirs = New-Object System.Collections.Generic.List[string]
  $res = @{ Links = $links; Dirs = $dirs; Newest = $null; Complete = $true; Missing = $false }
  if ($path.StartsWith('\\?\')) { $top = $path } else { $top = LongPath ([IO.Path]::GetFullPath($path).TrimEnd('\')) }
  if (-not (Exists $top)) { $res.Missing = $true; return $res }
  try { $topAttr = [IO.File]::GetAttributes($top) } catch { $res.Complete = $false; return $res }
  if ($topAttr -band [IO.FileAttributes]::ReparsePoint) { $links.Add($top); return $res }
  $newest = $null; $complete = $true
  $stack = New-Object System.Collections.Generic.Stack[string]
  $stack.Push($top)
  while ($stack.Count -gt 0) {
    $dir = $stack.Pop()
    $dirs.Add($dir)
    try { $entries = [IO.Directory]::GetFileSystemEntries($dir) } catch { $complete = $false; continue }
    foreach ($e in $entries) {
      try { $a = [IO.File]::GetAttributes($e) } catch { $complete = $false; continue }
      if ($a -band [IO.FileAttributes]::ReparsePoint) { $links.Add($e) }
      elseif ($a -band [IO.FileAttributes]::Directory) { $stack.Push($e) }
      else { try { $t = [IO.File]::GetLastWriteTime($e); if (-not $newest -or $t -gt $newest) { $newest = $t } } catch { } }
    }
  }
  $res.Newest = $newest; $res.Complete = $complete
  return $res
}
# backups/, logs/ or "Claude outputs/" anywhere in a walked tree (outside a
# real node_modules), as paths inside it.
function HeldIn($walk) {
  if ($walk.Dirs.Count -eq 0) { return @() }
  $top = $walk.Dirs[0]
  return @($walk.Dirs | Where-Object {
    $_ -notlike '*\node_modules\*' -and ($_.Substring($_.LastIndexOf('\') + 1) -in @('backups', 'logs', 'Claude outputs'))
  } | ForEach-Object { if ($_.Length -gt $top.Length) { $_.Substring($top.Length + 1) + '\' } else { 'the folder itself (named ' + $_.Substring($_.LastIndexOf('\') + 1) + ')' } })
}

# Remove a junction or symlink ITSELF. A non-recursive Directory.Delete
# refuses a folder that has anything in it, so it can never empty the target
# or a real folder by mistake. No cmd.exe: cmd expands % in a name and gives
# up past 260 characters.
function Unlink([string]$link) {
  $link = LongPath $link
  if (-not (Exists $link)) { return $true }
  try {
    $a = [int][IO.File]::GetAttributes($link)
    if (-not ($a -band [int][IO.FileAttributes]::ReparsePoint)) { return $false }
    if ($a -band [int][IO.FileAttributes]::ReadOnly) { ClearReadOnly $link }
    if ($a -band [int][IO.FileAttributes]::Directory) { [IO.Directory]::Delete($link, $false) } else { [IO.File]::Delete($link) }
  } catch { }
  return -not (Exists $link)
}

# Links come out FIRST (see JUNCTIONS at the top), the tree is walked again,
# and only a tree with no links left is deleted, folder by folder, deepest
# first, with nothing that can reach through a link. This also gets past the
# 260-character limit that the Academy docs inside a worktree hit.
function RemoveTree([string]$path) {
  if (HasTrailingDot $path) { Say ("  refused: '" + $path + "' has a name ending in a dot or a space, so Windows would open a different folder") 'Red'; return $false }
  $full = [IO.Path]::GetFullPath($path).TrimEnd('\')
  $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\')
  if (-not $full.StartsWith($rootFull + '\', [StringComparison]::OrdinalIgnoreCase)) { Say ("  refused: " + $full + " is outside the repo") 'Red'; return $false }
  if ($full -ieq (Join-Path $rootFull 'node_modules')) { Say '  refused: the main node_modules' 'Red'; return $false }
  $walk = WalkTree $full
  if ($walk.Missing) { return $true }
  if (-not $walk.Complete) { Say ("  left alone: a folder under " + $full + " could not be read, so a link inside it can't be ruled out") 'Red'; return $false }
  foreach ($l in $walk.Links) {
    if (Unlink $l) { Say ("  unlinked " + (ShortPath $l)) 'DarkGray' }
    else { Say ("  stopped: could not remove the link " + (ShortPath $l) + ", so nothing under it was touched") 'Red'; return $false }
  }
  $again = WalkTree $full
  if ($again.Missing) { return $true }   # the folder itself was the link
  if (-not $again.Complete -or $again.Links.Count -gt 0) { Say ("  left alone: links still under " + $full) 'Red'; return $false }
  $top = $again.Dirs[0]
  for ($i = $again.Dirs.Count - 1; $i -ge 0; $i--) {
    $d = $again.Dirs[$i]
    if (-not (Exists $d)) { continue }
    # right before anything in it goes: this folder and every folder above it are still plain folders, not links
    $c = $d
    while ($true) {
      if (-not (IsRealDir $c)) { Say ("  stopped: " + (ShortPath $c) + " is no longer a plain folder; nothing under it was touched") 'Red'; return $false }
      if ($c.Length -le $top.Length) { break }
      $c = $c.Substring(0, $c.LastIndexOf('\'))
    }
    try { $items = [IO.Directory]::GetFileSystemEntries($d) } catch { continue }
    foreach ($e in $items) {
      try { $a = [int][IO.File]::GetAttributes($e) } catch { continue }
      if ($a -band [int][IO.FileAttributes]::ReparsePoint) { Say ("  stopped: a link appeared at " + (ShortPath $e) + " during the delete; it was not followed") 'Red'; return $false }
      if ($a -band [int][IO.FileAttributes]::Directory) { continue }   # a folder below that could not be emptied
      try { [IO.File]::Delete($e) } catch { try { ClearReadOnly $e; [IO.File]::Delete($e) } catch { } }
    }
    try { [IO.Directory]::Delete($d, $false) } catch { try { ClearReadOnly $d; [IO.Directory]::Delete($d, $false) } catch { } }
  }
  if (Exists $full) { Say ("  partly removed: something under " + $full + " could not be deleted (open in another program?); its links are already gone") 'Red'; return $false }
  return $true
}
# Any surprise inside RemoveTree fails that one item, never the run.
function TryRemove([string]$path) {
  try { return (RemoveTree $path) } catch { Say ("  error: " + $_.Exception.Message) 'Red'; return $false }
}

# A branch is in master when it is an ancestor of origin/master, or when every
# one of its commits has an identical twin there (git cherry prints '+' for a
# commit with no twin). The second case is how parallel-agent slices look after
# an integration branch carried their work in. git cherry skips merge commits,
# and a hand-resolved conflict lives only in one, so a branch with a merge of
# its own still to land is not in master.
function InMaster([string]$branch) {
  if ((GitOut merge-base --is-ancestor $branch origin/master).Code -eq 0) { return $true }
  $c = GitOut cherry origin/master $branch
  if ($c.Code -ne 0) { return $false }
  if (@($c.Lines | Where-Object { $_ -like '+*' }).Count -gt 0) { return $false }
  $m = GitOut rev-list --merges ('origin/master..' + $branch)
  return ($m.Code -eq 0 -and @($m.Lines | Where-Object { $_ }).Count -eq 0)
}

$Root = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
Set-Location $Root
Say ("Repo: " + $Root) 'Cyan'
$branch = (GitOut rev-parse --abbrev-ref HEAD).Lines | Select-Object -First 1
Say ("Branch: " + $branch)
if ($branch -ne 'master') { throw "Run this on master (you are on '$branch')." }

# ---------------------------------------------------------------- 1. worktrees
$cutoff = (Get-Date).AddDays(-$Days)
# an empty list here would make every folder look unknown, so a failure stops the run before anything changes
$wtr = GitOut worktree list --porcelain
if ($wtr.Code -ne 0 -or -not ($wtr.Lines | Where-Object { $_ -like 'worktree *' })) { throw ('git worktree list failed, so nothing was changed: ' + ($wtr.Lines -join ' ')) }
$entries = @(); $cur = $null
foreach ($l in $wtr.Lines) {
  if ($l -like 'worktree *') { if ($cur) { $entries += $cur }; $cur = @{ Path = $l.Substring(9); Branch = '(detached)'; Locked = $null } }
  elseif ($l -like 'branch *') { $cur.Branch = $l.Substring(7) -replace '^refs/heads/', '' }
  elseif ($l -like 'locked*') { $cur.Locked = $l.Substring(6).Trim(); if (-not $cur.Locked) { $cur.Locked = 'no reason given' } }
}
if ($cur) { $entries += $cur }

# What git ignores that is safe to lose with a worktree. Anything else it
# ignores (a harness/ round folder, logs/, backups/, .env) keeps the worktree.
$Disposable = '^!! "?(node_modules/?|dist/|build/|coverage/|\.firebase/|\.vitest/|firebase-applet-config\.json|[^/]*-debug\.log|client-errors\.log|\.claude/settings\.local\.json|harness/perf-lab/\.work/|(.*/)?\.vite-cache[^/]*/)"?$'
$Ask = ' - leave it, or ask a Claude session'
function Listed([string[]]$items) { $s = (@($items) | Select-Object -First 3) -join ', '; if (@($items).Count -gt 3) { $s += ' and ' + (@($items).Count - 3) + ' more' }; return $s }

# A worktree moved by hand: git still lists its old path, and the folder's
# .git still points at that entry. git worktree prune would delete the entry
# and cut the folder off from git, so the old entry is kept and prune waits.
$movedTo = @{}
foreach ($d in (Get-ChildItem -LiteralPath (Join-Path $Root '.claude\worktrees') -Directory -Force -ErrorAction SilentlyContinue)) {
  if ($d.Name -match '[. ]$') { continue }
  $gitFile = Join-Path $d.FullName '.git'
  if (-not (Test-Path -LiteralPath $gitFile -PathType Leaf)) { continue }
  try {
    $gd = ([IO.File]::ReadAllText($gitFile) -split "`n")[0].Trim() -replace '^gitdir:\s*', ''
    if (-not [IO.Path]::IsPathRooted($gd)) { $gd = [IO.Path]::GetFullPath((Join-Path $d.FullName $gd)) }
    $back = ([IO.File]::ReadAllText((Join-Path $gd 'gitdir')) -split "`n")[0].Trim()
    if (-not [IO.Path]::IsPathRooted($back)) { $back = [IO.Path]::GetFullPath((Join-Path $gd $back)) }
    $old = Split-Path -Parent ($back -replace '/', '\')
    if ($old -and ($old -ine $d.FullName)) { $movedTo[$old.ToLowerInvariant()] = $d.Name }
  } catch { }
}

$removeWt = @(); $keepWt = @()
foreach ($e in $entries) {
  $p = $e.Path -replace '/', '\'
  if ($p -notlike '*\.claude\worktrees\*') { continue }
  $name = Split-Path -Leaf $p
  # locked first: git keeps a locked entry even when its folder is gone (a USB stick, say)
  if ($e.Locked) { $keepWt += @{ Name = $name; Why = 'locked in git (' + $e.Locked + ')' + $Ask }; continue }
  if (-not (Exists $p)) {
    $mv = $movedTo[$p.ToLowerInvariant()]
    if ($mv) { $keepWt += @{ Name = $name; Why = 'moved by hand to ' + $mv + ', which still points at it' + $Ask; Moved = $true }; continue }
    $removeWt += @{ Name = $name; Why = 'folder already gone (prune)'; Path = $p }; continue
  }
  $why = $null
  if (IsLink $p) { $why = 'the folder is itself a link to somewhere else' + $Ask }
  elseif ($e.Branch -eq '(detached)') { $why = 'detached HEAD' + $Ask }
  elseif (-not (InMaster $e.Branch)) { $why = "branch $($e.Branch) is NOT in origin/master" }
  else {
    # --untracked-files=normal: a status.showUntrackedFiles=no setting would otherwise hide new files
    $st = GitOut -C $p status --porcelain --untracked-files=normal
    if ($st.Code -ne 0) { $why = 'git could not read it' }
    elseif ($st.Lines | Where-Object { $_ -like 'warning:*' }) { $why = 'git could not read part of it' }
    elseif (@($st.Lines | Where-Object { $_ -ne '' -and $_ -notmatch '^ ?D ' }).Count -gt 0) { $why = 'has uncommitted changes' }
    # lines that are only ' D' / 'D ' are deleted files: a half-removed worktree, not work
    else {
      # git status hides ignored files, and a session's harness or a data script's restore point is ignored
      $ig = GitOut -C $p status --porcelain --ignored --untracked-files=normal
      $held = @($ig.Lines | Where-Object { $_ -like '!! *' -and $_ -notmatch $Disposable } | ForEach-Object { $_.Substring(3).Trim('"') })
      if ($ig.Code -ne 0) { $why = 'git could not read it' }
      elseif ($held.Count) { $why = 'holds ' + (Listed $held) + ' (not in git)' + $Ask }
      else {
        # WalkTree never enters node_modules' junction (v5): before, a fresh npm ci in the main checkout made every worktree look touched
        $walk = WalkTree $p
        $deep = HeldIn $walk
        if (-not $walk.Complete) { $why = 'a folder inside could not be read' }
        elseif ($deep.Count) { $why = 'holds ' + (Listed $deep) + $Ask }
        elseif ($walk.Newest -and $walk.Newest -gt $cutoff) { $why = 'touched ' + $walk.Newest.ToString('MMM d HH:mm') }
      }
    }
  }
  if ($why) { $keepWt += @{ Name = $name; Why = $why } } else { $removeWt += @{ Name = $name; Why = "merged ($($e.Branch)), clean, idle"; Path = $p } }
}
# Folders under .claude/worktrees git no longer lists. Git can't vouch for
# them, so one with a .git of its own (moved by hand, a copy, a separate
# clone) is kept; the rest (left over from an earlier removal) go only when
# they hold nothing of the kept kinds and have sat idle.
$known = @($entries | ForEach-Object { Split-Path -Leaf ($_.Path -replace '/', '\') })
foreach ($d in (Get-ChildItem -LiteralPath (Join-Path $Root '.claude\worktrees') -Directory -Force -ErrorAction SilentlyContinue)) {
  if ($known -contains $d.Name) { continue }
  $why = $null
  if ($d.Name -match '[. ]$') { $keepWt += @{ Name = "'" + $d.Name + "'"; Why = 'its name ends in a dot or a space, which Windows reads as another folder' + $Ask }; continue }
  if (Exists (Join-Path $d.FullName '.git')) { $why = 'not listed by git, but it has a .git of its own' + $Ask }
  else {
    $walk = WalkTree $d.FullName
    $deep = HeldIn $walk
    if (-not $walk.Complete) { $why = 'a folder inside could not be read' }
    elseif ($deep.Count) { $why = 'not a git worktree any more, but holds ' + (Listed $deep) + $Ask }
    elseif ($walk.Newest -and $walk.Newest -gt $cutoff) { $why = 'not a git worktree any more, but touched ' + $walk.Newest.ToString('MMM d HH:mm') }
  }
  if ($why) { $keepWt += @{ Name = $d.Name; Why = $why } } else { $removeWt += @{ Name = $d.Name; Why = 'left from an earlier removal, idle'; Path = $d.FullName } }
}

# ---------------------------------------------------------------- 2. root litter
$litterFiles = @()
$litterFiles += Get-ChildItem -Path $Root -File -Force | Where-Object {
  $_.Extension -in @('.log', '.txt', '.txtcd', '.zip', '.bundle') -or $_.Name -like '*.tar.gz' -or $_.Name -like 'live-rules-*.rules'
} | ForEach-Object { $_.FullName }
$docsZip = Join-Path $Root 'docs\Final client profile edits-20260906T202819Z-1-001.zip'
if (Test-Path -LiteralPath $docsZip) { $litterFiles += $docsZip }
$litterDirs = @('patches-fix', 'patches-floor', 'patches-gate', 'patches-tracker', 'patches', '_to_delete', '.claude-stage', 'build', 'dist', '.git\stale-locks') |
  ForEach-Object { Join-Path $Root $_ } | Where-Object { Test-Path -LiteralPath $_ -PathType Container }
# never delete something git tracks ('--' quoted: PowerShell eats a bare one; exit 1 is "not tracked", anything else is a failure)
$litterFiles = @($litterFiles | Where-Object { (GitOut ls-files --error-unmatch '--' $_).Code -eq 1 })

# ---------------------------------------------------------------- 4. merged branches
$allBranches = @((GitOut branch).Lines | ForEach-Object { $_.Trim().TrimStart('+', '*').Trim() } |
  Where-Object { $_ -and $_ -notin @('master', 'demo-mode-foundation') })
$merged = @($allBranches | Where-Object { InMaster $_ })
# a branch checked out in a worktree that stays can't be deleted, so it isn't tried
$goingPaths = @($removeWt | ForEach-Object { $_.Path })
$stays = @($entries | Where-Object { $_.Branch -ne '(detached)' -and ($goingPaths -notcontains ($_.Path -replace '/', '\')) } | ForEach-Object { $_.Branch })

# ---------------------------------------------------------------- report
Say ''
Say ("=== 1. WORKTREES: remove " + $removeWt.Count + ", keep " + $keepWt.Count + " (then git worktree prune) ===") 'Cyan'
foreach ($w in $removeWt) { Say ("  remove {0,-42} {1}" -f $w.Name, $w.Why) 'Gray' }
foreach ($w in $keepWt) { Say ("  keep   {0,-42} {1}" -f $w.Name, $w.Why) 'Yellow' }
Say ''
Say ("=== 2. ROOT LITTER: " + $litterFiles.Count + " files, " + $litterDirs.Count + " folders ===") 'Cyan'
foreach ($f in $litterFiles) { Say ("  " + $f.Substring($Root.Length + 1)) }
foreach ($d in $litterDirs)  { Say ("  " + $d.Substring($Root.Length + 1) + "\") }
Say ''
Say ("=== 4. LOCAL BRANCHES ALREADY IN MASTER: " + $merged.Count + " (ancestor, or every commit has a twin there) ===") 'Cyan'
foreach ($b in $merged) { if ($stays -contains $b) { Say ("  stays  " + $b + "  (checked out in a worktree that is kept)") 'Yellow' } else { Say ("  delete " + $b) } }
Say ''
if (-not $Apply) { Say 'Report only. Nothing was changed. Run with "apply" to do it.' 'Yellow'; exit 0 }

# ---------------------------------------------------------------- apply
$failed = @()
foreach ($w in $removeWt) {
  if (-not (Exists $w.Path)) { Say ("already gone: worktree " + $w.Name) 'DarkGray'; continue }
  if (TryRemove $w.Path) { Say ("removed worktree " + $w.Name) 'DarkGray' }
  else { $failed += $w.Name; Say ("FAILED  worktree " + $w.Name + " (perhaps partly removed - re-run apply later)") 'Red' }
}
if (@($keepWt | Where-Object { $_.Moved }).Count) { Say 'git worktree prune: skipped (a worktree was moved by hand, and pruning would cut it off from git)' 'Yellow' }
else { $r = GitOut worktree prune; Say ("git worktree prune: " + $(if ($r.Code -eq 0) { 'ok' } else { ($r.Lines -join ' ') })) }
foreach ($f in $litterFiles) {
  $rel = $f.Substring($Root.Length + 1)
  try { Remove-Item -LiteralPath $f -Force -ErrorAction Stop; Say ("deleted " + $rel) 'DarkGray' }
  catch { $failed += $rel; Say ("FAILED  " + $rel + " (" + $_.Exception.Message + ")") 'Red' }
}
foreach ($d in $litterDirs) {
  $rel = $d.Substring($Root.Length + 1) + "\"
  if (TryRemove $d) { Say ("deleted " + $rel) 'DarkGray' } else { $failed += $rel; Say ("FAILED  " + $rel + " (perhaps partly removed)") 'Red' }
}
$gone = 0; $refused = @()
# --delete, never -d: GitOut is an advanced function, so PowerShell swallows -d as its own -Debug switch.
# --force as well: git's own -d check is ancestry only, and InMaster already proved every commit is in master.
foreach ($b in @($merged | Where-Object { $stays -notcontains $_ })) { $r = GitOut branch --delete --force $b; if ($r.Code -eq 0) { $gone++; Say ("deleted branch " + $b) 'DarkGray' } else { $refused += $b } }
Say ("branches deleted: " + $gone + $(if ($refused.Count) { "; git refused " + $refused.Count + " (still checked out, or waiting for prune): " + ($refused -join ', ') } else { '' })) 'Green'
[void](GitOut remote prune origin)
Say ''
if ($failed.Count) { Say ("Could not remove " + $failed.Count + ": " + ($failed -join ', ') + ". They are safe to leave. Don't delete them by hand (a link inside one can empty node_modules): re-run apply later, or ask a Claude session to look.") 'Yellow' }
Say 'Done. Nothing was committed or pushed. `git status --short` should now show only real work.' 'Cyan'
