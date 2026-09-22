<#
.SYNOPSIS
  Stop what start-vesyn.ps1 started: the public Funnel, the API, ReactionT5 and (unless -KeepDatabase) the database.
  Ollama is your own app and is left running. Data is never deleted: the database keeps its Docker volume.
#>
param([switch]$KeepDatabase)

$ts = (Get-Command tailscale -ErrorAction SilentlyContinue).Source
if (-not $ts -and (Test-Path "$env:ProgramFiles\Tailscale\tailscale.exe")) { $ts = "$env:ProgramFiles\Tailscale\tailscale.exe" }
if ($ts) { & $ts funnel --https=443 off; Write-Host "public address: off" }

foreach ($port in 8436, 8435) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }
  Write-Host ("port {0}: {1}" -f $port, $(if ($conns) { "stopped" } else { "was not running" }))
}

if (-not $KeepDatabase) {
  Push-Location $PSScriptRoot
  cmd /c "docker compose stop db >nul 2>&1"
  Pop-Location
  Write-Host "database: stopped (data kept)"
}
