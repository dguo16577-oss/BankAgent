param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('core', 'web', 'agent')]
  [string]$Service,
  [Parameter(Mandatory = $true)]
  [string]$LogPath
)

$ErrorActionPreference = 'Stop'
$serviceScript = Join-Path $PSScriptRoot "start-$Service-local.ps1"
try {
  if ($Service -in @('core', 'agent')) {
    & $serviceScript -ManagedLogPrefix $LogPath > $LogPath
  } else {
    & $serviceScript *> $LogPath
  }
} catch {
  $_ | Out-String | Add-Content -LiteralPath $LogPath
  exit 1
}
