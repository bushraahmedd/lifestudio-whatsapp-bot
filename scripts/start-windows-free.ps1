# Free local hosting: WhatsApp bot + Cloudflare HTTPS tunnel
# Usage: .\scripts\start-windows-free.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js is required. Install from https://nodejs.org" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path ".\serviceAccountKey.json")) {
  Write-Host "Missing serviceAccountKey.json in whatsapp-bot folder." -ForegroundColor Red
  exit 1
}

$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflared) {
  Write-Host "Installing cloudflared via winget..." -ForegroundColor Yellow
  winget install Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements
  $cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
}

if (-not $cloudflared) {
  Write-Host "cloudflared not found. Install: winget install Cloudflare.cloudflared" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "=== Live Studio WhatsApp Bot (free mode) ===" -ForegroundColor Green
Write-Host "1) Bot API: http://localhost:8080"
Write-Host "2) Copy the https://....trycloudflare.com URL from the tunnel window"
Write-Host "3) Admin -> bot settings -> paste URL (no redeploy needed)"
Write-Host ""

$botJob = Start-Job -ScriptBlock {
  param($dir)
  Set-Location $dir
  $env:WHATSAPP_PROVIDER = "baileys"
  npm run start:baileys 2>&1
} -ArgumentList $Root

Start-Sleep -Seconds 4

try {
  & cloudflared tunnel --url http://localhost:8080
}
finally {
  Stop-Job $botJob -ErrorAction SilentlyContinue
  Remove-Job $botJob -Force -ErrorAction SilentlyContinue
}
