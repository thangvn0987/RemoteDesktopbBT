# Build Instructions for RemoteBT Helper Agent

## Prerequisites

You need a C++ compiler with Windows SDK support. Choose one:

### Option 1: MinGW-w64 (Recommended)

Download and install MinGW-w64:

- **WinLibs**: https://winlibs.com/ (easiest, includes all libraries)
- **Official MinGW-w64**: https://www.mingw-w64.org/downloads/

Add `bin/` folder to your PATH environment variable.

### Option 2: Visual Studio (MSVC)

Install Visual Studio 2019 or newer with "Desktop development with C++" workload.

## Build Commands

### Using MinGW-w64 (g++)

```powershell
cd helper\cpp-helper
.\build.ps1
```

Or manually:

```powershell
g++ -std=c++11 src/main.cpp -o build/remotebt_helper.exe -lgdiplus -lws2_32 -lgdi32 -lole32 -luuid -static-libgcc -static-libstdc++
```

### Using Visual Studio (MSVC)

```powershell
cl /EHsc /std:c++11 src/main.cpp /Fe:build\remotebt_helper.exe gdiplus.lib ws2_32.lib gdi32.lib ole32.lib uuid.lib
```

## After Build

The executable will be at: `build/remotebt_helper.exe`

The build script automatically copies it to `frontend/web/public/downloads/` for web distribution.

## Manual Distribution

To make the helper agent downloadable from the web dashboard:

```powershell
Copy-Item build/remotebt_helper.exe ../../frontend/web/public/downloads/remotebt_helper.exe
```

Then rebuild the web-portal Docker container:

```powershell
cd ../../infra/docker
docker compose build web-portal
docker compose up -d web-portal
```

## Testing

Run the built executable:

```powershell
.\build\remotebt_helper.exe
```

You should see:

```
[auto] No config.json found. Starting configuration server...
[config] HTTP server listening on localhost:12345
[config] Waiting for configuration from web dashboard...
```

Now open the host dashboard and click "Link This Computer".

## Troubleshooting

### "g++ is not recognized"

MinGW-w64 is not installed or not in PATH. Install it and add to PATH.

### Linking errors

Make sure you have Windows SDK libraries. MinGW-w64 includes them by default.

### "MSVCR120.dll is missing"

Add `-static-libgcc -static-libstdc++` flags to statically link runtime libraries (already in build.ps1).
