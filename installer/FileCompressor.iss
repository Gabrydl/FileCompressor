; FileCompressor - Windows installer (Inno Setup 6). Built by .github/workflows/release.yml:
;   ISCC /DMyAppVersion=<version> installer\FileCompressor.iss   (expects the built app in out\FileCompressor)

#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif
#define MyAppName "FileCompressor"
#define MyAppExe "FileCompressor.exe"

[Setup]
AppId={{3F6B9D21-7C4E-4A8B-B1D5-9E0C2A6F4B73}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher=Gabrydl
AppPublisherURL=https://github.com/Gabrydl/FileCompressor
AppUpdatesURL=https://github.com/Gabrydl/FileCompressor/releases
VersionInfoVersion={#MyAppVersion}
; per-user install: no admin prompt, and the app can update itself silently
PrivilegesRequired=lowest
DefaultDirName={localappdata}\Programs\{#MyAppName}
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
UsePreviousAppDir=yes
OutputDir=..\dist-installer
OutputBaseFilename={#MyAppName}-Setup
SetupIconFile=..\desktop\icon.ico
UninstallDisplayIcon={app}\{#MyAppExe}
UninstallDisplayName={#MyAppName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=force
RestartApplications=no

[Files]
Source: "..\out\{#MyAppName}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[InstallDelete]
; old pages from the previous version (settings live in the "data" folder and are kept)
Type: filesandordirs; Name: "{app}\resources\app\www"

[Icons]
Name: "{userprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"
Name: "{userdesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"

[Run]
; silent update started from inside the app: open it again
Filename: "{app}\{#MyAppExe}"; Flags: nowait; Check: WizardSilent
Filename: "{app}\{#MyAppExe}"; Description: "Open {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/f /im {#MyAppExe}"; Flags: runhidden; RunOnceId: "StopApp"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\data"

[Registry]
; "Compress with FileCompressor" in the Explorer right-click menu is added by the app; remove it on uninstall
Root: HKCU; Subkey: "Software\Classes\*\shell\FileCompressor"; Flags: uninsdeletekey dontcreatekey
Root: HKCU; Subkey: "Software\Classes\Directory\shell\FileCompressor"; Flags: uninsdeletekey dontcreatekey

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/f /im {#MyAppExe}', '', SW_HIDE, ewWaitUntilTerminated, Code);
  Sleep(800);
  Result := '';
end;
