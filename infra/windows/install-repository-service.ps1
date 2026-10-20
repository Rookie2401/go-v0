<#
.SYNOPSIS
  Keep the Go Repository service and its Cloudflare tunnel running on this PC without a terminal window: the service as a
  Scheduled Task that starts with Windows and restarts itself, the tunnel as the cloudflared Windows service. Optionally
  stop the PC from sleeping on battery. Run from an ADMINISTRATOR PowerShell.

.DESCRIPTION
  Why: until the service is hosted off this PC (infra/repository: Render or a VPS), the phone can only sync while the PC
  is on, online, and both processes are alive. Started by hand in a terminal they die with the window, with a sleep, or
  with a sign-out (2026-10-19: the tunnel got a terminate signal nine seconds before the PC slept; the service was gone
  too). This script makes both start with Windows and come back after a crash. It hosts nothing elsewhere: a PC that is
  off or asleep still means no sync, which is why -NeverSleepOnBattery exists and why the hosted path is the real fix.

  What it does (idempotent; re-run safely):
    1. Scheduled Task "GoRepositoryService": runs the service (vite-node packages/repository-service/src/main.ts --port
       8790 --data data/local-repository --host 127.0.0.1) at startup and at logon, as this user without a stored password
       (S4U logon: works logged in or not, no network credentials needed since the service only listens on 127.0.0.1),
       unlimited run time, restart every minute up to 99 times, allowed on battery, started late if the trigger was missed.
       Output goes to data\local-repository\service.log. No secrets are read or written.
    2. cloudflared Windows service: copies %USERPROFILE%\.cloudflared\config.yml and the tunnel credentials JSON into the
       LocalSystem profile (C:\Windows\System32\config\systemprofile\.cloudflared), which is where the Windows service
       reads them, then `cloudflared service install` + Start-Service. A tunnel already running in a window is stopped
       first (two copies would both register). Skipped with -SkipTunnel.
    3. With -NeverSleepOnBattery: powercfg standby and hibernate timeouts on battery set to never (the AC side is already
       never on this PC). Without the switch nothing about power changes.
    4. Verifies http://127.0.0.1:8790/health, then https://<Hostname>/health (ok:true, service "repository").

  Undo: Unregister-ScheduledTask GoRepositoryService; cloudflared service uninstall (elevated); powercfg as you had it.

.PARAMETER Hostname    Public name of the tunnel (default repo.golearn-global-languages.com)
.PARAMETER TunnelName  Name of the named tunnel (default goreview-repository)
.PARAMETER Port        Local service port (default 8790)
.PARAMETER Cloudflared Path to cloudflared.exe (default: the copy under Documents\Codex\…\work\tools, else PATH)
.PARAMETER SkipTunnel  Install only the Repository service task.
.PARAMETER NeverSleepOnBattery  Also set the battery sleep / hibernate timeouts to never.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File infra\windows\install-repository-service.ps1 -NeverSleepOnBattery
#>
param(
  [string]$Hostname = 'repo.golearn-global-languages.com',
  [string]$TunnelName = 'goreview-repository',
  [int]$Port = 8790,
  [string]$Cloudflared = '',
  [switch]$SkipTunnel,
  [switch]$NeverSleepOnBattery
)

$ErrorActionPreference = 'Stop'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Run this from an ADMINISTRATOR PowerShell (a Scheduled Task at startup and a Windows service both need it).' }

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$taskName = 'GoRepositoryService'
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'node.exe is not on PATH for this account.' }
$viteNode = Join-Path $repo 'node_modules\vite-node\dist\cli.mjs'
if (-not (Test-Path $viteNode)) { throw "vite-node is not installed: run npm install in $repo first." }
$dataDir = Join-Path $repo 'data\local-repository'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$log = Join-Path $dataDir 'service.log'

function Find-Cloudflared {
  param([string]$Given)
  if ($Given -and (Test-Path $Given)) { return (Resolve-Path $Given).Path }
  $codex = Join-Path $env:USERPROFILE 'Documents\Codex\2026-10-14\ple\work\tools\cloudflared.exe'
  if (Test-Path $codex) { return $codex }
  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw 'cloudflared.exe not found. Install it (winget install Cloudflare.cloudflared) or pass -Cloudflared <path>.'
}

