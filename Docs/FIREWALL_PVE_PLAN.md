# Firewall PVE — Modèle Tailscale-Only Admin

> Date : 2026-09-01
> Host : NEVA (192.168.10.75 / 10.10.10.1)
> OS : Debian 13 (Trixie) — Proxmox VE 9.2.11 — Kernel 7.0.2-6-pve
> Statut : **ACTIF** ✅

---

## Principe

L'host PVE n'est accessible qu'**uniquement via Tailscale** (VPN) pour l'administration.
Les apps publiques (nginx router → sous-domaines) restent ouvertes depuis Internet.

```
Internet → :80/:443 → nginx router → LXC 105 → apps (cetas, nws, nsweb)
Internet → :41641/udp → Tailscale DERP
Tailscale → :22 (SSH), :3128 (SPICE), :8006 (Proxmox UI)
LAN → :22 (SSH), :3128 (SPICE), :8006 (Proxmox UI)
```

---

## Matrice de sécurité

| Port | Service | Internet | Tailscale | LAN | Containers |
|------|---------|----------|-----------|-----|------------|
| :22 | SSH | ❌ | ✅ | ✅ | ✅ |
| :80 | nginx router | ✅ | ✅ | ✅ | ✅ |
| :443 | nginx router | ✅ | ✅ | ✅ | ✅ |
| :3128 | SPICE proxy | ❌ | ✅ | ✅ | ✅ |
| :8006 | Proxmox UI | ❌ | ✅ | ✅ | ✅ |
| :41641 | Tailscale | ✅ | ✅ | ✅ | ✅ |
| :111 | rpcbind | ❌ | ❌ | ❌ | ❌ |

---

## Fichiers de configuration

### `/etc/pve/firewall/cluster.fw` (activer le système + management ipset)

```ini
[OPTIONS]
enable: 1

[ipset management]
192.168.10.0/24
100.64.0.0/10
10.10.10.0/24
10.10.99.0/24
127.0.0.0/8
```

### `/etc/pve/firewall/host.fw` (règles host)

```ini
[OPTIONS]
enable: 1

[IN]
# NGINX ROUTER — Apps publiques
80 - TCP - ACCEPT - 0.0.0.0/0
443 - TCP - ACCEPT - 0.0.0.0/0

# TAILSCALE — Port DERP
41641 - UDP - ACCEPT - 0.0.0.0/0

# BLOQUAGE EXPLICITE
111 - TCP - DROP - 0.0.0.0/0
111 - UDP - DROP - 0.0.0.0/0

[ipset management]
100.64.0.0/10
10.10.10.0/24
10.10.99.0/24
127.0.0.0/8

[OUT]
- - ACCEPT - 0.0.0.0/0
```

---

## Comment ça fonctionne

### Le système de management ipset

Le firewall PVE ne lit pas les règles `[IN]` port par port pour les ports admin.
Il utilise un **ipset** (`PVEFW-0-management-v4`) qui contient les réseaux autorisés.
Les ports admin (22, 3128, 8006, 5900-5999, 60000-60050) ne sont accessibles QUE
depuis les IPs de cet ipset.

```
PVEFW-HOST-IN:
  lo → ACCEPT (loopback)
  INVALID → DROP
  RELATED,ESTABLISHED → ACCEPT
  management-ipset + tcp:8006 → RETURN (Proxmox UI)
  management-ipset + tcp:3128 → RETURN (SPICE)
  management-ipset + tcp:22 → RETURN (SSH)
  → PVEFW-Drop → DROP
  → DROP
```

### Contenu du management ipset

| Réseau | Usage |
|--------|-------|
| `192.168.10.0/24` | LAN local |
| `100.64.0.0/10` | Tailscale (tous les devices) |
| `10.10.10.0/24` | Containers LXC (vmbr1) |
| `10.10.99.0/24` | Réseau interne 2 (vmbr2) |
| `127.0.0.0/8` | Loopback |

---

## Erreurs rencontrées et solutions

