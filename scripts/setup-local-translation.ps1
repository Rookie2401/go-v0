[CmdletBinding()]
param(
  [string] $PythonExe = "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe",
  [string] $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string[]] $Languages = @('sq','hi','es','de','th','nb','nn'),
  [switch] $SkipModelDownload,
  [switch] $NoStart
)

$ErrorActionPreference = 'Stop'
$localRoot = Join-Path $ProjectRoot 'data\translation.local'
$venvPython = Join-Path $localRoot '.venv\Scripts\python.exe'
$modelDir = Join-Path $localRoot 'model'
$serviceConfig = Join-Path $localRoot 'service-config.json'
$extensionConfig = Join-Path $localRoot 'extension-config.json'
$distConfig = Join-Path $ProjectRoot 'packages\golearn-extension\dist\translation.local.json'
$catalogPath = Join-Path $ProjectRoot 'packages\golearn-extension\src\translation\models.json'
$sharedCatalog = Get-Content -LiteralPath $catalogPath -Raw | ConvertFrom-Json
$catalog = @{}
foreach ($property in $sharedCatalog.PSObject.Properties) { $catalog[$property.Name] = $property.Value }
foreach ($language in $Languages) { if (-not $catalog.ContainsKey($language)) { throw "Unsupported language code: $language" } }
$requestedIds = @($Languages | ForEach-Object { $catalog[$_].id } | Sort-Object -Unique)

if (-not (Test-Path -LiteralPath $PythonExe)) { throw 'The configured Python runtime was not found. Pass -PythonExe with a Python 3.12 executable.' }
New-Item -ItemType Directory -Force -Path $localRoot | Out-Null
if (-not (Test-Path -LiteralPath $venvPython)) {
  & $PythonExe -m venv (Join-Path $localRoot '.venv')
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated translation environment.' }
}

& $venvPython -m pip install --disable-pip-version-check --index-url https://download.pytorch.org/whl/cpu 'torch==2.6.0'
if ($LASTEXITCODE -ne 0) { throw 'Could not install the CPU-only PyTorch runtime.' }
& $venvPython -m pip install --disable-pip-version-check 'transformers==4.49.0' 'sentencepiece==0.2.0' 'huggingface_hub==0.29.3' 'safetensors==0.5.3' 'truststore==0.10.4' 'sacremoses==0.1.1'
if ($LASTEXITCODE -ne 0) { throw 'Could not install the local translation runtime packages.' }

if (-not $SkipModelDownload) {
  foreach ($modelId in $requestedIds) {
    $entry = $catalog[($Languages | Where-Object { $catalog[$_].id -eq $modelId } | Select-Object -First 1)]
    $modelKey = ($modelId -split '/')[-1] -replace '^opus-mt-','' -replace '-en$',''
    $targetDir = if ($modelKey -eq 'sq') { $modelDir } else { Join-Path $modelDir $modelKey }
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
    $pythonArgs = @('-c', "import truststore; truststore.inject_into_ssl(); from huggingface_hub import snapshot_download; snapshot_download(repo_id='$($entry.id)', revision='$($entry.revision)', local_dir=r'$targetDir', allow_patterns=['README.md','config.json','generation_config.json','pytorch_model.bin','source.spm','target.spm','tokenizer_config.json','vocab.json'])")
    & $venvPython @pythonArgs
    if ($LASTEXITCODE -ne 0) { throw "Could not download the pinned public translation model for $modelKey." }
  }
}

if (-not (Test-Path -LiteralPath $serviceConfig)) {
  $token = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
  [IO.File]::WriteAllText($serviceConfig, (@{token=$token} | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
} else {
  $existingConfig = Get-Content -LiteralPath $serviceConfig -Raw | ConvertFrom-Json
  if (-not $existingConfig.token -or $existingConfig.token -notmatch '^[0-9a-f]{64,}$') { throw 'The existing local translation service config is invalid.' }
  $token = [string]$existingConfig.token
}

$extensionJson = @{ endpoint='http://127.0.0.1:8792/translate'; token=$token } | ConvertTo-Json -Compress
[IO.File]::WriteAllText($extensionConfig, $extensionJson, [Text.UTF8Encoding]::new($false))
$distDir = Split-Path -Parent $distConfig
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
[IO.File]::WriteAllText($distConfig, $extensionJson, [Text.UTF8Encoding]::new($false))

# Keep both local secret files readable only by this Windows account.
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
foreach ($secretPath in @($serviceConfig, $extensionConfig, $distConfig)) {
  $grant = '{0}:(F)' -f $identity
  & icacls.exe $secretPath '/inheritance:r' '/grant:r' $grant | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not restrict local translation config permissions.' }
}

if ($SkipModelDownload) {
  Write-Output "Prepared local translation settings for: $($Languages -join ', '); model downloads were skipped."
} else {
  Write-Output "Installed local source-to-English snapshots for: $($Languages -join ', ')."
}
Write-Output "Extension config is ready at $distConfig (token withheld). Rebuilds of the extension may replace dist; rerun this setup script after rebuilding."

if (-not $NoStart) {
  $process = Start-Process -FilePath $venvPython -ArgumentList @('-m', 'server.translation') -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $localRoot 'service.stdout.log') -RedirectStandardError (Join-Path $localRoot 'service.stderr.log')
  Start-Sleep -Seconds 2
  if ($process.HasExited) { throw 'The local translation service did not start. See the private service error log for details.' }
  Write-Output 'Local translation service started on 127.0.0.1:8792.'
}
