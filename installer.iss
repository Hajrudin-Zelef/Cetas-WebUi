; Cetas — installer Windows (Inno Setup)
; Usage : compiler installer.iss avec Inno Setup (après build_windows.ps1)
; Portable requis : dist\Cetas\Cetas.exe

#define AppName "Cetas"
#define AppVersion "1.0.0"
#define AppPublisher "Marexsoft Corporation"
#define AppExeName "Cetas.exe"

[Setup]
AppId={{54FC3A2D-5A09-4FAA-98AE-4A3D03829E8F}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\Cetas
DefaultGroupName=Cetas
UninstallDisplayIcon={app}\{#AppExeName}
OutputDir=installer
OutputBaseFilename=Cetas-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Files]
Source: "dist\Cetas\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Cetas"; Filename: "{app}\{#AppExeName}"
Name: "{group}\Désinstaller Cetas"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Cetas"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Créer un raccourci sur le bureau"; GroupDescription: "Raccourcis:"

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Lancer Cetas"; Flags: nowait postinstall skipifsilent