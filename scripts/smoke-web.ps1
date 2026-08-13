[CmdletBinding()]
param(
    [string]$RuntimeRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) 'artifacts/portable/DeepSeekHarness'),
    [ValidateRange(1025, 65535)] [int]$Port = 31880,
    [ValidateRange(5, 120)] [int]$TimeoutSeconds = 45
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$nodeExe = Join-Path $RuntimeRoot 'runtime/node/node.exe'
$pwshDirectory = Join-Path $RuntimeRoot 'runtime/pwsh'
$dshEntry = Join-Path $RuntimeRoot 'app/node_modules/@deepseek-ai/dsh/lib/bin.js'
$smokeHome = Join-Path $RuntimeRoot '.smoke-dsh-home'

foreach ($requiredPath in @($nodeExe, $pwshDirectory, $dshEntry)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Required runtime path is missing: $requiredPath"
    }
}

function Test-LocalPortOpen {
    param([int]$TargetPort)

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connect = $client.BeginConnect('127.0.0.1', $TargetPort, $null, $null)
        if (-not $connect.AsyncWaitHandle.WaitOne(500)) {
            return $false
        }
        $client.EndConnect($connect)
        return $true
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

if (Test-LocalPortOpen -TargetPort $Port) {
    throw "Smoke-test port $Port is already in use. Choose another port."
}

New-Item -ItemType Directory -Force -Path $smokeHome | Out-Null
$savedPath = $env:PATH
$savedDshHome = $env:DSH_HOME
$savedNodeOptions = $env:NODE_OPTIONS
$savedNodePath = $env:NODE_PATH
$process = $null

try {
    $env:PATH = "$pwshDirectory;$([System.IO.Path]::GetDirectoryName($nodeExe));$savedPath"
    $env:DSH_HOME = $smokeHome
    Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
    Remove-Item Env:NODE_PATH -ErrorAction SilentlyContinue

    $process = Start-Process -FilePath $nodeExe -ArgumentList @($dshEntry, 'web', '--port', $Port) -PassThru -WindowStyle Hidden
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if ($process.HasExited) {
            throw "DSH exited before opening the Web UI. Exit code: $($process.ExitCode)."
        }
        if (Test-LocalPortOpen -TargetPort $Port) {
            Write-Host "DSH Web UI smoke test passed at http://127.0.0.1:$Port"
            exit 0
        }
        Start-Sleep -Milliseconds 250
    }

    throw "DSH did not open http://127.0.0.1:$Port within $TimeoutSeconds seconds."
} finally {
    if ($null -ne $process -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -Force
    }
    $env:PATH = $savedPath
    if ($null -eq $savedDshHome) { Remove-Item Env:DSH_HOME -ErrorAction SilentlyContinue } else { $env:DSH_HOME = $savedDshHome }
    if ($null -eq $savedNodeOptions) { Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue } else { $env:NODE_OPTIONS = $savedNodeOptions }
    if ($null -eq $savedNodePath) { Remove-Item Env:NODE_PATH -ErrorAction SilentlyContinue } else { $env:NODE_PATH = $savedNodePath }
}
