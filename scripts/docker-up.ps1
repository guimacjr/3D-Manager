param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ExtraArgs
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  docker compose up -d --build @ExtraArgs
  Write-Host 'Release Docker em execucao:'
  Write-Host '- Web: http://localhost:8080'
  Write-Host '- API: http://localhost:3333'
}
finally {
  Pop-Location
}
