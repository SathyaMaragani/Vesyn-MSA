<#
.SYNOPSIS
  Start Vesyn's backend on this machine and publish the API through Tailscale Funnel.

.DESCRIPTION
  Database (Docker, vesyn_db) -> Ollama (LLM) -> ReactionT5 (:8435) -> API (:8436) -> Tailscale Funnel.
  Anything already running is left alone, so it is safe to run again (e.g. after a reboot).
  Logs: .\logs\*.log. Stop everything with .\stop-vesyn.ps1.

.PARAMETER Origins
  Browser origins allowed to call the API, comma-separated. Add your Vercel domain if it does not match -OriginRegex.

.PARAMETER OriginRegex
  Regex for more allowed origins. The default covers a Vercel project named vesyn* and its preview URLs.

.PARAMETER NoFunnel
  Local only: do not publish the API through Tailscale.

.EXAMPLE
  .\start-vesyn.ps1
  .\start-vesyn.ps1 -Origins "http://localhost:3100,https://my-vesyn.vercel.app"
#>
param(
  [string]$Origins = "http://localhost:3100",
  [string]$OriginRegex = '^https://vesyn[a-z0-9-]*\.vercel\.app$',
  [string]$Python = "$env:USERPROFILE\.conda\envs\retrosynth\python.exe",
  [switch]$NoFunnel
)

$root = $PSScriptRoot
$logs = Join-Path $root "logs"
New-Item -ItemType Directory -Force $logs | Out-Null
$status = [ordered]@{}

function Test-Port([int]$Port) { [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) }

function Wait-Until([scriptblock]$Ready, [int]$Seconds, [string]$What) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (& $Ready) { return $true }
    Start-Sleep -Seconds 2
  }
  Write-Warning "$What did not come up within $Seconds s - see $logs"
  return $false
}

function Test-Url([string]$Url) {
  try { Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec 3 | Out-Null; return $true } catch { return $false }
}

function Start-Hidden([string]$Exe, [string]$ArgLine, [string]$Name) {
  Start-Process -FilePath $Exe -ArgumentList $ArgLine -WorkingDirectory $root -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logs "$Name.log") -RedirectStandardError (Join-Path $logs "$Name.err.log") | Out-Null
}

# 1. Database -------------------------------------------------------------
Write-Host "[1/5] Database" -ForegroundColor Cyan
cmd /c "docker info >nul 2>&1"
if ($LASTEXITCODE -ne 0) {
  Write-Host "      starting Docker Desktop..."
  Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  $null = Wait-Until { cmd /c "docker info >nul 2>&1"; $LASTEXITCODE -eq 0 } 180 "Docker Desktop"
}
Push-Location $root
cmd /c "docker compose up -d db >nul 2>&1"
Pop-Location
$dbUp = Wait-Until { (cmd /c "docker inspect -f {{.State.Health.Status}} vesyn_db 2>nul") -eq "healthy" } 120 "vesyn_db"
$status["Database (vesyn_db :5437)"] = if ($dbUp) { "up" } else { "NOT UP" }

# 2. LLM (optional: without it, runs still finish with template summaries) --
Write-Host "[2/5] Ollama (LLM)" -ForegroundColor Cyan
if (-not (Test-Url "http://127.0.0.1:11434/api/tags")) {
  $ollama = (Get-Command ollama -ErrorAction SilentlyContinue).Source
  if ($ollama) {
    Start-Hidden $ollama "serve" "ollama"
    $null = Wait-Until { Test-Url "http://127.0.0.1:11434/api/tags" } 60 "Ollama"
  }
}
$status["LLM (Ollama :11434)"] = if (Test-Url "http://127.0.0.1:11434/api/tags") { "up" } else { "off - summaries fall back to templates" }

# 3. ReactionT5 (optional: without it, steps are not forward-checked) -------
Write-Host "[3/5] ReactionT5" -ForegroundColor Cyan
$t5 = Join-Path $root "venv-t5\Scripts\python.exe"
if (-not (Test-Port 8435) -and (Test-Path $t5)) {
  Start-Hidden $t5 "-m uvicorn --app-dir backend/forward_model_service main:app --host 127.0.0.1 --port 8435" "t5"
  $null = Wait-Until { Test-Port 8435 } 180 "ReactionT5"
}
$status["ReactionT5 (:8435)"] = if (Test-Port 8435) { "up" } else { "off - steps not forward-checked" }

# 4. API --------------------------------------------------------------------
Write-Host "[4/5] API (loads AiZynthFinder and QSAR: ~30 s)" -ForegroundColor Cyan
if (Test-Port 8436) {
  Write-Host "      already running - CORS settings apply only when this script starts it"
} elseif (Test-Path $Python) {
  $env:VESYN_CORS_ORIGINS = $Origins
  $env:VESYN_CORS_ORIGIN_REGEX = $OriginRegex
  Start-Hidden $Python "-m uvicorn backend.api.main:app --host 127.0.0.1 --port 8436" "api"
  $null = Wait-Until { Test-Url "http://127.0.0.1:8436/health" } 240 "API"
} else {
  Write-Warning "Python not found at $Python (pass -Python <path to the retrosynth env's python.exe>)"
}
$apiUp = Test-Url "http://127.0.0.1:8436/health"
$status["API (:8436)"] = if ($apiUp) { "up" } else { "NOT UP" }

# 5. Public address -----------------------------------------------------------
Write-Host "[5/5] Public address (Tailscale Funnel)" -ForegroundColor Cyan
$public = $null
if ($NoFunnel) {
  $status["Public URL"] = "skipped (-NoFunnel)"
} else {
  $ts = (Get-Command tailscale -ErrorAction SilentlyContinue).Source
  if (-not $ts -and (Test-Path "$env:ProgramFiles\Tailscale\tailscale.exe")) { $ts = "$env:ProgramFiles\Tailscale\tailscale.exe" }
  if (-not $ts) {
    $status["Public URL"] = "Tailscale not installed - https://tailscale.com/download/windows, sign in, then run this again"
  } else {
    & $ts funnel --bg 8436
    if ($LASTEXITCODE -ne 0) {
      $status["Public URL"] = "funnel failed - follow the link Tailscale printed above to enable HTTPS/Funnel, then run this again"
    } else {
      $dns = ((& $ts status --json | ConvertFrom-Json).Self.DNSName).TrimEnd(".")
      $public = "https://$dns"
      $status["Public URL"] = $public
    }
  }
}

Write-Host ""
Write-Host "Vesyn backend" -ForegroundColor Green
$status.GetEnumerator() | ForEach-Object { "  {0,-28} {1}" -f $_.Key, $_.Value }
if ($public) {
  Write-Host ""
  Write-Host "  In Vercel: NEXT_PUBLIC_API_URL = $public" -ForegroundColor Yellow
}
Write-Host "  Logs: $logs    Stop: .\stop-vesyn.ps1"
if (-not $apiUp) { exit 1 }
