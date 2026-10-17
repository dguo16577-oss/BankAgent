param([string]$ManagedLogPrefix)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$coreDirectory = Join-Path $projectRoot 'services\banking-core'
$defaultJar = Join-Path $coreDirectory 'target\banking-core-0.1.0-SNAPSHOT.jar'
$fallbackJar = Join-Path $coreDirectory 'target\banking-core-0.1.0-SNAPSHOT-exec.jar'
$jar = if ((Test-Path -LiteralPath $defaultJar -PathType Leaf) -and
  (Get-Item -LiteralPath $defaultJar).Length -ge 50000000) { $defaultJar } else { $fallbackJar }
if (-not (Test-Path -LiteralPath $jar -PathType Leaf) -or (Get-Item -LiteralPath $jar).Length -lt 50000000) {
  throw 'Executable Banking Core JAR is missing or incomplete. Build the backend before starting it.'
}
$knownJdk = Join-Path $env:USERPROFILE '.jdks\jdk-21.0.12.1+1\bin\java.exe'
$java = if (Test-Path -LiteralPath $knownJdk -PathType Leaf) {
  $knownJdk
} elseif ($env:JAVA_HOME) {
  Join-Path $env:JAVA_HOME 'bin\java.exe'
}
if (-not $java) {
  throw 'JDK 21 was not found. Set JAVA_HOME to a Java 21 installation.'
}

$listener = Get-NetTCPConnection -LocalPort 18080 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($listener) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
  if (-not $process -or
    ($process.CommandLine.IndexOf($defaultJar, [StringComparison]::OrdinalIgnoreCase) -lt 0 -and
     $process.CommandLine.IndexOf($fallbackJar, [StringComparison]::OrdinalIgnoreCase) -lt 0)) {
    throw 'Port 18080 is occupied by a process outside the local Banking Core.'
  }
  Stop-Process -Id $listener.OwningProcess -Force
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if (-not (Get-NetTCPConnection -LocalPort 18080 -State Listen -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 100
  }
  if (Get-NetTCPConnection -LocalPort 18080 -State Listen -ErrorAction SilentlyContinue) {
    throw 'Port 18080 did not become free after stopping the previous Banking Core process.'
  }
}

# The local launcher is for the competition demo. Enable the demo-only SMS
# inbox so browser step-up can be completed without a production SMS provider.
if (-not $env:DB_HOST) { $env:DB_HOST = 'localhost' }
if (-not $env:DB_PORT) { $env:DB_PORT = '5432' }
if (-not $env:DB_NAME) { $env:DB_NAME = 'aster_banking' }
if (-not $env:DB_USER) { $env:DB_USER = if ($env:SPRING_DATASOURCE_USERNAME) { $env:SPRING_DATASOURCE_USERNAME } else { 'aster_local' } }
if (-not $env:DB_PASSWORD) { $env:DB_PASSWORD = if ($env:SPRING_DATASOURCE_PASSWORD) { $env:SPRING_DATASOURCE_PASSWORD } else { 'aster_local_dev_only' } }
$arguments = @('-Xmx512m', '-XX:+UseSerialGC', '-jar', $jar,
  '--spring.profiles.active=demo,local', '--server.port=18080', '--server.address=127.0.0.1')
Write-Host 'Starting local Banking Core at http://127.0.0.1:18080.'
if ($ManagedLogPrefix) {
  $coreProcess = Start-Process -FilePath $java -ArgumentList $arguments `
    -WorkingDirectory $coreDirectory -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput "$ManagedLogPrefix.stdout.log" `
    -RedirectStandardError "$ManagedLogPrefix.stderr.log"
  Write-Host "Banking Core process launched with PID $($coreProcess.Id)."
} else {
  & $java @arguments
}
