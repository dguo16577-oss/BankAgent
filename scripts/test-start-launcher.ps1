# Offline launcher safety tests. Docker, HTTP and memory probes are mocked.
$ErrorActionPreference = 'Stop'
$launcherPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'start.ps1'
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('aster-launcher-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot | Out-Null
$envPath = Join-Path $tempRoot 'test.env'
$keyPath = Join-Path $tempRoot 'test.key'
Set-Content -LiteralPath $envPath -Value 'DB_PASSWORD=offline-test-placeholder'
Set-Content -LiteralPath $keyPath -Value 'offline-test-placeholder'
$global:AsterLauncherTestCalls = [Collections.Generic.List[string]]::new()
$global:AsterLauncherTestHeadroom = 4096
function docker {
  $global:AsterLauncherTestCalls.Add(($args -join ' '))
  $global:LASTEXITCODE = 0
  if ($args[0] -eq 'info') { 'offline-test' }
  if ($args[0] -eq 'ps' -and $args -contains '-aq') { 'owned-test-container' }
  if ($args[0] -eq 'inspect') { 'healthy' }
}
function Get-CimInstance { [pscustomobject]@{ AvailableMBytes = 4096; CommitLimit = 8GB; CommittedBytes = 8GB - ($global:AsterLauncherTestHeadroom * 1MB) } }
function Invoke-WebRequest { [pscustomobject]@{ StatusCode = 200 } }
function Assert-That($condition, [string]$message) { if (-not $condition) { throw $message } }
$savedKeyFile = $env:DEEPSEEK_API_KEY_FILE
$savedBind = $env:DEMO_BIND_ADDRESS
$savedPort = $env:DEMO_PORT
$savedEmbeddingCache = $env:ASTER_EMBEDDING_CACHE
$savedMcp = $env:ASTER_MCP_ENABLED
$cachePath = Join-Path $tempRoot 'model-cache'
try {
  & $launcherPath check -EnvFile $envPath -KeyFile $keyPath
  Assert-That (-not ($global:AsterLauncherTestCalls | Where-Object { $_ -match ' up |build|^stop ' })) 'Check performed a mutation.'
  $global:AsterLauncherTestCalls.Clear()
  & $launcherPath restart -NoBuild -EnvFile $envPath -KeyFile $keyPath
  Assert-That ([bool]($global:AsterLauncherTestCalls | Where-Object { $_ -match 'up .*--force-recreate' })) 'Restart did not recreate services.'
  Assert-That (-not ($global:AsterLauncherTestCalls | Where-Object { $_ -match ' build ' })) 'NoBuild built images.'
  $global:AsterLauncherTestCalls.Clear()
  & $launcherPath restart -NoBuild -Services 'web,agent-runtime' -EnvFile $envPath -KeyFile $keyPath
  Assert-That ([bool]($global:AsterLauncherTestCalls | Where-Object { $_ -match 'up .*--no-deps web agent-runtime$' })) 'Incremental update included dependencies.'
  Assert-That ([bool]($global:AsterLauncherTestCalls | Where-Object { $_ -match 'exec aster-local-reverse-proxy-1 nginx -s reload$' })) 'Proxy upstream was not refreshed.'
  New-Item -ItemType Directory -Path $cachePath | Out-Null
  $env:ASTER_EMBEDDING_CACHE = $cachePath
  $global:AsterLauncherTestCalls.Clear()
  & $launcherPath restart -NoBuild -WithKnowledge -Services 'knowledge-service,agent-runtime' -EnvFile $envPath -KeyFile $keyPath
  Assert-That ([bool]($global:AsterLauncherTestCalls | Where-Object { $_ -match 'up .*--no-deps knowledge-service agent-runtime$' })) 'Knowledge incremental update changed other services.'
  Assert-That ([bool]($global:AsterLauncherTestCalls | Where-Object { $_ -match 'exec aster-local-knowledge-service-1 python ingest_cli.py$' })) 'Reviewed corpus was not ingested.'
  $global:AsterLauncherTestCalls.Clear()
  $global:AsterLauncherTestHeadroom = 128
  $blocked = $false
  try { & $launcherPath restart -NoBuild -EnvFile $envPath -KeyFile $keyPath } catch { $blocked = $_.Exception.Message -match 'RESOURCE_BLOCKED' }
  Assert-That $blocked 'Low commit headroom was not rejected.'
  Assert-That (-not ($global:AsterLauncherTestCalls | Where-Object { $_ -match ' up | build |^stop ' })) 'Low memory mutated services.'
  $global:AsterLauncherTestCalls.Clear()
  foreach ($command in @('status', 'logs', 'stop')) {
    & $launcherPath $command -ProjectName offline-test-project -EnvFile (Join-Path $tempRoot 'missing.env') -KeyFile (Join-Path $tempRoot 'missing.key')
  }
  Assert-That ([bool]($global:AsterLauncherTestCalls | Where-Object { $_ -eq 'stop owned-test-container' })) 'Stop did not use project container selection.'
  Assert-That (-not ($global:AsterLauncherTestCalls | Where-Object { $_ -match ' down |volume|--all' })) 'Destructive command detected.'
  Write-Host 'PASS: preflight, restart/no-build, resource refusal, secret-independent status/logs/stop and project-scoped stop.'
} finally {
  $env:DEEPSEEK_API_KEY_FILE = $savedKeyFile
  $env:DEMO_BIND_ADDRESS = $savedBind
  $env:DEMO_PORT = $savedPort
  $env:ASTER_EMBEDDING_CACHE = $savedEmbeddingCache
  $env:ASTER_MCP_ENABLED = $savedMcp
  if (Test-Path -LiteralPath $cachePath) { [IO.Directory]::Delete($cachePath) }
  Remove-Item -LiteralPath $envPath, $keyPath -Force
  [IO.Directory]::Delete($tempRoot)
}
