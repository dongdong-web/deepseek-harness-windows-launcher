[CmdletBinding()]
param(
    [string]$RuntimeRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) 'artifacts/portable/DeepSeekHarness'),
    [ValidateRange(1025, 65535)] [int]$Port = 31900,
    [switch]$KeepArtifacts
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$nodeExe = Join-Path $RuntimeRoot 'runtime/node/node.exe'
$launcher = Join-Path $RuntimeRoot 'launcher/launcher.mjs'
foreach ($requiredPath in @($nodeExe, $launcher)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Required launcher path is missing: $requiredPath"
    }
}

$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("dsh-launcher-integration-" + [Guid]::NewGuid())
$previousDataRoot = $env:DSH_LAUNCHER_DATA_ROOT
$startProcess = $null
$portReservation = $null
$startOutput = Join-Path $testRoot 'launcher-stdout.log'
$startError = Join-Path $testRoot 'launcher-stderr.log'
try {
    $env:DSH_LAUNCHER_DATA_ROOT = $testRoot
    New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
    $portReservation = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    $portReservation.Start()
    $expectedPort = $Port + 1
    $startProcess = Start-Process -FilePath $nodeExe -ArgumentList @($launcher, 'start', '--port', $Port, '--no-browser') -RedirectStandardOutput $startOutput -RedirectStandardError $startError -PassThru -WindowStyle Hidden
    $deadline = (Get-Date).AddSeconds(60)
    $statusOutput = ''
    $statusSucceeded = $false
    while ((Get-Date) -lt $deadline) {
        $statusOutput = & $nodeExe $launcher status 2>&1
        if ($LASTEXITCODE -eq 0 -and $statusOutput -match "127.0.0.1:$expectedPort") {
            $statusSucceeded = $true
            break
        }
        Start-Sleep -Milliseconds 250
    }
    if (-not $statusSucceeded) {
        $launcherOutput = (Get-Content -LiteralPath $startOutput -Raw -ErrorAction SilentlyContinue) + (Get-Content -LiteralPath $startError -Raw -ErrorAction SilentlyContinue)
        $exitDescription = if ($startProcess.HasExited) { " Launcher exit code: $($startProcess.ExitCode)." } else { '' }
        throw "Launcher did not report a running instance.$exitDescription Last status: $statusOutput Launcher output: $launcherOutput"
    }

    $instancePath = Join-Path $testRoot 'DeepSeekHarness/launcher/instance.json'
    $instance = Get-Content -LiteralPath $instancePath -Raw | ConvertFrom-Json
    $expectedWorkspace = Join-Path $testRoot 'DeepSeekHarness/workspace'
    if ($instance.workspace -ne $expectedWorkspace -or -not (Test-Path -LiteralPath $expectedWorkspace -PathType Container)) {
        throw "Launcher did not create its private default workspace. Expected: $expectedWorkspace Actual: $($instance.workspace)"
    }

    $webDeadline = (Get-Date).AddSeconds(30)
    $webResponse = $null
    $webError = $null
    while ((Get-Date) -lt $webDeadline) {
        try {
            $webResponse = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$expectedPort" -TimeoutSec 5
            if ($webResponse.StatusCode -eq 200) {
                break
            }
            $webError = "Harness Web UI returned HTTP $($webResponse.StatusCode), expected HTTP 200."
        } catch {
            $webError = $_.Exception.Message
        }
        Start-Sleep -Milliseconds 500
    }
    if ($null -eq $webResponse -or $webResponse.StatusCode -ne 200) {
        $launcherOutput = (Get-Content -LiteralPath $startOutput -Raw -ErrorAction SilentlyContinue) + (Get-Content -LiteralPath $startError -Raw -ErrorAction SilentlyContinue)
        throw "Harness Web UI did not become ready at http://127.0.0.1:$expectedPort. Last error: $webError Launcher output: $launcherOutput"
    }

    $duplicateStart = & $nodeExe $launcher start --port $Port --no-browser 2>&1
    if ($LASTEXITCODE -ne 0 -or $duplicateStart -notmatch 'already running') {
        throw "Duplicate start did not reuse the existing instance: $duplicateStart"
    }

    & $nodeExe $launcher stop
    if ($LASTEXITCODE -ne 0) {
        throw 'Launcher stop command failed.'
    }
    $startProcess.WaitForExit(15000) | Out-Null
    if (-not $startProcess.HasExited) {
        throw 'Original launcher process did not exit after stop.'
    }

    Write-Host 'Launcher integration test passed.'
} finally {
    if ($null -ne $startProcess -and -not $startProcess.HasExited) {
        Stop-Process -Id $startProcess.Id -Force
    }
    if ($null -ne $portReservation) {
        $portReservation.Stop()
    }
    if ($null -eq $previousDataRoot) { Remove-Item Env:DSH_LAUNCHER_DATA_ROOT -ErrorAction SilentlyContinue } else { $env:DSH_LAUNCHER_DATA_ROOT = $previousDataRoot }
    if (-not $KeepArtifacts -and (Test-Path -LiteralPath $testRoot)) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
    if ($KeepArtifacts) {
        Write-Host "Integration artifacts retained: $testRoot"
    }
}
