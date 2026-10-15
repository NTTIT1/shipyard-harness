# Shipyard Platform Orchestrator Script for Windows/PowerShell
param(
    [Parameter(Position=0)]
    [ValidateSet("start", "stop", "restart", "status", "build", "infra-up", "infra-down")]
    [string]$Action = "status"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PlatformDir = Join-Path (Split-Path -Parent $ScriptDir) "platform"
$RunDir = Join-Path $ScriptDir "..\run\platform"
$LogDir = Join-Path $ScriptDir "..\logs\platform"
$JavaExe = "C:\Users\NguyenTheTruong\.jdks\ms-21.0.12\bin\java.exe"

if (-not (Test-Path $JavaExe)) {
    $JavaCmd = Get-Command java -ErrorAction SilentlyContinue
    if ($JavaCmd) {
        $JavaExe = $JavaCmd.Source
    } else {
        Write-Error "java.exe not found at $JavaExe and not in PATH"
    }
}

if (-not (Test-Path $RunDir)) { New-Item -ItemType Directory -Force -Path $RunDir | Out-Null }
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }

$Services = @(
    @{ Name = "auth-service"; Port = 9081; Jar = "$PlatformDir\auth-service\target\auth-service-1.0.0-SNAPSHOT.jar" },
    @{ Name = "project-service"; Port = 9082; Jar = "$PlatformDir\project-service\target\project-service-1.0.0-SNAPSHOT.jar" },
    @{ Name = "lane-service"; Port = 9083; Jar = "$PlatformDir\lane-service\target\lane-service-1.0.0-SNAPSHOT.jar" },
    @{ Name = "api-gateway"; Port = 9080; Jar = "$PlatformDir\api-gateway\target\api-gateway-1.0.0-SNAPSHOT.jar" }
)

function Start-Infra {
    Write-Host "Starting core platform infrastructure (Postgres 5433, Redis 6379, RabbitMQ 5672)..." -ForegroundColor Cyan
    docker compose -f "$PlatformDir\docker-compose.yml" up -d
}

function Stop-Infra {
    Write-Host "Stopping platform infrastructure..." -ForegroundColor Yellow
    docker compose -f "$PlatformDir\docker-compose.yml" down
}

function Start-ServiceProcess($svc) {
    $name = $svc.Name
    $pidFile = "$RunDir\$name.pid"
    $logFile = "$LogDir\$name.log"
    $errFile = "$LogDir\$name.err.log"

    if (Test-Path $pidFile) {
        $existingPid = Get-Content $pidFile -ErrorAction SilentlyContinue
        if ($existingPid -and (Get-Process -Id $existingPid -ErrorAction SilentlyContinue)) {
            Write-Host "Service $name is already running (PID: $existingPid)" -ForegroundColor Yellow
            return
        }
    }

    if (-not (Test-Path $svc.Jar)) {
        Write-Host "Jar not found for $name. Building first..." -ForegroundColor Yellow
        mvn -f "$PlatformDir\pom.xml" package -DskipTests
    }

    Write-Host "Starting $name on port $($svc.Port)..." -ForegroundColor Green
    $proc = Start-Process -FilePath $JavaExe -ArgumentList "-jar", "`"$($svc.Jar)`"" -RedirectStandardOutput $logFile -RedirectStandardError $errFile -PassThru -WindowStyle Hidden
    Set-Content -Path $pidFile -Value $proc.Id
}

function Stop-ServiceProcess($svc) {
    $name = $svc.Name
    $pidFile = "$RunDir\$name.pid"

    if (Test-Path $pidFile) {
        $procId = Get-Content $pidFile -ErrorAction SilentlyContinue
        if ($procId) {
            $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
            if ($p) {
                Write-Host "Stopping $name (PID: $procId)..." -ForegroundColor Yellow
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            }
        }
        Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue
    }
}

function Get-ServiceStatus($svc) {
    $name = $svc.Name
    $pidFile = "$RunDir\$name.pid"
    $isRunning = $false
    $procId = $null

    if (Test-Path $pidFile) {
        $procId = Get-Content $pidFile -ErrorAction SilentlyContinue
        if ($procId -and (Get-Process -Id $procId -ErrorAction SilentlyContinue)) {
            $isRunning = $true
        }
    }

    $portStatus = "DOWN"
    try {
        $tcp = Test-NetConnection -ComputerName 127.0.0.1 -Port $svc.Port -WarningAction SilentlyContinue
        if ($tcp.TcpTestSucceeded) { $portStatus = "UP" }
    } catch {}

    [PSCustomObject]@{
        Service = $name
        Port    = $svc.Port
        Running = $isRunning
        PID     = if ($isRunning) { $procId } else { "-" }
        Health  = $portStatus
    }
}

switch ($Action) {
    "infra-up" { Start-Infra }
    "infra-down" { Stop-Infra }
    "build" {
        Write-Host "Building platform microservices..." -ForegroundColor Cyan
        mvn -f "$PlatformDir\pom.xml" clean package -DskipTests
    }
    "start" {
        Start-Infra
        Start-Sleep -Seconds 2
        foreach ($svc in $Services) {
            Start-ServiceProcess $svc
        }
        Write-Host "All services started. Waiting 5 seconds before checking health..." -ForegroundColor Cyan
        Start-Sleep -Seconds 5
        $Services | ForEach-Object { Get-ServiceStatus $_ } | Format-Table -AutoSize
    }
    "stop" {
        foreach ($svc in $Services) {
            Stop-ServiceProcess $svc
        }
        Write-Host "All platform services stopped." -ForegroundColor Green
    }
    "restart" {
        foreach ($svc in $Services) { Stop-ServiceProcess $svc }
        Start-Sleep -Seconds 2
        foreach ($svc in $Services) { Start-ServiceProcess $svc }
    }
    "status" {
        $Services | ForEach-Object { Get-ServiceStatus $_ } | Format-Table -AutoSize
    }
}
