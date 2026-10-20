$ErrorActionPreference = 'Stop'
$taskEnvPath = Join-Path (Split-Path $PSScriptRoot -Parent) '.env.local'
$taskText = [IO.File]::ReadAllText($taskEnvPath)
$taskMatch = [regex]::Match($taskText, '(?m)^GO_SPEECH_AUTH_TOKEN=([A-Za-z0-9._~-]{32,256})\r?$')
if (-not $taskMatch.Success) { throw 'The local speech access token is not configured.' }
Set-Clipboard -Value $taskMatch.Groups[1].Value
$taskText = $null
$taskMatch = $null
Write-Output 'Backend access token copied. Paste it into GoLearn Speech backend; its value was not displayed.'
