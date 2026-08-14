[CmdletBinding()]
param(
    [string]$ArchivePath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'artifacts/dist/DeepSeekHarness-Portable-0.1.0-dev.zip'),
    [ValidateRange(1025, 65535)] [int]$Port = 31920,
    [switch]$KeepArtifacts
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Remove-TestDirectory {
    param([Parameter(Mandatory)] [string]$Path)

    if (Test-Path -LiteralPath $Path) {
        $fullPath = [IO.Path]::GetFullPath($Path)
        [IO.Directory]::Delete("\\?\$fullPath", $true)
    }
}

if (-not (Test-Path -LiteralPath $ArchivePath -PathType Leaf)) {
    throw "Portable ZIP is missing: $ArchivePath"
}

$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('dsh-portable-zip-e2e-' + [Guid]::NewGuid().ToString('N'))
$extractRoot = Join-Path $testRoot 'extracted'
$tar = Get-Command tar.exe -ErrorAction Stop

try {
    New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
    New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
    & $tar.Path -xf $ArchivePath -C $extractRoot
    if ($LASTEXITCODE -ne 0) {
        throw "tar.exe could not extract the portable ZIP (exit code $LASTEXITCODE)."
    }
    $runtimeRoot = $extractRoot

    foreach ($relativePath in @(
        'runtime/node/node.exe',
        'runtime/pwsh/pwsh.exe',
        'app/node_modules/@deepseek-ai/dsh/lib/bin.js',
        'launcher/start.vbs',
        'launcher/start.cmd',
        'runtime-manifest.json'
    )) {
        if (-not (Test-Path -LiteralPath (Join-Path $runtimeRoot $relativePath) -PathType Leaf)) {
            throw "Portable ZIP output is missing: $relativePath"
        }
    }

    & (Join-Path $PSScriptRoot 'launcher-integration.ps1') -RuntimeRoot $runtimeRoot -Port $Port
    if ($LASTEXITCODE -ne 0) {
        throw "Portable ZIP launcher integration test failed with exit code $LASTEXITCODE."
    }

    Write-Host 'Portable ZIP end-to-end test passed.'
} finally {
    if ($KeepArtifacts) {
        Write-Host "Portable ZIP end-to-end artifacts retained: $testRoot"
    } elseif (Test-Path -LiteralPath $testRoot) {
        Remove-TestDirectory -Path $testRoot
    }
}
