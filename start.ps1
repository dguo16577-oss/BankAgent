param(
  [ValidateSet('start', 'restart', 'check', 'status', 'logs', 'stop')]
  [string]$Command = 'start',
  [string]$ProjectName = 'aster-local',
  [ValidateRange(1, 65535)]
  [int]$Port = 8088,
  [string]$EnvFile = '.env.start.local',
  [string]$KeyFile = '',
  [switch]$NoBuild,
  [string]$Services = '',
  [switch]$WithKnowledge,
  [switch]$Recreate
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$selectedServices = @()
if ($Services) {
  $selectedServices = @($Services.Split(',') | ForEach-Object { $_.Trim() } | Select-Object -Unique)
  if ($selectedServices | Where-Object { $_ -notin @('web', 'agent-runtime', 'knowledge-service') }) {
    throw 'Incremental -Services accepts only web,agent-runtime,knowledge-service.'
  }
}
$composeFiles = @(
  (Join-Path $root 'infra\compose\demo.compose.yml'),
  (Join-Path $root 'infra\compose\agent.compose.yml')
)
if ($WithKnowledge) {
  $composeFiles += Join-Path $root 'infra\compose\knowledge.compose.yml'
  $env:ASTER_MCP_ENABLED = '1'
  if (-not $env:ASTER_EMBEDDING_CACHE) {
    $env:ASTER_EMBEDDING_CACHE = Join-Path $env:USERPROFILE '.cache\huggingface\hub\models--intfloat--multilingual-e5-small'
  }
  if (-not (Test-Path -LiteralPath $env:ASTER_EMBEDDING_CACHE -PathType Container)) {
    throw 'Approved local multilingual-e5-small model cache is missing. No runtime download or alternate model is allowed.'
  }
} elseif ($selectedServices -contains 'knowledge-service') {
  throw 'knowledge-service requires -WithKnowledge.'
}

function Invoke-Compose([string[]]$Arguments) {
  & docker @script:composeArgs @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose failed with exit code $LASTEXITCODE."
  }
}

if ($Command -in @('start', 'restart', 'check')) {
  # Check before even invoking Docker: under commit exhaustion its Go runtime
  # may fail to create an OS thread before Compose can return an error.
  $memory = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory
  $commitHeadroomMB = [math]::Floor(([double]$memory.CommitLimit - [double]$memory.CommittedBytes) / 1MB)
  Write-Host "Available physical memory: $($memory.AvailableMBytes) MiB; commit headroom: $commitHeadroomMB MiB."
  if ($WithKnowledge -and ($commitHeadroomMB -lt 4096 -or $memory.AvailableMBytes -lt 4096)) {
    throw 'RESOURCE_BLOCKED: Knowledge embedding build/start needs 4096 MiB physical and commit headroom. No services changed.'
  }
  if ($commitHeadroomMB -lt 2048 -or $memory.AvailableMBytes -lt 2048) {
    throw 'RESOURCE_BLOCKED: at least 2048 MiB of both physical memory and commit headroom is required. No services were stopped or started.'
  }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker CLI is unavailable. Install/start Docker Desktop first.'
}
& docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'Docker Desktop engine is not running.'
}

$script:composeArgs = @('compose', '-p', $ProjectName)
foreach ($file in $composeFiles) { $script:composeArgs += @('-f', $file) }

$resolvedEnvFile = if ([IO.Path]::IsPathRooted($EnvFile)) {
  $EnvFile
} else {
  Join-Path $root $EnvFile
}
if (Test-Path -LiteralPath $resolvedEnvFile -PathType Leaf) {
  $script:composeArgs += @('--env-file', $resolvedEnvFile)
} elseif ($Command -in @('start', 'restart', 'check') -and -not $env:DB_PASSWORD) {
  throw "Missing $resolvedEnvFile. Copy start.env.example to .env.start.local and set DB_PASSWORD."
}

# These inspection/stop commands operate on existing project containers and
# must not depend on interpolation secrets or local files still being present.
if ($Command -in @('status', 'logs', 'stop')) {
  if ($Command -eq 'status') {
    & docker ps -a --filter "label=com.docker.compose.project=$ProjectName" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    if ($LASTEXITCODE -ne 0) { throw 'Docker status failed.' }
  } else {
    $containerIds = @(& docker ps -aq --filter "label=com.docker.compose.project=$ProjectName")
    if ($LASTEXITCODE -ne 0) { throw 'Docker project lookup failed.' }
    foreach ($containerId in $containerIds) {
      if ($Command -eq 'logs') { & docker logs --tail 80 $containerId }
      else { & docker stop $containerId }
      if ($LASTEXITCODE -ne 0) { throw "Docker $Command failed for a project container." }
    }
    if ($Command -eq 'stop') { Write-Host "Stopped $ProjectName; PostgreSQL volume was retained." }
  }
  return
}

