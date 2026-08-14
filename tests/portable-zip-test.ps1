[CmdletBinding()]
param(
    [switch]$KeepArtifacts,
    [string]$TestRoot
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$buildScript = Join-Path $repoRoot 'scripts/build-portable-zip.ps1'
$testRoot = if ([string]::IsNullOrWhiteSpace($TestRoot)) {
    Join-Path ([IO.Path]::GetTempPath()) ('dsh-portable-zip-test-' + [Guid]::NewGuid().ToString('N'))
} else {
    [IO.Path]::GetFullPath($TestRoot)
}
$runtimeRoot = Join-Path $testRoot 'runtime'
$archivePath = Join-Path $testRoot 'DeepSeekHarness-Portable.zip'
$extractRoot = Join-Path $testRoot 'extracted'
$tar = Get-Command tar.exe -ErrorAction Stop

try {
    foreach ($relativePath in @(
        'runtime/node',
        'runtime/pwsh',
        'app/node_modules/@deepseek-ai/dsh/lib',
        'app/node_modules/@dsh-community/dsh-client-ui-drive-picker',
        'launcher',
        '.smoke-dsh-home'
    )) {
        New-Item -ItemType Directory -Force -Path (Join-Path $runtimeRoot $relativePath) | Out-Null
    }
    Set-Content -LiteralPath (Join-Path $runtimeRoot 'runtime/node/node.exe') -Value 'fixture-node'
    Set-Content -LiteralPath (Join-Path $runtimeRoot 'runtime/pwsh/pwsh.exe') -Value 'fixture-pwsh'
    Set-Content -LiteralPath (Join-Path $runtimeRoot 'app/node_modules/@deepseek-ai/dsh/lib/bin.js') -Value 'fixture-dsh'
    Set-Content -LiteralPath (Join-Path $runtimeRoot 'app/node_modules/@dsh-community/dsh-client-ui-drive-picker/client.js') -Value 'fixture-drive-picker-client'
    Set-Content -LiteralPath (Join-Path $runtimeRoot 'app/node_modules/@dsh-community/dsh-client-ui-drive-picker/package.json') -Value '{"name":"fixture-drive-picker"}'
    Set-Content -LiteralPath (Join-Path $runtimeRoot 'launcher/start.vbs') -Value 'fixture-vbs'
    Set-Content -LiteralPath (Join-Path $runtimeRoot 'launcher/start.cmd') -Value 'fixture-cmd'
    Set-Content -LiteralPath (Join-Path $runtimeRoot 'launcher/browse-directory-picker.patch.yml') -Value 'fixture-directory-picker-patch'
    Set-Content -LiteralPath (Join-Path $runtimeRoot 'runtime-manifest.json') -Value '{"launcher":{"version":"test"}}'
    Set-Content -LiteralPath (Join-Path $runtimeRoot 'LICENSE') -Value 'fixture-license'
    Set-Content -LiteralPath (Join-Path $runtimeRoot 'README.md') -Value 'fixture-readme'
    Set-Content -LiteralPath (Join-Path $runtimeRoot 'THIRD_PARTY_NOTICES.md') -Value 'fixture-third-party-notices'
    Set-Content -LiteralPath (Join-Path $runtimeRoot '.smoke-dsh-home/transient.txt') -Value 'must not ship'

    & $buildScript -SkipRuntimeBuild -RuntimeRoot $runtimeRoot -OutputPath $archivePath -MinimumArchiveSizeBytes 1KB
    if ($LASTEXITCODE -ne 0) {
        throw "Portable ZIP build failed with exit code $LASTEXITCODE."
    }
    if (-not (Test-Path -LiteralPath "$archivePath.sha256" -PathType Leaf)) {
        throw 'Portable ZIP hash file was not created.'
    }
    $hash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $expectedHashLine = "$hash  $([IO.Path]::GetFileName($archivePath))"
    if ((Get-Content -LiteralPath "$archivePath.sha256" -Raw).Trim() -ne $expectedHashLine) {
        throw 'Portable ZIP hash file does not match the archive.'
    }

    New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
    & $tar.Path -xf $archivePath -C $extractRoot
    if ($LASTEXITCODE -ne 0) {
        throw "tar.exe could not extract the portable ZIP (exit code $LASTEXITCODE)."
    }
    $payloadRoot = $extractRoot
    foreach ($relativePath in @(
        'runtime/node/node.exe',
        'runtime/pwsh/pwsh.exe',
        'app/node_modules/@deepseek-ai/dsh/lib/bin.js',
        'app/node_modules/@dsh-community/dsh-client-ui-drive-picker/client.js',
        'app/node_modules/@dsh-community/dsh-client-ui-drive-picker/package.json',
        'launcher/start.vbs',
        'launcher/start.cmd',
        'launcher/browse-directory-picker.patch.yml',
        'runtime-manifest.json',
        'LICENSE',
        'README.md',
        'THIRD_PARTY_NOTICES.md'
    )) {
        if (-not (Test-Path -LiteralPath (Join-Path $payloadRoot $relativePath) -PathType Leaf)) {
            throw "Portable ZIP extraction is missing: $relativePath"
        }
    }
    if (Test-Path -LiteralPath (Join-Path $payloadRoot '.smoke-dsh-home')) {
        throw 'Portable ZIP included transient smoke-test data.'
    }
    if (Test-Path -LiteralPath (Join-Path $extractRoot 'DeepSeekHarness')) {
        throw 'Portable ZIP unexpectedly contains a nested package root.'
    }

    Write-Host 'Portable ZIP build test passed.'
} finally {
    if ($KeepArtifacts) {
        Write-Host "Portable ZIP build test artifacts retained: $testRoot"
    } elseif (Test-Path -LiteralPath $testRoot) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
}
