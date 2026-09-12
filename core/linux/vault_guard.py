#!/usr/bin/env python3
"""
CETAS Vault Guard — Linux
──────────────────────────────
  install [vault-path]   Set chattr +i + install systemd service
  remove                 Stop service, chattr -i, uninstall
  stop                   Remove immutability (to modify vault)
  start                  Restore immutability
  status                 Show guard status
  --foreground [path]    Run in terminal (test)

Uses chattr +i (kernel-enforced immutability) + systemd service
that monitors the vault and re-applies protection if tampered.
"""
import os
import sys
import subprocess
import signal
import time
from pathlib import Path

SERVICE_NAME = "cetas-vault-guard"
SERVICE_FILE = Path("/etc/systemd/system") / f"{SERVICE_NAME}.service"
PERMANENT_DIR = Path("/opt/cetas")
PERMANENT_SCRIPT = PERMANENT_DIR / "vault_guard.py"
PERMANENT_CONFIG = PERMANENT_DIR / "guard_config"

FOREGROUND = "--foreground" in sys.argv


def _read_vault_path() -> str | None:
    if PERMANENT_CONFIG.exists():
        v = PERMANENT_CONFIG.read_text().strip()
        if v:
            return v
    return None


def _is_root() -> bool:
    return os.geteuid() == 0


def _run_as_root(args: list[str]) -> int:
    """Re-launch with sudo python (preserves terminal for password prompt)."""
    try:
        r = subprocess.run(["sudo", sys.executable] + args, timeout=120, stdin=None)
        return r.returncode
    except Exception:
        return -1


def cmd_install(vault_path: str | None = None) -> None:
    if not _is_root():
        print("[!] Root required. Requesting sudo...")
        ret = _run_as_root([__file__, "install"] + ([vault_path] if vault_path else []))
        if ret != 0:
            print(f"[!] Failed (code {ret}). Run with: sudo python {__file__} install [path]")
            sys.exit(1)
        return

    if vault_path is None:
        vault_path = _read_vault_path()
    if not vault_path:
        print("[!] No vault path. Provide one:")
        print(f"    sudo python {__file__} install <vault-path>")
        sys.exit(1)

    print(f"=== Install CETAS Vault Guard (Linux) ===")
    print(f"    Vault : {vault_path}")

    PERMANENT_DIR.mkdir(parents=True, exist_ok=True)
    script_src = Path(__file__).resolve()
    with open(script_src, "r") as src:
        with open(PERMANENT_SCRIPT, "w") as dst:
            dst.write(src.read())
    PERMANENT_SCRIPT.chmod(0o700)

    PERMANENT_CONFIG.write_text(vault_path)
    PERMANENT_CONFIG.chmod(0o600)

    subprocess.run(["chattr", "+i", vault_path], check=False)
    _chattr_dir(os.path.dirname(vault_path), "+i")

    print("[+] Guard copied + vault set immutable (chattr +i).")

    service_def = f"""[Unit]
Description=CETAS Vault Guard
After=network.target

[Service]
Type=simple
ExecStart={sys.executable} {PERMANENT_SCRIPT} --_svc
ExecStop=/bin/sh -c 'chattr -i {vault_path} 2>/dev/null; chattr -R -i {os.path.dirname(vault_path)} 2>/dev/null'
Restart=always
RestartSec=5
User=root
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
"""

    SERVICE_FILE.write_text(service_def)
    subprocess.run(["systemctl", "daemon-reload"], check=False)
    subprocess.run(["systemctl", "enable", SERVICE_NAME], check=False)
    subprocess.run(["systemctl", "start", SERVICE_NAME], check=False)

    print("[+] systemd service installed and started.")
    print("    The vault is immutable (chattr +i) + monitored 24/7.")
    print("    Use 'stop' to modify, 'start' to re-lock.")


