; Inno Setup script for the "next-next-finish" installer.
;
; Build (after PyInstaller produced dist\PFN):
;   ISCC.exe installer\pfn.iss /DAppVersion=1.2.0
;
; Per-user install by default ("PrivilegesRequired=lowest"), so no admin prompt
; and no UAC: it lands in %LOCALAPPDATA%\Programs\PFN and can be removed from
; "Программы и компоненты" like any other app.

#ifndef AppVersion
  #define AppVersion "1.2.0"
#endif

#define AppName "PFN"
#define AppPublisher "PFN"
#define AppExe "PFN.exe"

[Setup]
AppId={{8D1C4F62-3B7A-4E55-9C1D-2F6A0B7E4A11}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={localappdata}\Programs\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\release
OutputBaseFilename=PFN-{#AppVersion}-Setup
SetupIconFile=..\assets\icon.ico
UninstallDisplayIcon={app}\{#AppExe}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\dist\PFN\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{group}\Остановить PFN"; Filename: "{app}\{#AppExe}"; Parameters: "--stop"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "Запустить {#AppName}"; Flags: nowait postinstall skipifsilent
