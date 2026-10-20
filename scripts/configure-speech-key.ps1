[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

# This handoff is intentionally local-only. It never calls Azure, prints the key,
# or accepts an arbitrary output path.
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$envPath = [IO.Path]::GetFullPath((Join-Path $repoRoot '.env.local'))
$expectedPath = [IO.Path]::GetFullPath((Join-Path (Get-Location) '.env.local'))
if ($envPath -ne $expectedPath) {
  throw 'Run this helper from the GoListen repository root; the destination is fixed to .env.local.'
}

$secure = Read-Host 'Paste the Azure Speech key (input is hidden)' -AsSecureString
$bstr = [IntPtr]::Zero
$key = $null
try {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  if ([string]::IsNullOrWhiteSpace($key) -or $key.Length -lt 16 -or $key.Length -gt 256 -or $key -match '\s') {
    throw 'The entered Azure Speech key failed local validation.'
  }

  $existing = if (Test-Path -LiteralPath $envPath) { [IO.File]::ReadAllText($envPath) } else { '' }
  $original = $existing
  $values = [ordered]@{
    'AZURE_SPEECH_KEY' = $key
    'AZURE_SPEECH_REGION' = 'eastus'
    'GO_SPEECH_ALLOWED_EXTENSION_ORIGINS' = 'chrome-extension://ckjmiefophlhjlobnidnclkiimbjalfo'
  }
  foreach ($name in $values.Keys) {
    $line = $name + '=' + $values[$name]
    $pattern = '(?m)^' + [regex]::Escape($name) + '=.*$'
    if ($existing -match $pattern) {
      $existing = [regex]::Replace($existing, $pattern, [Text.RegularExpressions.MatchEvaluator]{ param($m) $line })
    } else {
      $suffix = if ($existing.Length -gt 0 -and $existing -notmatch "(`r`n|`n|`r)$") { "`r`n" } else { '' }
      $existing = $existing + $suffix + $line + "`r`n"
    }
  }

  # Preserve every unrelated setting byte-for-byte and keep the destination private.
  [IO.File]::WriteAllText($envPath, $existing, [Text.UTF8Encoding]::new($false))
  $check = [IO.File]::ReadAllText($envPath)
  foreach ($name in $values.Keys) {
    if ($check -notmatch ('(?m)^' + [regex]::Escape($name) + '=.+$')) { throw "Local validation failed for $name." }
  }
  if ($check -notmatch '(?m)^GO_SPEECH_AUTH_TOKEN=') { throw 'Existing GO_SPEECH_AUTH_TOKEN was not preserved.' }
  Write-Output 'Azure Speech key stored in the repository .env.local (key withheld). Region and extension origin validated.'
} finally {
  if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  $key = $null
  $secure = $null
}
