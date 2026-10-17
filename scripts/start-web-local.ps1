$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$node = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if (-not (Test-Path -LiteralPath $node -PathType Leaf)) {
  throw 'Bundled Node.js was not found. Start the Web runtime with a local Node.js installation.'
}

$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($listener) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
  $expectedServer = Join-Path $projectRoot 'apps\web\.next\standalone\apps\web\server.js'
  if (-not $process -or $process.CommandLine.IndexOf($expectedServer, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
    throw 'Port 3000 is occupied by a process outside this project. Stop it manually before starting Aster Web.'
  }
  Stop-Process -Id $listener.OwningProcess -Force
  Write-Host 'Stopped the previous local Web process.'
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if (-not (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 100
  }
  if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) {
    throw 'Port 3000 did not become free after stopping the previous Web process.'
  }
}

Set-Location -LiteralPath $projectRoot
$env:NEXT_PUBLIC_API_MODE = 'backend'
$env:NEXT_PUBLIC_BANKING_API_BASE_URL = 'http://localhost:18080'
Write-Host 'Starting Aster Web at http://localhost:3000; keep this window open.'
& $node (Join-Path $projectRoot 'scripts\web-runtime.mjs') start
