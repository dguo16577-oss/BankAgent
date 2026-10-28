param(
  [Parameter(Mandatory = $true)][ValidateSet('web', 'agent-runtime')][string]$Service,
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)
$ErrorActionPreference = 'Stop'
$base = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
$files = New-Object 'System.Collections.Generic.List[string]'
$inputs = if ($Service -eq 'web') {
  @('package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.dockerignore',
    'apps/web', 'packages/zod-v3-compat', 'patches', 'docs/audit',
    'scripts/web-runtime.mjs', 'scripts/build-fingerprint.ps1')
} else {
  @('.dockerignore', 'services/agent-runtime/Dockerfile',
    'services/agent-runtime/requirements.txt', 'services/agent-runtime/app',
    'scripts/build-fingerprint.ps1')
}
function Add-BuildInput([string]$Path) {
  $item = Get-Item -LiteralPath $Path -Force
  if ($item.PSIsContainer) {
    if ($item.Name -in @('node_modules', '.next', 'target', 'coverage', 'test-results', 'playwright-report', '.git', '__pycache__')) { return }
  } elseif ($item.Name -like '.env*' -or $item.Name -match '\.(log|tsbuildinfo|zip|pyc)$') { return }
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
    throw "Build fingerprint refuses linked input: $Path"
  }
  if ($item.PSIsContainer) {
    foreach ($child in Get-ChildItem -LiteralPath $Path -Force) { Add-BuildInput $child.FullName }
  } else {
    [void]$files.Add($item.FullName)
  }
}
foreach ($relative in $inputs) { Add-BuildInput (Join-Path $base $relative) }
$entries = [string[]]@($files | Select-Object -Unique | ForEach-Object {
  $_.Substring($base.Length).TrimStart('\', '/').Replace('\', '/') + ':' + (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()
})
[Array]::Sort($entries, [StringComparer]::Ordinal)
$sha = [Security.Cryptography.SHA256]::Create()
try {
  $bytes = [Text.Encoding]::UTF8.GetBytes("aster-build-input-v2/$Service`n" + ($entries -join "`n"))
  ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
} finally { $sha.Dispose() }
