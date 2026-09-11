# -*- mode: python ; coding: utf-8 -*-
# Cetas Deploy — config PyInstaller (build portable Windows)
# Usage : python -m PyInstaller --clean --noconfirm deploy.spec

block_cipher = None

a = Analysis(
    ['deploy.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[
        'webview',
        'webview.platforms.winforms',
        'webview.platforms.edgechromium',
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='CetasDeploy',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='CetasDeploy',
)