| Erreur | Cause | Solution |
|--------|-------|----------|
| `pve-firewall status: disabled/running` | `cluster.fw` absent ou mal placé | Créer `/etc/pve/firewall/cluster.fw` avec `enable: 1` |
| `enable: type check failed - got '5/s'` | `log_ratelimit` dans `[OPTIONS]` du cluster.fw | Retirer `log_ratelimit` du cluster.fw |
| `firewall disabled` dans compile | `$cluster_conf->{options}->{enable}` non trouvé | Le `cluster.fw` doit être dans `/etc/pve/firewall/` (pas `/etc/pve/`) |
| UFW chains dans iptables | UFW résiduel (package supprimé mais config restante) | `dpkg --purge ufw` |
| Management ipset ne contient que LAN | `[ipset management]` non configuré | Ajouter les réseaux dans `cluster.fw` |

---

## Procédure d'application

### Pré-requis
- Accès Tailscale actif depuis un device (Android/Windows)
- Connexion SSH active vers le host

### Étape 1 — Nettoyer UFW résiduel
```bash
sudo dpkg --purge ufw
```

### Étape 2 — Créer cluster.fw
```bash
sudo cat > /etc/pve/firewall/cluster.fw << 'EOF'
[OPTIONS]
enable: 1

[ipset management]
192.168.10.0/24
100.64.0.0/10
10.10.10.0/24
10.10.99.0/24
127.0.0.0/8
EOF
```

### Étape 3 — Créer host.fw
```bash
sudo cat > /etc/pve/firewall/host.fw << 'EOF'
[OPTIONS]
enable: 1

[IN]
# NGINX ROUTER
80 - TCP - ACCEPT - 0.0.0.0/0
443 - TCP - ACCEPT - 0.0.0.0/0

# TAILSCALE DERP
41641 - UDP - ACCEPT - 0.0.0.0/0

# BLOQUAGE EXPLICITE
111 - TCP - DROP - 0.0.0.0/0
111 - UDP - DROP - 0.0.0.0/0

[ipset management]
100.64.0.0/10
10.10.10.0/24
10.10.99.0/24
127.0.0.0/8

[OUT]
- - ACCEPT - 0.0.0.0/0
EOF
```

### Étape 4 — Activer
```bash
sudo systemctl restart pve-firewall
```

### Étape 5 — Vérifier
```bash
# Status
sudo pve-firewall status
# → Status: enabled/running

# Management ipset
sudo ipset list PVEFW-0-management-v4
# → 5 entries: 192.168.10.0/24, 100.64.0.0/10, 10.10.10.0/24, 10.10.99.0/24, 127.0.0.0/8

# Règles iptables
sudo iptables -L PVEFW-HOST-IN -n
```

### Tests de validation
| # | Test | Résultat attendu |
|---|------|------------------|
| 1 | SSH via Tailscale (`ssh sam@100.65.108.122`) | ✅ Connexion OK |
| 2 | Proxmox UI via Tailscale (`https://100.65.108.122:8006`) | ✅ Page Proxmox |
| 3 | Apps depuis Internet (`curl -I https://cetas.neva-ci.pro`) | ✅ 200 OK |
| 4 | SSH depuis IP publique | ❌ Refusé/timeout |
| 5 | Proxmox depuis IP publique | ❌ Refusé/timeout |

### Rollback
```bash
# Si lockout, depuis accès physique ou console Proxmox :
sudo pve-firewall stop
# Ou :
sudo rm /etc/pve/firewall/host.fw /etc/pve/firewall/cluster.fw
sudo systemctl restart pve-firewall
```

---

## Risques identifiés

| Scénario | Impact | Mitigation |
|----------|--------|------------|
| Tailscale crash | Plus d'accès SSH/UI | Physical access ou restart tailscaled |
| Mauvaise règle | Lockout total | `pve-firewall stop` depuis accès physique |
| Apps cassées | HTTP/HTTPS bloqué | Ports 80/443 ouverts, pas de risque |
| Tailscale compromis | Accès SSH/UI | 2FA sur compte Tailscale |

---

## Notes

- Le trafic inter-containers (vmbr1 → vmbr1) ne passe PAS par le firewall host
- Les containers LXC n'ont pas de firewall activé
- rpcbind (port 111) est fermé car inutile pour un serveur Proxmox
- Le SPICE proxy (port 3128) est nécessaire pour les consoles graphiques Proxmox
- Le firewall PVE utilise iptables legacy (pas nftables) sur cette version
