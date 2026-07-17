// ============================================================
// auth.js — Authentification Cetas (chargé avant app.js)
// Non-module — expose l'objet global Auth
// ============================================================
const Auth = (() => {
  'use strict';

  const LS_USERS = 'cetas-users';
  const SS_SESSION = 'cetas-session';
  const SS_VAULT_KEY = 'cetas-vault-key';       // clé AES-256 raw hex
  const LS_VAULT_KEYS = 'cetas-vault-keys';      // clés API chiffrées
  const LS_LEGACY_KEYS = 'minou-apikeys';         // ancien stockage en clair
  const SEED_URL = 'core/users-seed.json';
  const PBKDF2_ITER = 600000;

  let _currentUser = null; // {username, email, role, created_at}
  let _vaultReady = false; // true si la clé de coffre est disponible

  // --- Helpers ---

  /** SHA256 via Web Crypto API */
  async function _sha256(text) {
    const enc = new TextEncoder();
    const data = enc.encode(text);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const arr = Array.from(new Uint8Array(hash));
    return arr.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /** Lire les utilisateurs depuis localStorage */
  function _readUsers() {
    try {
      const s = localStorage.getItem(LS_USERS);
      return s ? JSON.parse(s) : [];
    } catch (e) {
      return [];
    }
  }

  /** Écrire les utilisateurs dans localStorage */
  function _writeUsers(users) {
    localStorage.setItem(LS_USERS, JSON.stringify(users));
  }

  /** Créer une session */
  function _createSession(user) {
    const session = {
      username: user.username,
      email: user.email,
      role: user.role || 'user',
      loginTime: Date.now()
    };
    sessionStorage.setItem(SS_SESSION, JSON.stringify(session));
    localStorage.setItem('cetas-user', user.username);
    _currentUser = session;
  }

  /** Détruire la session */
  function _clearSession() {
    sessionStorage.removeItem(SS_SESSION);
    _currentUser = null;
  }

  /** Restaurer la session existante */
  function _restoreSession() {
    try {
      const s = sessionStorage.getItem(SS_SESSION);
      if (s) {
        _currentUser = JSON.parse(s);
        _vaultReady = !!sessionStorage.getItem(SS_VAULT_KEY);
        return true;
      }
    } catch (e) {}
    return false;
  }

  // --- Bootstrap première exécution ---

  async function _bootstrapUsers() {
    let users = _readUsers();

    // Toujours tenter de sync depuis le seed setup.py
    // (ajoute les nouveaux comptes sans écraser les existants)
    try {
      const resp = await fetch(SEED_URL);
      if (resp.ok) {
        const seed = await resp.json();
        if (Array.isArray(seed) && seed.length > 0) {
          let changed = false;
          for (const su of seed) {
            if (!users.find(u => u.username === su.username)) {
              users.push({
                username: su.username,
                email: su.email || '',
                password_hash: su.password_hash,
                role: 'admin',
                created_at: su.created_at || new Date().toISOString()
              });
              changed = true;
            }
          }
          if (changed) _writeUsers(users);
        }
      }
    } catch (e) {
      // Fichier seed inexistant
    }

    if (users.length > 0) return users;

    // Fallback — compte admin par défaut
    const defaultHash = await _sha256('admin');
    users = [{
      username: 'admin',
      email: 'admin@cetas.local',
      password_hash: defaultHash,
      role: 'admin',
      created_at: new Date().toISOString()
    }];
    _writeUsers(users);
    return users;
  }

  // --- Coffre clés API (PBKDF2 + AES-256-GCM) ---

  function _hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
  }

  function _bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /** Dérive une clé AES-256 depuis le mot de passe via PBKDF2 */
  async function _deriveVaultKey(password) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
    );
    const derived = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode('cetas-vault-salt-v1'), iterations: PBKDF2_ITER, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true, // extractable
      ['encrypt', 'decrypt']
    );
    return derived;
  }

  /** Stocke la clé dans sessionStorage (raw hex) */
  async function _storeVaultKey(cryptoKey) {
    const raw = await crypto.subtle.exportKey('raw', cryptoKey);
    sessionStorage.setItem(SS_VAULT_KEY, _bytesToHex(new Uint8Array(raw)));
    _vaultReady = true;
  }

  /** Récupère la clé depuis sessionStorage (null si absente) */
  async function _getVaultKey() {
    if (!_vaultReady) return null;
    const hex = sessionStorage.getItem(SS_VAULT_KEY);
    if (!hex) return null;
    try {
      return await crypto.subtle.importKey(
        'raw', _hexToBytes(hex), 'AES-GCM', false, ['encrypt', 'decrypt']
      );
    } catch (e) {
      return null;
    }
  }

  /** Initialise le coffre au login (appelé après authentification réussie) */
  async function _vaultInit(password) {
    const key = await _deriveVaultKey(password);
    await _storeVaultKey(key);
    // Migration : anciennes clés en clair → coffre chiffré
    await _vaultMigrate();
  }

  /** Migre minou-apikeys → cetas-vault-keys */
  async function _vaultMigrate() {
    const legacy = localStorage.getItem(LS_LEGACY_KEYS);
    if (!legacy) return;
    const existing = localStorage.getItem(LS_VAULT_KEYS);
    if (existing) return; // déjà migré
    try {
      // Ré-encrypte avec la clé du coffre
      const key = await _getVaultKey();
      if (!key) return;
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const enc = new TextEncoder();
      const ct = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv }, key, enc.encode(legacy)
      );
      const combined = new Uint8Array(iv.length + ct.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(ct), iv.length);
      localStorage.setItem(LS_VAULT_KEYS, _bytesToHex(combined));
      localStorage.removeItem(LS_LEGACY_KEYS);
    } catch (e) {
      // Échec silencieux — on retentera au prochain login
    }
  }

  // --- API publique ---

  return {
    /** Initialise l'auth. Retourne une Promise qui resolve quand l'utilisateur est connecté. */
    async init() {
      // Restaurer session existante ?
      if (_restoreSession()) return _currentUser;

      // Bootstrap les utilisateurs
      await _bootstrapUsers();

      // Afficher l'overlay de login et attendre
      return new Promise((resolve) => {
        const overlay = document.getElementById('login-overlay');
        if (!overlay) {
          // Fallback : pas d'overlay → admin auto
          const users = _readUsers();
          _createSession(users[0]);
          resolve(_currentUser);
          return;
        }

        overlay.style.display = 'flex';
        const form = document.getElementById('login-form');
        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');
        const errorEl = document.getElementById('login-error');
        const bodyEl = document.body;

        // Masquer le body de l'app tant que pas connecté
        bodyEl.classList.add('auth-locked');

        function showError(msg) {
          if (errorEl) {
            errorEl.textContent = msg;
            errorEl.style.display = 'block';
          }
        }

        function hideError() {
          if (errorEl) errorEl.style.display = 'none';
        }

        async function handleLogin() {
          hideError();
          const username = usernameInput.value.trim();
          const password = passwordInput.value;

          if (!username || !password) {
            showError('Veuillez remplir tous les champs.');
            return;
          }

          try {
            const result = await Auth.login(username, password);
            if (result) {
              overlay.style.display = 'none';
              bodyEl.classList.remove('auth-locked');
              resolve(_currentUser);
            } else {
              showError('Identifiants incorrects.');
            }
          } catch (e) {
            showError('Erreur d\'authentification. Réessayez.');
          }
        }

        if (form) {
          form.addEventListener('submit', (e) => {
            e.preventDefault();
            handleLogin();
          });
        }

        // Bouton login
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
          loginBtn.addEventListener('click', handleLogin);
        }

        // Enter sur les champs
        passwordInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') handleLogin();
        });
      });
    },

    /** Tente de connecter l'utilisateur. Retourne true si succès. */
    async login(username, password) {
      const users = _readUsers();
      const hash = await _sha256(password);
      const user = users.find(u => u.username === username && u.password_hash === hash);
      if (!user) return false;
      _createSession(user);
      // Dériver la clé de coffre depuis le mot de passe
      await _vaultInit(password);
      return true;
    },

    /** Déconnecte l'utilisateur et recharge la page */
    logout() {
      _clearSession();
      sessionStorage.removeItem(SS_VAULT_KEY);
      _vaultReady = false;
      window.location.reload();
    },

    /** Retourne l'utilisateur connecté ou null */
    getCurrentUser() {
      if (!_currentUser) _restoreSession();
      return _currentUser ? { ..._currentUser } : null;
    },

    /** L'utilisateur connecté est-il admin ? */
    isAdmin() {
      const u = Auth.getCurrentUser();
      return u && u.role === 'admin';
    },

    /** Le coffre de clés API est-il prêt ? */
    isVaultReady() {
      return _vaultReady;
    },

    /** Chiffre une chaîne avec la clé de coffre → hex (iv + ciphertext) */
    async vaultEncrypt(plaintext) {
      const key = await _getVaultKey();
      if (!key) throw new Error('Coffre non disponible.');
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const enc = new TextEncoder();
      const ct = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv }, key, enc.encode(plaintext)
      );
      const combined = new Uint8Array(iv.length + ct.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(ct), iv.length);
      return _bytesToHex(combined);
    },

    /** Déchiffre une chaîne chiffrée par vaultEncrypt → texte clair */
    async vaultDecrypt(hexCiphertext) {
      const key = await _getVaultKey();
      if (!key) throw new Error('Coffre non disponible.');
      const combined = _hexToBytes(hexCiphertext);
      const iv = combined.slice(0, 12);
      const ct = combined.slice(12);
      const pt = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv }, key, ct
      );
      return new TextDecoder().decode(pt);
    },

    /** Admin : liste tous les utilisateurs */
    listUsers() {
      if (!Auth.isAdmin()) return [];
      return _readUsers().map(u => ({
        username: u.username,
        email: u.email || '',
        role: u.role || 'user',
        created_at: u.created_at || ''
      }));
    },

    /** Admin : crée un utilisateur */
    async createUser(username, email, password, role) {
      if (!Auth.isAdmin()) throw new Error('Permission refusée.');
      const users = _readUsers();
      if (users.find(u => u.username === username)) {
        throw new Error('Cet utilisateur existe déjà.');
      }
      const hash = await _sha256(password);
      users.push({
        username,
        email: email || '',
        password_hash: hash,
        role: role || 'user',
        created_at: new Date().toISOString()
      });
      _writeUsers(users);
      return true;
    },

    /** Admin : met à jour un utilisateur */
    async updateUser(username, data) {
      if (!Auth.isAdmin()) throw new Error('Permission refusée.');
      const users = _readUsers();
      const idx = users.findIndex(u => u.username === username);
      if (idx === -1) throw new Error('Utilisateur introuvable.');
      if (data.email !== undefined) users[idx].email = data.email;
      if (data.role !== undefined) users[idx].role = data.role;
      if (data.password) {
        users[idx].password_hash = await _sha256(data.password);
      }
      _writeUsers(users);
      return true;
    },

    /** Admin : supprime un utilisateur */
    deleteUser(username) {
      if (!Auth.isAdmin()) throw new Error('Permission refusée.');
      const current = Auth.getCurrentUser();
      if (current && current.username === username) {
        throw new Error('Vous ne pouvez pas supprimer votre propre compte.');
      }
      const users = _readUsers();
      const filtered = users.filter(u => u.username !== username);
      if (filtered.length === users.length) return false;
      _writeUsers(filtered);
      return true;
    },

    /** Change le mot de passe de l'utilisateur connecté */
    async changePassword(oldPassword, newPassword) {
      const current = Auth.getCurrentUser();
      if (!current) throw new Error('Non connecté.');
      const users = _readUsers();
      const idx = users.findIndex(u => u.username === current.username);
      if (idx === -1) throw new Error('Utilisateur introuvable.');
      const oldHash = await _sha256(oldPassword);
      if (users[idx].password_hash !== oldHash) {
        throw new Error('Mot de passe actuel incorrect.');
      }
      users[idx].password_hash = await _sha256(newPassword);
      _writeUsers(users);
      return true;
    }
  };
})();
