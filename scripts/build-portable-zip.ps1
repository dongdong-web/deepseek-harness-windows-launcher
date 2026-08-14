[CmdletBinding()]
param(
    [switch]$SkipRuntimeBuild,
    [string]$OutputPath,
    [string]$RuntimeRoot,
    [ValidateRange(1024, [int64]::MaxValue)] [int64]$MinimumArchiveSizeBytes = 1MB
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-PortableInput {
    param([Parameter(Mandatory)] [string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Required portable-package input is missing: $Path"
    }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'config/runtime-manifest.json') | ConvertFrom-Json
$runtimeRoot = if ([string]::IsNullOrWhiteSpace($RuntimeRoot)) { Join-Path $repoRoot 'artifacts/portable/DeepSeekHarness' } else { [IO.Path]::GetFullPath($RuntimeRoot) }
$distRoot = Join-Path $repoRoot 'artifacts/dist'
$version = $manifest.launcher.version
$archiveName = "DeepSeekHarness-Portable-$version.zip"
$targetPath = if ([string]::IsNullOrWhiteSpace($OutputPath)) { Join-Path $distRoot $archiveName } else { [IO.Path]::GetFullPath($OutputPath) }

if ([IO.Path]::GetExtension($targetPath) -ne '.zip') {
    throw "Portable package output must use a .zip extension: $targetPath"
}

if (-not $SkipRuntimeBuild) {
    & (Join-Path $PSScriptRoot 'build-runtime.ps1')
    if ($LASTEXITCODE -ne 0) {
        throw "Portable runtime build failed with exit code $LASTEXITCODE."
    }
}

foreach ($requiredPath in @(
    (Join-Path $runtimeRoot 'runtime/node/node.exe'),
    (Join-Path $runtimeRoot 'runtime/pwsh/pwsh.exe'),
    (Join-Path $runtimeRoot 'app/node_modules/@deepseek-ai/dsh/lib/bin.js'),
    (Join-Path $runtimeRoot 'launcher/start.vbs'),
    (Join-Path $runtimeRoot 'launcher/start.cmd'),
    (Join-Path $runtimeRoot 'launcher/browse-directory-picker.patch.yml'),
    (Join-Path $runtimeRoot 'runtime-manifest.json'),
    (Join-Path $runtimeRoot 'LICENSE'),
    (Join-Path $runtimeRoot 'README.md'),
    (Join-Path $runtimeRoot 'THIRD_PARTY_NOTICES.md')
)) {
    Assert-PortableInput -Path $requiredPath
}

$tar = Get-Command tar.exe -ErrorAction Stop
New-Item -ItemType Directory -Force -Path $distRoot, (Split-Path -Parent $targetPath) | Out-Null

# Archive only explicit runtime inputs. Direct archiving avoids an intermediate
# copy of deep npm dependency paths, which can exceed the Windows path limit.
if (Test-Path -LiteralPath $targetPath) {
    Remove-Item -LiteralPath $targetPath -Force
}
& $tar.Path -a -c -f $targetPath -C $runtimeRoot runtime app launcher runtime-manifest.json LICENSE README.md THIRD_PARTY_NOTICES.md
if ($LASTEXITCODE -ne 0) {
    throw "tar.exe failed to create portable ZIP (exit code $LASTEXITCODE)."
}
if (-not (Test-Path -LiteralPath $targetPath -PathType Leaf) -or (Get-Item -LiteralPath $targetPath).Length -lt $MinimumArchiveSizeBytes) {
    throw "tar.exe did not create a valid portable ZIP: $targetPath"
}

$entries = & $tar.Path -tf $targetPath
if ($LASTEXITCODE -ne 0) {
    throw "tar.exe could not read the created portable ZIP (exit code $LASTEXITCODE)."
}
foreach ($expectedEntry in @(
    'runtime/node/node.exe',
    'runtime/pwsh/pwsh.exe',
    'app/node_modules/@deepseek-ai/dsh/lib/bin.js',
    'launcher/start.vbs',
    'launcher/start.cmd',
    'launcher/browse-directory-picker.patch.yml',
    'runtime-manifest.json',
    'LICENSE',
    'README.md',
    'THIRD_PARTY_NOTICES.md'
)) {
    if ($entries -notcontains $expectedEntry) {
        throw "Portable ZIP is missing required entry: $expectedEntry"
    }
}
if ($entries | Where-Object { $_ -match '(^|/)\.smoke-dsh-home(/|$)' }) {
    throw 'Portable ZIP contains transient smoke-test data.'
}

$hash = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath "$targetPath.sha256" -Value "$hash  $([IO.Path]::GetFileName($targetPath))" -Encoding ascii
Write-Host "Portable ZIP built: $targetPath"
Write-Host "SHA-256: $hash"
