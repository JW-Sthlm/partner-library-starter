<#
.SYNOPSIS
    One-command provisioning for a Partner Library Starter site.

.DESCRIPTION
    Creates the Azure resources (resource group, optional Application Insights,
    Static Web App) and wires the two GitHub secrets the deploy workflow needs.
    Activates the shipped workflow file and pushes. First deploy fires automatically.

    Prerequisites:
      - PowerShell 7+ (cross-platform: Windows, macOS, Linux)
      - Azure CLI logged in: `az login`
      - GitHub CLI logged in: `gh auth login`
      - Repo cloned locally with a GitHub remote (`origin`)
      - Run from the root of your cloned template

.PARAMETER Name
    Short slug used to derive resource names. Lowercase alphanumeric + hyphens.
    Example: `acme-library` produces `rg-acme-library`, `swa-acme-library`,
    `appi-acme-library`, `log-acme-library`.

.PARAMETER Location
    Azure region. Default: westeurope. SWA Free is available in a limited set;
    the script auto-falls-back to westeurope for SWA if your chosen region is
    not supported.

.PARAMETER SubscriptionId
    Azure subscription ID or name. Defaults to your current `az` context.

.PARAMETER SkipAnalytics
    Skip Application Insights and Log Analytics. Site deploys without telemetry.

.PARAMETER SkipPush
    Don't auto-commit and push. Useful if you want to inspect changes first.

.EXAMPLE
    .\scripts\bootstrap.ps1 -Name acme-library

.EXAMPLE
    .\scripts\bootstrap.ps1 -Name acme -Location northeurope -SkipAnalytics

.NOTES
    Idempotent. Re-running with the same Name updates existing resources.
    All resource names follow the convention <prefix>-<Name>.
#>
param(
  [Parameter(Mandatory = $true)] [string] $Name,
  [string] $Location = 'westeurope',
  [string] $SubscriptionId,
  [switch] $SkipAnalytics,
  [switch] $SkipPush
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Write-Info($msg) { Write-Host "    $msg" -ForegroundColor Gray }
function Write-Warn($msg) { Write-Host "    $msg" -ForegroundColor Yellow }
function Fail($msg)       { Write-Host ""; Write-Host "[FAIL] $msg" -ForegroundColor Red; exit 1 }

Write-Step 'Pre-flight checks'

if (-not (Get-Command az -ErrorAction SilentlyContinue)) { Fail 'az CLI not found. Install: https://aka.ms/azcli' }
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Fail 'gh CLI not found. Install: https://cli.github.com' }
if (-not (Test-Path .git)) { Fail 'Not in a git repo. Run from the root of your cloned template.' }

$exampleWorkflow = Join-Path '.github' 'workflows' 'azure-static-web-apps.yml.example'
$activeWorkflow  = Join-Path '.github' 'workflows' 'azure-static-web-apps.yml'
if (-not (Test-Path $exampleWorkflow) -and -not (Test-Path $activeWorkflow)) {
  Fail "Expected workflow file not found at $exampleWorkflow."
}

try {
  $azAccount = az account show --only-show-errors 2>$null | ConvertFrom-Json
} catch {
  $azAccount = $null
}
if (-not $azAccount) { Fail 'az not logged in. Run: az login' }

gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Fail 'gh not logged in. Run: gh auth login' }

$repoSlug = gh repo view --json nameWithOwner -q .nameWithOwner 2>$null
if (-not $repoSlug) { Fail 'Unable to detect GitHub repo. Is the local repo connected to a GitHub remote?' }
Write-Ok "GitHub repo:        $repoSlug"

if ($SubscriptionId) {
  az account set --subscription $SubscriptionId --only-show-errors
  $azAccount = az account show --only-show-errors | ConvertFrom-Json
}
Write-Ok "Azure subscription: $($azAccount.name) ($($azAccount.id))"

if ($Name -notmatch '^[a-z0-9][a-z0-9-]*[a-z0-9]$') {
  Fail 'Name must be lowercase alphanumeric and hyphens only, starting and ending with a letter or digit.'
}
if ($Name.Length -gt 30) {
  Fail 'Name must be 30 characters or fewer (Azure resource name limits).'
}

$rg   = "rg-$Name"
$swa  = "swa-$Name"
$law  = "log-$Name"
$appi = "appi-$Name"

Write-Ok "Resources will be:  $rg / $swa$(if (-not $SkipAnalytics) { " / $appi / $law" })"

