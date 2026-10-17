param(
  [ValidateSet('all', 'core', 'web', 'agent')]
  [string]$Service = 'all'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $projectRoot 'artifacts\runtime-logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

function Get-ListenerPid([int]$port) {
  $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($listener) { return [int]$listener.OwningProcess }
  return 0
}

function Restart-LocalService([string]$name, [int]$port, [string]$healthUrl) {
  $oldPid = Get-ListenerPid $port
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $logPath = Join-Path $logDirectory "$name-$stamp.log"
  $runner = Join-Path $PSScriptRoot 'run-local-service.ps1'

  # The service script verifies ownership before stopping an existing listener.
  # The API key stays in the Agent process environment and never enters arguments or logs.
  $launcher = Start-Process -FilePath 'powershell.exe' `
    -ArgumentList @('-NoProfile', '-File', ('"' + $runner + '"'),
      '-Service', $name, '-LogPath', ('"' + $logPath + '"')) `
    -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru

  $maxAttempts = if ($name -eq 'core') { 80 } else { 30 }
  for ($attempt = 0; $attempt -lt $maxAttempts; $attempt++) {
    Start-Sleep -Milliseconds 500
    $currentPid = Get-ListenerPid $port
    if ($currentPid -ne 0 -and $currentPid -ne $oldPid) {
      try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 15
        if ($response.StatusCode -eq 200) {
          Write-Host "$name ready: $healthUrl (PID $currentPid)"
          Write-Host "Logs: $logPath"
          return
        }
      } catch { }
    }
  }

  $detailPaths = @($logPath, "$logPath.stderr.log")
  $details = ($detailPaths | Where-Object { Test-Path -LiteralPath $_ } |
    ForEach-Object { Get-Content -LiteralPath $_ -Tail 12 }) -join [Environment]::NewLine
  throw "$name failed to become healthy. Logs: $logPath`n$details"
}

if ($Service -in @('all', 'core')) {
  Restart-LocalService 'core' 18080 'http://127.0.0.1:18080/actuator/health'
}
if ($Service -in @('all', 'web')) {
  Restart-LocalService 'web' 3000 'http://localhost:3000/app/agent'
}
if ($Service -in @('all', 'agent')) {
  Restart-LocalService 'agent' 8001 'http://127.0.0.1:8001/health'
}
