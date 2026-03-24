param(
  [switch]$Install
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root "backend"
$mobileDir = Join-Path $root "mobile"

if (-not (Test-Path (Join-Path $backendDir "package.json"))) {
  throw "Nao encontrei backend/package.json em: $backendDir"
}
if (-not (Test-Path (Join-Path $mobileDir "package.json"))) {
  throw "Nao encontrei mobile/package.json em: $mobileDir"
}

Write-Host "3D Manager - Dev runner" -ForegroundColor Cyan
Write-Host "Raiz: $root"
Write-Host "API esperada: http://localhost:3333"

$listening = Get-NetTCPConnection -LocalPort 3333 -State Listen -ErrorAction SilentlyContinue
if ($listening) {
  $pids = $listening | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($pidValue in $pids) {
    $proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($proc) {
      Write-Host ""
      Write-Host "Porta 3333 ja esta em uso por: $($proc.ProcessName) (PID $pidValue)" -ForegroundColor Yellow
      Write-Host "Feche esse processo para evitar usar backend antigo." -ForegroundColor Yellow
      Write-Host "Exemplo para encerrar: Stop-Process -Id $pidValue"
    }
  }
  throw "Abortado para evitar conflito com backend incorreto."
}

if ($Install) {
  Write-Host ""
  Write-Host "Instalando dependencias do backend..." -ForegroundColor DarkCyan
  Push-Location $backendDir
  npm install
  Pop-Location

  Write-Host "Instalando dependencias do mobile..." -ForegroundColor DarkCyan
  Push-Location $mobileDir
  npm install
  Pop-Location
}

$backendCmd = "Set-Location '$backendDir'; npm run dev"
$frontendCmd = "Set-Location '$mobileDir'; `$env:EXPO_PUBLIC_API_URL='http://localhost:3333'; npm run web"

Write-Host ""
Write-Host "Abrindo backend em nova janela..." -ForegroundColor Green
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  $backendCmd
) | Out-Null

Start-Sleep -Seconds 2

Write-Host "Abrindo frontend (Expo Web) em nova janela..." -ForegroundColor Green
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  $frontendCmd
) | Out-Null

Write-Host ""
Write-Host "Pronto. Janelas iniciadas:" -ForegroundColor Cyan
Write-Host "- Backend: $backendDir"
Write-Host "- Frontend: $mobileDir (EXPO_PUBLIC_API_URL=http://localhost:3333)"
Write-Host ""
Write-Host "Se quiser instalar dependencias automaticamente antes de abrir, rode:"
Write-Host ".\dev.cmd -Install"
