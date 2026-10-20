$ErrorActionPreference = 'Stop'
# Use Windows' existing trust store while retaining certificate verification.
$taskPreviousCa = $env:NODE_USE_SYSTEM_CA
Push-Location (Join-Path $PSScriptRoot '..')
try {
  $env:NODE_USE_SYSTEM_CA = '1'
  & npm run speech:serve
} finally {
  $env:NODE_USE_SYSTEM_CA = $taskPreviousCa
  Pop-Location
}
