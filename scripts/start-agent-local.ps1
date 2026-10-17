param([string]$ManagedLogPrefix)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$keyFile = if ($env:DEEPSEEK_API_KEY_FILE) {
  $env:DEEPSEEK_API_KEY_FILE
} else {
  'E:\deeoseekapikey.txt'
}
if (-not (Test-Path -LiteralPath $keyFile -PathType Leaf)) {
  throw "DeepSeek key file was not found. Set DEEPSEEK_API_KEY_FILE to its path."
}
$apiKey = (Get-Content -LiteralPath $keyFile -Raw).Trim()
if (-not $apiKey) {
  throw 'The DeepSeek key file is empty.'
}
$python = if ($env:ASTER_AGENT_PYTHON) {
  $env:ASTER_AGENT_PYTHON
} elseif (Test-Path -LiteralPath 'D:\Anaconda\python.exe' -PathType Leaf) {
  'D:\Anaconda\python.exe'
} else {
  (Get-Command python -ErrorAction Stop).Source
}
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
  throw 'Agent Python was not found. Set ASTER_AGENT_PYTHON to its executable path.'
}

$listener = Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($listener) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
  if (-not $process -or $process.CommandLine -notmatch 'uvicorn app\.main:app.*services/agent-runtime') {
    throw 'Port 8001 is occupied by another process. Stop it before starting the Agent.'
  }
  Stop-Process -Id $listener.OwningProcess -Force
  Write-Host 'Stopped the previous local Agent process.'
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if (-not (Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 100
  }
  if (Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue) {
    throw 'Port 8001 did not become free after stopping the previous Agent process.'
  }
}

Set-Location -LiteralPath $projectRoot
$env:AGENT_RUNTIME_VERSION = 'v2'
$env:BANKING_API_BASE_URL = 'http://127.0.0.1:18080'
$env:DEEPSEEK_API_KEY = $apiKey

# Some local VPNs return a fake 198.18/15 address for DeepSeek but fail to
# route its TLS traffic. Resolve the public address through HTTPS only for
# this Agent process; the Python client still verifies api.deepseek.com.
$deepSeekDns = Resolve-DnsName 'api.deepseek.com' -Type A -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress } | Select-Object -First 1 -ExpandProperty IPAddress
if ($deepSeekDns -match '^198\.(18|19)\.') {
  $dnsPayload = curl.exe --silent --show-error --max-time 10 `
    'https://dns.google/resolve?name=api.deepseek.com&type=A' | ConvertFrom-Json
  $publicIp = $dnsPayload.Answer | Where-Object {
    $_.type -eq 1 -and $_.data -notmatch '^198\.(18|19)\.'
  } | Select-Object -First 1 -ExpandProperty data
  $parsedIp = $null
  if (-not $publicIp -or
    -not [System.Net.IPAddress]::TryParse($publicIp, [ref]$parsedIp) -or
    $parsedIp.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
    throw 'DeepSeek DNS fallback could not obtain a valid public IPv4 address.'
  }
  $env:DEEPSEEK_RESOLVED_IP = $publicIp
  $overrideDirectory = Join-Path $projectRoot 'scripts\agent_dns_override'
  $env:PYTHONPATH = if ($env:PYTHONPATH) {
    "$overrideDirectory;$env:PYTHONPATH"
  } else {
    $overrideDirectory
  }
  Write-Host 'VPN fake DNS detected; using local DeepSeek address resolution in this Agent process.'
}

Write-Host 'Starting Agent v2 at http://127.0.0.1:8001.'
if ($ManagedLogPrefix) {
  $agentProcess = Start-Process -FilePath $python `
    -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--app-dir', 'services/agent-runtime', '--host', '127.0.0.1', '--port', '8001') `
    -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput "$ManagedLogPrefix.stdout.log" `
    -RedirectStandardError "$ManagedLogPrefix.stderr.log"
  Write-Host "Agent process launched with PID $($agentProcess.Id)."
} else {
  & $python -m uvicorn app.main:app --app-dir services/agent-runtime --host 127.0.0.1 --port 8001
}
