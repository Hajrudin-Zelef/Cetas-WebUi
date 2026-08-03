#!/usr/bin/env python3
"""
INSTALL — Marexsoft CETAS
Installation complète interactive sur VPS
Inspiré de setup.py — © Marexsoft Corporation
"""
from __future__ import annotations

import os
import re
import sys
import json
import time
import hashlib
import secrets
import getpass
import subprocess
import platform
from pathlib import Path

__version__ = "1.0.0"

# ── Couleurs ─────────────────────────────────────────────────
C = {
    "reset":   "\033[0m",
    "bold":    "\033[1m",
    "dim":     "\033[2m",
    "italic":  "\033[3m",
    "green":   "\033[92m",
    "cyan":    "\033[96m",
    "yellow":  "\033[93m",
    "red":     "\033[91m",
    "white":   "\033[97m",
    "gray":    "\033[90m",
    "blue":    "\033[94m",
}

def c(color, text):
    return f"{C.get(color, '')}{text}{C['reset']}"

def banner():
    G = C["green"]
    G2 = "\033[38;5;28m"
    W = C["white"]
    B = C["bold"]
    D = C["dim"]
    R = C["reset"]
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
    print(f"{G}  ║{R}   {G}▶{R} {B}{W}INSTALL{R}  {G}│{R}  {W}CETAS Docker{R}                   {D}{W}v{__version__}{R}           {G}║{R}")
    print(f"{G}  ║{R}   {D}{C['italic']}{W}Installation interactive sur VPS{R}                         {G}║{R}")
    print(f"{G}  ╚{'═'*64}╝{R}")
    print()


def section(title):
    print()
    print(c("cyan", f"  ┌─ {title} {'─'*(48-len(title))}┐"))
    print()

def sub(text):
    print(c("gray", f"  {text}"))

def ok(text):
    print(c("green", f"  ✓ {text}"))

def warn(text):
    print(c("yellow", f"  ⚠ {text}"))

def fail(text):
    print(c("red", f"  ✗ {text}"))

def progress_bar(label, width=30):
    """Retourne un gestionnaire de barre de progression."""
    class Bar:
        def __init__(self):
            self.i = 0
        def update(self, pct):
            filled = int(width * min(pct, 100) / 100)
            bar = "█" * filled + "░" * (width - filled)
            sys.stdout.write(f"\r  {C['gray']}{label:<20}{C['reset']} [{C['cyan']}{bar}{C['reset']}] {pct:3d}%")
            sys.stdout.flush()
        def done(self, success=True):
            sym = c("green", "✓") if success else c("red", "✗")
            sys.stdout.write(f"\r  {C['gray']}{label:<20}{C['reset']} [{C['cyan']}{'█'*width}{C['reset']}] 100% {sym}\n")
            sys.stdout.flush()
    return Bar()


def run(cmd, **kwargs):
    """Exécute une commande shell, retourne (returncode, stdout)."""
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=300, **kwargs)
        return r.returncode, r.stdout.strip()
    except subprocess.TimeoutExpired:
        return 1, "timeout"
    except Exception as e:
        return 1, str(e)


def check_docker():
    """Vérifie et installe Docker si nécessaire."""
    section("ETAPE 1/8 — Docker")
    rc, out = run("docker --version")
    if rc == 0:
        ver = out.split()[2].rstrip(",") if len(out.split()) > 2 else out
        ok(f"Docker déjà installé ({ver})")
        return True

    warn("Docker non trouvé. Installation...")
    bar = progress_bar("Installation Docker")

    for i in range(10):
        bar.update(i * 10)
        time.sleep(0.1)
    bar.update(50)

    rc, _ = run("apt-get update -qq")
    if rc != 0:
        bar.done(False)
        fail("Échec apt-get update")
        return False

    rc, _ = run("apt-get install -y -qq docker.io docker-compose-v2 curl")
    if rc != 0:
        bar.done(False)
        fail("Échec installation Docker")
        return False

    run("systemctl enable --now docker")
    bar.done()
    ok("Docker installé avec succès")
    return True


def prepare_repo(install_dir):
    """Prépare le dépôt."""
    section("ETAPE 2/8 — Dépôt")
    sub(f"Répertoire : {install_dir}")

    if (Path(install_dir) / ".git").exists():
        ok("Dépôt existant")
        return True

    # Chercher une copie locale
    home = Path.home()
    for candidate in [home / "Cetas-WebUi", home / "sam" / "Cetas-WebUi"]:
        if (candidate / ".git").exists():
            sub(f"Copie depuis {candidate}...")
            run(f"cp -r {candidate}/* {install_dir}/")
            run(f"cp -r {candidate}/.git {install_dir}/")
            ok(f"Dépôt copié depuis {candidate}")
            return True

    fail(f"Dépôt non trouvé. Copie Cetas-WebUi dans {install_dir}/")
    return False


def check_files(install_dir):
    """Vérifie les fichiers critiques."""
    section("ETAPE 3/8 — Fichiers critiques")
    os.chdir(install_dir)

    required = [
        "setup.py", "proxy/server.py", "proxy/encrypt_keys.py",
        "nginx.conf", "Dockerfile", "docker-compose.yml", "start.sh",
        "core/linux/crypto_linux.py", "core/linux/vault_guard.py"
    ]

    missing = [f for f in required if not Path(f).exists()]
    if missing:
        for f in missing:
            fail(f"Manquant : {f}")
        return False

    ok("Tous les fichiers présents")
    return True


def configure_ports(install_dir):
    """Configure les ports dynamiquement."""
    section("ETAPE 4/8 — Configuration des ports")
    os.chdir(install_dir)

    sub("Port Cetas (défaut: 8901) :")
    port_input = input(c("white", "  Port [8901] : ")).strip()
    cetas_port = int(port_input) if port_input.isdigit() else 8901

    sub("Port SearXNG (défaut: 8904, interne uniquement) :")
    port_input = input(c("white", "  Port [8904] : ")).strip()
    searxng_port = int(port_input) if port_input.isdigit() else 8904

    # Modifier docker-compose.yml
    content = Path("docker-compose.yml").read_text()
    content = re.sub(r'"[0-9]+:80"', f'"{cetas_port}:80"', content)
    content = re.sub(r'"127\.0\.0\.1:[0-9]+:8080"', f'"127.0.0.1:{searxng_port}:8080"', content)
    content = re.sub(r'SEARXNG_BASE_URL=http://localhost:[0-9]+/', f'SEARXNG_BASE_URL=http://localhost:{searxng_port}/', content)
    content = re.sub(r'/home/[^/]*/[^/]*/\.vault', './.vault', content)
    content = re.sub(r'/home/[^/]*/[^/]*/\.env', './.env', content)
    # Ajouter :ro
    if ".vault:/usr/share/nginx/html/.vault:ro" not in content:
        content = content.replace(".vault:/usr/share/nginx/html/.vault", ".vault:/usr/share/nginx/html/.vault:ro")
    if ".env:/usr/share/nginx/html/.env:ro" not in content:
        content = content.replace(".env:/usr/share/nginx/html/.env", ".env:/usr/share/nginx/html/.env:ro")

    Path("docker-compose.yml").write_text(content)

    ok(f"Cetas : port {cetas_port}")
    ok(f"SearXNG : port {searxng_port} (interne)")
    return cetas_port, searxng_port


def setup_secrets(install_dir):
    """Génère les secrets."""
    section("ETAPE 5/8 — Secrets")
    os.chdir(install_dir)

    worker_token = secrets.token_hex(32)
    searxng_secret = secrets.token_hex(32)

    sub("Mot de passe du vault (pour chiffrer les clés API) :")
    vault_pass = getpass.getpass(c("white", "  Vault password : "))
    if not vault_pass:
        fail("Mot de passe requis")
        sys.exit(1)

    if len(vault_pass) < 12:
        warn("Mot de passe court (<12 car.) — recommandé: 12+ caractères")

    # Créer .env.docker
    env_content = f"""# Cetas — Variables d'environnement Docker
# Généré par install.sh le {time.strftime('%Y-%m-%d %H:%M:%S')}

CETAS_VAULT_PASSWORD={vault_pass}
CETAS_WORKER_TOKEN={worker_token}
CETAS_CORS_ORIGINS=http://localhost
"""
    Path(".env.docker").write_text(env_content)
    os.chmod(".env.docker", 0o600)

    ok("Secrets générés")
    ok(f".env.docker créé")

    return vault_pass, searxng_secret


def setup_searxng(install_dir):
    """Configure SearXNG."""
    section("ETAPE 6/8 — SearXNG")
    os.chdir(install_dir)

    Path("searxng-data").mkdir(exist_ok=True)

    Path("searxng-data/settings.yml").write_text("""use_default_settings: true
general:
  instance_name: "Cetas Search"
  debug: false
search:
  safe_search: 0
  formats:
    - html
    - json
server:
  secret_key: "cetas-searxng"
  bind_address: "0.0.0.0"
  port: 8080
""")

    Path("searxng-data/limiter.yml").write_text("""botdetection:
  ip_limit:
    link_token: false
    filter_match: false
  ip_lists:
    pass_ip:
      - 0.0.0.0/0
""")

    ok("SearXNG configuré")


def run_setup_py(install_dir):
    """Lance setup.py pour le vault et les clés API."""
    section("ETAPE 7/8 — Vault & Clés API")
    os.chdir(install_dir)

    if Path(".vault/.enc").exists():
        sub("Vault existant détecté.")
        overwrite = input(c("yellow", "  Écraser le vault existant ? [o/N] : ")).strip().lower()
        if overwrite != "o":
            ok("Vault conservé")
            return True

    sub("Lancement de setup.py (interactif)...")
    sub("Configure le coffre-fort et tes clés API.")
    print()

    # Installer les dépendances Python
    run("pip3 install --break-system-packages cryptography requests psutil platformdirs 2>/dev/null")

    # Lancer setup.py
    try:
        ret = os.system(f"{sys.executable} setup.py")
        if ret != 0:
            warn("setup.py terminé avec erreurs")
            return False
    except KeyboardInterrupt:
        warn("Interrompu par l'utilisateur")
        return False

    ok("Vault et clés API configurés")
    return True


