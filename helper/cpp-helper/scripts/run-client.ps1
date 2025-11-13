param(
  [string]$Host = "127.0.0.1",
  [int]$Port = 5555,
  [string]$Token = "dev-secret",
  [switch]$Demo
)

$exe = Join-Path $PSScriptRoot "..\build\Release\remotebt_helper.exe"
if (-not (Test-Path $exe)) { Write-Error "Executable not found: $exe. Build it first."; exit 1 }

if ($Demo) {
  & $exe --client --host $Host --port $Port --token $Token --demo
} else {
  & $exe --client --host $Host --port $Port --token $Token
}