def cmd_remove() -> None:
    if not _is_root():
        ret = _run_as_root([__file__, "remove"])
        if ret != 0:
            print(f"[!] Failed (code {ret}). Run with: sudo python {__file__} remove")
            sys.exit(1)
        return

    print("=== Remove CETAS Vault Guard (Linux) ===")
    vault_path = _read_vault_path()

    subprocess.run(["systemctl", "stop", SERVICE_NAME], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(["systemctl", "disable", SERVICE_NAME], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    if SERVICE_FILE.exists():
        SERVICE_FILE.unlink()
    subprocess.run(["systemctl", "daemon-reload"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    if vault_path:
        if os.path.exists(vault_path):
            subprocess.run(["chattr", "-i", vault_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        _chattr_dir(os.path.dirname(vault_path), "-i")

    for f in [PERMANENT_SCRIPT, PERMANENT_CONFIG]:
        if f.exists():
            f.unlink()

    print("[+] Guard removed. Vault is now mutable.")


def cmd_stop() -> None:
    """Remove immutability to allow vault modification."""
    vault_path = _read_vault_path()
    if not vault_path:
        print("[!] Guard not installed.")
        sys.exit(1)

    if not _is_root():
        _run_as_root([__file__, "stop"])
        return

    subprocess.run(["systemctl", "stop", SERVICE_NAME], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if os.path.exists(vault_path):
        subprocess.run(["chattr", "-i", vault_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    _chattr_dir(os.path.dirname(vault_path), "-i")
    print("[+] Vault is now mutable. You can modify it.")
    print(f"    Re-lock: sudo python {__file__} start")


def cmd_start() -> None:
    if not _is_root():
        _run_as_root([__file__, "start"])
        return

    vault_path = _read_vault_path()
    if vault_path and os.path.exists(vault_path):
        subprocess.run(["chattr", "+i", vault_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        _chattr_dir(os.path.dirname(vault_path), "+i")

    subprocess.run(["systemctl", "start", SERVICE_NAME], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("[+] Guard restarted. Vault is immutable.")


def cmd_status() -> None:
    r = subprocess.run(["systemctl", "is-active", SERVICE_NAME],
                       capture_output=True, text=True)
    state = r.stdout.strip()
    print(f"Status : {state}")
    vault = _read_vault_path()
    if vault:
        exists = "present" if os.path.exists(vault) else "MISSING!"
        r2 = subprocess.run(["lsattr", vault], capture_output=True, text=True)
        if "i" in r2.stdout:
            exists += " [immutable]"
        print(f"Vault  : {vault}  ({exists})")


def _chattr_dir(dirpath: str, flag: str) -> None:
    if os.path.exists(dirpath):
        subprocess.run(["chattr", flag, dirpath],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def _run_monitor(vault_path: str) -> None:
    print(f"[guard] Monitoring: {vault_path}")
    running = True

    def on_signal(sig, frame):
        nonlocal running
        print("\n[guard] Stopping...")
        running = False

    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)

    while running:
        if not os.path.exists(vault_path):
            print(f"[guard] Vault missing — cannot restore without cache.")
            time.sleep(5)
            continue

        r = subprocess.run(["lsattr", vault_path], capture_output=True, text=True)
        if "i" not in r.stdout:
            print(f"[guard] chattr +i removed! Re-applying...")
            subprocess.run(["chattr", "+i", vault_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            _chattr_dir(os.path.dirname(vault_path), "+i")

        parent = os.path.dirname(vault_path)
        if os.path.exists(parent):
            r2 = subprocess.run(["lsattr", "-d", parent], capture_output=True, text=True)
            if "i" not in r2.stdout:
                _chattr_dir(parent, "+i")

        time.sleep(5)


if __name__ == "__main__":
    svc_mode = "--_svc" in sys.argv

    if svc_mode:
        vault_path = _read_vault_path()
        if not vault_path:
            print("[guard] No vault configured. Exiting.")
            sys.exit(1)
        _run_monitor(vault_path)

    elif FOREGROUND:
        vault_path = None
        for i, arg in enumerate(sys.argv):
            if arg in ("--vault", "--foreground") and i + 1 < len(sys.argv):
                if not sys.argv[i + 1].startswith("--"):
                    vault_path = sys.argv[i + 1]
                    break
        if not vault_path:
            vault_path = _read_vault_path()
        if not vault_path:
            print("[!] No vault path. Use: --foreground <path>")
            sys.exit(1)
        _run_monitor(vault_path)

    else:
        args = [a for a in sys.argv[1:] if not a.startswith("--vault")]

        if len(args) == 0:
            print(__doc__)
            cmd_status()

        elif args[0] == "install":
            vault_path = args[1] if len(args) > 1 else None
            cmd_install(vault_path)

        elif args[0] == "remove":
            cmd_remove()

        elif args[0] == "stop":
            cmd_stop()

        elif args[0] == "start":
            cmd_start()

        elif args[0] == "status":
            cmd_status()

        else:
            print(f"[!] Unknown: {args[0]}")
            print(__doc__)