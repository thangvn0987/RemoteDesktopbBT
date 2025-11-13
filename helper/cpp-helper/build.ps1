# Build script for RemoteBT Helper Agent
# Requires: MinGW-w64 with g++ or MSVC

Write-Host "Building RemoteBT Helper Agent..." -ForegroundColor Cyan

# Check if g++ is available
$gpp = Get-Command g++ -ErrorAction SilentlyContinue
if (-not $gpp) {
    Write-Host "Error: g++ not found. Please install MinGW-w64." -ForegroundColor Red
    Write-Host "Download from: https://winlibs.com/ or https://www.mingw-w64.org/" -ForegroundColor Yellow
    exit 1
}

# Create build directory if it doesn't exist
if (-not (Test-Path "build")) {
    New-Item -ItemType Directory -Path "build" | Out-Null
}

# Build command
Write-Host "Compiling with g++..." -ForegroundColor Green
g++ -std=c++11 src/main.cpp -o build/remotebt_helper.exe -lgdiplus -lws2_32 -lgdi32 -lole32 -luuid -static-libgcc -static-libstdc++

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Build successful!" -ForegroundColor Green
    Write-Host "Executable: build/remotebt_helper.exe" -ForegroundColor Cyan
    
    # Copy to web downloads folder for distribution
    $webDownloads = "../../frontend/web/public/downloads"
    if (Test-Path $webDownloads) {
        Copy-Item "build/remotebt_helper.exe" "$webDownloads/remotebt_helper.exe" -Force
        Write-Host "✓ Copied to web downloads folder" -ForegroundColor Green
    }
} else {
    Write-Host "✗ Build failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit 1
}
