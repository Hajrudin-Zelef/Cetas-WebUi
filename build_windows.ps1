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

Write-Host "==> Build PyInstaller (deploy.spec)..."
python -m PyInstaller --clean --noconfirm deploy.spec

Write-Host ""
Write-Host "==> Terminé !"
Write-Host "    Cetas     : dist\Cetas\Cetas.exe"
Write-Host "    Deploy    : dist\CetasDeploy\CetasDeploy.exe"
Write-Host "    Données utilisateur : %APPDATA%\Cetas"