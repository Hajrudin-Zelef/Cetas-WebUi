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

import os as _os
icon_path = _os.path.join(SPECPATH, 'static', 'images', 'Cetas42.ico')
if not _os.path.exists(icon_path):
    icon_path = None

a = Analysis(
    ['cetas.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=[
        'cryptography',
        'cryptography.hazmat.primitives.kdf',
        'cryptography.hazmat.primitives.kdf.scrypt',
        'cryptography.hazmat.primitives.kdf.hkdf',
        'cryptography.hazmat.primitives.ciphers',
        'cryptography.hazmat.primitives.ciphers.aead',
        'cryptography.hazmat.primitives.ciphers.aead.aesgcm',
        'cryptography.hazmat.primitives.hashes',
        'cryptography.hazmat.backends',
        'cryptography.hazmat.backends.openssl',
        'cryptography.hazmat.backends.openssl.aead',
        'cryptography.hazmat.backends.openssl.binding',
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
    console=True,
    icon=icon_path,
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