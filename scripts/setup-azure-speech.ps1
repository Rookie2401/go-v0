[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $SubscriptionId,
  [Parameter(Mandatory = $true)] [string] $ResourceGroupName,
  [Parameter(Mandatory = $true)] [string] $ResourceName,
  [Parameter(Mandatory = $true)] [ValidatePattern('^[a-z0-9-]{2,40}$')] [string] $Location,
  [string] $OutputEnvPath = '.env.local',
  [ValidatePattern('^[a-p]{32}$')] [string] $ExtensionId,
  [switch] $Apply
)

$ErrorActionPreference = 'Stop'

function Assert-AzureCli {
  if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw 'Azure CLI (az) is not installed. Install it separately or use the portal handoff in docs/golisten/AZURE-SETUP.md.'
  }
}

function Invoke-AzJson([string[]] $Arguments) {
  $raw = & az @Arguments --only-show-errors --output json
  if ($LASTEXITCODE -ne 0) { throw "Azure CLI command failed (exit $LASTEXITCODE)." }
  return ($raw -join "`n") | ConvertFrom-Json
}

Write-Output "Azure Speech plan"
Write-Output "  subscription: $SubscriptionId"
Write-Output "  resource group: $ResourceGroupName"
Write-Output "  resource: $ResourceName"
Write-Output "  region: $Location"
Write-Output '  SKU: F0 (free tier only)'
if ($ExtensionId) { Write-Output "  extension origin: chrome-extension://$ExtensionId" }
Write-Output "  env destination: $OutputEnvPath"

if (-not $Apply) {
  Write-Output ''
  Write-Output 'Plan only. No Azure CLI call, cloud resource, credential, or local env file was changed.'
  Write-Output 'Re-run with -Apply after reviewing the parameters and confirming the subscription.'
  exit 0
}

Assert-AzureCli

# The subscription and resource group are explicit. No default account, tenant, or resource is inferred.
& az account set --subscription $SubscriptionId --only-show-errors
if ($LASTEXITCODE -ne 0) { throw 'Could not select the requested Azure subscription.' }

$group = & az group show --name $ResourceGroupName --only-show-errors --output json 2>$null
if ($LASTEXITCODE -ne 0) {
  & az group create --name $ResourceGroupName --location $Location --only-show-errors --output none
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the requested Azure resource group.' }
}

$account = & az cognitiveservices account show --name $ResourceName --resource-group $ResourceGroupName --only-show-errors --output json 2>$null
if ($LASTEXITCODE -ne 0) {
  & az cognitiveservices account create --name $ResourceName --resource-group $ResourceGroupName --location $Location --kind SpeechServices --sku F0 --yes --only-show-errors --output none
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the Azure Speech resource.' }
} else {
  $accountObject = $account | ConvertFrom-Json
  if ($accountObject.kind -ne 'SpeechServices') { throw "Existing resource '$ResourceName' is not a SpeechServices account." }
  if ($accountObject.sku.name -ne 'F0') { throw "Existing resource '$ResourceName' is not on the free F0 tier; no paid resource is accepted." }
}

$region = (& az cognitiveservices account show --name $ResourceName --resource-group $ResourceGroupName --query 'location' --output tsv --only-show-errors).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($region)) { throw 'Azure returned no resource region.' }

# Capture the key only in memory and write only the two server-side variables. Never print it.
$key = (& az cognitiveservices account keys list --name $ResourceName --resource-group $ResourceGroupName --query 'key1' --output tsv --only-show-errors).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($key)) { throw 'Azure returned no Speech key; no env file was changed.' }

$envFullPath = [IO.Path]::GetFullPath($OutputEnvPath)
$existing = if (Test-Path -LiteralPath $envFullPath) { Get-Content -LiteralPath $envFullPath -Raw } else { '' }
$pairs = @(@('AZURE_SPEECH_KEY', $key), @('AZURE_SPEECH_REGION', $region))
if ($ExtensionId) { $pairs += ,@('GO_SPEECH_ALLOWED_EXTENSION_ORIGINS', "chrome-extension://$ExtensionId") }
foreach ($pair in $pairs) {
  $name = $pair[0]; $value = $pair[1]
  $line = "$name=$value"
  $pattern = "(?m)^$([regex]::Escape($name))=.*$"
  if ($existing -match $pattern) { $existing = [regex]::Replace($existing, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $line }) }
  else { $existing = $existing.TrimEnd("`r", "`n") + "`r`n$line`r`n" }
}
[IO.File]::WriteAllText($envFullPath, $existing, [Text.UTF8Encoding]::new($false))
Write-Output "Azure Speech is configured in $envFullPath (key value withheld). Restart the server before running speech checks."
