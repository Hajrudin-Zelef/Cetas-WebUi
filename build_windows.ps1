# Cetas — build portable Windows (PyInstaller one-dir)
# Usage (PowerShell) :  .\build_windows.ps1
$ErrorActionPreference = 'Stop'

Write-Host "==> Installation de PyInstaller..."
python -m pip install pyinstaller

Write-Host "==> Nettoyage des builds précédents..."
if (Test-Path build) { Remove-Item build -Recurse -Force }
if (Test-Path dist)  { Remove-Item dist  -Recurse -Force }

Write-Host "==> Build PyInstaller (cetas.spec)..."
python -m PyInstaller --clean --noconfirm cetas.spec

Write-Host ""
Write-Host "==> Terminé ! Portable : dist\Cetas\Cetas.exe"
Write-Host "    (double-clic sur Cetas.exe pour lancer)"
Write-Host "    Données utilisateur : %APPDATA%\Cetas"