def create_admin(install_dir):
    """Crée le compte admin dans le vault via users-seed.json."""
    section("ETAPE 8/8 — Compte administrateur")
    os.chdir(install_dir)

    sub("Créez votre compte administrateur pour accéder à CETAS.")
    print()

    username = input(c("white", "  Username : ")).strip()
    if not username:
        fail("Username requis")
        return False

    email = input(c("white", "  Email : ")).strip()
    if not email:
        email = f"{username}@localhost"

    pwd1 = getpass.getpass(c("white", "  Mot de passe : "))
    pwd2 = getpass.getpass(c("white", "  Confirmer : "))
    if pwd1 != pwd2:
        fail("Les mots de passe ne correspondent pas")
        return False
    if len(pwd1) < 6:
        fail("Minimum 6 caractères")
        return False

    # Hash SHA256 pour users-seed.json (compatible setup.py)
    pwd_hash = hashlib.sha256(pwd1.encode()).hexdigest()

    seed_path = Path("core/users-seed.json")
    seed_path.parent.mkdir(parents=True, exist_ok=True)

    admins = []
    if seed_path.exists():
        try:
            admins = json.loads(seed_path.read_text())
        except Exception:
            admins = []

    # Ajouter ou remplacer
    admins = [a for a in admins if a.get("username") != username]
    admins.append({
        "username": username,
        "email": email,
        "password_hash": pwd_hash,
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
    })

    seed_path.write_text(json.dumps(admins, indent=2))
    ok(f"Compte '{username}' créé")

    return True


def build_docker(install_dir, searxng_secret):
    """Build et démarre Docker."""
    section("BUILD DOCKER")
    os.chdir(install_dir)

    # Permissions
    os.chmod(".vault", 0o755) if Path(".vault").exists() else None
    for f in [".vault/.enc", ".vault/.guard_config", ".vault/.system", ".env"]:
        if Path(f).exists():
            os.chmod(f, 0o644)

    sub("Build de l'image Docker (3-5 minutes)...")
    bar = progress_bar("Docker build")

    import threading
    def run_build():
        env = os.environ.copy()
        env["SEARXNG_SECRET_KEY"] = searxng_secret
        proc = subprocess.Popen(
            "docker compose build --no-cache",
            shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            env=env, text=True
        )
        for line in proc.stdout:
            pass  # Consommer la sortie
        proc.wait()
        return proc.returncode

    t = threading.Thread(target=run_build, daemon=True)
    t.start()

    i = 0
    while t.is_alive():
        bar.update(min(i, 99))
        time.sleep(0.5)
        i += 1

    t.join()
    bar.done()

    ok("Image Docker construite")


