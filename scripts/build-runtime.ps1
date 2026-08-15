[CmdletBinding()]
param(
    [switch]$Clean,
    [switch]$SkipPowerShell,
    [string]$NpmRegistry
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $repoRoot 'config/runtime-manifest.json'
$manifest = Get-Content -Raw $manifestPath | ConvertFrom-Json
$artifactRoot = Join-Path $repoRoot 'artifacts'
$cacheRoot = Join-Path $artifactRoot 'cache'
$portableRoot = Join-Path $artifactRoot 'portable/DeepSeekHarness'
$effectiveNpmRegistry = if ([string]::IsNullOrWhiteSpace($NpmRegistry)) { $manifest.npm.registry } else { $NpmRegistry }

function Assert-Sha256 {
    param(
        [Parameter(Mandatory)] [string]$Path,
        [Parameter(Mandatory)] [string]$ExpectedHash
    )

    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
    if ($actualHash -ne $ExpectedHash.ToLowerInvariant()) {
        throw "SHA-256 mismatch for '$Path'. Expected $ExpectedHash, got $actualHash."
    }
}

function Get-VerifiedArchive {
    param(
        [Parameter(Mandatory)] [string]$Url,
        [Parameter(Mandatory)] [string]$Sha256,
        [Parameter(Mandatory)] [string]$CacheFileName
    )

    $destination = Join-Path $cacheRoot $CacheFileName
    if (Test-Path -LiteralPath $destination) {
        try {
            Assert-Sha256 -Path $destination -ExpectedHash $Sha256
            return $destination
        } catch {
            Remove-Item -LiteralPath $destination -Force
        }
    }

    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $destination
    Assert-Sha256 -Path $destination -ExpectedHash $Sha256
    return $destination
}

function Expand-ArchiveContents {
    param(
        [Parameter(Mandatory)] [string]$Archive,
        [Parameter(Mandatory)] [string]$Destination,
        [string]$ArchiveRoot
    )

    $temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("dsh-runtime-" + [Guid]::NewGuid())
    try {
        Expand-Archive -LiteralPath $Archive -DestinationPath $temporaryRoot -Force
        $source = if ([string]::IsNullOrWhiteSpace($ArchiveRoot)) {
            $temporaryRoot
        } else {
            Join-Path $temporaryRoot $ArchiveRoot
        }

        if (-not (Test-Path -LiteralPath $source)) {
            throw "Expected archive content '$ArchiveRoot' was not found in '$Archive'."
        }

        New-Item -ItemType Directory -Force -Path $Destination | Out-Null
        Copy-Item -Path (Join-Path $source '*') -Destination $Destination -Recurse -Force
    } finally {
        if (Test-Path -LiteralPath $temporaryRoot) {
            Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
        }
    }
}

if ($Clean -and (Test-Path -LiteralPath $portableRoot)) {
    Remove-Item -LiteralPath $portableRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $cacheRoot, $portableRoot | Out-Null

$nodeArchiveName = [System.IO.Path]::GetFileName([Uri]$manifest.node.url)
$nodeArchive = Get-VerifiedArchive -Url $manifest.node.url -Sha256 $manifest.node.sha256 -CacheFileName $nodeArchiveName
$nodeDestination = Join-Path $portableRoot 'runtime/node'
if (-not (Test-Path -LiteralPath (Join-Path $nodeDestination 'node.exe'))) {
    Expand-ArchiveContents -Archive $nodeArchive -Destination $nodeDestination -ArchiveRoot $manifest.node.archiveRoot
}

$nodeExe = Join-Path $nodeDestination 'node.exe'
if (-not (Test-Path -LiteralPath $nodeExe)) {
    throw "Private Node runtime was not created at '$nodeExe'."
}

if (-not $SkipPowerShell) {
    $pwshArchiveName = [System.IO.Path]::GetFileName([Uri]$manifest.powershell.url)
    $pwshArchive = Get-VerifiedArchive -Url $manifest.powershell.url -Sha256 $manifest.powershell.sha256 -CacheFileName $pwshArchiveName
    $pwshDestination = Join-Path $portableRoot 'runtime/pwsh'
    if (-not (Test-Path -LiteralPath (Join-Path $pwshDestination 'pwsh.exe'))) {
        Expand-ArchiveContents -Archive $pwshArchive -Destination $pwshDestination -ArchiveRoot $manifest.powershell.archiveRoot
    }

    if (-not (Test-Path -LiteralPath (Join-Path $pwshDestination 'pwsh.exe'))) {
        throw "Private PowerShell runtime was not created at '$pwshDestination'."
    }
}

$portableApp = Join-Path $portableRoot 'app'
New-Item -ItemType Directory -Force -Path $portableApp | Out-Null
Copy-Item -LiteralPath (Join-Path $repoRoot 'app/package.json') -Destination (Join-Path $portableApp 'package.json') -Force

$portableLauncher = Join-Path $portableRoot 'launcher'
New-Item -ItemType Directory -Force -Path $portableLauncher | Out-Null
Copy-Item -Path (Join-Path $repoRoot 'launcher/*') -Destination $portableLauncher -Force

foreach ($releaseDocument in @('LICENSE', 'README.md', 'THIRD_PARTY_NOTICES.md')) {
    $sourceDocument = Join-Path $repoRoot $releaseDocument
    if (-not (Test-Path -LiteralPath $sourceDocument -PathType Leaf)) {
        throw "Release document is missing: $sourceDocument"
    }
    Copy-Item -LiteralPath $sourceDocument -Destination (Join-Path $portableRoot $releaseDocument) -Force
}

$lockFile = Join-Path $repoRoot 'app/package-lock.json'
if (Test-Path -LiteralPath $lockFile) {
    Copy-Item -LiteralPath $lockFile -Destination (Join-Path $portableApp 'package-lock.json') -Force
}

$npmCli = Join-Path $nodeDestination 'node_modules/npm/bin/npm-cli.js'
if (-not (Test-Path -LiteralPath $npmCli)) {
    throw "Private npm CLI was not found at '$npmCli'."
}

$npmCache = Join-Path $cacheRoot 'npm'
$npmCommand = if (Test-Path -LiteralPath (Join-Path $portableApp 'package-lock.json')) { 'ci' } else { 'install' }
$npmArgs = @(
    $npmCli,
    '--prefix', $portableApp,
    $npmCommand,
    '--omit=dev',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    "--registry=$effectiveNpmRegistry",
    "--cache=$npmCache"
)
& $nodeExe @npmArgs
if ($LASTEXITCODE -ne 0) {
    throw "npm install failed with exit code $LASTEXITCODE."
}

$drivePickerSource = Join-Path $repoRoot 'app/community-plugins/dsh-client-ui-drive-picker'
$drivePickerDestination = Join-Path $portableApp 'node_modules/@dsh-community/dsh-client-ui-drive-picker'
if (-not (Test-Path -LiteralPath $drivePickerSource -PathType Container)) {
    throw "Community drive-picker source is missing: $drivePickerSource"
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $drivePickerDestination) | Out-Null
Copy-Item -LiteralPath $drivePickerSource -Destination $drivePickerDestination -Recurse -Force

$fileExplorerSource = Join-Path $repoRoot 'app/community-plugins/dsh-file-explorer'
$fileExplorerDestination = Join-Path $portableApp 'node_modules/dsh-file-explorer'
if (-not (Test-Path -LiteralPath $fileExplorerSource -PathType Container)) {
    throw "Community file-explorer source is missing: $fileExplorerSource"
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $fileExplorerDestination) | Out-Null
Copy-Item -LiteralPath $fileExplorerSource -Destination $fileExplorerDestination -Recurse -Force

$chatOutlineSource = Join-Path $repoRoot 'app/community-plugins/dsh-chat-outline'
$chatOutlineDestination = Join-Path $portableApp 'node_modules/dsh-chat-outline'
if (-not (Test-Path -LiteralPath $chatOutlineSource -PathType Container)) {
    throw "Community chat-outline source is missing: $chatOutlineSource"
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $chatOutlineDestination) | Out-Null
Copy-Item -LiteralPath $chatOutlineSource -Destination $chatOutlineDestination -Recurse -Force

$costMeterSource = Join-Path $repoRoot 'app/community-plugins/dsh-cost-meter'
$costMeterDestination = Join-Path $portableApp 'node_modules/@steven-wu/dsh-cost-meter'
if (-not (Test-Path -LiteralPath $costMeterSource -PathType Container)) {
    throw "Community cost-meter source is missing: $costMeterSource"
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $costMeterDestination) | Out-Null
Copy-Item -LiteralPath $costMeterSource -Destination $costMeterDestination -Recurse -Force

$balanceTideSource = Join-Path $repoRoot 'app/community-plugins/dsh-balance-tide'
$balanceTideDestination = Join-Path $portableApp 'node_modules/dsh-balance-tide'
if (-not (Test-Path -LiteralPath $balanceTideSource -PathType Container)) {
    throw "Community balance-tide source is missing: $balanceTideSource"
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $balanceTideDestination) | Out-Null
Copy-Item -LiteralPath $balanceTideSource -Destination $balanceTideDestination -Recurse -Force

$sessionDeleteSource = Join-Path $repoRoot 'app/community-plugins/dsh-plugin-session-delete'
$sessionDeleteDestination = Join-Path $portableApp 'node_modules/@huanlin/dsh-plugin-session-delete'
if (-not (Test-Path -LiteralPath $sessionDeleteSource -PathType Container)) {
    throw "Community session-delete source is missing: $sessionDeleteSource"
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $sessionDeleteDestination) | Out-Null
Copy-Item -LiteralPath $sessionDeleteSource -Destination $sessionDeleteDestination -Recurse -Force

$dingSource = Join-Path $repoRoot 'app/community-plugins/dsh-ding'
$dingDestination = Join-Path $portableApp 'node_modules/dsh-ding'
if (-not (Test-Path -LiteralPath $dingSource -PathType Container)) {
    throw "Community dsh-ding source is missing: $dingSource"
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dingDestination) | Out-Null
Copy-Item -LiteralPath $dingSource -Destination $dingDestination -Recurse -Force

$lanPassSource = Join-Path $repoRoot 'app/community-plugins/dsh-lan-pass'
$lanPassDestination = Join-Path $portableApp 'node_modules/dsh-lan-pass'
if (-not (Test-Path -LiteralPath $lanPassSource -PathType Container)) {
    throw "Community dsh-lan-pass source is missing: $lanPassSource"
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $lanPassDestination) | Out-Null
Copy-Item -LiteralPath $lanPassSource -Destination $lanPassDestination -Recurse -Force

$entryPoint = Join-Path $portableApp $manifest.dsh.entryPoint
if (-not (Test-Path -LiteralPath $entryPoint)) {
    throw "DSH entry point was not found at '$entryPoint'."
}

$installedPackageJson = Join-Path $portableApp 'node_modules/@deepseek-ai/dsh/package.json'
$installedVersion = & $nodeExe -e "process.stdout.write(require(process.argv[1]).version)" $installedPackageJson 2>$null
if ($LASTEXITCODE -ne 0 -or $installedVersion.Trim() -ne $manifest.dsh.version) {
    throw "Installed DSH version '$installedVersion' does not match pinned version '$($manifest.dsh.version)'."
}

$runtimeManifest = [ordered]@{
    launcher = $manifest.launcher
    platform = $manifest.platform
    node = [ordered]@{ version = $manifest.node.version }
    powershell = [ordered]@{ version = $manifest.powershell.version; included = (-not $SkipPowerShell) }
    dsh = [ordered]@{ package = $manifest.dsh.package; version = $manifest.dsh.version; entryPoint = $manifest.dsh.entryPoint }
    npm = [ordered]@{ registry = $effectiveNpmRegistry }
    builtAtUtc = (Get-Date).ToUniversalTime().ToString('o')
}
$runtimeManifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $portableRoot 'runtime-manifest.json') -Encoding utf8

Write-Host "Portable runtime built: $portableRoot"
Write-Host "Node: $(& $nodeExe --version)"
Write-Host "DSH:  $installedVersion"
