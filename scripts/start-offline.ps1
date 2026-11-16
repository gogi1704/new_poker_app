# Brings the offline tournament stack (docker-compose.local.yml) back up —
# meant to be run after a reboot caused by a power outage, either by hand
# (double-click "Run with PowerShell") or via a Task Scheduler login task.
# Safe to run any time: idempotent, does nothing destructive if everything is
# already up. See docs/OFFLINE.md for the one-time Task Scheduler setup.

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "Ждём, пока запустится Docker Desktop..."
$maxWaitSeconds = 180
$waited = 0
while ($true) {
    $null = docker info 2>$null
    if ($LASTEXITCODE -eq 0) { break }
    if ($waited -ge $maxWaitSeconds) {
        Write-Host "Docker не ответил за $maxWaitSeconds сек. Откройте Docker Desktop вручную и запустите этот скрипт снова."
        exit 1
    }
    Start-Sleep -Seconds 3
    $waited += 3
}

Write-Host "Docker готов. Поднимаем офлайн-стек..."
Push-Location $repoRoot
try {
    docker compose -f docker-compose.local.yml up -d
    if ($LASTEXITCODE -ne 0) { throw "docker compose up завершился с ошибкой" }
    Write-Host "Готово. Панель доступна на http://localhost:8080 (и по LAN-адресу этого ноутбука)."
} finally {
    Pop-Location
}
