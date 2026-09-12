import sys
import os
import getpass
import threading
import datetime
import base64
import hashlib
import json

COFFRE = "coffre.enc"

def gen_key(password: str) -> bytes:
    return base64.urlsafe_b64encode(hashlib.sha256(password.encode()).digest())

def load_coffre():
    if not os.path.exists(COFFRE):
        print("\033[1;31m  ✗ Coffre introuvable. Lancez: python setup_coffre.py\033[0m")
        sys.exit(1)
    try:
        from cryptography.fernet import Fernet, InvalidToken
    except ImportError:
        print("\033[1;31m  ✗ Lancez: pip install cryptography\033[0m")
        sys.exit(1)
    pwd = getpass.getpass("  Mot de passe coffre : ")
    key = gen_key(pwd)
    f = Fernet(key)
    try:
        with open(COFFRE, "rb") as fp:
            data = json.loads(f.decrypt(fp.read()).decode())
        return data
    except Exception:
        print("\033[1;31m  ✗ Mot de passe coffre incorrect.\033[0m")
        sys.exit(1)

def clear():
    os.system('cls' if os.name == 'nt' else 'clear')

def banner():
    print("\033[1;32m")
    print("╔══════════════════════════════════════════════╗")
    print("║         SAM AGENT — OPEN INTERPRETER         ║")
    print("║         by Marexsoft Corporation             ║")
    print("╚══════════════════════════════════════════════╝")
    print("\033[0m")

def auth(app_password):
    clear()
    banner()
    print("\033[1;33m🔐 Authentification requise\033[0m\n")
    for attempt in range(3):
        pwd = getpass.getpass("  Mot de passe app : ")
        if pwd == app_password:
            print("\n\033[1;32m  ✓ Accès autorisé\033[0m\n")
            return True
        else:
            remaining = 2 - attempt
            if remaining > 0:
                print(f"\033[1;31m  ✗ Incorrect. {remaining} tentative(s) restante(s)\033[0m")
            else:
                print("\033[1;31m  ✗ Accès refusé. Au revoir.\033[0m\n")
    return False

def timestamp():
    return datetime.datetime.now().strftime("%H:%M:%S")

def print_user(msg):
    print(f"\n\033[1;34m╔══ Vous [{timestamp()}]\033[0m")
    print(f"\033[0;34m║  {msg}\033[0m")
    print(f"\033[1;34m╚{'═' * 40}\033[0m")

def print_agent(msg):
    print(f"\n\033[1;32m╔══ Agent [{timestamp()}]\033[0m")
    for line in msg.strip().split('\n'):
        print(f"\033[0;32m║  {line}\033[0m")
    print(f"\033[1;32m╚{'═' * 40}\033[0m")

def print_system(msg):
    print(f"\n\033[1;33m  ▶ {msg}\033[0m")

def print_error(msg):
    print(f"\n\033[1;31m  ✗ {msg}\033[0m")

def spinner_start(msg):
    import itertools, time
    stop_event = threading.Event()
    def spin():
        for c in itertools.cycle(['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']):
            if stop_event.is_set():
                break
            sys.stdout.write(f"\r\033[1;33m  {c} {msg}\033[0m ")
            sys.stdout.flush()
            time.sleep(0.1)
        sys.stdout.write("\r" + " " * 50 + "\r")
        sys.stdout.flush()
    t = threading.Thread(target=spin, daemon=True)
    t.start()
    return stop_event

def main():
    secrets = load_coffre()
    app_password = secrets.get("app_password", "")
    api_key = secrets.get("api_key", "")

    if not auth(app_password):
        sys.exit(1)

    clear()
    banner()

    print("\033[0;37m  Chargement d'Open Interpreter...\033[0m")

    try:
        from interpreter import interpreter
    except ImportError:
        print_error("Open Interpreter non installé. Lancez: pip install open-interpreter")
        sys.exit(1)

    interpreter.llm.api_key = api_key
    interpreter.llm.model = "openrouter/deepseek/deepseek-v4-flash"
    interpreter.auto_run = True
    interpreter.verbose = False

    print_system("Agent prêt. Tapez votre demande.")
    print("\033[0;37m  /quitter pour fermer | /effacer pour vider l'écran | /historique\033[0m\n")
    print("\033[1;30m" + "─" * 50 + "\033[0m")

    history = []

    while True:
        try:
            print(f"\n\033[1;34m┌─ Vous\033[0m")
            user_input = input("\033[1;34m└▶ \033[0m").strip()

            if not user_input:
                continue

            if user_input.lower() in ['/quitter', '/exit', '/quit']:
                print_system("Au revoir.")
                break

            if user_input.lower() in ['/effacer', '/clear']:
                clear()
                banner()
                print_system("Écran vidé.")
                continue

            if user_input.lower() == '/historique':
                if not history:
                    print_system("Aucun historique.")
                else:
                    for i, h in enumerate(history, 1):
                        print(f"\033[0;37m  [{i}] {h['user']}\033[0m")
                continue

            print_user(user_input)

            stop = spinner_start("Agent réfléchit...")

            try:
                response = interpreter.chat(user_input, display=False, stream=False)
                stop.set()

                if response:
                    full_response = ""
                    for chunk in response:
                        if isinstance(chunk, dict):
                            content = chunk.get('content', '')
                            if content:
                                full_response += str(content)
                        else:
                            full_response += str(chunk)

                    if full_response.strip():
                        print_agent(full_response)
                        history.append({'user': user_input, 'agent': full_response})
                    else:
                        print_agent("Tâche exécutée.")
                        history.append({'user': user_input, 'agent': 'Tâche exécutée.'})
                else:
                    print_agent("Tâche exécutée.")

            except Exception as e:
                stop.set()
                print_error(f"Erreur: {str(e)}")

        except KeyboardInterrupt:
            print("\n")
            print_system("Interruption. Au revoir.")
            break
        except EOFError:
            break

if __name__ == "__main__":
    main()