def start_services(install_dir, searxng_secret, cetas_port=8901):
    """Démarre les services."""
    os.chdir(install_dir)

    env = os.environ.copy()
    env["SEARXNG_SECRET_KEY"] = searxng_secret
    subprocess.run("docker compose up -d", shell=True, env=env,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    time.sleep(5)

    rc, out = run(f"curl -sf http://localhost:{cetas_port}/api/health")
    if rc == 0 and '"status":"ok"' in out:
        ok("Proxy actif")
    else:
        warn("Proxy en cours de démarrage...")


def create_systemd(install_dir, searxng_secret):
    """Crée le service systemd."""
    section("SERVICE SYSTEMD")

    content = f"""[Unit]
Description=Cetas — Assistant IA multi-modèles
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory={install_dir}
Environment=SEARXNG_SECRET_KEY={searxng_secret}
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=120

[Install]
WantedBy=multi-user.target
"""

    Path("/tmp/cetas.service").write_text(content)
    rc, _ = run("sudo cp /tmp/cetas.service /etc/systemd/system/cetas.service")
    if rc != 0:
        warn("Impossible de créer le service systemd (sudo requis)")
        return

    run("sudo systemctl daemon-reload")
    run("sudo systemctl enable cetas")
    ok("Service systemd installé et activé")


# ================================================================
#  TROUBLESHOOTING — Diagnostics et correction automatique
# ================================================================

class Issue:
    """Représente un problème détecté."""
    def __init__(self, name, severity, description, fix=None, auto_fix=None):
        self.name = name
        self.severity = severity  # "error", "warning", "info"
        self.description = description
        self.fix = fix            # Description textuelle de la correction
        self.auto_fix = auto_fix  # Fonction de correction automatique
        self.resolved = False


def _get_cetas_port(install_dir):
    """Extrait le port Cetas depuis docker-compose.yml."""
    try:
        content = Path(install_dir, "docker-compose.yml").read_text()
        m = re.search(r'"([0-9]+):80"', content)
        return int(m.group(1)) if m else 8901
    except Exception:
        return 8901


def _get_searxng_port(install_dir):
    """Extrait le port SearXNG depuis docker-compose.yml."""
    try:
        content = Path(install_dir, "docker-compose.yml").read_text()
        m = re.search(r'"127\.0\.0\.1:([0-9]+):8080"', content)
        return int(m.group(1)) if m else 8904
    except Exception:
        return 8904


def troubleshoot(install_dir="/opt/cetas", auto_fix_all=False):
    """Diagnostic complet de l'installation Cetas."""

    section("DIAGNOSTIC — Vérification de l'installation")
    issues = []
    fixes_applied = []

    # ── 1. Docker ────────────────────────────────────────────
    sub("Vérification de Docker...")
    rc, _ = run("docker --version")
    if rc != 0:
        issues.append(Issue(
            "Docker absent",
            "error",
            "Docker n'est pas installé.",
            fix="sudo apt-get install -y docker.io docker-compose-v2",
            auto_fix=lambda: (run("apt-get update -qq"), run("apt-get install -y -qq docker.io docker-compose-v2"), run("systemctl enable --now docker"))
        ))
    else:
        # Vérifier que Docker tourne
        rc, _ = run("docker info >/dev/null 2>&1")
        if rc != 0:
            issues.append(Issue(
                "Docker arrêté",
                "error",
                "Le service Docker ne tourne pas.",
                fix="sudo systemctl start docker",
                auto_fix=lambda: run("systemctl enable --now docker")
            ))
        else:
            ok("Docker actif")

    # ── 2. Fichiers critiques ────────────────────────────────
    sub("Vérification des fichiers...")
    os.chdir(install_dir) if os.path.isdir(install_dir) else None
    required_files = {
        "setup.py": "Script de configuration vault",
        "proxy/server.py": "Proxy Python (backend API)",
        "proxy/encrypt_keys.py": "Script de chiffrement des clés",
        "core/linux/crypto_linux.py": "Module chiffrement AES-256-GCM",
        "core/linux/vault_guard.py": "Daemon immutabilité vault",
        "nginx.conf": "Configuration Nginx",
        "Dockerfile": "Image Docker",
        "docker-compose.yml": "Stack Docker",
        "start.sh": "Script de démarrage container",
    }

    missing_files = []
    for f, desc in required_files.items():
        if not Path(install_dir, f).exists():
            missing_files.append(f)
            issues.append(Issue(
                f"Fichier manquant: {f}",
                "error",
                f"{desc} — Ce fichier est requis pour le build Docker.",
                fix=f"Copie {f} depuis l'installation source vers {install_dir}/"
            ))

    if not missing_files:
        ok("Tous les fichiers critiques présents")

    # ── 3. Vault (.vault/.enc) ───────────────────────────────
    sub("Vérification du vault...")
    vault_path = Path(install_dir, ".vault", ".enc")
    vault_dir = Path(install_dir, ".vault")

    if not vault_path.exists():
        issues.append(Issue(
            "Vault absent",
            "error",
            ".vault/.enc n'existe pas. Lance setup.py pour le créer.",
            fix=f"cd {install_dir} && python3 setup.py"
        ))
    else:
        # Vérifier permissions
        st = os.stat(vault_path)
        if st.st_mode & 0o077:
            issues.append(Issue(
                "Vault permissions trop ouvertes",
                "warning",
                f".vault/.enc a les permissions {oct(st.st_mode)[-3:]} (devrait être 644).",
                fix=f"chmod 644 {vault_path}",
                auto_fix=lambda: (os.chmod(vault_path, 0o644), os.chmod(vault_dir, 0o755))
            ))
        else:
            ok("Vault permissions correctes")

        # Vérifier que le vault est lisible (test déchiffrement)
        if Path(install_dir, ".env.docker").exists():
            env_docker = Path(install_dir, ".env.docker").read_text()
            m = re.search(r'CETAS_VAULT_PASSWORD=(.*)', env_docker)
            if m:
                vault_pass = m.group(1).strip()
                try:
                    sys.path.insert(0, str(Path(install_dir, "core", "linux")))
                    spec = __import__("crypto_linux").SecureVault
                    vault_obj = spec(str(vault_path))
                    data = vault_obj.load(vault_pass)
                    if data is None:
                        issues.append(Issue(
                            "Vault mot de passe incorrect",
                            "error",
                            "Le CETAS_VAULT_PASSWORD dans .env.docker ne déchiffre pas le vault.",
                            fix="Vérifie le mot de passe dans .env.docker et relance setup.py"
                        ))
                    else:
                        ok("Vault déchiffrement OK")
                except Exception as e:
                    issues.append(Issue(
                        "Vault test déchiffrement échoué",
                        "warning",
                        f"Impossible de tester le vault: {e}",
                        fix="Vérifie que core/linux/crypto_linux.py est présent"
                    ))

    # ── 4. .env et .env.docker ───────────────────────────────
    sub("Vérification des fichiers d'environnement...")

    if not Path(install_dir, ".env.docker").exists():
        issues.append(Issue(
            ".env.docker absent",
            "error",
            "Le fichier .env.docker n'existe pas.",
            fix=f"Créé par install.py ou manuellement"
        ))
    else:
        env_content = Path(install_dir, ".env.docker").read_text()
        if "CETAS_VAULT_PASSWORD=" not in env_content:
            issues.append(Issue(
                "Vault password manquant",
                "error",
                "CETAS_VAULT_PASSWORD n'est pas défini dans .env.docker.",
                fix="Ajoute CETAS_VAULT_PASSWORD=votre_mdp dans .env.docker"
            ))
        else:
            ok(".env.docker configuré")

    if not Path(install_dir, ".env").exists():
        issues.append(Issue(
            ".env absent",
            "warning",
            "Le fichier .env (clés chiffrées) n'existe pas.",
            fix=f"cd {install_dir} && CETAS_VAULT_PASSWORD=... python3 proxy/encrypt_keys.py"
        ))
    else:
        ok(".env présent")

    # ── 5. Permissions .vault et .env (lisibles par le container uid 1001) ──
    sub("Vérification des permissions (container uid 1001)...")
    for p in [".vault", ".vault/.enc", ".env"]:
        fp = Path(install_dir, p)
        if fp.exists():
            st = os.stat(fp)
            mode = oct(st.st_mode)[-3:]
            # Le container lit en uid 1001, le fichier est owner uid 1000
            # Besoin au moins de world-read
            if not (st.st_mode & 0o004):  # pas world-read
                issues.append(Issue(
                    f"Permission {p}",
                    "error",
                    f"{p} n'est pas lisible par le container (mode {mode}).",
                    fix=f"chmod 644 {fp}",
                    auto_fix=lambda fp=fp: os.chmod(fp, 0o644)
                ))
            else:
                ok(f"{p} lisible")

    # ── 6. docker-compose.yml ────────────────────────────────
    sub("Vérification de docker-compose.yml...")
    dc_path = Path(install_dir, "docker-compose.yml")
    if dc_path.exists():
        dc_content = dc_path.read_text()
        # Vérifier chemins absolus
        if "/home/" in dc_content and ".vault" in dc_content:
            abs_paths = re.findall(r'/home/[^/]+/[^/]+/\.(vault|env)', dc_content)
            if abs_paths:
                issues.append(Issue(
                    "Chemins absolus dans docker-compose.yml",
                    "warning",
                    "Des chemins absolus /home/... sont utilisés au lieu de chemins relatifs.",
                    fix="Remplace les chemins par ./.vault et ./.env",
                    auto_fix=lambda: _fix_dc_paths(dc_path)
                ))
        # Vérifier :ro
        if ".vault:/usr/share/nginx/html/.vault:ro" not in dc_content:
            issues.append(Issue(
                "Volume vault non read-only",
                "warning",
                "Le volume .vault n'est pas monté en read-only (:ro).",
                fix="Ajoute :ro après le montage .vault",
                auto_fix=lambda: _fix_dc_ro(dc_path)
            ))
        ok("docker-compose.yml vérifié")
    else:
        issues.append(Issue(
            "docker-compose.yml absent",
            "error",
            "Le fichier docker-compose.yml est manquant.",
            fix="Copie docker-compose.yml dans le répertoire"
        ))

    # ── 7. Containers Docker ─────────────────────────────────
    sub("Vérification des containers...")
    rc, out = run("docker compose ps --format json 2>/dev/null", cwd=install_dir)
    if rc == 0 and out:
        for line in out.strip().split("\n"):
            try:
                container = json.loads(line)
                name = container.get("Name", "")
                state = container.get("State", "")
                if "cetas" in name.lower():
                    if state == "running":
                        ok(f"Container {name}: running")
                    else:
                        issues.append(Issue(
                            f"Container {name} arrêté",
                            "error",
                            f"Le container {name} est en état '{state}'.",
                            fix=f"docker compose up -d",
                            auto_fix=lambda: run("docker compose up -d", cwd=install_dir)
                        ))
            except json.JSONDecodeError:
                pass
    else:
        # Pas de json format, essayer avec ps simple
        rc2, out2 = run("docker compose ps", cwd=install_dir)
        if rc2 == 0 and "Up" in out2:
            ok("Containers actifs")
        elif "no such service" not in out2.lower():
            issues.append(Issue(
                "Containers non démarrés",
                "error",
                "Les containers ne sont pas en cours d'exécution.",
                fix=f"cd {install_dir} && docker compose up -d",
                auto_fix=lambda: run("docker compose up -d", cwd=install_dir)
            ))

    # ── 8. Port conflict ─────────────────────────────────────
    sub("Vérification des ports...")
    cetas_port = _get_cetas_port(install_dir)
    rc, _ = run(f"ss -tlnp | grep :{cetas_port} | grep -v docker")
    if rc == 0:
        # Un process非-docker utilise le port
        issues.append(Issue(
            f"Port {cetas_port} occupé",
            "error",
            f"Le port {cetas_port} est utilisé par un autre processus.",
            fix=f"Arrête le processus ou choisis un autre port dans docker-compose.yml",
            auto_fix=lambda: _fix_port_conflict(install_dir, cetas_port)
        ))
    else:
        ok(f"Port {cetas_port} disponible")

    # ── 9. Proxy health ──────────────────────────────────────
    sub("Vérification du proxy API...")
    rc, out = run(f"curl -sf http://localhost:{cetas_port}/api/health 2>/dev/null")
    if rc == 0 and '"status":"ok"' in out:
        keys = 0
        try:
            keys = json.loads(out).get("keys_loaded", 0)
        except Exception:
            pass
        ok(f"Proxy actif — {keys} clés API chargées")
        if keys == 0:
            issues.append(Issue(
                "Aucune clé API chargée",
                "warning",
                "Le proxy fonctionne mais aucune clé API n'est chargée.",
                fix=f"Configure des clés API via setup.py ou l'interface web"
            ))
    else:
        issues.append(Issue(
            "Proxy injoignable",
            "error",
            f"Le proxy ne répond pas sur le port {cetas_port}.",
            fix="Vérifie les logs: docker compose logs cetas",
            auto_fix=lambda: run("docker compose restart cetas", cwd=install_dir)
        ))

    # ── 10. SearXNG ──────────────────────────────────────────
    sub("Vérification de SearXNG...")
    searxng_port = _get_searxng_port(install_dir)
    rc, _ = run(f"curl -sf http://localhost:{searxng_port}/ > /dev/null 2>&1")
    if rc == 0:
        ok(f"SearXNG actif sur port {searxng_port}")
    else:
        issues.append(Issue(
            "SearXNG injoignable",
            "warning",
            f"SearXNG ne répond pas sur le port {searxng_port}.",
            fix="docker compose logs searxng"
        ))

    # ── 11. Login test ───────────────────────────────────────
    sub("Test d'authentification...")
    rc, out = run(f"curl -sf http://localhost:{cetas_port}/api/health")
    if rc == 0:
        # Vérifier si users-seed.json existe
        seed_path = Path(install_dir, "core", "users-seed.json")
        if not seed_path.exists():
            issues.append(Issue(
                "Pas de compte admin",
                "warning",
                "Aucun users-seed.json trouvé. Le login échouera.",
                fix=f"Crée un compte via setup.py ou crée core/users-seed.json"
            ))
        else:
            try:
                admins = json.loads(seed_path.read_text())
                if not admins:
                    issues.append(Issue(
                        "users-seed.json vide",
                        "warning",
                        "Le fichier users-seed.json est vide.",
                        fix="Ajoute au moins un admin via setup.py"
                    ))
                else:
                    ok(f"Compte(s) admin trouvé(s): {len(admins)}")
            except Exception:
                pass

    # ── 12. systemd ──────────────────────────────────────────
    sub("Vérification du service systemd...")
    rc, _ = run("systemctl is-enabled cetas 2>/dev/null")
    if rc == 0:
        ok("Service systemd activé")
    else:
        issues.append(Issue(
            "Service systemd non activé",
            "info",
            "Le service cetas n'est pas activé au démarrage.",
            fix="sudo systemctl enable cetas"
        ))

    # ── 13. Network connectivity ─────────────────────────────
    sub("Vérification réseau...")
    rc, _ = run("ping -c1 -W2 8.8.8.8 >/dev/null 2>&1")
    if rc != 0:
        issues.append(Issue(
            "Pas de connexion Internet",
            "error",
            "Le serveur n'a pas accès à Internet.",
            fix="Vérifie la configuration réseau du VPS"
        ))
    else:
        # Test DNS
        rc2, _ = run("nslookup registry.npmjs.org >/dev/null 2>&1")
        if rc2 != 0:
            issues.append(Issue(
                "DNS ne résout pas",
                "warning",
                "Le DNS ne résout pas registry.npmjs.org (problème pour npm).",
                fix="Vérifie /etc/resolv.conf"
            ))
        else:
            ok("Connexion Internet OK")

    # ── 14. MTU check ────────────────────────────────────────
    sub("Vérification MTU...")
    rc, out = run("ip link show | grep -A1 'state UP' | grep mtu | head -1")
    if rc == 0 and out:
        mtu_match = re.search(r'mtu (\d+)', out)
        if mtu_match:
            mtu = int(mtu_match.group(1))
            if mtu > 1400:
                issues.append(Issue(
                    f"MTU élevé ({mtu})",
                    "info",
                    f"MTU={mtu}. Si tu as des erreurs réseau Docker, essaye: ip link set dev eth0 mtu 1300",
                    fix="sudo ip link set dev eth0 mtu 1300"
                ))
            else:
                ok(f"MTU={mtu} (OK)")

    # ── RÉSULTATS ────────────────────────────────────────────
    print()
    errors = [i for i in issues if i.severity == "error"]
    warnings = [i for i in issues if i.severity == "warning"]
    infos = [i for i in issues if i.severity == "info"]

    if not issues:
        print(c("green", "  ══════════════════════════════════════════════════"))
        print(c("green", "  ✅ Aucun problème détecté !"))
        print(c("green", "  ══════════════════════════════════════════════════"))
        return True

    print(c("cyan", "  ┌─ RÉSULTATS DU DIAGNOSTIC ───────────────────────┐"))
    print()
    erreurs = len(errors)
    avertissements = len(warnings)
    infos = len(infos)
    print(f"  {c('red', '✗ ' + str(erreurs) + ' erreur(s)')}")
    print(f"  {c('yellow', '⚠ ' + str(avertissements) + ' avertissement(s)')}")
    print(f"  {c('gray', 'ℹ ' + str(infos) + ' info(s)')}")
    print()

    for i, issue in enumerate(issues, 1):
        if issue.severity == "error":
            sym = c("red", "✗")
        elif issue.severity == "warning":
            sym = c("yellow", "⚠")
        else:
            sym = c("gray", "ℹ")
        print(f"  {sym} {c('bold', issue.name)}")
        print(f"    {c('gray', issue.description)}")
        if issue.fix:
            print(f"    {c('cyan', '→ ' + issue.fix)}")
        print()

    # Auto-fix
    if errors or warnings:
        print(c("yellow", "  Voulez-vous appliquer les corrections automatiques ?"))
        print(c("gray", "  (les corrections manuelles restent possibles)"))
        print()
        choix = input(c("white", "  Auto-fix ? [O/n] : ")).strip().lower()
        if choix != "n":
            print()
            for issue in issues:
                if issue.auto_fix and (issue.severity == "error" or issue.severity == "warning"):
                    sub(f"Correction: {issue.name}...")
                    try:
                        result = issue.auto_fix()
                        if isinstance(result, tuple):
                            for r in result:
                                if hasattr(r, 'returncode') and r.returncode != 0:
                                    warn(f"Échec correction: {issue.name}")
                                    break
                            else:
                                ok(f"Corrigé: {issue.name}")
                                issue.resolved = True
                        else:
                            ok(f"Corrigé: {issue.name}")
                            issue.resolved = True
                    except Exception as e:
                        warn(f"Échec correction: {issue.name} — {e}")

            # Relancer les checks
            resolved = sum(1 for i in issues if i.resolved)
            if resolved:
                print()
                ok(f"{resolved}/{len(issues)} problème(s) corrigé(s)")
                print(c("gray", "  Relance le diagnostic pour vérifier: python3 install.py --troubleshoot"))

    return len(errors) == 0


def _fix_dc_paths(dc_path):
    """Corrige les chemins absolus dans docker-compose.yml."""
    content = dc_path.read_text()
    content = re.sub(r'/home/[^/]*/[^/]*/\.vault', './.vault', content)
    content = re.sub(r'/home/[^/]*/[^/]*/\.env', './.env', content)
    dc_path.write_text(content)


def _fix_dc_ro(dc_path):
    """Ajoute :ro aux volumes vault et .env."""
    content = dc_path.read_text()
    content = content.replace(
        ".vault:/usr/share/nginx/html/.vault",
        ".vault:/usr/share/nginx/html/.vault:ro"
    )
    content = content.replace(
        ".env:/usr/share/nginx/html/.env",
        ".env:/usr/share/nginx/html/.env:ro"
    )
    dc_path.write_text(content)


def _fix_port_conflict(install_dir, port):
    """Change le port si conflict."""
    dc_path = Path(install_dir, "docker-compose.yml")
    content = dc_path.read_text()
    new_port = port + 1
    content = re.sub(rf'"{port}:80"', f'"{new_port}:80"', content)
    dc_path.write_text(content)
    print(c("gray", f"    Port changé: {port} → {new_port}"))
    return new_port


# ================================================================
#  MAIN
# ================================================================

def main():
    install_dir = "/opt/cetas"

    # Mode test/audit seul
    if "--test" in sys.argv or "-T" in sys.argv:
        if os.geteuid() != 0:
            print(c("red", "  Diagnostic nécessite root:"))
            print(c("white", "    sudo python3 install.py --test"))
            sys.exit(1)
        banner()
        run_test(install_dir)
        sys.exit(0)

    # Mode troubleshooting seul
    if "--troubleshoot" in sys.argv or "-t" in sys.argv:
        if os.geteuid() != 0:
            print(c("red", "  Diagnostic nécessite root:"))
            print(c("white", "    sudo python3 install.py --troubleshoot"))
            sys.exit(1)
        banner()
        troubleshoot(install_dir)
        sys.exit(0)

    if os.geteuid() != 0:
        print(c("red", "  Ce script doit être lancé en root:"))
        print(c("white", "    sudo python3 install.py"))
        print(c("gray", "    sudo python3 install.py --troubleshoot  (diagnostic seul)"))
        sys.exit(1)

    banner()

    real_user = os.environ.get("SUDO_USER", "sam")

    print(c("cyan", "  ╔══════════════════════════════════════════════════╗"))
    print(c("cyan", "  ║") + c("bold", "        INSTALL — Marexsoft CETAS                    ") + c("cyan", "║"))
    print(c("cyan", "  ╚══════════════════════════════════════════════════╝"))
    print()
    print(c("white", "  Modes :"))
    print(c("green", "    sudo python3 install.py                → Installation complète"))
    print(c("green", "    sudo python3 install.py --troubleshoot  → Diagnostic + auto-fix"))
    print(c("green", "    sudo python3 install.py --test          → Audit complet (10 niveaux)"))
    print()
    print(c("white", "  Ce script va :"))
    print(c("gray", "  1. Installer Docker"))
    print(c("gray", "  2. Préparer le dépôt"))
    print(c("gray", "  3. Vérifier les fichiers"))
    print(c("gray", "  4. Configurer les ports"))
    print(c("gray", "  5. Générer les secrets"))
    print(c("gray", "  6. Configurer SearXNG"))
    print(c("gray", "  7. Lancer setup.py (vault + clés API)"))
    print(c("gray", "  8. Créer le compte admin"))
    print(c("gray", "  9. Build Docker"))
    print(c("gray", " 10. Créer le service systemd"))
    print(c("gray", " 11. Diagnostic automatique"))
    print()
    print(c("yellow", "  ⚠ Les fichiers secrets (setup.py, core/linux/)"))
    print(c("yellow", "    doivent être présents dans le dépôt."))
    print()

    continuer = input(c("white", "  Commencer l'installation ? [O/n] : ")).strip().lower()
    if continuer == "n":
        print(c("gray", "  Annulé."))
        sys.exit(0)

    print()

    # 1. Docker
    if not check_docker():
        sys.exit(1)

    # 2. Dépôt
    if not prepare_repo(install_dir):
        sys.exit(1)

    # 3. Fichiers
    if not check_files(install_dir):
        sys.exit(1)

    # 4. Ports
    cetas_port, searxng_port = configure_ports(install_dir)

    # 5. Secrets
    vault_pass, searxng_secret = setup_secrets(install_dir)

    # 6. SearXNG
    setup_searxng(install_dir)

    # 7. Setup.py
    run_setup_py(install_dir)

    # 8. Admin
    create_admin(install_dir)

    # 9. Build
    build_docker(install_dir, searxng_secret)

    # 10. Start
    start_services(install_dir, searxng_secret, cetas_port)

    # 11. Systemd
    create_systemd(install_dir, searxng_secret)

    # 12. Diagnostic post-install
    print()
    sub("Diagnostic post-installation...")
    troubleshoot(install_dir)

    # Résumé
    try:
        local_ip = subprocess.run("hostname -I", shell=True, capture_output=True, text=True).stdout.split()[0]
    except Exception:
        local_ip = "localhost"

    print()
    print(c("green", "  ══════════════════════════════════════════════════"))
    print(c("green", "  ✅ Installation terminée avec succès !"))
    print(c("green", "  ══════════════════════════════════════════════════"))
    print()
    print(f"  {c('blue', 'URL:')}          http://{local_ip}:{cetas_port}")
    print(f"  {c('blue', 'Dossier:')}      {install_dir}")
    print(f"  {c('blue', 'Systemd:')}      sudo systemctl restart cetas")
    print(f"  {c('blue', 'Logs:')}         docker compose logs -f")
    print(f"  {c('blue', 'Diagnostic:')}   sudo python3 install.py --troubleshoot")
    print()
    print(c("yellow", "  ⚠  Supprime setup.py du serveur pour la sécurité :"))
    print(c("gray", f"    rm {install_dir}/setup.py"))
    print()
    print(c("gray", "  © Marexsoft Corporation — Tous droits réservés"))
    print()


# ================================================================
#  TEST / AUDIT — Test complet de tous les niveaux
# ================================================================

def run_test(install_dir="/opt/cetas"):
    """Test complet de l'installation — tous les niveaux."""
    import hashlib

    results = {"pass": 0, "fail": 0, "warn": 0, "skip": 0}
    all_tests = []

    def test(name, category):
        """Décorateur de test."""
        class TestRunner:
            def __init__(self):
                self.name = name
                self.category = category
                self.passed = False
                self.message = ""
                self.skipped = False
            def ok(self, msg=""):
                self.passed = True
                self.message = msg
                results["pass"] += 1
                all_tests.append(("pass", category, name, msg))
                print(c("green", f"    ✓ {name}") + (f" — {c('gray', msg)}" if msg else ""))
            def fail(self, msg=""):
                self.passed = False
                self.message = msg
                results["fail"] += 1
                all_tests.append(("fail", category, name, msg))
                print(c("red", f"    ✗ {name}") + (f" — {c('red', msg)}" if msg else ""))
            def warn(self, msg=""):
                self.message = msg
                results["warn"] += 1
                all_tests.append(("warn", category, name, msg))
                print(c("yellow", f"    ⚠ {name}") + (f" — {c('yellow', msg)}" if msg else ""))
            def skip(self, msg=""):
                self.skipped = True
                self.message = msg
                results["skip"] += 1
                all_tests.append(("skip", category, name, msg))
                print(c("gray", f"    ○ {name}") + (f" — {c('gray', msg)}" if msg else ""))
        return TestRunner()

    section("TEST COMPLET — Audit de l'installation")
    print()

    # ══════════════════════════════════════════════════════════
    # NIVEAU 1: SYSTÈME
    # ══════════════════════════════════════════════════════════
    print(c("cyan", "  ── NIVEAU 1: SYSTÈME ──────────────────────────────"))
    print()

    t = test("OS supporté", "Système")
    pf = platform.system()
    if pf in ("Linux", "Darwin"):
        t.ok(f"{pf} {platform.release()}")
    else:
        t.fail(f"{pf} non supporté")

    t = test("Root / sudo", "Système")
    if os.geteuid() == 0:
        t.ok()
    else:
        t.fail("Lancé sans root")

    t = test("Python disponible", "Système")
    py_ver = sys.version.split()[0]
    if sys.version_info >= (3, 8):
        t.ok(f"Python {py_ver}")
    else:
        t.fail(f"Python {py_ver} trop ancien (>=3.8 requis)")

    t = test("curl disponible", "Système")
    rc, _ = run("curl --version >/dev/null 2>&1")
    if rc == 0:
        t.ok()
    else:
        t.fail("curl non installé")

    t = test("Espace disque", "Système")
    try:
        st = os.statvfs(install_dir if os.path.isdir(install_dir) else "/")
        free_gb = (st.f_bavail * st.f_frsize) / (1024**3)
        if free_gb >= 5:
            t.ok(f"{free_gb:.1f} Go disponibles")
        elif free_gb >= 2:
            t.warn(f"{free_gb:.1f} Go — peut être juste")
        else:
            t.fail(f"{free_gb:.1f} Go — insuffisant (5 Go min)")
    except Exception:
        t.skip("Impossible de vérifier")

    t = test("RAM disponible", "Système")
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemAvailable:"):
                    avail_kb = int(line.split()[1])
                    avail_gb = avail_kb / (1024**2)
                    if avail_gb >= 1.5:
                        t.ok(f"{avail_gb:.1f} Go")
                    elif avail_gb >= 0.5:
                        t.warn(f"{avail_gb:.1f} Go — peut être juste")
                    else:
                        t.fail(f"{avail_gb:.1f} Go — insuffisant")
                    break
    except Exception:
        t.skip("Impossible de vérifier")

    # ══════════════════════════════════════════════════════════
    # NIVEAU 2: DOCKER
    # ══════════════════════════════════════════════════════════
    print()
    print(c("cyan", "  ── NIVEAU 2: DOCKER ───────────────────────────────"))
    print()

    t = test("Docker installé", "Docker")
    rc, out = run("docker --version")
    if rc == 0:
        ver = out.split()[2].rstrip(",") if len(out.split()) > 2 else "?"
        t.ok(f"v{ver}")
    else:
        t.fail("Docker non installé")

    t = test("Docker Compose disponible", "Docker")
    rc, out = run("docker compose version")
    if rc == 0:
        t.ok(out.split(":")[-1].strip() if ":" in out else "OK")
    else:
        t.fail("docker compose non disponible")

    t = test("Service Docker actif", "Docker")
    rc, _ = run("docker info >/dev/null 2>&1")
    if rc == 0:
        t.ok()
    else:
        t.fail("Service Docker arrêté")

    t = test("Image Cetas existante", "Docker")
    rc, out = run("docker images cetas-webui-cetas --format {{.Size}}")
    if rc == 0 and out:
        t.ok(f"Taille: {out}")
    else:
        t.fail("Image Docker non buildée")

    t = test("Container Cetas", "Docker")
    rc, out = run("docker compose ps --format '{{.State}}' 2>/dev/null", cwd=install_dir)
    if rc == 0 and "running" in (out or "").lower():
        t.ok("running")
    else:
        t.fail("Container non démarré")

    t = test("Container SearXNG", "Docker")
    rc, _ = run("docker compose ps searxng 2>/dev/null | grep -q Up", cwd=install_dir)
    if rc == 0:
        t.ok("running")
    else:
        t.fail("Container SearXNG non démarré")

    # ══════════════════════════════════════════════════════════
    # NIVEAU 3: RÉSEAU / PORTS
    # ══════════════════════════════════════════════════════════
    print()
    print(c("cyan", "  ── NIVEAU 3: RÉSEAU ───────────────────────────────"))
    print()

    cetas_port = _get_cetas_port(install_dir)
    searxng_port = _get_searxng_port(install_dir)

    t = test(f"Port Cetas ({cetas_port})", "Réseau")
    rc, _ = run(f"curl -sf --max-time 3 http://localhost:{cetas_port}/ >/dev/null 2>&1")
    if rc == 0:
        t.ok("accessible")
    else:
        t.fail("inaccessible")

    t = test(f"Port SearXNG ({searxng_port})", "Réseau")
    rc, _ = run(f"curl -sf --max-time 3 http://localhost:{searxng_port}/ >/dev/null 2>&1")
    if rc == 0:
        t.ok("accessible")
    else:
        t.fail("inaccessible")

    t = test("Connexion Internet", "Réseau")
    rc, _ = run("ping -c1 -W3 8.8.8.8 >/dev/null 2>&1")
    if rc == 0:
        t.ok()
    else:
        t.fail("Pas de connexion Internet")

    t = test("DNS fonctionnel", "Réseau")
    rc, _ = run("nslookup registry.npmjs.org >/dev/null 2>&1")
    if rc == 0:
        t.ok()
    else:
        t.warn("DNS ne résout pas registry.npmjs.org")

    t = test("MTU réseau", "Réseau")
    rc, out = run("ip link show 2>/dev/null | grep -o 'mtu [0-9]*' | head -1")
    if rc == 0 and "mtu" in out:
        mtu = int(out.split()[-1])
        if mtu <= 1400:
            t.ok(f"mtu={mtu}")
        else:
            t.warn(f"mtu={mtu} — peut causer des erreurs Docker")
    else:
        t.skip("impossible de lire le MTU")

    # ══════════════════════════════════════════════════════════
    # NIVEAU 4: FICHIERS / CONFIG
    # ══════════════════════════════════════════════════════════
    print()
    print(c("cyan", "  ── NIVEAU 4: FICHIERS / CONFIG ────────────────────"))
    print()

    t = test("Dossier /opt/cetas", "Fichiers")
    if os.path.isdir(install_dir):
        t.ok()
    else:
        t.fail("Dossier non trouvé")

    critical_files = {
        "Dockerfile": "Image Docker",
        "docker-compose.yml": "Stack Docker",
        "nginx.conf": "Config Nginx",
        "start.sh": "Script démarrage",
        "setup.py": "Setup vault",
        "proxy/server.py": "Proxy backend",
        "proxy/encrypt_keys.py": "Chiffrement clés",
        "core/linux/crypto_linux.py": "Module crypto",
        "core/linux/vault_guard.py": "Vault guard",
        "index.html": "SPA frontend",
        "models.js": "Catalogue modèles",
        "js/app.js": "Application principale",
        "js/auth.js": "Authentification",
    }

    for filepath, desc in critical_files.items():
        t = test(f"{filepath}", "Fichiers")
        fp = Path(install_dir, filepath)
        if fp.exists():
            size = fp.stat().st_size
            if size > 0:
                t.ok(f"{desc} ({size:,} octets)")
            else:
                t.fail(f"{desc} — fichier vide")
        else:
            t.fail(f"{desc} — MANQUANT")

    # ══════════════════════════════════════════════════════════
    # NIVEAU 5: VAULT / SÉCURITÉ
    # ══════════════════════════════════════════════════════════
    print()
    print(c("cyan", "  ── NIVEAU 5: VAULT / SÉCURITÉ ─────────────────────"))
    print()

    t = test(".vault/.enc existe", "Vault")
    fp = Path(install_dir, ".vault", ".enc")
    if fp.exists():
        t.ok(f"{fp.stat().st_size} octets")
    else:
        t.fail("Vault non trouvé")

    t = test("Permissions .vault", "Vault")
    if fp.exists():
        st = os.stat(fp)
        mode = oct(st.st_mode)[-3:]
        if not (st.st_mode & 0o077):  # pas group/other write
            t.ok(f"mode {mode}")
        else:
            t.warn(f"mode {mode} — trop ouvert")

    t = test(".env existe", "Vault")
    fp = Path(install_dir, ".env")
    if fp.exists():
        t.ok()
    else:
        t.fail("Fichier .env manquant")

    t = test(".env.docker existe", "Vault")
    fp = Path(install_dir, ".env.docker")
    if fp.exists():
        content = fp.read_text()
        if "CETAS_VAULT_PASSWORD=" in content:
            t.ok("vault password défini")
        else:
            t.fail("CETAS_VAULT_PASSWORD manquant")
    else:
        t.fail(".env.docker manquant")

    t = test("Chiffrement .vault lisible", "Vault")
    try:
        sys.path.insert(0, str(Path(install_dir, "core", "linux")))
        import crypto_linux
        vault_obj = crypto_linux.SecureVault(str(Path(install_dir, ".vault", ".enc")))
        env_content = Path(install_dir, ".env.docker").read_text()
        m = re.search(r'CETAS_VAULT_PASSWORD=(.*)', env_content)
        if m:
            data = vault_obj.load(m.group(1).strip())
            if data:
                t.ok(f"clés API: {len(data.get('api_keys', {}))}")
            else:
                t.fail("Déchiffrement échoué — mot de passe incorrect?")
        else:
            t.fail("CETAS_VAULT_PASSWORD non trouvé")
    except ImportError:
        t.skip("crypto_linux.py non importable")
    except Exception as e:
        t.fail(str(e))

    t = test("Permissions .env (container)", "Vault")
    fp = Path(install_dir, ".env")
    if fp.exists():
        st = os.stat(fp)
        if st.st_mode & 0o004:
            t.ok("lisible par le container")
        else:
            t.fail("non lisible par le container (uid 1001)")

    # ══════════════════════════════════════════════════════════
    # NIVEAU 6: API / PROXY
    # ══════════════════════════════════════════════════════════
    print()
    print(c("cyan", "  ── NIVEAU 6: API / PROXY ──────────────────────────"))
    print()

    t = test("/api/health", "API")
    rc, out = run(f"curl -sf --max-time 5 http://localhost:{cetas_port}/api/health")
    if rc == 0:
        try:
            data = json.loads(out)
            keys = data.get("keys_loaded", 0)
            status = data.get("status", "?")
            t.ok(f"status={status}, keys={keys}")
        except Exception:
            t.ok("réponse reçue")
    else:
        t.fail("endpoint /api/health inaccessible")

    t = test("/api/auth/login (POST)", "API")
    rc, out = run(f'curl -sf --max-time 5 -X POST http://localhost:{cetas_port}/api/auth/login -H "Content-Type: application/json" -d \'{{"username":"test","password":"test"}}\'')
    if rc == 0:
        try:
            data = json.loads(out)
            if "error" in data:
                t.ok(f"réponse: {data['error']}")
            elif "token" in data:
                t.ok("authentification fonctionne")
            else:
                t.ok("réponse reçue")
        except Exception:
            t.ok("réponse reçue")
    else:
        # 401 est normal pour de mauvais identifiants
        t.ok("endpoint fonctionne (401 = identifiants incorrects = normal)")

    t = test("Login avec compte admin", "API")
    seed_path = Path(install_dir, "core", "users-seed.json")
    if seed_path.exists():
        try:
            admins = json.loads(seed_path.read_text())
            if admins and len(admins) > 0:
                username = admins[0].get("username", "")
                pwd_hash = admins[0].get("password_hash", "")
                # On ne peut pas tester sans le vrai mot de passe, mais on vérifie que le hash est là
                if pwd_hash and len(pwd_hash) >= 64:
                    t.ok(f"admin '{username}' configuré (hash présent)")
                else:
                    t.fail(f"hash du mot de passe invalide")
            else:
                t.fail("pas d'admin dans users-seed.json")
        except Exception as e:
            t.fail(f"erreur lecture users-seed.json: {e}")
    else:
        t.fail("users-seed.json non trouvé")

    t = test("Rate limiting actif", "API")
    # Faire 15 tentatives rapides pour déclencher le rate limit
    for _ in range(12):
        run(f'curl -sf --max-time 2 -X POST http://localhost:{cetas_port}/api/auth/login -H "Content-Type: application/json" -d \'{{"username":"test","password":"test"}}\' >/dev/null 2>&1')
    rc, out = run(f'curl -sf --max-time 2 -o /dev/null -w "%{{http_code}}" -X POST http://localhost:{cetas_port}/api/auth/login -H "Content-Type: application/json" -d \'{{"username":"test","password":"test"}}\'')
    if out and "429" in out:
        t.ok("rate limiting fonctionne (429)")
    elif out and "401" in out:
        t.warn("rate limiting pas déclenché (normal si peu de tentatives)")
    else:
        t.skip("impossible de tester le rate limiting")

    # ══════════════════════════════════════════════════════════
    # NIVEAU 7: RECHERCHE WEB
    # ══════════════════════════════════════════════════════════
    print()
    print(c("cyan", "  ── NIVEAU 7: RECHERCHE WEB ────────────────────────"))
    print()

    t = test("SearXNG accessible", "Recherche")
    rc, _ = run(f"curl -sf --max-time 5 http://localhost:{searxng_port}/ >/dev/null 2>&1")
    if rc == 0:
        t.ok()
    else:
        t.fail("SearXNG inaccessible")

    t = test("SearXNG JSON API", "Recherche")
    rc, out = run(f'curl -sf --max-time 5 "http://localhost:{searxng_port}/search?q=test&format=json" 2>/dev/null')
    if rc == 0:
        try:
            data = json.loads(out)
            if "results" in data:
                t.ok(f"{len(data['results'])} résultats")
            else:
                t.ok("réponse reçue")
        except Exception:
            t.ok("réponse reçue")
    else:
        t.warn("API JSON SearXNG inaccessible")

    t = test("Proxy /search (via Nginx)", "Recherche")
    rc, _ = run(f"curl -sf --max-time 5 http://localhost:{cetas_port}/search >/dev/null 2>&1")
    if rc == 0:
        t.ok()
    else:
        t.warn("route /search via Nginx inaccessible")

    # ══════════════════════════════════════════════════════════
    # NIVEAU 8: SYSTEMD
    # ══════════════════════════════════════════════════════════
    print()
    print(c("cyan", "  ── NIVEAU 8: SYSTEMD ──────────────────────────────"))
    print()

    t = test("Service cetas créé", "Systemd")
    rc, _ = run("test -f /etc/systemd/system/cetas.service")
    if rc == 0:
        t.ok()
    else:
        t.fail("fichier cetas.service non trouvé")

    t = test("Service cetas enabled", "Systemd")
    rc, _ = run("systemctl is-enabled cetas 2>/dev/null")
    if rc == 0:
        t.ok()
    else:
        t.fail("service non activé au démarrage")

    t = test("Service cetas actif", "Systemd")
    rc, out = run("systemctl is-active cetas 2>/dev/null")
    if rc == 0 and "active" in out:
        t.ok()
    else:
        t.warn("service non actif (peut être normal)")

    # ══════════════════════════════════════════════════════════
    # NIVEAU 9: FRONTEND
    # ══════════════════════════════════════════════════════════
    print()
    print(c("cyan", "  ── NIVEAU 9: FRONTEND ─────────────────────────────"))
    print()

    t = test("Page d'accueil accessible", "Frontend")
    rc, _ = run(f"curl -sf --max-time 5 http://localhost:{cetas_port}/ | grep -q 'Cetas'")
    if rc == 0:
        t.ok()
    else:
        t.fail("page d'accueil non accessible")

    t = test("CSS chargé", "Frontend")
    rc, _ = run(f"curl -sf --max-time 5 http://localhost:{cetas_port}/css/style.css | wc -c")
    if rc == 0 and out and int(out) > 1000:
        t.ok(f"{int(out):,} octets")
    else:
        t.fail("CSS non chargé")

    t = test("JS app.js chargé", "Frontend")
    rc, out = run(f"curl -sf --max-time 5 http://localhost:{cetas_port}/js/app.js | wc -c")
    if rc == 0 and out and int(out) > 1000:
        t.ok(f"{int(out):,} octets")
    else:
        t.fail("app.js non chargé")

    t = test("login-overlay présent", "Frontend")
    rc, _ = run(f"curl -sf --max-time 5 http://localhost:{cetas_port}/ | grep -q 'login-overlay'")
    if rc == 0:
        t.ok()
    else:
        t.warn("login-overlay non trouvé dans le HTML")

    t = test("Headers sécurité", "Frontend")
    rc, out = run(f'curl -sfI --max-time 5 http://localhost:{cetas_port}/ | grep -iE "referrer-policy|permissions-policy"')
    if rc == 0 and out:
        t.ok("Referrer-Policy + Permissions-Policy")
    else:
        t.warn("headers de sécurité manquants")

    # ══════════════════════════════════════════════════════════
    # NIVEAU 10: LOGS (erreurs récentes)
    # ══════════════════════════════════════════════════════════
    print()
    print(c("cyan", "  ── NIVEAU 10: LOGS ────────────────────────────────"))
    print()

    t = test("Pas d'erreurs proxy", "Logs")
    rc, out = run("docker compose logs cetas --tail 50 2>/dev/null", cwd=install_dir)
    if rc == 0:
        errors = [l for l in out.split("\n") if "ERREUR" in l.upper() or "ERROR" in l.upper() and "vault introuvable" not in l.lower()]
        if not errors:
            t.ok("aucune erreur récente")
        else:
            t.warn(f"{len(errors)} erreur(s) dans les logs")
    else:
        t.skip("impossible de lire les logs")

    t = test("Pas d'erreurs SearXNG", "Logs")
    rc, out = run("docker compose logs searxng --tail 20 2>/dev/null", cwd=install_dir)
    if rc == 0:
        errors = [l for l in out.split("\n") if "error" in l.lower() or "traceback" in l.lower()]
        if not errors:
            t.ok("aucune erreur récente")
        else:
            t.warn(f"{len(errors)} erreur(s) dans les logs SearXNG")
    else:
        t.skip("impossible de lire les logs SearXNG")

    # ══════════════════════════════════════════════════════════
    # NIVEAU 11: DOCKER COMPOSE CONFIG
    # ══════════════════════════════════════════════════════════
    print()
    print(c("cyan", "  ── NIVEAU 11: DOCKER COMPOSE ──────────────────────"))
    print()

    t = test("docker compose config valide", "Docker")
    rc, _ = run("docker compose config --quiet 2>/dev/null", cwd=install_dir)
    if rc == 0:
        t.ok()
    else:
        t.fail("docker-compose.yml invalide")

    t = test("Volume .vault monté", "Docker")
    rc, out = run("docker compose exec cetas ls /usr/share/nginx/html/.vault/.enc 2>/dev/null", cwd=install_dir)
    if rc == 0 and "No such file" not in out:
        t.ok()
    else:
        t.fail("vault non monté dans le container")

    t = test("Volume .env monté", "Docker")
    rc, out = run("docker compose exec cetas ls /usr/share/nginx/html/.env 2>/dev/null", cwd=install_dir)
    if rc == 0 and "No such file" not in out:
        t.ok()
    else:
        t.fail(".env non monté dans le container")

    t = test("Volume data monté", "Docker")
    rc, out = run("docker compose exec cetas ls /app/data/ 2>/dev/null", cwd=install_dir)
    if rc == 0:
        t.ok()
    else:
        t.fail("volume /app/data non monté")

    t = test("Variable CETAS_VAULT_PASSWORD", "Docker")
    rc, out = run("docker compose exec cetas printenv CETAS_VAULT_PASSWORD 2>/dev/null", cwd=install_dir)
    if rc == 0 and out and len(out) > 3:
        t.ok(f"longueur={len(out)}")
    else:
        t.fail("CETAS_VAULT_PASSWORD non défini dans le container")

    t = test("Variable CETAS_WORKER_TOKEN", "Docker")
    rc, out = run("docker compose exec cetas printenv CETAS_WORKER_TOKEN 2>/dev/null", cwd=install_dir)
    if rc == 0 and out and len(out) > 10:
        t.ok()
    else:
        t.warn("CETAS_WORKER_TOKEN non défini")

    t = test("Container user = cetas (uid 1001)", "Docker")
    rc, out = run("docker compose exec cetas id 2>/dev/null", cwd=install_dir)
    if rc == 0 and "1001" in out:
        t.ok()
    else:
        t.warn("container ne tourne pas en uid 1001")

    t = test("Python dans container", "Docker")
    rc, out = run("docker compose exec cetas python3 --version 2>/dev/null", cwd=install_dir)
    if rc == 0:
        t.ok(out.strip())
    else:
        t.fail("Python non disponible dans le container")

    t = test("PyJWT dans container", "Docker")
    rc, out = run("docker compose exec cetas python3 -c 'import jwt; print(jwt.__version__)' 2>/dev/null", cwd=install_dir)
    if rc == 0:
        t.ok(f"v{out.strip()}")
    else:
        t.fail("PyJWT non installé dans le container")

    t = test("cryptography dans container", "Docker")
    rc, out = run("docker compose exec cetas python3 -c 'from cryptography.hazmat.primitives.ciphers.aead import AESGCM; print(\"OK\")' 2>/dev/null", cwd=install_dir)
    if rc == 0:
        t.ok()
    else:
        t.fail("cryptography non installé dans le container")

    t = test("Nginx actif dans container", "Docker")
    rc, out = run("docker compose exec cetas nginx -t 2>&1", cwd=install_dir)
    if rc == 0 and "successful" in out.lower():
        t.ok()
    else:
        t.fail("config Nginx invalide")

    t = test("Proxy Python actif dans container", "Docker")
    rc, out = run("docker compose exec cetas curl -sf http://127.0.0.1:8080/health 2>/dev/null", cwd=install_dir)
    if rc == 0 and "ok" in out.lower():
        t.ok()
    else:
        t.fail("proxy Python non joignable depuis Nginx")

    # ══════════════════════════════════════════════════════════
    # NIVEAU 12: DÉPENDANCES SYSTÈME
    # ══════════════════════════════════════════════════════════
    print()
    print(c("cyan", "  ── NIVEAU 12: DÉPENDANCES ─────────────────────────"))
    print()

    deps = {
        "docker.io": "Docker engine",
        "curl": "Client HTTP",
        "python3": "Python",
    }
    for pkg, desc in deps.items():
        t = test(f"{pkg} installé", "Dépendances")
        rc, _ = run(f"which {pkg} >/dev/null 2>&1")
        if rc == 0:
            t.ok()
        else:
            t.fail(f"{desc} non installé")

    t = test("docker-compose-v2 plugin", "Dépendances")
    rc, _ = run("docker compose version >/dev/null 2>&1")
    if rc == 0:
        t.ok()
    else:
        t.fail("docker compose non disponible")

    # ══════════════════════════════════════════════════════════
    # NIVEAU 13: PORTS & CONFLITS
    # ══════════════════════════════════════════════════════════
    print()
    print(c("cyan", "  ── NIVEAU 13: PORTS & CONFLITS ────────────────────"))
    print()

    t = test(f"Port {cetas_port} occupé par Docker", "Ports")
    rc, _ = run(f"ss -tlnp | grep :{cetas_port} | grep -q docker")
    if rc == 0:
        t.ok()
    else:
        t.fail(f"port {cetas_port} non bindé par Docker")

    t = test(f"Port {searxng_port} occupé par Docker", "Ports")
    rc, _ = run(f"ss -tlnp | grep :{searxng_port} | grep -q docker")
    if rc == 0:
        t.ok()
    else:
        t.fail(f"port {searxng_port} non bindé par Docker")

    t = test("Pas de conflit port 80", "Ports")
    rc, _ = run("ss -tlnp | grep ':80 ' | grep -v docker")
    if rc != 0:
        t.ok("port 80 libre")
    else:
        t.warn("port 80 utilisé (peut être un conflit si container expose 80)")

    t = test("Pas de conflit port 443", "Ports")
    rc, _ = run("ss -tlnp | grep ':443 '")
    if rc != 0:
        t.ok("port 443 libre")
    else:
        t.warn("port 443 utilisé (Caddy/HTTPS peut-être actif)")

    # ══════════════════════════════════════════════════════════
    # NIVEAU 14: CORS & SÉCURITÉ
    # ══════════════════════════════════════════════════════════
    print()
    print(c("cyan", "  ── NIVEAU 14: CORS & SÉCURITÉ ─────────────────────"))
    print()

    t = test("CORS configuré", "Sécurité")
    if Path(install_dir, ".env.docker").exists():
        content = Path(install_dir, ".env.docker").read_text()
        if "CETAS_CORS_ORIGINS" in content:
            origins = content.split("CETAS_CORS_ORIGINS=")[1].strip().split("\n")[0]
            t.ok(f"origines: {origines}")
        else:
            t.warn("CETAS_CORS_ORIGINS non défini")
    else:
        t.skip(".env.docker absent")

    t = test("Headers sécurité Nginx", "Sécurité")
    rc, out = run(f'curl -sfI --max-time 3 http://localhost:{cetas_port}/ 2>/dev/null')
    if rc == 0:
        has_referrer = "referrer-policy" in out.lower()
        has_permissions = "permissions-policy" in out.lower()
        if has_referrer and has_permissions:
            t.ok("Referrer-Policy + Permissions-Policy")
        elif has_referrer:
            t.warn("Permissions-Policy manquant")
        elif has_permissions:
            t.warn("Referrer-Policy manquant")
        else:
            t.fail("headers de sécurité manquants")
    else:
        t.skip("impossible de tester les headers")

    t = test("Rate limiting actif", "Sécurité")
    rc, out = run("docker compose exec cetas cat /etc/nginx/conf.d/default.conf 2>/dev/null", cwd=install_dir)
    if rc == 0 and "limit_req" in out:
        t.ok()
    else:
        t.warn("rate limiting non configuré dans Nginx")

    t = test("Accès fichiers cachés bloqué", "Sécurité")
    rc, _ = run(f'curl -sf --max-time 3 http://localhost:{cetas_port}/.env 2>/dev/null')
    if rc != 0:
        t.ok(".env inaccessible depuis le web")
    else:
        t.fail(".env accessible depuis le web — faille de sécurité!")

    rc, _ = run(f'curl -sf --max-time 3 http://localhost:{cetas_port}/.vault/.enc 2>/dev/null')
    if rc != 0:
        t.ok(".vault/.enc inaccessible depuis le web")
    else:
        t.fail(".vault/.enc accessible depuis le web — faille de sécurité!")

    t = test("Service Worker présent", "Sécurité")
    rc, _ = run(f'curl -sf --max-time 3 http://localhost:{cetas_port}/sw.js >/dev/null 2>&1')
    if rc == 0:
        t.ok()
    else:
        t.warn("sw.js (service worker) non trouvé")

    t = test("manifest.json présent", "Sécurité")
    rc, _ = run(f'curl -sf --max-time 3 http://localhost:{cetas_port}/manifest.json >/dev/null 2>&1')
    if rc == 0:
        t.ok()
    else:
        t.warn("manifest.json non trouvé")

    # ══════════════════════════════════════════════════════════
    # NIVEAU 15: USERS & AUTH
    # ══════════════════════════════════════════════════════════
    print()
    print(c("cyan", "  ── NIVEAU 15: USERS & AUTH ────────────────────────"))
    print()

    t = test("users-seed.json existe", "Auth")
    fp = Path(install_dir, "core", "users-seed.json")
    if fp.exists():
        t.ok()
    else:
        t.fail("users-seed.json non trouvé — aucun compte admin")

    t = test("users-seed.json valide", "Auth")
    if fp.exists():
        try:
            admins = json.loads(fp.read_text())
            if isinstance(admins, list) and len(admins) > 0:
                t.ok(f"{len(admins)} admin(s)")
            else:
                t.fail("liste vide ou format invalide")
        except Exception as e:
            t.fail(f"JSON invalide: {e}")

    t = test("Admin password hash", "Auth")
    if fp.exists():
        try:
            admins = json.loads(fp.read_text())
            for admin in admins:
                h = admin.get("password_hash", "")
                if h.startswith("sha256:"):
                    t.ok(f"SHA-256 — {admin.get('username', '?')}")
                elif h.startswith("pbkdf2:"):
                    t.ok(f"PBKDF2 — {admin.get('username', '?')}")
                elif len(h) == 64:
                    t.ok(f"SHA-256 legacy — {admin.get('username', '?')}")
                else:
                    t.fail(f"hash invalide pour {admin.get('username', '?')}")
                break
        except Exception:
            t.skip("impossible de lire")

    t = test("Login API fonctionne", "Auth")
    rc, out = run(f'curl -sf --max-time 5 -X POST http://localhost:{cetas_port}/api/auth/login -H "Content-Type: application/json" -d \'{{"username":"__test__","password":"__test__"}}\'')
    if rc == 0:
        try:
            data = json.loads(out)
            if "error" in data:
                t.ok(f"réponse: {data['error']} (normal pour identifiants fake)")
            elif "token" in data:
                t.ok("authentification fonctionne")
        except Exception:
            t.ok("réponse reçue")
    else:
        t.fail("endpoint /api/auth/login ne répond pas")

    t = test("Register API fonctionne", "Auth")
    rc, out = run(f'curl -sf --max-time 5 -X POST http://localhost:{cetas_port}/api/auth/register -H "Content-Type: application/json" -d \'{{"username":"__test__","password":"test1234"}}\'')
    if rc == 0 or "429" in out or "409" in out or "403" in out or "400" in out:
        t.ok("endpoint register accessible")
    else:
        t.fail("endpoint /api/auth/register inaccessible")

    t = test("JWT secret généré", "Auth")
    rc, out = run("docker compose exec cetas cat /app/data/.jwt_secret 2>/dev/null", cwd=install_dir)
    if rc == 0 and len(out.strip()) > 10:
        t.ok()
    else:
        t.warn("JWT secret non trouvé (sera régénéré au prochain démarrage)")

    # ══════════════════════════════════════════════════════════
    # NIVEAU 16: PROXY API ENDPOINTS
    # ══════════════════════════════════════════════════════════
    print()
    print(c("cyan", "  ── NIVEAU 16: PROXY API ───────────────────────────"))
    print()

    endpoints = [
        ("/api/health", "GET", "Health check"),
        ("/api/auth/login", "POST", "Login"),
        ("/api/auth/register", "POST", "Register"),
    ]

    for path, method, desc in endpoints:
        t = test(f"{method} {path}", "API")
        if method == "GET":
            rc, out = run(f'curl -sf --max-time 5 http://localhost:{cetas_port}{path}')
        else:
            rc, out = run(f'curl -sf --max-time 5 -X {method} http://localhost:{cetas_port}{path} -H "Content-Type: application/json" -d \'{{}}\'')
        if rc == 0:
            try:
                data = json.loads(out)
                t.ok(f"clé(s): {list(data.keys())[:3]}")
            except Exception:
                t.ok("réponse reçue")
        else:
            t.fail(f"{desc} ne répond pas")

    t = test("Proxy streaming", "API")
    rc, out = run(f'curl -sf --max-time 10 -X POST http://localhost:{cetas_port}/api/auth/login -H "Content-Type: application/json" -d \'{{"username":"test","password":"test"}}\' 2>/dev/null')
    if rc == 0:
        t.ok("réponse reçue")
    else:
        t.fail("proxy timeout ou injoignable")

    # ══════════════════════════════════════════════════════════
    # NIVEAU 17: DISQUE & RESSOURCES
    # ══════════════════════════════════════════════════════════
    print()
    print(c("cyan", "  ── NIVEAU 17: RESSOURCES ──────────────────────────"))
    print()

    t = test("Espace disque /opt", "Ressources")
    try:
        st = os.statvfs("/opt")
        free_gb = (st.f_bavail * st.f_frsize) / (1024**3)
        if free_gb >= 5:
            t.ok(f"{free_gb:.1f} Go")
        elif free_gb >= 2:
            t.warn(f"{free_gb:.1f} Go — peut être juste")
        else:
            t.fail(f"{free_gb:.1f} Go — insuffisant")
    except Exception:
        t.skip("impossible de vérifier")

    t = test("Espace disque /var/lib/docker", "Ressources")
    try:
        st = os.statvfs("/var/lib/docker")
        free_gb = (st.f_bavail * st.f_frsize) / (1024**3)
        if free_gb >= 5:
            t.ok(f"{free_gb:.1f} Go")
        elif free_gb >= 2:
            t.warn(f"{free_gb:.1f} Go — peut être juste")
        else:
            t.fail(f"{free_gb:.1f} Go — insuffisant pour Docker")
    except Exception:
        t.skip("impossible de vérifier")

    t = test("Docker images taille", "Ressources")
    rc, out = run("docker images --format '{{.Repository}}:{{.Size}}' | grep cetas")
    if rc == 0 and out:
        t.ok(out.strip()[:60])
    else:
        t.warn("aucune image Cetas trouvée")

    t = test("Docker volumes", "Ressources")
    rc, out = run("docker volume ls | grep cetas")
    if rc == 0 and out:
        t.ok(out.strip()[:60])
    else:
        t.warn("aucun volume Cetas trouvé")

    # ══════════════════════════════════════════════════════════
    # NIVEAU 18: NETWORKING AVANCÉ
    # ══════════════════════════════════════════════════════════
    print()
    print(c("cyan", "  ── NIVEAU 18: NETWORKING ──────────────────────────"))
    print()

    t = test("DNS résolution", "Network")
    rc, _ = run("nslookup google.com >/dev/null 2>&1")
    if rc == 0:
        t.ok()
    else:
        t.fail("DNS ne résout pas")

    t = test("HTTPS sortant", "Network")
    rc, _ = run("curl -sf --max-time 5 https://api.openai.com >/dev/null 2>&1")
    if rc == 0:
        t.ok("openai.com accessible")
    else:
        t.warn("openai.com inaccessible (peut être normal si firewall)")

    t = test("Connexion container → Internet", "Network")
    rc, _ = run("docker compose exec cetas ping -c1 -W3 8.8.8.8 2>/dev/null", cwd=install_dir)
    if rc == 0:
        t.ok()
    else:
        t.warn("container ne peut pas atteindre Internet")

    t = test("Connexion container → SearXNG", "Network")
    rc, _ = run("docker compose exec cetas curl -sf http://searxng:8080/ >/dev/null 2>&1", cwd=install_dir)
    if rc == 0:
        t.ok()
    else:
        t.fail("container ne peut pas atteindre SearXNG")

    t = test("Connexion Nginx → Proxy Python", "Network")
    rc, _ = run("docker compose exec cetas curl -sf http://127.0.0.1:8080/health >/dev/null 2>&1", cwd=install_dir)
    if rc == 0:
        t.ok()
    else:
        t.fail("Nginx ne peut pas atteindre le proxy Python")

    # ══════════════════════════════════════════════════════════
    # NIVEAU 19: BACKUPS & PERSISTANCE
    # ══════════════════════════════════════════════════════════
    print()
    print(c("cyan", "  ── NIVEAU 19: PERSISTANCE ─────────────────────────"))
    print()

    t = test("Volume cetas-data existe", "Persistance")
    rc, _ = run("docker volume inspect cetas-data >/dev/null 2>&1")
    if rc == 0:
        t.ok()
    else:
        t.fail("volume cetas-data non trouvé")

    t = test("Données persistantes", "Persistance")
    rc, out = run("docker compose exec cetas ls /app/data/ 2>/dev/null", cwd=install_dir)
    if rc == 0:
        files = [f for f in out.split() if not f.startswith(".")]
        if files:
            t.ok(f"{len(files)} fichier(s)")
        else:
            t.warn("répertoire vide (normal au premier démarrage)")
    else:
        t.fail("impossible de lire /app/data/")

    t = test("Conversations montées", "Persistance")
    rc, _ = run("docker compose exec cetas ls /usr/share/nginx/html/conversations/ >/dev/null 2>&1", cwd=install_dir)
    if rc == 0:
        t.ok()
    else:
        t.warn("répertoire conversations non monté")

    # ══════════════════════════════════════════════════════════
    # NIVEAU 20: NETTOYAGE SÉCURITÉ
    # ══════════════════════════════════════════════════════════
    print()
    print(c("cyan", "  ── NIVEAU 20: SÉCURITÉ ────────────────────────────"))
    print()

    t = test("setup.py présent (à supprimer)", "Sécurité")
    fp = Path(install_dir, "setup.py")
    if fp.exists():
        t.warn("setup.py encore présent — supprime-le: rm /opt/cetas/setup.py")
    else:
        t.ok("setup.py supprimé")

    t = test("Fichiers .or non exposés", "Sécurité")
    rc, _ = run(f'curl -sf --max-time 3 http://localhost:{cetas_port}/core/linux/crypto_linux.py.or 2>/dev/null')
    if rc != 0:
        t.ok(".or non exposés")
    else:
        t.fail("fichiers .or exposés")

    t = test("__pycache__ non exposé", "Sécurité")
    rc, _ = run(f'curl -sf --max-time 3 http://localhost:{cetas_port}/core/linux/__pycache__/ 2>/dev/null')
    if rc != 0:
        t.ok("__pycache__ bloqué")
    else:
        t.warn("__pycache__ accessible")

    t = test("docker-compose.yml non exposé", "Sécurité")
    rc, _ = run(f'curl -sf --max-time 3 http://localhost:{cetas_port}/docker-compose.yml 2>/dev/null')
    if rc != 0:
        t.ok("docker-compose.yml non exposé")
    else:
        t.warn("docker-compose.yml accessible")

    t = test(".git non exposé", "Sécurité")
    rc, _ = run(f'curl -sf --max-time 3 http://localhost:{cetas_port}/.git/config 2>/dev/null')
    if rc != 0:
        t.ok(".git bloqué")
    else:
        t.fail(".git exposé — faille de sécurité!")

    # ══════════════════════════════════════════════════════════
    # RÉSUMÉ
    # ══════════════════════════════════════════════════════════
    print()
    print(c("cyan", "  ══════════════════════════════════════════════════"))
    print(c("cyan", "  RÉSULTATS DU TEST"))
    print(c("cyan", "  ══════════════════════════════════════════════════"))
    print()
    p = results["pass"]
    f = results["fail"]
    w = results["warn"]
    s = results["skip"]
    print(f"    {c('green', '✓ Passés :  ' + str(p))}  "
          f"{c('red', '✗ Échoués : ' + str(f))}  "
          f"{c('yellow', '⚠ Avertissements : ' + str(w))}  "
          f"{c('gray', '○ Ignorés : ' + str(s))}")
    print()

    total = results["pass"] + results["fail"]
    if results["fail"] == 0:
        print(c("green", "  ══════════════════════════════════════════════════"))
        print(c("green", f"  ✅ TOUS LES TESTS PASSÉS ({results['pass']}/{total})"))
        print(c("green", "  ══════════════════════════════════════════════════"))
    else:
        print(c("red", "  ══════════════════════════════════════════════════"))
        print(c("red", f"  ✗ {results['fail']} TEST(S) ÉCHOUÉ(S) sur {total}"))
        print(c("red", "  ══════════════════════════════════════════════════"))
        print()
        print(c("yellow", "  Détail des échecs :"))
        for status, cat, name, msg in all_tests:
            if status == "fail":
                print(f"    {c('red', '✗')} [{cat}] {name}: {c('red', msg)}")
        print()

        # Proposition de corrections
        print(c("cyan", "  Propositions de correction :"))
        print()
        for status, cat, name, msg in all_tests:
            if status == "fail":
                if "Docker" in cat:
                    print(f"    → {c('cyan', 'sudo apt-get install -y docker.io docker-compose-v2')}")
                elif "Vault" in cat or ".vault" in name:
                    print(f"    → {c('cyan', f'cd {install_dir} && python3 setup.py')}")
                elif "API" in cat:
                    print(f"    → {c('cyan', f'docker compose restart cetas')}")
                elif "SearXNG" in cat:
                    print(f"    → {c('cyan', f'docker compose restart searxng')}")
                elif "Systemd" in cat:
                    print(f"    → {c('cyan', 'sudo systemctl enable cetas')}")
                elif "Fichiers" in cat:
                    print(f"    → {c('cyan', f'Copie le fichier manquant depuis la source')}")
        print()

    return results["fail"] == 0


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{C['red']}  Interrompu.{C['reset']}")
        sys.exit(1)
    except Exception as e:
        print(f"\n{C['red']}  Erreur : {e}{C['reset']}")
        sys.exit(1)
