param(
  [string]$ApiUrl = "http://localhost:3333"
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
$BackendDir = Join-Path $RootDir "backend"
$MobileDir = Join-Path $RootDir "mobile"
$DesktopDir = Join-Path $RootDir "desktop"
$ReleaseDir = Join-Path $RootDir "release/windows"
$BackendReleaseDir = Join-Path $ReleaseDir "backend"
$DataDir = Join-Path $ReleaseDir "data"
$StorageDir = Join-Path $ReleaseDir "storage/media"

$DesktopPackageJsonPath = Join-Path $DesktopDir "package.json"
if (-not (Test-Path $DesktopPackageJsonPath)) {
  throw "Arquivo nao encontrado: $DesktopPackageJsonPath"
}
$DesktopPackage = Get-Content $DesktopPackageJsonPath -Raw | ConvertFrom-Json
$ElectronVersionRaw = [string]$DesktopPackage.devDependencies.electron
if ([string]::IsNullOrWhiteSpace($ElectronVersionRaw)) {
  throw "Nao foi possivel identificar a versao do Electron em desktop/package.json"
}
$ElectronVersion = ($ElectronVersionRaw -replace '^[^\d]*', '')
if ([string]::IsNullOrWhiteSpace($ElectronVersion)) {
  throw "Versao do Electron invalida em desktop/package.json: $ElectronVersionRaw"
}

Invoke-Step "Limpando release anterior" {
  if (Test-Path $ReleaseDir) {
    Remove-Item -Recurse -Force $ReleaseDir
  }
  New-Item -ItemType Directory -Path $ReleaseDir | Out-Null
}

Invoke-Step "Compilando backend (TypeScript -> dist)" {
  Push-Location $BackendDir
  try {
    npm install
    npm run build
  } finally {
    Pop-Location
  }
}

Invoke-Step "Exportando app mobile para web (Windows)" {
  Push-Location $MobileDir
  try {
    npm install
    $env:EXPO_PUBLIC_API_URL = $ApiUrl
    npx expo export --platform web --output-dir ../release/windows/mobile-web
  } finally {
    Remove-Item Env:EXPO_PUBLIC_API_URL -ErrorAction SilentlyContinue
    Pop-Location
  }
}

Invoke-Step "Montando backend de release sem banco de teste" {
  New-Item -ItemType Directory -Path $BackendReleaseDir | Out-Null

  Copy-Item (Join-Path $BackendDir "package.json") $BackendReleaseDir
  if (Test-Path (Join-Path $BackendDir "package-lock.json")) {
    Copy-Item (Join-Path $BackendDir "package-lock.json") $BackendReleaseDir
  }
  Copy-Item -Recurse (Join-Path $BackendDir "dist") (Join-Path $BackendReleaseDir "dist")
  Copy-Item -Recurse (Join-Path $BackendDir "migrations") (Join-Path $BackendReleaseDir "migrations")

  Push-Location $BackendReleaseDir
  try {
    npm install --omit=dev
    npm rebuild better-sqlite3 --runtime=electron --target=$ElectronVersion --dist-url=https://electronjs.org/headers
  } finally {
    Pop-Location
  }
}

Invoke-Step "Criando estrutura de dados vazia para producao" {
  New-Item -ItemType Directory -Path $DataDir | Out-Null
  New-Item -ItemType Directory -Path $StorageDir -Force | Out-Null
}

$startBackendScript = @'
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:DB_PATH = Join-Path $root "data\app.sqlite"
$env:PORT = "3333"

node (Join-Path $root "backend\dist\index.js")
'@

$startAllScript = @'
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -File `"$root\start-backend.ps1`""
Start-Process (Join-Path $root "mobile-web\index.html")
'@

$readme = @'
3D Manager - Release Windows

Conteudo:
- mobile-web/: app exportado para web (React Native Web)
- backend/: backend compilado
- data/: banco SQLite de producao (inicia vazio)
- storage/: arquivos de midia

Importante:
- Este pacote NAO copia backend/data.sqlite do ambiente de desenvolvimento.
- O backend inicia com DB_PATH apontando para data/app.sqlite.

Como executar:
1) Clique em start-all.ps1
   ou
2) Execute start-backend.ps1 e abra mobile-web/index.html no navegador.
'@

Set-Content -Path (Join-Path $ReleaseDir "start-backend.ps1") -Value $startBackendScript -Encoding UTF8
Set-Content -Path (Join-Path $ReleaseDir "start-all.ps1") -Value $startAllScript -Encoding UTF8
Set-Content -Path (Join-Path $ReleaseDir "README.txt") -Value $readme -Encoding UTF8

Write-Host ""
Write-Host "Release gerada em: $ReleaseDir"
Write-Host "Banco de producao inicial: $DataDir\app.sqlite (sera criado no primeiro start)"
