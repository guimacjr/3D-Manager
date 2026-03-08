param(
  [string]$ApiUrl = "http://127.0.0.1:3333"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Action
  )

  Write-Host "==> $Name"
  & $Action
}

function Assert-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Comando obrigatorio nao encontrado: $Name"
  }
}

Assert-Command "npm"
Assert-Command "npx"
Assert-Command "node"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Resolve-Path (Join-Path $ScriptDir "..")
$DesktopDir = Join-Path $RootDir "desktop"
$ReleaseDir = Join-Path $RootDir "release/windows"

Invoke-Step "Montando release windows (sem banco de teste)" {
  & (Join-Path $ScriptDir "build-windows.ps1") -ApiUrl $ApiUrl
}

Invoke-Step "Instalando dependencias do desktop" {
  Push-Location $DesktopDir
  try {
    npm install
  } finally {
    Pop-Location
  }
}

Invoke-Step "Compilando .exe portable (Electron Builder)" {
  Push-Location $DesktopDir
  try {
    $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
    $env:WIN_CSC_LINK = ""
    $env:WIN_CSC_KEY_PASSWORD = ""
    npm run dist:win
  } finally {
    Remove-Item Env:CSC_IDENTITY_AUTO_DISCOVERY -ErrorAction SilentlyContinue
    Remove-Item Env:WIN_CSC_LINK -ErrorAction SilentlyContinue
    Remove-Item Env:WIN_CSC_KEY_PASSWORD -ErrorAction SilentlyContinue
    Pop-Location
  }
}

Write-Host ""
Write-Host "Build concluido."
Write-Host "Portable .exe gerado em: $DesktopDir\dist"
Write-Host "Release base usada: $ReleaseDir"
