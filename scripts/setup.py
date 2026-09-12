#!/usr/bin/env python3
"""
SETUP — Marexsoft CETAS
Version portable Windows / Linux / macOS
Modifie automatiquement pour compatibilite multi-plateforme.
"""
from __future__ import annotations

import os
import sys
import time
import json
import getpass
import logging
import smtplib
import subprocess
import platform
from pathlib import Path
from typing import Optional

__version__ = "1.0.0"

CONFIG_FREELLM_URL = os.environ.get("CETAS_FREELLM_URL")

_IS_WINDOWS = platform.system() == "Windows"
_IS_LINUX   = platform.system() == "Linux"
_IS_MAC     = platform.system() == "Darwin"
_IS_UNIX    = _IS_LINUX or _IS_MAC

def _get_log_path() -> Path:
    try:
        cd = _config_dir()
        return cd / "setup.log"
    except Exception:
        return Path.home() / "setup.log"

_log_path = _get_log_path()
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(_log_path, encoding="utf-8"),
        logging.StreamHandler(sys.stderr),
    ],
)
_log = logging.getLogger("cetas-setup")

try:
    import psutil
    _HAS_PSUTIL = True
except ImportError:
    _HAS_PSUTIL = False
    _log.warning(
        "psutil non installe — la gestion des processus sera limitee a subprocess. "
        "Installez avec : pip install psutil"
    )

try:
    from platformdirs import user_config_dir
    def _config_dir() -> Path:
        p = Path(user_config_dir("CETAS", appauthor="Marexsoft", ensure_exists=True))
        return p
except ImportError:
    def _config_dir() -> Path:
        if _IS_WINDOWS:
            base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
        elif _IS_MAC:
            base = Path.home() / "Library" / "Application Support"
        else:
            base = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
        p = base / "CETAS"
        p.mkdir(parents=True, exist_ok=True)
        return p

def _base_dir() -> Path:
    return Path(__file__).resolve().parent

def _vault_dir() -> Path:
    return _base_dir() / ".vault"