# ── 1. the Repository service as a Scheduled Task ───────────────────────────────────────────────────────────────────────
Write-Host "1. Scheduled Task $taskName -> $node $viteNode (port $Port, data $dataDir)"
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) { Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
# a cmd wrapper so stdout/stderr land in the log (schtasks cannot redirect by itself); the service listens only on 127.0.0.1
$cmdLine = "/c `"`"$node`" `"$viteNode`" packages/repository-service/src/main.ts --port $Port --data data/local-repository --host 127.0.0.1 >> `"$log`" 2>&1`""
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\cmd.exe" -Argument $cmdLine -WorkingDirectory $repo
$triggers = @((New-ScheduledTaskTrigger -AtStartup), (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME))
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal `
  -Description 'Go Repository service on 127.0.0.1:8790 (data/local-repository); restarts itself; log in data/local-repository/service.log' | Out-Null
# stop a copy started by hand in a terminal (it would hold the port), then start the task
$onPort = (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
if ($onPort) { Write-Host "   stopping the process already listening on $Port (pid $onPort) so the task owns it"; Stop-Process -Id $onPort -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2 }
Start-ScheduledTask -TaskName $taskName
Write-Host "   task registered and started (state: $((Get-ScheduledTask -TaskName $taskName).State))"

# ── 2. cloudflared as a Windows service ─────────────────────────────────────────────────────────────────────────────────
if (-not $SkipTunnel) {
  $cf = Find-Cloudflared $Cloudflared
  $userHome = Join-Path $env:USERPROFILE '.cloudflared'
  $config = Join-Path $userHome 'config.yml'
  if (-not (Test-Path $config)) { throw "No ${config}: run infra\cloudflare\setup-named-tunnel.ps1 -Hostname $Hostname first (it creates the tunnel, the config and the DNS route)." }
  # the Windows service runs as LocalSystem and reads its config from the system profile, not from this user's folder
  $sysHome = Join-Path $env:SystemRoot 'System32\config\systemprofile\.cloudflared'
  New-Item -ItemType Directory -Force -Path $sysHome | Out-Null
  Copy-Item $config (Join-Path $sysHome 'config.yml') -Force
  $credRef = (Select-String -Path $config -Pattern '^credentials-file:\s*(.+)$').Matches | ForEach-Object { $_.Groups[1].Value.Trim() } | Select-Object -First 1
  if ($credRef -and (Test-Path $credRef)) { Copy-Item $credRef (Join-Path $sysHome (Split-Path $credRef -Leaf)) -Force }
  # point the system copy at the system-profile credentials (same file name)
  (Get-Content (Join-Path $sysHome 'config.yml')) -replace '^credentials-file:.*$', ("credentials-file: " + (Join-Path $sysHome (Split-Path $credRef -Leaf))) | Set-Content (Join-Path $sysHome 'config.yml') -Encoding ascii
  Write-Host "2. cloudflared service: $cf (config copied to $sysHome)"
  Get-Process cloudflared -ErrorAction SilentlyContinue | Where-Object { (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine -notmatch 'service' } | ForEach-Object { Write-Host "   stopping the tunnel running in a window (pid $($_.Id))"; Stop-Process -Id $_.Id -Force }
  $svc = Get-Service -Name cloudflared -ErrorAction SilentlyContinue
  if (-not $svc) { & $cf service install | Out-Host }
  Set-Service -Name cloudflared -StartupType Automatic
  Restart-Service -Name cloudflared
  Write-Host "   service cloudflared: $((Get-Service cloudflared).Status), startup $((Get-Service cloudflared).StartType)"
}

# ── 3. power (opt-in) ───────────────────────────────────────────────────────────────────────────────────────────────────
if ($NeverSleepOnBattery) {
  powercfg /change standby-timeout-dc 0 | Out-Null
  powercfg /change hibernate-timeout-dc 0 | Out-Null
  Write-Host '3. power: sleep and hibernate on battery set to never (AC was already never)'
} else {
  Write-Host '3. power: unchanged (pass -NeverSleepOnBattery to stop the PC sleeping on battery; asleep means no sync)'
}

# ── 4. verify ───────────────────────────────────────────────────────────────────────────────────────────────────────────
Write-Host "4. waiting for http://127.0.0.1:$Port/health (the service takes about 40 s to listen) …"
$local = $false
for ($i = 0; $i -lt 40 -and -not $local; $i++) {
  try { $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 5; if ($r.ok -eq $true) { $local = $true } } catch { Start-Sleep -Seconds 3 }
}
if (-not $local) { Write-Host "   local health not answering yet; see $log"; exit 3 }
Write-Host "   local: ok (service $($r.service), contractVersion $($r.contractVersion))"
if (-not $SkipTunnel) {
  $ok = $false
  for ($i = 0; $i -lt 12 -and -not $ok; $i++) {
    try { $r = Invoke-RestMethod -Uri "https://$Hostname/health" -TimeoutSec 10; if ($r.ok -eq $true -and $r.service -eq 'repository') { $ok = $true } } catch { Start-Sleep -Seconds 5 }
  }
  if ($ok) { Write-Host "   public: https://$Hostname/health ok" }
  else { Write-Host "   public: not reachable. If the TLS handshake fails (connection reset, no HTTP status), the zone's edge certificate is not active: Cloudflare dashboard -> SSL/TLS -> Edge Certificates (Universal SSL), and the zone must show Active. If HTTP 530: the tunnel is not connected (Get-Service cloudflared; the log is in the Event Viewer under Application)."; exit 3 }
}
Write-Host 'Done. Both start with Windows now; the PC must still be on and online for the phone to sync.'
