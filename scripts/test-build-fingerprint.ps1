$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'build-fingerprint.ps1'
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('aster-fingerprint-' + [guid]::NewGuid().ToString('N'))
$fixtureFiles = @('package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.dockerignore',
  'apps/web/Dockerfile', 'apps/web/src/page.ts', 'packages/zod-v3-compat/index.cjs', 'patches/zod.patch',
  'docs/audit/test.json', 'scripts/web-runtime.mjs', 'scripts/build-fingerprint.ps1',
  'services/agent-runtime/Dockerfile', 'services/agent-runtime/requirements.txt', 'services/agent-runtime/app/main.py')
try {
  foreach ($relative in $fixtureFiles) {
    $path = Join-Path $temporary $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $path) -Force | Out-Null
    [IO.File]::WriteAllText($path, 'original')
  }
  $baseline = & $script -Root $temporary -Service web
  foreach ($relative in $fixtureFiles | Where-Object { $_ -notlike 'services/*' }) {
    $path = Join-Path $temporary $relative
    [IO.File]::WriteAllText($path, 'changed')
    if ((& $script -Root $temporary -Service web) -eq $baseline) { throw "Missed build input: $relative" }
    [IO.File]::WriteAllText($path, 'original')
  }
  $ignored = Join-Path $temporary 'apps/web/node_modules/unused.js'
  New-Item -ItemType Directory -Path (Split-Path -Parent $ignored) -Force | Out-Null
  [IO.File]::WriteAllText($ignored, 'cache')
  if ((& $script -Root $temporary -Service web) -ne $baseline) { throw 'Cache affected hash' }
  $agent = & $script -Root $temporary -Service agent-runtime
  [IO.File]::WriteAllText((Join-Path $temporary 'services/agent-runtime/requirements.txt'), 'changed')
  if ((& $script -Root $temporary -Service agent-runtime) -eq $agent) { throw 'Agent requirements omitted' }
  Write-Host 'PASS: all Web build roots and Agent requirements affect hash; excluded cache does not.'
} finally {
  # Only explicitly created fixture files are removed, never a recursive delete.
  foreach ($path in $fixtureFiles + @('apps/web/node_modules/unused.js')) {
    $resolved = Join-Path $temporary $path
    if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Force }
  }
  foreach ($directory in Get-ChildItem -LiteralPath $temporary -Directory -Recurse | Sort-Object { $_.FullName.Length } -Descending) {
    [IO.Directory]::Delete($directory.FullName)
  }
  [IO.Directory]::Delete($temporary)
}