$env:DEMO_BIND_ADDRESS = '127.0.0.1'
$env:DEMO_PORT = [string]$Port
$resolvedKeyFile = if ($KeyFile) {
  $KeyFile
} elseif ($env:DEEPSEEK_API_KEY_FILE) {
  $env:DEEPSEEK_API_KEY_FILE
} else {
  'E:\deeoseekapikey.txt'
}
if (-not (Test-Path -LiteralPath $resolvedKeyFile -PathType Leaf)) {
  throw 'DeepSeek key file missing. Set -KeyFile to an existing private file.'
}
$env:DEEPSEEK_API_KEY_FILE = (Resolve-Path -LiteralPath $resolvedKeyFile).Path
Invoke-Compose -Arguments @('config', '--quiet')
if ($Command -eq 'check') {
  Write-Host 'Preflight passed: Docker, configuration, key file and memory. No services were started.'
  return
}
if ($Command -in @('start', 'restart')) {
  Write-Host "Starting $ProjectName at http://127.0.0.1:$Port"
  Write-Host 'The database, Banking Core, Agent and Web run in Docker. Their state is preserved on stop.'
  if ($selectedServices.Count) {
    foreach ($dependency in @('postgres', 'banking-core', 'reverse-proxy')) {
      $state = & docker inspect "$ProjectName-$dependency-1" --format '{{.State.Health.Status}}'
      if ($LASTEXITCODE -ne 0 -or $state -ne 'healthy') { throw "Incremental deployment requires healthy existing $dependency." }
    }
  }
  if (-not $NoBuild) {
    # Building these large images concurrently can exhaust Docker Desktop memory.
    $buildServices = if ($selectedServices.Count) { $selectedServices } else { @('reverse-proxy', 'banking-core', 'agent-runtime', 'web') }
    if ($WithKnowledge -and -not $selectedServices.Count) { $buildServices += 'knowledge-service' }
    foreach ($service in $buildServices) {
      $memory = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory
      if (([double]$memory.CommitLimit - [double]$memory.CommittedBytes) -lt 2GB) {
        throw 'RESOURCE_BLOCKED before next build; running services unchanged.'
      }
      Write-Host "Building $service..."
      if ($service -in @('web', 'agent-runtime')) {
        $sourceDirectory = if ($service -eq 'web') { Join-Path $root 'apps/web/src' } else { Join-Path $root 'services/agent-runtime/app' }
        $entries = @(Get-ChildItem -LiteralPath $sourceDirectory -Recurse -File |
          Where-Object { $_.Extension -in @('.py', '.ts', '.tsx', '.css', '.json') } |
          Sort-Object FullName | ForEach-Object {
            $_.FullName.Substring($root.Length) + ':' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
          })
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $fingerprint = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(($entries -join "`n"))))).Replace('-', '').ToLowerInvariant() }
        finally { $sha.Dispose() }
        Write-Host "Source tree SHA256 ($service): $fingerprint"
        Invoke-Compose -Arguments @('build', '--build-arg', "ASTER_SOURCE_SHA256=$fingerprint", $service)
      } else {
        Invoke-Compose -Arguments @('build', $service)
      }
    }
  }
  $upArguments = @('up', '-d', '--no-build', '--wait', '--wait-timeout', '240')
  if (-not $NoBuild -or $Recreate -or $Command -eq 'restart') { $upArguments += '--force-recreate' }
  if ($selectedServices.Count) { $upArguments += @('--no-deps') + $selectedServices }
  Invoke-Compose -Arguments $upArguments
  if ($WithKnowledge) {
    & docker exec "$ProjectName-knowledge-service-1" python ingest_cli.py
    if ($LASTEXITCODE -ne 0) { throw 'Reviewed Aster Demo Policy ingestion failed; RAG is not accepted.' }
  }
  if ($selectedServices.Count) {
    # nginx upstream addresses may retain the replaced Web container IP.
    & docker exec "$ProjectName-reverse-proxy-1" nginx -t
    if ($LASTEXITCODE -ne 0) { throw 'Proxy configuration verification failed.' }
    & docker exec "$ProjectName-reverse-proxy-1" nginx -s reload
    if ($LASTEXITCODE -ne 0) { throw 'Proxy DNS refresh failed after incremental deployment.' }
  }
  $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/" -TimeoutSec 15
  if ($response.StatusCode -ne 200) { throw "Web returned HTTP $($response.StatusCode)." }
  Write-Host "Ready: http://127.0.0.1:$Port/"
  Invoke-Compose -Arguments @('ps')
}
