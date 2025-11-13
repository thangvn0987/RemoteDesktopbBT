# RemoteBT Helper (Windows, C++)

Minimal helper to connect two real PCs: one acts as controller (client), the other is the target (server). Transport is TCP, commands are line-based, and input injection uses Win32 SendInput.

No Docker required. Token-based handshake protects the session.

## Build

Requirements: Visual Studio Build Tools (MSVC), CMake >= 3.18

```powershell
cd helper/cpp-helper
cmake -S . -B build -A x64
cmake --build build --config Release
```

Output: `helper/cpp-helper/build/Release/remotebt_helper.exe`

## Use on two real machines

- Pick a shared token, e.g. `abc123`.
- On TARGET machine (the one to be controlled), open a PowerShell window:

```powershell
# Allow inbound on port 5555 (once). Requires admin PowerShell.
# Optional: If firewall prompts, approve manually instead.
# New-NetFirewallRule -DisplayName "RemoteBT Helper" -Direction Inbound -Protocol TCP -LocalPort 5555 -Action Allow

# Start the server
./build/Release/remotebt_helper.exe --server --port 5555 --token abc123
```

- On CONTROLLER machine, run:

```powershell
./build/Release/remotebt_helper.exe --client --host <TARGET_IP> --port 5555 --token abc123 --demo
```

You should see the target machine move the cursor, click, and type a line then press Enter.

Interactive client (manual commands):

```powershell
./build/Release/remotebt_helper.exe --client --host <TARGET_IP> --port 5555 --token abc123
```

Then type commands (one per line):

```
MOVE 600 400
CLICK left
TYPE Xin chao tu controller!
KEY Enter
SCROLL -240
QUIT
```

## Commands

- `AUTH <token>` sent automatically by client on connect
- `MOVE x y` screen coordinates (absolute)
- `CLICK left|right|middle`
- `DOWN left|right|middle` / `UP left|right|middle`
- `SCROLL delta` 120 per notch; negative = down
- `TYPE <utf8 text>` any Unicode text
- `KEY <name|combo>` e.g. Enter, Esc, A..Z, F1..F24, or combos like `ctrl+alt+t`

## Notes

- Works in the active interactive session; cannot interact with UAC secure desktop.
- Make sure the target firewall allows TCP port 5555 (or your chosen port).
- For multi-monitor setups, coordinates are virtual-screen pixels.
- Next steps: switch transport to WebSocket, add screen capture, and Linux adapter.