def _secure_permissions(path: Path) -> None:
    try:
        if _IS_WINDOWS:
            user = os.getlogin()
            result = subprocess.run(
                ["icacls", str(path), "/inheritance:r", "/grant:r", f"{user}:F"],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode != 0:
                _log.warning(
                    "icacls a retourne un code non nul sur %s : %s",
                    path, (result.stderr.strip() or result.stdout.strip())
                )
        else:
            if path.is_dir():
                os.chmod(path, 0o700)
            else:
                os.chmod(path, 0o600)
    except Exception as e:
        _log.warning("Impossible d'appliquer les permissions sur %s : %s", path, e)

def _atomic_write(path: Path, data: bytes) -> None:
    import tempfile
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp_")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
            fh.flush()
            os.fsync(fh.fileno())
        _secure_permissions(Path(tmp))
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except Exception:
            pass
        raise

def _kill_process(name: str, timeout: int = 3) -> None:
    if _HAS_PSUTIL:
        for proc in psutil.process_iter(["pid", "name", "cmdline"]):
            try:
                cmdline = " ".join(proc.info.get("cmdline") or [])
                if name in cmdline or proc.info.get("name", "").lower().startswith(name.lower().split()[0].lower()):
                    try:
                        proc.terminate()
                    except psutil.NoSuchProcess:
                        continue
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        time.sleep(timeout)
        for proc in psutil.process_iter(["pid", "cmdline"]):
            try:
                cmdline = " ".join(proc.info.get("cmdline") or [])
                if name in cmdline:
                    proc.kill()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
    else:
        if _IS_WINDOWS:
            try:
                subprocess.run(["taskkill", "/F", "/FI", f"IMAGENAME eq {name}*"],
                               capture_output=True, timeout=timeout + 2)
            except Exception:
                pass
        else:
            subprocess.run(["pkill", "-15", "-f", name], capture_output=True, timeout=timeout + 2)
            time.sleep(timeout)
            subprocess.run(["pkill", "-9", "-f", name], capture_output=True, timeout=timeout + 2)

def main() -> None:

    _IS_WINDOWS = platform.system() == "Windows"

    def _print_banner() -> None:
        G = "\033[38;5;34m"
        G2 = "\033[38;5;28m"
        W = "\033[97m"
        B = "\033[1m"
        D = "\033[2m"
        I = "\033[3m"
        R = "\033[0m"
        print()
        print(f"{G}  ╔{'═'*64}╗{R}")
        print(f"{G}  ║{'░'*64}║{R}")
        print(f"{G}  ║{' '*64}║{R}")
        print(f"{G}  ║{B}   █████╗ ███████╗████████╗ █████╗ ███████╗{R}     {G}║{R}")
        print(f"{G}  ║{B}  ██╔══██╗██╔════╝╚══██╔══╝██╔══██╗██╔════╝{R}     {G}║{R}")
        print(f"{G}  ║{B}  ███████║█████╗     ██║   ███████║███████╗{R}     {G}║{R}")
        print(f"{G}  ║{G2}  ██╔══██║██╔══╝     ██║   ██╔══██║╚════██║{R}     {G}║{R}")
        print(f"{G}  ║{G2}  ██║  ██║███████╗   ██║   ██║  ██║███████║{R}     {G}║{R}")
        print(f"{G}  ║{G2}  ╚═╝  ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚══════╝{R}     {G}║{R}")
        print(f"{G}  ║{R}                                        {D}{W}by Marexsoft Corporation{R}  {G}║{R}")
        print(f"{G}  ╠{'─'*64}╣{R}")
        print(f"{G}  ║{R}   {G}▶{R} {B}{W}App{R}  {G}│{R}  {W}CETAS{R}                              {D}{W}v1.0{R}           {G}║{R}")
        print(f"{G}  ║{R}   {D}{I}{W}Tous droits réservés © Marexsoft Corporation{R}                    {G}║{R}")
        print(f"{G}  ╚{'═'*64}╝{R}")
        print()

    _print_banner()

    def _check_and_install_requirements() -> None:
        import importlib
        import threading
        import re

        _pkg_map = {
            "requests": "requests",
            "cryptography": "cryptography",
        }
        if _IS_WINDOWS:
            _pkg_map["pywin32"] = "pywin32"
        _req = os.path.join(os.path.dirname(os.path.abspath(__file__)), "requirements.txt")

        pkgs = []
        try:
            with open(_req, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#"):
                        name = re.split(r"[>=<!]", line)[0].strip().lower()
                        if name in _pkg_map:
                            pkgs.append(name)
        except Exception:
            pkgs = list(_pkg_map.keys())

        print()
        COL = {"green": "\033[92m", "red": "\033[91m", "cyan": "\033[96m",
               "gray": "\033[90m", "bold": "\033[1m", "reset": "\033[0m",
               "yellow": "\033[93m"}

        print(COL["cyan"] + "  ┌─ Vérification des dépendances ───────────────┐" + COL["reset"])
        print()

        to_install = []
        for pkg in pkgs:
            mod = _pkg_map[pkg]
            try:
                importlib.import_module(mod)
                print(f"  {COL['gray']}{pkg:<20}{COL['reset']} {COL['green']}✓{COL['reset']}")
            except ImportError:
                print(f"  {COL['gray']}{pkg:<20}{COL['reset']} {COL['red']}✗{COL['reset']}")
                to_install.append(pkg)

        if to_install:
            print()
            for pkg in to_install:
                done_flag = [False]

                def _install(pkg=pkg):
                    pip_cmd = [sys.executable, "-m", "pip", "install", pkg]
                    if not _IS_WINDOWS:
                        pip_cmd.append("--break-system-packages")
                    pip_cmd.append("--quiet")
                    subprocess.check_call(pip_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    done_flag[0] = True

                t = threading.Thread(target=_install, daemon=True)
                t.start()

                width = 30
                i = 0
                while not done_flag[0]:
                    pct = min(int(i / (width * 3) * 100), 99)
                    done = "█" * (i % (width + 1))
                    left = "░" * (width - len(done))
                    sys.stdout.write(
                        f"\r  {COL['gray']}Installation {pkg:<14}{COL['reset']} "
                        f"[{COL['cyan']}{done}{left}{COL['reset']}] {pct:3d}%"
                    )
                    sys.stdout.flush()
                    time.sleep(0.05)
                    i += 1

                t.join()
                sys.stdout.write(
                    f"\r  {COL['gray']}Installation {pkg:<14}{COL['reset']} "
                    f"[{COL['cyan']}{'█' * width}{COL['reset']}] 100% {COL['green']}✓{COL['reset']}\n"
                )
                sys.stdout.flush()

        print()

    _check_and_install_requirements()

    import json
    import getpass
    import smtplib
    import requests
    import importlib.util

    BASE_DIR = _base_dir()
    VAULT_DIR = _vault_dir()
    SECRETS_FILE = str(VAULT_DIR / ".enc")
    VAULT_DIR.mkdir(parents=True, exist_ok=True)
    try:
        _secure_permissions(VAULT_DIR)
    except Exception as _e:
            _log.debug("Exception silenciee: %s", _e)

    _system_choice_file = VAULT_DIR / ".system"
    _system_map = {
        "1": ("linux", "crypto_linux"),
        "2": ("win", "crypto_windows"),
        "3": ("linux", "crypto_linux"),  # macOS utilise le module Linux (POSIX)
    }

    _COL = {"green": "\033[92m", "red": "\033[91m", "cyan": "\033[96m",
            "gray": "\033[90m", "bold": "\033[1m", "reset": "\033[0m",
            "yellow": "\033[93m", "white": "\033[97m"}

    if os.path.exists(SECRETS_FILE):
        if _IS_LINUX:
            _selected_dir, _selected_module = "linux", "crypto_linux"
        elif _IS_WINDOWS:
            _selected_dir, _selected_module = "win", "crypto_windows"
        else:
            _selected_dir, _selected_module = "linux", "crypto_linux"
        with open(_system_choice_file, "w") as _f:
            _f.write(_selected_dir)
        print(f"  {_COL['gray']}Systeme detecte : {_selected_dir}{_COL['reset']}")
        print()
    else:
        if _IS_LINUX:
            _selected_dir, _selected_module = "linux", "crypto_linux"
        elif _IS_WINDOWS:
            _selected_dir, _selected_module = "win", "crypto_windows"
        else:
            _selected_dir, _selected_module = "linux", "crypto_linux"
        with open(_system_choice_file, "w") as _f:
            _f.write(_selected_dir)
        print(f"  {_COL['green']}Systeme detecte : {_selected_dir}{_COL['reset']}")
        print()

    _crypto_path = BASE_DIR / "core" / _selected_dir / f"{_selected_module}.py"
    if not _crypto_path.exists():
        print(f"  {_COL['red']}Erreur : module crypto introuvable : {_crypto_path}{_COL['reset']}")
        print(f"  {_COL['red']}Verifiez que le dossier core/{_selected_dir}/ contient {_selected_module}.py{_COL['reset']}")
        sys.exit(1)
    _spec = importlib.util.spec_from_file_location("crypto_module", str(_crypto_path))
    _crypto_mod = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(_crypto_mod)
    SecureVault = _crypto_mod.SecureVault

    vault = SecureVault(SECRETS_FILE)

    if not _IS_WINDOWS and vault.exists():
        print(_COL['gray'] + "  Déverrouillage du coffre (sudo chattr -i)..." + _COL['reset'])
        subprocess.run(["sudo", "chattr", "-i", SECRETS_FILE])
        parent = os.path.dirname(SECRETS_FILE)
        if os.path.exists(parent):
            subprocess.run(["sudo", "chattr", "-i", parent])
        print(_COL['green'] + "  ✅ Coffre déverrouillé." + _COL['reset'])

    COLORS = {
        "reset": "\033[0m",
        "bold": "\033[1m",
        "green": "\033[92m",
        "cyan": "\033[96m",
        "yellow": "\033[93m",
        "red": "\033[91m",
        "white": "\033[97m",
        "gray": "\033[90m",
    }

    def c(color, text):
        return f"{COLORS.get(color, '')}{text}{COLORS['reset']}"

    import hashlib
    # Hash SHA256 du mot de passe. Pour changer :
    #   python -c "import hashlib; print(hashlib.sha256(b'ton_mdp').hexdigest())"
    SETUP_PASSWORD_HASH = "f30a9ce7c3d1f09c8f22e9b2543949c52f09ee685756f651ce85cd3ebbe84923"

    print(f"  {c('cyan', '┌─ Authentification ─────────────────────────────┐')}")
    print()
    for _ in range(3):
        pwd = getpass.getpass(c("white", "  Mot de passe setup : "))
        if hashlib.sha256(pwd.encode()).hexdigest() == SETUP_PASSWORD_HASH:
            print(c("green", "  Accès autorisé.\n"))
            break
        print(c("red", f"  Mot de passe incorrect ({2 - _} tentative(s) restante(s)).\n"))
    else:
        print(c("red", "  Accès refusé. Setup verrouillé.\n"))
        sys.exit(1)

    def save_secrets(password: str, data: dict):
        return vault.save(password, data)

    def load_secrets(password: str):
        return vault.load(password)

    def _test_openai_compat(url: str, key: str, model: str, provider_name: str) -> tuple[bool, Optional[str]]:
        headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        if provider_name == "OpenRouter":
            headers["HTTP-Referer"] = "https://marexsoft.ci"
            headers["X-Title"] = "Marexsoft CETAS"
        payload = {"model": model, "messages": [{"role": "user", "content": "Hi"}], "max_tokens": 1, "stream": False}
        try:
            r = requests.post(url, headers=headers, json=payload, timeout=30)
            if r.status_code in (200, 201):
                return True, None
            try:
                msg = r.json().get("error", {}).get("message", r.text[:120])
            except Exception:
                msg = r.text[:120]
            return False, f"HTTP {r.status_code} — {msg}"
        except requests.exceptions.Timeout:
            return False, "Timeout (30s)"
        except Exception as e:
            return False, str(e)

    def _test_openai_responses(url: str, key: str, model: str, provider_name: str) -> tuple[bool, Optional[str]]:
        headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        payload = {"model": model, "input": "Hi"}
        try:
            r = requests.post(url, headers=headers, json=payload, timeout=30)
            if r.status_code in (200, 201):
                return True, None
            try:
                msg = r.json().get("error", {}).get("message", r.text[:120])
            except Exception:
                msg = r.text[:120]
            return False, f"HTTP {r.status_code} — {msg}"
        except requests.exceptions.Timeout:
            return False, "Timeout (30s)"
        except Exception as e:
            return False, str(e)

    API_TESTS = {
        "NVIDIA NIM": lambda k: _test_openai_compat(
            "https://integrate.api.nvidia.com/v1/chat/completions",
            k,
            "nvidia/nemotron-3.5-lightning-30b-a3b",
            "NVIDIA NIM"
        ),
        "Groq": lambda k: _test_openai_responses(
            "https://api.groq.com/openai/v1/responses",
            k,
            "openai/gpt-oss-20b",
            "Groq"
        ),
        "OpenRouter": lambda k: _test_openai_compat(
            "https://openrouter.ai/api/v1/chat/completions",
            k,
            "openai/gpt-4o-mini",
            "OpenRouter"
        ),
        "DeepSeek": lambda k: _test_openai_compat(
            "https://api.deepseek.com/v1/chat/completions",
            k,
            "deepseek-chat",
            "DeepSeek"
        ),
        "FreeLLMAPI": lambda k: (
            _test_openai_compat(CONFIG_FREELLM_URL, k, "llama-3.3-70b-versatile", "FreeLLMAPI")
            if CONFIG_FREELLM_URL
            else (False, "CETAS_FREELLM_URL non defini — provider desactive")
        ),
        "Anthropic": lambda k: _test_openai_compat(
            "https://api.anthropic.com/v1/messages",
            k,
            "claude-3-5-sonnet-20241022",
            "Anthropic"
        ),
        "OpenAI": lambda k: _test_openai_compat(
            "https://api.openai.com/v1/chat/completions",
            k,
            "gpt-4o-mini",
            "OpenAI"
        ),
        "Perplexity": lambda k: _test_openai_compat(
            "https://api.perplexity.ai/chat/completions",
            k,
            "llama-3.1-sonar-small-128k-online",
            "Perplexity"
        ),
        "OpenCode Zen": lambda k: _test_openai_compat(
            "https://opencode.ai/zen/v1/chat/completions",
            k,
            "glm-5",
            "OpenCode Zen"
        ),
        "OpenCode Go": lambda k: _test_openai_compat(
            "https://opencode.ai/zen/go/v1/chat/completions",
            k,
            "hy3",
            "OpenCode Go"
        ),
        "Grok": lambda k: _test_openai_compat(
            "https://api.x.ai/v1/chat/completions",
            k,
            "grok-beta",
            "Grok"
        ),
        "Google": lambda k: _test_openai_compat(
            "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
            k,
            "gemini-3.5-flash-lite",
            "Google"
        ),
        "Mistral": lambda k: _test_openai_compat(
            "https://api.mistral.ai/v1/chat/completions",
            k,
            "open-mistral-nemo",
            "Mistral"
        ),
        "Qwen": lambda k: _test_openai_compat(
            "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
            k,
            "qwen-max",
            "Qwen"
        ),
        "Kimi": lambda k: _test_openai_compat(
            "https://api.moonshot.cn/v1/chat/completions",
            k,
            "moonshot-v1-8k",
            "Kimi"
        ),
        "GLM": lambda k: _test_openai_compat(
            "https://open.bigmodel.cn/api/paas/v4/chat/completions",
            k,
            "glm-4-plus",
            "GLM"
        ),
    }

    # PROVIDERS mis à jour avec les nouveaux
    PROVIDERS = {
        "1": ("NVIDIA NIM", "nvapi-..."),
        "2": ("Groq", "gsk_..."),
        "3": ("OpenRouter", "sk-or-..."),
        "4": ("DeepSeek", "sk-..."),
        "5": ("FreeLLMAPI", "fllm-..."),
        "6": ("Anthropic", "sk-ant-..."),
        "7": ("OpenAI", "sk-..."),
        "8": ("Grok", "xai-..."),
        "9": ("Perplexity", "pplx-..."),
        "10": ("Google", "AIza..."),
        "11": ("Mistral", "sk-..."),
        "12": ("Qwen", "sk-..."),
        "13": ("Kimi", "sk-..."),
        "14": ("GLM", "sk-..."),
        "15": ("OpenCode Zen", "sk-..."),
        "16": ("OpenCode Go", "sk-..."),
    }

    LOCAL_ENGINES = {
        "1": ("Ollama", "http://localhost:11434"),
        "2": ("LM Studio", "http://localhost:1234"),
        "3": ("vLLM", "http://localhost:8000"),
        "4": ("LLaMA.cpp", "http://localhost:8080"),
    }

    def test_key(provider_name: str, key: str) -> tuple[bool, Optional[str]]:
        fn = API_TESTS.get(provider_name)
        if fn is None:
            return True, None
        print(c("gray", f"  Test de la cle {provider_name} ..."), end=" ", flush=True)
        ok, err = fn(key)
        print(c("green", "OK") if ok else c("red", f"ECHEC — {err}"))
        return ok, err

    def _configure_provider(secrets: dict, provider_name: str, hint: str, password: str, quick_mode: bool = False) -> bool:
        existing = secrets.get("api_keys", {}).get(provider_name)

        if not quick_mode:
            print()
            print(c("cyan", f"  ── Configuration de {provider_name} ──"))

        if existing and not quick_mode:
            print(c("gray", f"  Cle actuelle : {existing[:6]}...{existing[-4:]}"))
            modifier = input(c("yellow", "  Modifier cette cle ? [O/n] : ")).strip().lower()
            if modifier == "n":
                print(c("gray", f"  {provider_name} conserve.\n"))
                return False

        while True:
            if quick_mode:
                key = getpass.getpass(c("white", f"  {provider_name} ({hint}) : ")).strip()
            else:
                key = getpass.getpass(c("white", f"  Cle {provider_name} ({hint}) : ")).strip()

            if not key:
                if existing:
                    if not quick_mode:
                        print(c("gray", f"  {provider_name} conserve.\n"))
                else:
                    if not quick_mode:
                        print(c("gray", f"  {provider_name} ignore.\n"))
                return False

            ok, err = test_key(provider_name, key)
            if ok:
                if "api_keys" not in secrets:
                    secrets["api_keys"] = {}
                secrets["api_keys"][provider_name] = key

                if not quick_mode:
                    print(c("green", f"  Cle {provider_name} enregistree.\n"))
                else:
                    print(c("green", "✓"))
                return True
            else:
                if quick_mode:
                    print(c("red", f"✗ {err}"))
                else:
                    print(c("red", f"  Echec : {err}"))
                retry = input(c("yellow", "  Reessayer ? [O/n] : ")).strip().lower()
                if retry == "n":
                    if existing and not quick_mode:
                        print(c("gray", f"  {provider_name} conserve.\n"))
                    elif not quick_mode:
                        print(c("gray", f"  {provider_name} ignore.\n"))
                    return False

    def _configure_local_engine(secrets: dict, engine_name: str, default_url: str) -> bool:
        existing = secrets.get("local", {}).get(engine_name)

        print()
        print(c("cyan", f"  ── Configuration de {engine_name} ──"))
        if existing:
            print(c("gray", f"  URL actuelle : {existing}"))
            modifier = input(c("yellow", "  Modifier cette URL ? [O/n] : ")).strip().lower()
            if modifier == "n":
                print(c("gray", f"  {engine_name} conserve.\n"))
                return False

        url = input(c("white", f"  URL de {engine_name} [{default_url}] : ")).strip()
        if not url:
            if existing:
                print(c("gray", f"  {engine_name} conserve.\n"))
            else:
                print(c("gray", f"  {engine_name} ignore.\n"))
            return False

        if "local" not in secrets:
            secrets["local"] = {}
        secrets["local"][engine_name] = url
        print(c("green", f"  {engine_name} enregistre : {url}\n"))
        return True

    def _show_providers_menu(secrets: dict) -> str:
        print()
        print(c("cyan", "  ────────────────────────────────────────────────────────"))
        print(c("white", "  Providers disponibles :"))
        print()

        for k, (pname, _) in PROVIDERS.items():
            existing = secrets.get("api_keys", {}).get(pname)
            if existing:
                masked = existing[:6] + "..." + existing[-4:] if len(existing) > 10 else "****"
                status = c("green", f"✓ {masked}")
            else:
                status = c("gray", "─ Non configuré")
            print(c("white", f"  {k}. {pname:<15}") + f"  {status}")

        print()
        print(c("gray", "  ─── Providers locaux ───"))
        for k, (ename, _) in LOCAL_ENGINES.items():
            existing = secrets.get("local", {}).get(ename)
            if existing:
                status = c("green", f"✓ {existing}")
            else:
                status = c("gray", "─ Non configuré")
            print(c("white", f"  L{k}. {ename:<15}") + f"  {status}")

        print()
        print(c("yellow", "  0. Terminer la configuration"))
        print(c("yellow", "  r. Revenir au menu principal"))
        print()
        return input(c("white", "  Choisir un provider à configurer (ou 0/r) : ")).strip().lower()

    # ============================================================
    # NOUVELLE ÉTAPE 4 : GESTION DES COMPTES ADMINISTRATEURS
    # ============================================================
    def _export_users_seed(secrets: dict):
        """Exporte les comptes admin vers core/users-seed.json (lu par le frontend)"""
        seed_path = BASE_DIR / "core" / "users-seed.json"
        try:
            admins = secrets.get("admins", [])
            seed_path.write_text(json.dumps(admins, indent=2), encoding='utf-8')
        except Exception as e:
            _log.warning("Export users-seed.json échoué: %s", e)

    def _export_api_keys_seed(secrets: dict):
        """Exporte les clés API vers core/api-keys-seed.json (lu par le frontend)"""
        seed_path = BASE_DIR / "core" / "api-keys-seed.json"
        try:
            api_keys = secrets.get("api_keys", {})
            local_keys = secrets.get("local", {})
            export = dict(api_keys)
            export.update(local_keys)
            seed_path.write_text(json.dumps(export, indent=2), encoding='utf-8')
        except Exception as e:
            _log.warning("Export api-keys-seed.json échoué: %s", e)

    def _export_env_file(secrets: dict, password: str):
        """Chiffre les clés API avec proxy_key du vault → .env (utilisé par le proxy Python)"""
        import secrets as _pysecrets
        try:
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        except ImportError:
            _log.warning("cryptography non disponible — export .env ignoré.")
            return

        vault_obj = SecureVault(SECRETS_FILE)
        data = vault_obj.load(password) or {}

        # Générer ou récupérer proxy_key
        if "proxy_key" not in data:
            data["proxy_key"] = _pysecrets.token_hex(32)
            vault_obj.save(password, data)

        proxy_key = bytes.fromhex(data["proxy_key"])
        api_keys = secrets.get("api_keys", {})
        local_keys = secrets.get("local", {})

        if not api_keys and not local_keys:
            try:
                ENV_PATH = BASE_DIR / ".env"
                if ENV_PATH.exists():
                    ENV_PATH.unlink()
            except Exception:
                pass
            return

        env_lines = []
        # Noms d'env stables par provider (AAD de chiffrement). Les clés OpenCode
        # sont scellées sous opencode (Zen) / opencode-go (Go) — ne jamais dériver
        # du nom d'affichage ("OpenCode Zen" -> opencode_zen casserait le déchiffrement).
        OC_NORMALIZE = {
            "OpenCode Zen": "opencode",
            "OpenCode Go": "opencode-go",
        }
        for provider, key in api_keys.items():
            normalized = OC_NORMALIZE.get(provider, provider.lower().replace(" ", "_"))
            iv = _pysecrets.token_bytes(12)
            aesgcm = AESGCM(proxy_key)
            ct = aesgcm.encrypt(iv, key.encode("utf-8"), normalized.encode("utf-8"))
            env_lines.append(f"{normalized}_key={iv.hex()}:{ct.hex()}")

        for provider, url in local_keys.items():
            normalized = provider.lower().replace(" ", "_")
            iv = _pysecrets.token_bytes(12)
            aesgcm = AESGCM(proxy_key)
            ct = aesgcm.encrypt(iv, url.encode("utf-8"), normalized.encode("utf-8"))
            env_lines.append(f"{normalized}_key={iv.hex()}:{ct.hex()}")

        env_path = BASE_DIR / ".env"
        env_path.write_text("\n".join(sorted(env_lines)) + "\n", encoding="utf-8")
        os.chmod(env_path, 0o600)
        print()
        print(c("green", f"  .env écrit ({len(api_keys)} clés API + {len(local_keys)} locales)"))
        print(c("gray", "  CETAS_VAULT_PASSWORD=... python3 server/encrypt_keys.py pour regénérer"))

    def _migrate_opencode_keys(secrets: dict, password: str):
        """Renomme l'ancienne clé OpenCode (mono) en 'OpenCode Zen' — idempotent.
        Préserve le AAD : l'env reste 'opencode' pour Zen, 'opencode-go' pour Go."""
        try:
            keys = secrets.get("api_keys")
            if not keys or "OpenCode" not in keys:
                return
            if "OpenCode Zen" not in keys:
                keys["OpenCode Zen"] = keys.pop("OpenCode")
                save_secrets(password, secrets)
                _log.info("Migration OpenCode -> OpenCode Zen effectuée.")
        except Exception as e:
            _log.warning("Migration OpenCode Zen échouée: %s", e)

    def _manage_admin_accounts(secrets: dict, password: str) -> bool:
        print()
        print(c("cyan", "  ── Gestion des comptes administrateurs ──"))
        
        if "admins" not in secrets:
            secrets["admins"] = []
        
        while True:
            print()
            print(c("white", "  === Gestion des administrateurs ==="))
            print(c("white", "  1. Créer un compte administrateur"))
            print(c("white", "  2. Modifier un compte"))
            print(c("white", "  3. Supprimer un compte"))
            print(c("white", "  4. Lister les comptes"))
            print(c("white", "  0. Retour au menu principal"))
            print()
            choix = input(c("white", "  Votre choix : ")).strip()
            
            if choix == "0":
                _export_users_seed(secrets)
                _export_api_keys_seed(secrets)
                _export_env_file(secrets, password)
                break
            
            elif choix == "1":
                print()
                print(c("cyan", "  --- Création d'un compte administrateur ---"))
                
                username = input(c("white", "  Username : ")).strip()
                if not username:
                    print(c("red", "  Nom d'utilisateur invalide.\n"))
                    continue
                
                # Vérifier si l'utilisateur existe déjà
                if any(a["username"] == username for a in secrets["admins"]):
                    print(c("red", f"  L'utilisateur '{username}' existe déjà.\n"))
                    continue
                
                email = input(c("white", "  Email : ")).strip()
                if not email or "@" not in email:
                    print(c("red", "  Email invalide.\n"))
                    continue
                
                pwd1 = getpass.getpass(c("white", "  Mot de passe : "))
                pwd2 = getpass.getpass(c("white", "  Confirmer : "))
                
                if pwd1 != pwd2:
                    print(c("red", "  Les mots de passe ne correspondent pas.\n"))
                    continue
                
                if len(pwd1) < 6:
                    print(c("red", "  Minimum 6 caractères.\n"))
                    continue
                
                # Hachage du mot de passe (simple, à améliorer avec bcrypt)
                import hashlib
                pwd_hash = hashlib.sha256(pwd1.encode()).hexdigest()
                
                secrets["admins"].append({
                    "username": username,
                    "email": email,
                    "password_hash": pwd_hash,
                    "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
                })
                
                save_secrets(password, secrets)
                print(c("green", f"  ✅ Compte '{username}' créé avec succès.\n"))
            
            elif choix == "2":
                print()
                if not secrets["admins"]:
                    print(c("gray", "  Aucun compte administrateur enregistré.\n"))
                    continue
                
                print(c("cyan", "  --- Modification d'un compte ---"))
                for i, admin in enumerate(secrets["admins"], 1):
                    print(c("white", f"  {i}. {admin['username']} ({admin['email']})"))
                
                print()
                idx = input(c("white", "  Numéro du compte à modifier (0=annuler) : ")).strip()
                if not idx.isdigit() or int(idx) == 0:
                    continue
                
                idx = int(idx) - 1
                if idx < 0 or idx >= len(secrets["admins"]):
                    print(c("red", "  Numéro invalide.\n"))
                    continue
                
                admin = secrets["admins"][idx]
                print(c("gray", f"  Modifier l'utilisateur : {admin['username']}"))
                
                new_username = input(c("white", f"  Nouvel username [{admin['username']}] : ")).strip()
                if new_username:
                    if any(a["username"] == new_username for a in secrets["admins"] if a != admin):
                        print(c("red", "  Ce nom d'utilisateur est déjà pris.\n"))
                        continue
                    admin["username"] = new_username
                
                new_email = input(c("white", f"  Nouvel email [{admin['email']}] : ")).strip()
                if new_email:
                    if "@" not in new_email:
                        print(c("red", "  Email invalide.\n"))
                        continue
                    admin["email"] = new_email
                
                new_pwd = getpass.getpass(c("white", "  Nouveau mot de passe (entrée=conserver) : "))
                if new_pwd:
                    if len(new_pwd) < 6:
                        print(c("red", "  Minimum 6 caractères.\n"))
                        continue
                    import hashlib
                    admin["password_hash"] = hashlib.sha256(new_pwd.encode()).hexdigest()
                
                save_secrets(password, secrets)
                print(c("green", "  ✅ Compte modifié avec succès.\n"))
            
            elif choix == "3":
                print()
                if not secrets["admins"]:
                    print(c("gray", "  Aucun compte administrateur enregistré.\n"))
                    continue
                
                print(c("cyan", "  --- Suppression d'un compte ---"))
                for i, admin in enumerate(secrets["admins"], 1):
                    print(c("white", f"  {i}. {admin['username']} ({admin['email']})"))
                
                print()
                idx = input(c("white", "  Numéro du compte à supprimer (0=annuler) : ")).strip()
                if not idx.isdigit() or int(idx) == 0:
                    continue
                
                idx = int(idx) - 1
                if idx < 0 or idx >= len(secrets["admins"]):
                    print(c("red", "  Numéro invalide.\n"))
                    continue
                
                admin = secrets["admins"][idx]
                confirm = input(c("red", f"  Supprimer définitivement '{admin['username']}' ? [o/N] : ")).strip().lower()
                if confirm == "o":
                    del secrets["admins"][idx]
                    save_secrets(password, secrets)
                    print(c("green", "  ✅ Compte supprimé avec succès.\n"))
                else:
                    print(c("gray", "  Suppression annulée.\n"))
            
            elif choix == "4":
                print()
                if not secrets["admins"]:
                    print(c("gray", "  Aucun compte administrateur enregistré.\n"))
                    continue
                
                print(c("cyan", "  --- Liste des administrateurs ---"))
                for admin in secrets["admins"]:
                    print(c("white", f"  👤 {admin['username']}"))
                    print(c("gray", f"     📧 {admin['email']}"))
                    print(c("gray", f"     🕐 Créé le : {admin.get('created_at', 'N/A')}"))
                    print()
            
            else:
                print(c("red", "  Choix invalide.\n"))
        
        return True

    def _install_vault_guard():
        try:
            guard_config = VAULT_DIR / ".guard_config"
            guard_config.write_text(SECRETS_FILE)
            if _IS_WINDOWS:
                guard_script = BASE_DIR / "core" / "win" / "vault_guard.py"
            else:
                guard_script = BASE_DIR / "core" / "linux" / "vault_guard.py"
            if not guard_script.exists():
                return
            kwargs = dict(timeout=120)
            if _IS_WINDOWS:
                kwargs["capture_output"] = True
                kwargs["text"] = True
            r = subprocess.run(
                [sys.executable, str(guard_script), "install", SECRETS_FILE],
                **kwargs
            )
            if r.returncode == 0:
                print(c("green", "  [+] VaultGuard installe et demarre."))
            elif not _IS_WINDOWS:
                print(c("yellow", "  [!] VaultGuard install echoue. Lancez en root :"))
                print(c("gray", f"      sudo python {guard_script} install"))
            else:
                print(c("yellow", f"  [!] VaultGuard install echoue (code {r.returncode}):"))
                if r.stderr:
                    print(c("gray", f"      {r.stderr.strip()}"))
                if r.stdout:
                    print(c("gray", f"      {r.stdout.strip()}"))
        except Exception as _e:
            print(c("yellow", f"  [!] VaultGuard non installe : {_e}"))

    def _uninstall_vault_guard():
        try:
            guard_config = VAULT_DIR / ".guard_config"
            if guard_config.exists():
                guard_config.unlink()
            if _IS_WINDOWS:
                guard_script = BASE_DIR / "core" / "win" / "vault_guard.py"
            else:
                guard_script = BASE_DIR / "core" / "linux" / "vault_guard.py"
            if not guard_script.exists():
                return
            kwargs = dict(timeout=30)
            if _IS_WINDOWS:
                kwargs["capture_output"] = True
            subprocess.run(
                [sys.executable, str(guard_script), "remove"],
                **kwargs
            )
        except Exception:
            pass

    def _secure_delete_vault() -> bool:
        if not vault.exists():
            print(c("red", "  Aucun coffre à supprimer.\n"))
            return False

        print(c("yellow", "  Veuillez entrer le mot de passe du coffre pour confirmer la suppression."))
        pwd_check = getpass.getpass(c("white", "  Mot de passe : "))

        try:
            test_data = load_secrets(pwd_check)
            if test_data is None:
                print(c("red", "  ❌ Mot de passe incorrect. Suppression annulée.\n"))
                return False

            print(c("gray", "  ✅ Mot de passe vérifié. Suppression en cours..."))
            _uninstall_vault_guard()

            if not _IS_WINDOWS and os.path.exists(SECRETS_FILE):
                subprocess.run(["sudo", "chattr", "-i", SECRETS_FILE],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                parent = os.path.dirname(SECRETS_FILE)
                if os.path.exists(parent):
                    subprocess.run(["sudo", "chattr", "-i", parent],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

            if vault.delete():
                print(c("green", "  ✅ Coffre supprimé avec succès.\n"))
                if not _IS_WINDOWS:
                    parent = os.path.dirname(SECRETS_FILE)
                    if os.path.exists(parent):
                        subprocess.run(["sudo", "chattr", "-i", parent],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        import shutil
                        shutil.rmtree(parent, ignore_errors=True)
                        print(c("gray", "  Dossier .vault supprimé.\n"))
                return True
            else:
                print(c("red", "  ❌ Erreur lors de la suppression.\n"))
                return False

        except Exception as e:
            print(c("red", f"  ❌ Erreur : {e}\n"))
            return False

    def _configure_email(secrets: dict, password: str) -> bool:
        print()
        print(c("cyan", "  ── Configuration Email SMTP ──"))

        current_gmail = secrets.get("gmail", {})
        if current_gmail:
            print(c("gray", f"  Email actuel : {current_gmail.get('email', 'Non configure')}"))
            print(c("gray", f"  SMTP : {current_gmail.get('smtp_host', 'Non configure')}:{current_gmail.get('smtp_port', '')}"))
            modifier = input(c("yellow", "  Modifier cette configuration ? [O/n] : ")).strip().lower()
            if modifier == "n":
                print(c("gray", "  Configuration conservee.\n"))
                return True

        print()
        print(c("cyan",   "  ┌─ Gmail ──────────────────────────────────────────"))
        print(c("white",  "  │  1. myaccount.google.com → Securite"))
        print(c("white",  "  │  2. Activer validation en 2 etapes (obligatoire)"))
        print(c("white",  "  │  3. Mots de passe des applications → Creer"))
        print(c("white",  "  │  4. Copier le mot de passe 16 caracteres genere"))
        print(c("gray",   "  │  Format : xyz@gmail.com + mdp 16 car. sans espaces"))
        print()
        print(c("cyan",   "  ┌─ Outlook / Hotmail ──────────────────────────────"))
        print(c("white",  "  │  1. account.microsoft.com → Securite"))
        print(c("white",  "  │  2. Verification en deux etapes → Activer"))
        print(c("white",  "  │  3. Mot de passe d'application → Creer"))
        print(c("white",  "  │  4. SMTP : smtp-mail.outlook.com:587 (STARTTLS)"))
        print(c("gray",   "  │  Format : xyz@outlook.com / xyz@hotmail.com"))
        print()
        print(c("cyan",   "  ┌─ Email professionnel (ex: OVH, Infomaniak, etc.) "))
        print(c("white",  "  │  Utilise ton mot de passe email normal"))
        print(c("white",  "  │  SMTP fourni par ton hebergeur"))
        print(c("gray",   "  │  Ex OVH : ssl0.ovh.net:465"))
        print()

        while True:
            print(c("yellow", "  Fournisseur :"))
            print(c("white",  "  1. Gmail"))
            print(c("white",  "  2. Outlook / Hotmail"))
            print(c("white",  "  3. Email professionnel"))
            print(c("white",  "  0. Annuler"))
            print()
            fournisseur = input(c("white", "  Choix [1/2/3/0] : ")).strip()

            if fournisseur == "0":
                print(c("gray", "  Configuration annulee.\n"))
                return False

            if fournisseur == "1":
                smtp_host, smtp_port, smtp_ssl = "smtp.gmail.com", 465, True
                hint_email = "xyz@gmail.com"
                hint_pwd = "Mot de passe application 16 car. (sans espaces)"
            elif fournisseur == "2":
                smtp_host, smtp_port, smtp_ssl = "smtp-mail.outlook.com", 587, False
                hint_email = "xyz@outlook.com ou xyz@hotmail.com"
                hint_pwd = "Mot de passe application Microsoft"
            elif fournisseur == "3":
                smtp_host = input(c("white", "  Serveur SMTP (ex: ssl0.ovh.net) : ")).strip()
                smtp_port_str = input(c("white", "  Port SMTP [465] : ")).strip()
                smtp_port = int(smtp_port_str) if smtp_port_str.isdigit() else 465
                smtp_ssl = smtp_port == 465
                hint_email = "votre@email.pro"
                hint_pwd = "Mot de passe email"
            else:
                print(c("red", "  Choix invalide.\n"))
                continue

            email = input(c("white", f"  Email ({hint_email}) : ")).strip()
            if not email or "@" not in email:
                print(c("red", "  Email invalide.\n"))
                continue

            app_pwd = getpass.getpass(c("white", f"  {hint_pwd} : ")).strip().replace(" ", "")
            if not app_pwd:
                print(c("red", "  Mot de passe vide.\n"))
                continue

            print(c("gray", "  Test connexion SMTP ..."), end=" ", flush=True)
            try:
                if smtp_ssl:
                    with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=10) as srv:
                        srv.login(email, app_pwd)
                else:
                    with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as srv:
                        srv.starttls()
                        srv.login(email, app_pwd)
                print(c("green", "OK"))
                secrets["gmail"] = {
                    "email": email,
                    "password": app_pwd,
                    "smtp_host": smtp_host,
                    "smtp_port": smtp_port,
                    "smtp_ssl": smtp_ssl
                }
                save_secrets(password, secrets)
                print(c("green", f"  Email mis a jour : {email}"))
                print(c("gray", "  Coffre rechiffre avec succes.\n"))
                return True
            except smtplib.SMTPAuthenticationError:
                print(c("red", "ECHEC — Authentification refusee"))
            except Exception as e:
                print(c("red", f"ECHEC — {e}"))
            retry = input(c("yellow", "  Reessayer ? [O/n] : ")).strip().lower()
            if retry == "n":
                print(c("gray", "  Configuration annulee.\n"))
                return False

    _TERM_STATE = None
    if not _IS_WINDOWS:
        try:
            import termios
            _TERM_STATE = termios.tcgetattr(sys.stdin.fileno())
        except Exception as _e:
            _log.debug("Exception silenciee: %s", _e)

    try:
        print()
        print(c("cyan", "╔══════════════════════════════════════════════════╗"))
        print(c("cyan", "║") + c("bold", "        SETUP — Marexsoft CETAS                    ") + c("cyan", "║"))
        print(c("cyan", "╚══════════════════════════════════════════════════╝"))
        print()
        print(c("cyan", "  ┌─ ETAPE 1 : Coffre chiffre ───────────────────┐"))
        print()

        if vault.exists():
            overwrite = input(c("red", "  Coffre existant detecte. Ecraser ? [o/N] : ")).strip().lower()
            if overwrite != "o":
                password = getpass.getpass(c("white", "  Mot de passe du coffre : "))
                try:
                    secrets = load_secrets(password)
                    if secrets is None:
                        print(c("red", "  Mot de passe incorrect.\n"))
                        sys.exit(1)
                    _migrate_opencode_keys(secrets, password)
                    print(c("green", "  Coffre ouvert.\n"))
                except Exception as e:
                    print(c("red", f"  Erreur: {e}\n"))
                    sys.exit(1)

                while True:
                    print(c("cyan", "  ┌─ QUE VOULEZ-VOUS FAIRE ? ─────────────────────┐"))
                    print(c("white", "  1. Ajouter / Modifier une cle API"))
                    print(c("white", "  2. Supprimer une cle API"))
                    print(c("white", "  3. Voir les cles enregistrees"))
                    print(c("white", "  4. Changer le mot de passe du coffre"))
                    print(c("white", "  5. Remplacer le coffre (reset complet)"))
                    print(c("white", "  6. Gérer les comptes administrateurs"))
                    print(c("white", "  7. Configurer l'email SMTP"))
                    print(c("white", "  8. Supprimer le coffre (avec mot de passe)"))
                    print(c("white", "  0. Quitter"))
                    print()
                    choix = input(c("white", "  Votre choix : ")).strip()

                    if choix == "0":
                        _export_env_file(secrets, password)
                        print(c("gray", "  Au revoir.\n"))
                        sys.exit(0)

                    elif choix == "1":
                        print()
                        print(c("cyan", "  --- Ajouter / Modifier une cle API ---"))
                        print()
                        for k, (pname, _) in PROVIDERS.items():
                            existing = secrets.get("api_keys", {}).get(pname)
                            tag = c("green", "[OK]") if existing else c("gray", "[--]")
                            print(f"  {tag} {pname}")

                        print()
                        print(c("gray", "  ─── Providers locaux ───"))
                        for k, (ename, _) in LOCAL_ENGINES.items():
                            existing = secrets.get("local", {}).get(ename)
                            tag = c("green", "[OK]") if existing else c("gray", "[--]")
                            print(f"  {tag} {ename}")

                        print()
                        print(c("yellow", "  Que voulez-vous configurer ?"))
                        print(c("white", "  a. Configurer un provider API"))
                        print(c("white", "  l. Configurer un provider local"))
                        print(c("white", "  0. Retour"))
                        print()
                        choix_config = input(c("white", "  Votre choix [a/l/0] : ")).strip().lower()

                        if choix_config == "0":
                            continue
                        elif choix_config == "a":
                            while True:
                                choix_provider = _show_providers_menu(secrets)

                                if choix_provider == "0" or choix_provider == "r":
                                    break

                                selected_provider = None
                                for k, (pname, _) in PROVIDERS.items():
                                    if k == choix_provider:
                                        selected_provider = pname
                                        break

                                if not selected_provider:
                                    print(c("red", "  Choix invalide.\n"))
                                    continue

                                _configure_provider(
                                    secrets,
                                    selected_provider,
                                    PROVIDERS.get(choix_provider, ("", ""))[1],
                                    password,
                                    quick_mode=False
                                )
                                save_secrets(password, secrets)
                        elif choix_config == "l":
                            while True:
                                print()
                                print(c("cyan", "  ────────────────────────────────────────────────────────"))
                                print(c("white", "  Providers locaux :"))
                                print()
                                for k, (ename, _) in LOCAL_ENGINES.items():
                                    existing = secrets.get("local", {}).get(ename)
                                    if existing:
                                        status = c("green", f"✓ {existing}")
                                    else:
                                        status = c("gray", "─ Non configuré")
                                    print(c("white", f"  {k}. {ename:<15}") + f"  {status}")
                                print()
                                print(c("yellow", "  0. Retour"))
                                print()
                                choix_local = input(c("white", "  Choisir un provider local (ou 0) : ")).strip()

                                if choix_local == "0":
                                    break

                                selected_local = None
                                for k, (ename, default_url) in LOCAL_ENGINES.items():
                                    if k == choix_local:
                                        selected_local = (ename, default_url)
                                        break

                                if not selected_local:
                                    print(c("red", "  Choix invalide.\n"))
                                    continue

                                ename, default_url = selected_local
                                _configure_local_engine(secrets, ename, default_url)
                                save_secrets(password, secrets)
                        else:
                            print(c("red", "  Choix invalide.\n"))

                        print(c("green", "  Coffre mis a jour.\n"))

                    elif choix == "2":
                        print()
                        keys = list(secrets.get("api_keys", {}).keys())
                        local_keys = list(secrets.get("local", {}).keys())

                        if not keys and not local_keys:
                            print(c("gray", "  Aucune configuration enregistree.\n"))
                        else:
                            idx = 1
                            if keys:
                                print(c("white", "  Clés API :"))
                                for k in keys:
                                    print(c("white", f"  {idx}. {k}"))
                                    idx += 1
                            if local_keys:
                                print()
                                print(c("white", "  Providers locaux :"))
                                for k in local_keys:
                                    print(c("white", f"  {idx}. {k} (local)"))
                                    idx += 1
                            print()
                            sel = input(c("white", "  Numero a supprimer (Entree=annuler) : ")).strip()
                            if sel.isdigit() and 1 <= int(sel) < idx:
                                idx_sel = int(sel)
                                all_keys = list(secrets.get("api_keys", {}).keys()) + list(secrets.get("local", {}).keys())
                                nom = all_keys[idx_sel - 1]
                                confirm = input(c("red", f"  Supprimer {nom} ? [o/N] : ")).strip().lower()
                                if confirm == "o":
                                    if nom in secrets.get("api_keys", {}):
                                        del secrets["api_keys"][nom]
                                    elif nom in secrets.get("local", {}):
                                        del secrets["local"][nom]
                                    save_secrets(password, secrets)
                                    print(c("green", f"  {nom} supprime.\n"))
                            else:
                                print(c("gray", "  Annule.\n"))

                    elif choix == "3":
                        print()
                        keys = secrets.get("api_keys", {})
                        if keys:
                            print(c("white", "  Clés API :"))
                            for pname, key in keys.items():
                                masked = key[:6] + "..." + key[-4:] if len(key) > 10 else "****"
                                print(c("white", f"  {pname} : ") + c("green", masked))
                        else:
                            print(c("gray", "  Aucune cle API enregistree."))

                        local = secrets.get("local", {})
                        if local:
                            print()
                            print(c("white", "  Providers locaux :"))
                            for ename, url in local.items():
                                print(c("white", f"  {ename} : ") + c("green", url))
                        else:
                            print(c("gray", "  Aucun provider local enregistre."))
                        print()

                    elif choix == "4":
                        print()
                        while True:
                            pwd1 = getpass.getpass(c("white", "  Nouveau mot de passe : "))
                            pwd2 = getpass.getpass(c("white", "  Confirmer            : "))
                            if pwd1 == pwd2 and len(pwd1) >= 12:
                                password = pwd1
                                save_secrets(password, secrets)
                                print(c("green", "  Mot de passe modifie et coffre mis a jour.\n"))
                                break
                            elif pwd1 != pwd2:
                                print(c("red", "  Les mots de passe ne correspondent pas.\n"))
                            else:
                                print(c("red", "  Minimum 12 caracteres.\n"))

                    elif choix == "5":
                        print()
                        print(c("red", "  ╔═══════════════════════════════════════════════════════════╗"))
                        print(c("red", "  ║  ⚠️  ATTENTION : RESET COMPLET DU COFFRE                 ║"))
                        print(c("red", "  ║                                                           ║"))
                        print(c("red", "  ║  ➜ Toutes les cles API seront supprimees                 ║"))
                        print(c("red", "  ║  ➜ La configuration email sera supprimee                 ║"))
                        print(c("red", "  ║  ➜ Les providers locaux seront supprimes                 ║"))
                        print(c("red", "  ║  ➜ Le coffre sera vide et un nouveau mot de passe        ║"))
                        print(c("red", "  ║     vous sera demande                                    ║"))
                        print(c("red", "  ╚═══════════════════════════════════════════════════════════╝"))
                        print()

                        confirm = input(c("red", "  Confirmer le reset complet ? [o/N] : ")).strip().lower()
                        if confirm == "o":
                            print(c("yellow", "  Veuillez entrer le mot de passe actuel du coffre pour confirmer."))
                            pwd_check = getpass.getpass(c("white", "  Mot de passe actuel : "))

                            try:
                                test_data = load_secrets(pwd_check)
                                if test_data is None:
                                    print(c("red", "  ❌ Mot de passe incorrect. Reset annulé.\n"))
                                    continue

                                print(c("gray", "  ✅ Mot de passe vérifié. Réinitialisation en cours..."))

                                _uninstall_vault_guard()

                                if not _IS_WINDOWS and os.path.exists(SECRETS_FILE):
                                    subprocess.run(["sudo", "chattr", "-i", SECRETS_FILE],
                                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                                    parent = os.path.dirname(SECRETS_FILE)
                                    if os.path.exists(parent):
                                        subprocess.run(["sudo", "chattr", "-i", parent],
                                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

                                if vault.delete():
                                    print(c("green", "  ✅ Ancien coffre supprimé."))
                                else:
                                    print(c("red", "  ❌ Erreur lors de la suppression."))
                                    continue

                                secrets = {"api_keys": {}, "admins": []}

                                print()
                                print(c("cyan", "  --- Nouveau mot de passe pour le coffre ---"))
                                print(c("gray", f"  (Générez un mot de passe fort: {SecureVault.generate_password(20)})"))
                                print()
                                while True:
                                    pwd1 = getpass.getpass(c("white", "  Nouveau mot de passe : "))
                                    pwd2 = getpass.getpass(c("white", "  Confirmer            : "))
                                    if pwd1 == pwd2 and len(pwd1) >= 12:
                                        password = pwd1
                                        break
                                    elif pwd1 != pwd2:
                                        print(c("red", "  Les mots de passe ne correspondent pas.\n"))
                                    else:
                                        print(c("red", "  Minimum 12 caracteres.\n"))

                                save_secrets(password, secrets)
                                print(c("green", "  ✅ Coffre reinitialise avec succes."))
                                print(c("gray", f"  Nouveau coffre cree : {SECRETS_FILE}"))
                                print(c("gray", "  Chiffrement : AES-256-GCM | Scrypt (N=2^16) | AEAD via GCM"))
                                print(c("gray", f"  Taille : {vault.get_size()} octets"))
                                print()

                                print(c("yellow", "  Le coffre est maintenant vide."))
                                print()

                            except Exception as e:
                                print(c("red", f"  ❌ Erreur : {e}\n"))
                        else:
                            print(c("gray", "  Reset annule.\n"))

                    elif choix == "6":
                        _manage_admin_accounts(secrets, password)

                    elif choix == "7":
                        _configure_email(secrets, password)

                    elif choix == "8":
                        print()
                        confirm = input(c("red", "  ATTENTION : Suppression definitive du coffre. Confirmer ? [o/N] : ")).strip().lower()
                        if confirm == "o":
                            if _secure_delete_vault():
                                print(c("red", "  Le coffre a ete supprime. Fin du programme."))
                                sys.exit(0)
                        else:
                            print(c("gray", "  Suppression annulee.\n"))

                    else:
                        print(c("red", "  Choix invalide.\n"))

                sys.exit(0)

            else:
                print(c("yellow", "  Veuillez entrer le mot de passe actuel du coffre pour confirmer l'écrasement."))
                pwd_check = getpass.getpass(c("white", "  Mot de passe actuel : "))
                try:
                    test_data = load_secrets(pwd_check)
                    if test_data is None:
                        print(c("red", "  Mot de passe incorrect. Écrasement annulé.\n"))
                        sys.exit(1)
                except Exception:
                    print(c("red", "  Mot de passe incorrect. Écrasement annulé.\n"))
                    sys.exit(1)

                if vault.delete():
                    print(c("green", "  Ancien coffre supprimé.\n"))
                else:
                    print(c("red", "  Erreur lors de la suppression du coffre.\n"))
                    sys.exit(1)

        secrets = {"api_keys": {}, "admins": []}
        print(c("cyan", "  --- Mot de passe coffre ---"))
        print(c("gray", f"  (Générez un mot de passe fort: {SecureVault.generate_password(20)})"))
        print()
        while True:
            pwd1 = getpass.getpass(c("white", "  Nouveau mot de passe : "))
            pwd2 = getpass.getpass(c("white", "  Confirmer            : "))
            if pwd1 == pwd2 and len(pwd1) >= 12:
                password = pwd1
                print(c("green", "  Mot de passe valide.\n"))
                break
            elif pwd1 != pwd2:
                print(c("red", "  Les mots de passe ne correspondent pas.\n"))
            else:
                print(c("red", "  Minimum 12 caracteres.\n"))

        print(c("cyan", "  --- Cles API (Entree = passer) ---"))
        print(c("gray", "  Chaque cle est testee avant enregistrement."))
        print()

        FIRST_PROVIDERS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]

        print(c("cyan", "  ─── Configuration des 5 providers principaux ───"))
        print(c("gray", "  (Appuyez sur Entree pour passer instantanement)"))
        print()

        for k in FIRST_PROVIDERS:
            pname, hint = PROVIDERS[k]
            _configure_provider(secrets, pname, hint, password, quick_mode=True)

        save_secrets(password, secrets)

        print()
        print(c("cyan", "  ─── Autres providers ───"))
        print(c("white", "  Voulez-vous configurer d'autres providers ?"))
        print(c("gray", "  (Anthropic, OpenAI, Grok, Perplexity, Google, Mistral, Qwen, Kimi, GLM, OpenCode, et providers locaux)"))
        print()
        choix = input(c("white", "  Voir la liste complete ? [O/n] : ")).strip().lower()

        if choix != "n":
            while True:
                choix_provider = _show_providers_menu(secrets)

                if choix_provider == "0" or choix_provider == "r":
                    break

                if choix_provider.startswith("l") or choix_provider.startswith("L"):
                    local_key = choix_provider.upper()
                    selected_local = None
                    for k, (ename, default_url) in LOCAL_ENGINES.items():
                        if k == local_key or k == choix_provider:
                            selected_local = (ename, default_url)
                            break

                    if selected_local:
                        ename, default_url = selected_local
                        _configure_local_engine(secrets, ename, default_url)
                        save_secrets(password, secrets)
                        continue
                    else:
                        print(c("red", "  Choix local invalide.\n"))
                        continue

                selected_provider = None
                for k, (pname, _) in PROVIDERS.items():
                    if k == choix_provider:
                        selected_provider = pname
                        break

                if not selected_provider:
                    print(c("red", "  Choix invalide.\n"))
                    continue

                _configure_provider(
                    secrets,
                    selected_provider,
                    PROVIDERS.get(choix_provider, ("", ""))[1],
                    password,
                    quick_mode=False
                )
                save_secrets(password, secrets)
        else:
            print(c("gray", "  Configuration des providers supplementaires ignoree.\n"))

        save_secrets(password, secrets)
        _export_env_file(secrets, password)
        print(c("green", f"  Coffre cree : {SECRETS_FILE}"))
        print(c("gray", "  Chiffrement : AES-256-GCM | Scrypt (N=2^16) | AEAD via GCM"))
        print(c("gray", f"  Taille : {vault.get_size()} octets"))
        _install_vault_guard()
        print()

        # ============================================================
        # ÉTAPE 4 : GESTION DES COMPTES ADMINISTRATEURS (NOUVEAU)
        # ============================================================
        print(c("cyan", "  ┌─ ETAPE 4 : Gestion des comptes administrateurs ─┐"))
        print()
        print(c("yellow", "  Créez vos comptes administrateurs pour accéder à CETAS."))
        print(c("gray", "  Vous pouvez créer plusieurs comptes."))
        print()
        print(c("white", "  Voulez-vous créer un compte administrateur maintenant ?"))
        print(c("white", "  [O]ui / [N]on (passer pour l'instant)"))
        print()
        configurer_admin = input(c("white", "  Votre choix [O/n] : ")).strip().lower()

        if configurer_admin != "n":
            _manage_admin_accounts(secrets, password)
        else:
            print(c("gray", "  Configuration des comptes administrateurs ignorée."))
            print(c("yellow", "  Pour gérer les comptes plus tard :"))
            print(c("gray", "  1. Relancez setup.py"))
            print(c("gray", "  2. Dans le menu, choisissez l'option 6 (Gérer les comptes administrateurs)"))
            print()

        # ============================================================
        # ÉTAPE 5 : EMAIL SMTP (optionnel)
        # ============================================================
        print(c("cyan", "  ┌─ ETAPE 5 : Email SMTP (optionnel) ─────────────┐"))
        print()
        print(c("yellow", "  Un email SMTP est requis pour l'envoi des emails de verification."))
        print(c("gray", "  Vous pouvez configurer maintenant ou plus tard via le menu."))
        print()
        print(c("white", "  Configurer l'email maintenant ?"))
        print(c("white", "  [O]ui / [N]on (passer pour l'instant)"))
        print()
        configurer_email = input(c("white", "  Votre choix [O/n] : ")).strip().lower()

        if configurer_email != "n":
            _configure_email(secrets, password)
        else:
            print(c("gray", "  Configuration email ignoree. Vous pourrez la configurer plus tard."))
            print(c("yellow", "  Pour configurer l'email plus tard :"))
            print(c("gray", "  1. Relancez setup.py"))
            print(c("gray", "  2. Dans le menu, choisissez l'option 7 (Configurer l'email SMTP)"))
            print()

        print(c("cyan", "  ══════════════════════════════════════════════════"))
        print(c("green", "  ✅ Setup CETAS terminé avec succès."))
        print(c("red", "  ⚠️  IMPORTANT : supprimez ce fichier setup.py du serveur."))
        print(c("gray", "  rm /home/sam/kiro/setup.py"))
        print(c("cyan", "  ══════════════════════════════════════════════════"))
        print(c("gray", ""))
        print(c("white", "  © Marexsoft Corporation — Tous droits reserves"))
        print(c("gray", ""))

    except Exception as e:
        print(f"\n  Erreur : {e}")
    finally:
        if _IS_WINDOWS and vault.exists():
            _install_vault_guard()
        if not _IS_WINDOWS:
            try:
                if _TERM_STATE is not None:
                    termios.tcsetattr(sys.stdin.fileno(), termios.TCSANOW, _TERM_STATE)
            except Exception:
                subprocess.run(["stty", "sane"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n  Interruption par l'utilisateur.")
        sys.exit(0)
    except Exception as e:
        _log.exception("Erreur fatale: %s", e)
        print(f"\n  Erreur fatale: {e}")
        sys.exit(1)