# -*- mode: python ; coding: utf-8 -*-
# Cetas — config PyInstaller (build portable Windows)
# Usage : python -m PyInstaller --clean --noconfirm cetas.spec

block_cipher = None

datas = [
    ('static', 'static'),
    ('core/win/crypto_windows.py', 'core/win'),
    ('core/linux/crypto_linux.py', 'core/linux'),
    ('core/users-seed.json', 'core'),
    ('core/api-keys-seed.json', 'core'),
]

a = Analysis(
    ['cetas.py'],
    pathex=['server'],
    binaries=[],
    datas=datas,
    hiddenimports=[
        'cryptography',
        'jwt',
        'webview',
        'webview.platforms.winforms',
        'webview.platforms.edgechromium',
        'observability',
        'marexcode',
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
    name='Cetas',
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
    name='Cetas',
)