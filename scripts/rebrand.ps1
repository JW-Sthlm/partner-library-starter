<#
.SYNOPSIS
    Rebrand the Partner Library Starter to your project (interactive).

.DESCRIPTION
    Updates the obvious project-identity bits so you don't have to hand-edit
    them after cloning. Files touched:
      - package.json        (name, description)
      - docs/.vitepress/config.ts (title, description, socialLinks)
      - docs/index.md       (hero name)
      - LICENSE             (copyright line: year + holder)

    Does NOT touch README.md or SUPPORT.md. Those have human voice in them
    that's worth a manual review pass. The script prints a reminder at the end.

    Idempotent. Safe to re-run.

.PARAMETER Title
    Site title, e.g. "Acme Partner Library". Shown in browser tab and hero.

.PARAMETER Description
    One-line description for SEO and the package.json description field.

.PARAMETER PackageName
    npm package name. Lowercase, hyphens, no spaces. Auto-derived from Title if omitted.

.PARAMETER Copyright
    Copyright holder for LICENSE, e.g. "Acme Inc." or "Jane Doe".

.PARAMETER Year
    Copyright year. Defaults to the current year.

.PARAMETER NonInteractive
    Skip the confirmation prompt. Use in scripts.

.EXAMPLE
    .\scripts\rebrand.ps1
    # Fully interactive — prompts for everything.

.EXAMPLE
    .\scripts\rebrand.ps1 -Title "Acme Library" -Copyright "Acme Inc."

.EXAMPLE
    .\scripts\rebrand.ps1 -Title "Acme Library" -Copyright "Acme Inc." -NonInteractive
#>
param(
  [string] $Title,
  [string] $Description,
  [string] $PackageName,
  [string] $Copyright,
  [int]    $Year = (Get-Date).Year,
  [switch] $NonInteractive
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Write-Info($msg) { Write-Host "    $msg" -ForegroundColor Gray }
function Fail($msg)       { Write-Host ""; Write-Host "[FAIL] $msg" -ForegroundColor Red; exit 1 }

if (-not (Test-Path 'package.json')) { Fail 'Run from the root of your cloned template repo.' }
if (-not (Test-Path 'docs/.vitepress/config.ts')) { Fail 'Expected docs/.vitepress/config.ts not found.' }
if (-not (Test-Path 'LICENSE')) { Fail 'Expected LICENSE not found.' }

Write-Step 'Project details'

if (-not $Title) {
  $Title = Read-Host '    Site title (e.g. "Acme Partner Library")'
}
if (-not $Title) { Fail 'Title is required.' }

if (-not $Description) {
  $Description = Read-Host "    One-line description [$Title]"
  if (-not $Description) { $Description = $Title }
}

if (-not $PackageName) {
  $autoSlug = ($Title.ToLower() -replace '[^a-z0-9]+', '-' -replace '^-|-$', '')
  $PackageName = Read-Host "    npm package name [$autoSlug]"
  if (-not $PackageName) { $PackageName = $autoSlug }
}
if ($PackageName -notmatch '^[a-z0-9][a-z0-9-]*$') {
  Fail "Package name must be lowercase alphanumeric and hyphens only (got: $PackageName)."
}

if (-not $Copyright) {
  $Copyright = Read-Host '    Copyright holder (e.g. "Acme Inc." or your name)'
}
if (-not $Copyright) { Fail 'Copyright holder is required.' }

# Try to detect GitHub remote for socialLinks
$repoUrl = $null
try {
  $remote = git remote get-url origin 2>$null
  if ($remote) {
    $repoUrl = $remote -replace '\.git$', '' -replace '^git@github\.com:', 'https://github.com/'
  }
} catch { }

Write-Step 'About to apply'
Write-Host "    Title:         $Title"
Write-Host "    Description:   $Description"
Write-Host "    Package name:  $PackageName"
Write-Host "    Copyright:     (c) $Year $Copyright"
if ($repoUrl) { Write-Host "    Repo URL:      $repoUrl (detected from git remote)" }

if (-not $NonInteractive) {
  $go = Read-Host "`n    Continue? (y/N)"
  if ($go -notmatch '^[yY]') { Write-Info 'Aborted.'; exit 0 }
}

# package.json
Write-Step 'package.json'
$pkg = Get-Content 'package.json' -Raw
$pkg = $pkg -replace '"name":\s*"[^"]*"', ('"name": "' + $PackageName + '"')
$pkg = $pkg -replace '"description":\s*"[^"]*"', ('"description": "' + ($Description -replace '"', '\"') + '"')
Set-Content 'package.json' -Value $pkg -NoNewline -Encoding utf8NoBOM
Write-Ok 'name + description'

# vitepress config
Write-Step 'docs/.vitepress/config.ts'
$cfg = Get-Content 'docs/.vitepress/config.ts' -Raw
$cfg = $cfg -replace "title:\s*'[^']*'", ("title: '" + ($Title -replace "'", "\'") + "'")
$cfg = $cfg -replace "description:\s*'[^']*'", ("description: '" + ($Description -replace "'", "\'") + "'")
if ($repoUrl) {
  $cfg = $cfg -replace "(\{\s*icon:\s*'github',\s*link:\s*')[^']*('\s*\})", ('${1}' + $repoUrl + '${2}')
}
Set-Content 'docs/.vitepress/config.ts' -Value $cfg -NoNewline -Encoding utf8NoBOM
Write-Ok 'title + description' + $(if ($repoUrl) { ' + GitHub link' })

# index.md hero
if (Test-Path 'docs/index.md') {
  Write-Step 'docs/index.md'
  $idx = Get-Content 'docs/index.md' -Raw
  $idx = $idx -replace 'name:\s*"[^"]*"', ('name: "' + ($Title -replace '"', '\"') + '"')
  Set-Content 'docs/index.md' -Value $idx -NoNewline -Encoding utf8NoBOM
  Write-Ok 'hero name'
}

# LICENSE
Write-Step 'LICENSE'
$lic = Get-Content 'LICENSE' -Raw
$lic = $lic -replace 'Copyright \(c\) \d{4}\s+[^\r\n]+', ("Copyright (c) $Year $Copyright")
Set-Content 'LICENSE' -Value $lic -NoNewline -Encoding utf8NoBOM
Write-Ok "(c) $Year $Copyright"

Write-Host ''
Write-Host '======================================================================' -ForegroundColor White
Write-Host '  Rebrand done.' -ForegroundColor White
Write-Host '======================================================================' -ForegroundColor White
Write-Host ''
Write-Host '  Still worth a human pass:' -ForegroundColor Gray
Write-Host '    - README.md   has a "personal experiment by Johan Wallquist" disclaimer'
Write-Host '                  near the top. Replace with your own framing or delete.'
Write-Host '    - SUPPORT.md  same disclaimer. Update to match your support model.'
Write-Host '    - docs/       sample pages (index.md content, resources.md, guides/).'
Write-Host '                  Replace with your own content.'
Write-Host ''
Write-Host '  Then:' -ForegroundColor Gray
Write-Host '    npm run docs:dev   # preview locally'
Write-Host '    git add . ; git commit -m "Rebrand"'
Write-Host ''