Write-Step 'Resource group'
az group create --name $rg --location $Location --only-show-errors --output none
Write-Ok "$rg in $Location"

$connectionString = $null
if (-not $SkipAnalytics) {
  Write-Step 'Log Analytics workspace'
  az monitor log-analytics workspace create `
    --resource-group $rg --workspace-name $law --location $Location `
    --only-show-errors --output none
  $lawId = az monitor log-analytics workspace show --resource-group $rg --workspace-name $law --query id -o tsv
  Write-Ok $law

  Write-Step 'Application Insights (workspace-based)'
  az monitor app-insights component create `
    --app $appi --location $Location --resource-group $rg --workspace $lawId `
    --only-show-errors --output none
  $connectionString = az monitor app-insights component show --app $appi --resource-group $rg --query connectionString -o tsv
  Write-Ok $appi
} else {
  Write-Step 'Application Insights'
  Write-Info 'Skipped (-SkipAnalytics). Site will deploy without telemetry.'
}

Write-Step 'Azure Static Web App'
$swaFreeRegions = @('westeurope','northeurope','eastasia','eastus2','centralus','westus2')
$swaLocation = $Location
if ($swaFreeRegions -notcontains $Location) {
  Write-Warn "SWA Free SKU not available in $Location. Falling back to westeurope for SWA."
  $swaLocation = 'westeurope'
}
az staticwebapp create `
  --name $swa --resource-group $rg --location $swaLocation --sku Free `
  --only-show-errors --output none
$swaToken    = az staticwebapp secrets list --name $swa --resource-group $rg --query properties.apiKey -o tsv
$swaHostname = az staticwebapp show --name $swa --resource-group $rg --query defaultHostname -o tsv
Write-Ok "$swa -> https://$swaHostname"

Write-Step 'GitHub secrets'
gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN --repo $repoSlug --body "$swaToken" | Out-Null
Write-Ok 'AZURE_STATIC_WEB_APPS_API_TOKEN'
if ($connectionString) {
  gh secret set VITE_APPINSIGHTS_CONNECTION_STRING --repo $repoSlug --body "$connectionString" | Out-Null
  Write-Ok 'VITE_APPINSIGHTS_CONNECTION_STRING'
}

Write-Step 'Activate deploy workflow'
if (Test-Path $activeWorkflow) {
  Write-Info "$activeWorkflow already exists. Skipping rename."
} elseif (Test-Path $exampleWorkflow) {
  Move-Item -Path $exampleWorkflow -Destination $activeWorkflow
  Write-Ok 'Renamed azure-static-web-apps.yml.example -> azure-static-web-apps.yml'
}

if (-not $SkipPush) {
  Write-Step 'Commit and push'
  $changes = git status --porcelain
  if ($changes) {
    git add $activeWorkflow 2>$null | Out-Null
    if (Test-Path $exampleWorkflow) { git add $exampleWorkflow 2>$null | Out-Null }
    git commit -m 'Activate Static Web Apps deploy workflow' | Out-Null
    git push | Out-Null
    Write-Ok 'Pushed. First deploy is running:'
    Write-Ok "  https://github.com/$repoSlug/actions"
  } else {
    Write-Info 'No git changes to commit.'
  }
} else {
  Write-Step 'Commit and push'
  Write-Info 'Skipped (-SkipPush). Run git add/commit/push when ready.'
}

Write-Host ''
Write-Host '======================================================================' -ForegroundColor White
Write-Host '  Done. Summary:' -ForegroundColor White
Write-Host '======================================================================' -ForegroundColor White
Write-Host ''
Write-Host "  Site (after first deploy):  https://$swaHostname"
Write-Host "  GitHub Actions:             https://github.com/$repoSlug/actions"
Write-Host "  Resource group:             $rg"
Write-Host "  Static Web App:             $swa"
if (-not $SkipAnalytics) {
  Write-Host "  Application Insights:       $appi"
  Write-Host "  Log Analytics workspace:    $law"
}
Write-Host ''
Write-Host '  Secrets set on the GitHub repo:'
Write-Host '    - AZURE_STATIC_WEB_APPS_API_TOKEN'
if ($connectionString) {
  Write-Host '    - VITE_APPINSIGHTS_CONNECTION_STRING'
}
Write-Host ''
Write-Host '  First deploy takes about 2-3 minutes. Check the Actions link above.' -ForegroundColor Gray
Write-Host ''
