; Inno Setup script to package RemoteBT Helper
#define MyAppName "RemoteBT Helper"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "RemoteBT"
#define MyAppExeName "remotebt_helper.exe"

[Setup]
AppId={{F2C9D1D3-0E2E-4C5D-B2E2-7F2C2E3B9D01}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={pf64}\RemoteBTHelper
DefaultGroupName=RemoteBTHelper
DisableProgramGroupPage=yes
OutputDir=.
OutputBaseFilename=RemoteBT-Helper-Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern

[Files]
Source: "..\build\Release\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\scripts\run-server.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\scripts\run-client.ps1"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\RemoteBT Helper Server"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File \"{app}\\run-server.ps1\""; WorkingDir: "{app}"
Name: "{group}\RemoteBT Helper Client"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File \"{app}\\run-client.ps1\""; WorkingDir: "{app}"
Name: "{autodesktop}\RemoteBT Helper Client"; Filename: "powershell.exe"; Tasks: desktopicon; Parameters: "-ExecutionPolicy Bypass -File \"{app}\\run-client.ps1\""; WorkingDir: "{app}"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut for Client"; GroupDescription: "Additional icons:"; Flags: unchecked
