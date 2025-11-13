param(
  [int]$Port = 5555,
  [string]$Token = "dev-secret"
)

$exe = Join-Path $PSScriptRoot "..\build\Release\remotebt_helper.exe"
if (-not (Test-Path $exe)) { Write-Error "Executable not found: $exe. Build it first."; exit 1 }
& $exe --server --port $Port --token $Token
