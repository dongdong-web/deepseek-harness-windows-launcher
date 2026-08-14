[CmdletBinding()]
param(
    [string]$RuntimeRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) 'artifacts/portable/DeepSeekHarness')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$nodeExe = Join-Path $RuntimeRoot 'runtime/node/node.exe'
$dshEntry = Join-Path $RuntimeRoot 'app/node_modules/@deepseek-ai/dsh/lib/bin.js'
$pwshExe = Join-Path $RuntimeRoot 'runtime/pwsh/pwsh.exe'

foreach ($requiredPath in @(
    $nodeExe,
    $dshEntry,
    $pwshExe,
    (Join-Path $RuntimeRoot 'LICENSE'),
    (Join-Path $RuntimeRoot 'README.md'),
    (Join-Path $RuntimeRoot 'THIRD_PARTY_NOTICES.md')
)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Required runtime file is missing: $requiredPath"
    }
}

& $nodeExe --version
if ($LASTEXITCODE -ne 0) { throw 'Private Node version check failed.' }

& $pwshExe -NoLogo -NoProfile -NonInteractive -Command '$PSVersionTable.PSVersion.ToString()'
if ($LASTEXITCODE -ne 0) { throw 'Private PowerShell version check failed.' }

& $nodeExe $dshEntry --help
if ($LASTEXITCODE -ne 0) { throw 'DSH help check failed.' }

Write-Host 'Portable runtime verification passed.'
