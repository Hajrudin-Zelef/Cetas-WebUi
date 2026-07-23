// ============================================================
// auth.js — Authentification Cetas (chargé avant app.js)
// Non-module — expose l'objet global Auth
// ============================================================
const Auth = (() => {
  'use strict';

  const LS_USERS = 'cetas-users';
  const SS_SESSION = 'cetas-session';
  const SS_VAULT_KEY = 'cetas-vault-key';       // clé AES-256 raw hex
  const SS_TOKEN = 'cetas-token';               // JWT
  const LS_VAULT_KEYS = 'cetas-vault-keys';      // clés API chiffrées
  const LS_LEGACY_KEYS = 'minou-apikeys';         // ancien stockage en clair
  const SEED_URL = 'core/users-seed.json';
  const PBKDF2_ITER = 600000;

  let _currentUser = null; // {username, email, role, created_at}
  let _vaultReady = false; // true si la clé de coffre est disponible

  // --- Helpers ---

  /** SHA256 via Web Crypto API (conservé pour rétrocompatibilité) */
  async function _sha256(text) {
    const enc = new TextEncoder();
    const data = enc.encode(text);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const arr = Array.from(new Uint8Array(hash));
    return arr.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /** Hash un mot de passe avec PBKDF2 (sel aléatoire, 600k itérations).
   *  Format stocké : "pbkdf2:iterations:salt_hex:hash_hex" */
  async function _hashPassword(password) {
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const derived = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' },
      keyMaterial, 256
    );
    const hashHex = _bytesToHex(new Uint8Array(derived));
    const saltHex = _bytesToHex(salt);
    return 'pbkdf2:' + PBKDF2_ITER + ':' + saltHex + ':' + hashHex;
  }

  /** Vérifie un mot de passe contre un hash stocké.
   *  Gère les deux formats :
   *    - "pbkdf2:iter:salt:hash" (nouveau)
   *    - "abcd1234..." 64 hex chars (ancien SHA-256)
   *  Retourne { valid, needsUpgrade } — needsUpgrade=true si le hash
   *  est au format SHA-256 et doit être migré vers PBKDF2. */
  async function _verifyPassword(password, stored) {
    if (!stored) return { valid: false, needsUpgrade: false };
    // ── Nouveau format PBKDF2 ──
    if (stored.startsWith('pbkdf2:')) {
      var parts = stored.split(':');
      if (parts.length !== 4) return { valid: false, needsUpgrade: false };
      var iterations = parseInt(parts[1], 10);
      var salt = _hexToBytes(parts[2]);
      var expectedHash = parts[3];
      var enc2 = new TextEncoder();
      var km2 = await crypto.subtle.importKey(
        'raw', enc2.encode(password), 'PBKDF2', false, ['deriveBits']
      );
      var der2 = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
        km2, 256
      );
      var hashHex2 = _bytesToHex(new Uint8Array(der2));
      return { valid: hashHex2 === expectedHash, needsUpgrade: false };
    }
    // ── Ancien format SHA-256 ──
    var oldHash = await _sha256(password);
    if (oldHash === stored) {
      return { valid: true, needsUpgrade: true };
    }
    return { valid: false, needsUpgrade: false };
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
    try { localStorage.setItem(LS_USERS, JSON.stringify(users)); }
    catch (e) { console.warn('Impossible d\'écrire les utilisateurs (stockage plein ?) :', e); }
  }

  /** Créer une session */
  function _createSession(user) {
    const session = {
      username: user.username,
      email: user.email,
      role: user.role || 'user',
      loginTime: Date.now()
    };
    // Propager le flag must_change_password s'il existe
    if (user.must_change_password) {
      session.must_change_password = true;
    }
    sessionStorage.setItem(SS_SESSION, JSON.stringify(session));
    localStorage.setItem('cetas-user', user.username);
    _currentUser = session;
  }

  /** Propage le flag must_change_password depuis localStorage vers _currentUser */
  function _propagateFlags(username) {
    var users = _readUsers();
    var localUser = users.find(function(u) { return u.username === username; });
    if (localUser && localUser.must_change_password) {
      _currentUser.must_change_password = true;
      // Mettre à jour la session stockée
      sessionStorage.setItem(SS_SESSION, JSON.stringify(_currentUser));
    }
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

  /** Token JWT */
  function _getToken() {
    return sessionStorage.getItem(SS_TOKEN) || '';
  }

  function _setToken(token) {
    sessionStorage.setItem(SS_TOKEN, token);
  }

  function _clearToken() {
    sessionStorage.removeItem(SS_TOKEN);
  }

  /** Décode le payload JWT (sans vérification — le serveur valide) */
  function _decodeJwtPayload(token) {
    try {
      var parts = token.split('.');
      if (parts.length !== 3) return null;
      var payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (payload.length % 4) payload += '=';
      return JSON.parse(atob(payload));
    } catch (e) {
      return null;
    }
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

    // Fallback — compte admin par défaut (PBKDF2)
    const defaultHash = await _hashPassword('admin');
    users = [{
      username: 'admin',
      email: 'admin@cetas.local',
      password_hash: defaultHash,
      role: 'admin',
      created_at: new Date().toISOString(),
      must_change_password: true   // Forcer le changement du mot de passe par défaut
    }];
    _writeUsers(users);
    return users;
  }

  /** Vérifie si l'admin a toujours le mot de passe par défaut et le marque.
   *  Appelé après _bootstrapUsers() et au login pour détecter les comptes
   *  non migrés. */
  async function _flagDefaultAdminPassword() {
    var users = _readUsers();
    var admin = users.find(function(u) { return u.username === 'admin'; });
    if (!admin) return;
    // Vérifier si le mot de passe est 'admin' (SHA-256 legacy ou PBKDF2)
    var check = await _verifyPassword('admin', admin.password_hash);
    if (check.valid && !admin.must_change_password) {
      admin.must_change_password = true;
      _writeUsers(users);
    }
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

  // ── API HTTP helpers ──────────────────────────────────────────────

  function _fetchJSON(url, opts) {
    opts = opts || {};
    var token = _getToken();
    opts.headers = opts.headers || {};
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (opts.body && typeof opts.body === 'object') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(url, opts).then(function(r) { return r.json().then(function(d) { return {ok: r.ok, status: r.status, data: d}; }); });
  }

  return {
    // ── Gestion du token ──────────────────────────────────────────

    /** Retourne le JWT stocké (utilisé par filemanager.js, api.js) */
    getToken: function() {
      return _getToken();
    },

    // ── Init / Login / Logout ──────────────────────────────────────

    /** Initialise l'auth. Résout quand l'utilisateur est connecté. */
    init: async function() {
      // Bootstrap : s'assurer qu'il existe au moins un compte utilisateur
      try { await _bootstrapUsers(); } catch (e) { console.warn('Bootstrap utilisateurs impossible :', e); }
      // Vérifier si l'admin a toujours le mot de passe par défaut
      try { await _flagDefaultAdminPassword(); } catch (e) { /* non bloquant */ }

      // Restaurer token JWT ?
      var token = _getToken();
      if (token) {
        var payload = _decodeJwtPayload(token);
        if (payload && payload.exp && payload.exp * 1000 > Date.now()) {
          _currentUser = {
            username: payload.sub,
            role: payload.role || 'user'
          };
          _vaultReady = !!sessionStorage.getItem(SS_VAULT_KEY);
          return Promise.resolve(_currentUser);
        }
        // Token expiré → nettoyer
        _clearToken();
      }

      // Fallback: restaurer session legacy
      if (_restoreSession()) return Promise.resolve(_currentUser);

      // Afficher l'overlay de login
      return new Promise(function(resolve) {
        var overlay = document.getElementById('login-overlay');
        if (!overlay) {
          // Fallback : pas d'overlay → rien (dev)
          resolve(null);
          return;
        }

        overlay.style.display = 'flex';
        var form = document.getElementById('login-form');
        var usernameInput = document.getElementById('login-username');
        var passwordInput = document.getElementById('login-password');
        var errorEl = document.getElementById('login-error');
        var bodyEl = document.body;

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
          var username = usernameInput.value.trim();
          var password = passwordInput.value;

          if (!username || !password) {
            showError('Veuillez remplir tous les champs.');
            return;
          }

          try {
            var result = await Auth.login(username, password);
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
          form.addEventListener('submit', function(e) {
            e.preventDefault();
            handleLogin();
          });
        }

        var loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
          loginBtn.addEventListener('click', handleLogin);
        }

        if (passwordInput) {
          passwordInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') handleLogin();
          });
        }
      });
    },

    /** Tente de connecter l'utilisateur. Priorité serveur, fallback localStorage. */
    login: async function(username, password) {
      // 1) Essayer le serveur
      try {
        var resp = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({username: username, password: password})
        });
        var data = await resp.json();
        if (resp.ok && data.token) {
          _setToken(data.token);
          var u = data.user;
          _currentUser = {
            username: u.username,
            email: u.email || '',
            role: u.role || 'user',
            created_at: u.created_at || ''
          };
          // Session legacy pour compatibilité
          localStorage.setItem('cetas-user', u.username);
          sessionStorage.setItem(SS_SESSION, JSON.stringify(_currentUser));
          // Propager must_change_password depuis le compte local
          _propagateFlags(u.username);
          await _vaultInit(password);
          return true;
        }
      } catch (e) {
        // Serveur injoignable → fallback
      }

      // 2) Fallback localStorage (migration)
      var users = _readUsers();
      var user = null;
      var needsUpgrade = false;
      for (var i = 0; i < users.length; i++) {
        if (users[i].username !== username) continue;
        var vr = await _verifyPassword(password, users[i].password_hash);
        if (vr.valid) { user = users[i]; needsUpgrade = vr.needsUpgrade; break; }
      }
      if (!user) return false;
      // Auto-upgrade : ancien hash SHA-256 → PBKDF2
      if (needsUpgrade) {
        user.password_hash = await _hashPassword(password);
        _writeUsers(users);
      }

      // 3) Migrer ce compte vers le serveur
      try {
        var regResp = await fetch('/api/auth/register', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            username: user.username,
            email: user.email || '',
            password: password
          })
        });
        if (regResp.ok) {
          // Réessayer le login serveur
          var retryResp = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username: username, password: password})
          });
          var retryData = await retryResp.json();
          if (retryResp.ok && retryData.token) {
            _setToken(retryData.token);
            _currentUser = {
              username: retryData.user.username,
              email: retryData.user.email || '',
              role: retryData.user.role || 'user',
              created_at: retryData.user.created_at || ''
            };
            localStorage.setItem('cetas-user', retryData.user.username);
            sessionStorage.setItem(SS_SESSION, JSON.stringify(_currentUser));
            _propagateFlags(retryData.user.username);
            await _vaultInit(password);
            return true;
          }
        }
      } catch (e) {
        // Migration échouée → fallback localStorage pur
      }

      // 4) Fallback localStorage pur (serveur injoignable)
      _createSession(user);
      await _vaultInit(password);
      return true;
    },

    /** Déconnecte et recharge */
    logout: function() {
      _clearSession();
      _clearToken();
      sessionStorage.removeItem(SS_VAULT_KEY);
      _vaultReady = false;
      window.location.reload();
    },

    /** Utilisateur connecté */
    getCurrentUser: function() {
      if (!_currentUser) _restoreSession();
      return _currentUser ? Object.assign({}, _currentUser) : null;
    },

    /** Admin ? */
    isAdmin: function() {
      var u = Auth.getCurrentUser();
      return u && u.role === 'admin';
    },

    /** L'utilisateur doit-il changer son mot de passe ? */
    needsPasswordChange: function() {
      var u = Auth.getCurrentUser();
      return u && u.must_change_password === true;
    },

    // ── Coffre API keys (inchangé) ─────────────────────────────────

    isVaultReady: function() { return _vaultReady; },

    vaultEncrypt: async function(plaintext) {
      var key = await _getVaultKey();
      if (!key) throw new Error('Coffre non disponible.');
      var iv = crypto.getRandomValues(new Uint8Array(12));
      var enc = new TextEncoder();
      var ct = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv }, key, enc.encode(plaintext)
      );
      var combined = new Uint8Array(iv.length + ct.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(ct), iv.length);
      return _bytesToHex(combined);
    },

    vaultDecrypt: async function(hexCiphertext) {
      var key = await _getVaultKey();
      if (!key) throw new Error('Coffre non disponible.');
      var combined = _hexToBytes(hexCiphertext);
      var iv = combined.slice(0, 12);
      var ct = combined.slice(12);
      var pt = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv }, key, ct
      );
      return new TextDecoder().decode(pt);
    },

    // ── Users CRUD (admin) — via API serveur ───────────────────────

    /** Admin : liste les utilisateurs */
    listUsers: async function() {
      if (!Auth.isAdmin()) return [];
      try {
        var r = await _fetchJSON('/api/users');
        if (r.ok) return r.data;
      } catch (e) {}
      // Fallback localStorage
      return _readUsers().map(function(u) { return {
        username: u.username, email: u.email || '', role: u.role || 'user', created_at: u.created_at || ''
      };});
    },

    /** Admin : crée un utilisateur */
    createUser: async function(username, email, password, role) {
      if (!Auth.isAdmin()) throw new Error('Permission refusée.');
      try {
        var r = await _fetchJSON('/api/auth/register', {method: 'POST', body: {username: username, email: email, password: password}});
        if (r.ok) return true;
        if (r.status === 409) throw new Error('Cet utilisateur existe déjà.');
        throw new Error(r.data.error || 'Erreur serveur.');
      } catch (e) {
        if (e.message === 'Cet utilisateur existe déjà.') throw e;
        // Fallback localStorage
        var users = _readUsers();
        if (users.find(function(u) { return u.username === username; })) throw new Error('Cet utilisateur existe déjà.');
        var hash = await _hashPassword(password);
        users.push({username: username, email: email || '', password_hash: hash, role: role || 'user', created_at: new Date().toISOString()});
        _writeUsers(users);
        return true;
      }
    },

    /** Admin : met à jour un utilisateur */
    updateUser: async function(username, data) {
      if (!Auth.isAdmin()) throw new Error('Permission refusée.');
      try {
        var body = {};
        if (data.email !== undefined) body.email = data.email;
        if (data.role !== undefined) body.role = data.role;
        if (data.password) body.password = data.password;
        var r = await _fetchJSON('/api/users/' + encodeURIComponent(username), {method: 'PUT', body: body});
        if (r.ok) return true;
        throw new Error(r.data.error || 'Erreur serveur.');
      } catch (e) {
        // Fallback localStorage
        var users = _readUsers();
        var idx = users.findIndex(function(u) { return u.username === username; });
        if (idx === -1) throw new Error('Utilisateur introuvable.');
        if (data.email !== undefined) users[idx].email = data.email;
        if (data.role !== undefined) users[idx].role = data.role;
        if (data.password) users[idx].password_hash = await _hashPassword(data.password);
        _writeUsers(users);
        return true;
      }
    },

    /** Admin : supprime un utilisateur */
    deleteUser: async function(username) {
      if (!Auth.isAdmin()) throw new Error('Permission refusée.');
      var current = Auth.getCurrentUser();
      if (current && current.username === username) {
        throw new Error('Vous ne pouvez pas supprimer votre propre compte.');
      }
      try {
        var r = await _fetchJSON('/api/users/' + encodeURIComponent(username), {method: 'DELETE'});
        if (r.ok) return true;
        throw new Error(r.data.error || 'Erreur serveur.');
      } catch (e) {
        // Fallback localStorage
        var users = _readUsers();
        var filtered = users.filter(function(u) { return u.username !== username; });
        if (filtered.length === users.length) return false;
        _writeUsers(filtered);
        return true;
      }
    },

    /** Change le mot de passe de l'utilisateur connecté */
    changePassword: async function(oldPassword, newPassword) {
      var current = Auth.getCurrentUser();
      if (!current) throw new Error('Non connecté.');
      try {
        var r = await _fetchJSON('/api/users/' + encodeURIComponent(current.username), {
          method: 'PUT',
          body: {password: newPassword}
        });
        if (r.ok) return true;
        throw new Error(r.data.error || 'Erreur serveur.');
      } catch (e) {
        // Fallback localStorage
        var users = _readUsers();
        var idx = users.findIndex(function(u) { return u.username === current.username; });
        if (idx === -1) throw new Error('Utilisateur introuvable.');
        var oldCheck = await _verifyPassword(oldPassword, users[idx].password_hash);
        if (!oldCheck.valid) throw new Error('Mot de passe actuel incorrect.');
        users[idx].password_hash = await _hashPassword(newPassword);
        // Retirer le flag must_change_password s'il existe
        if (users[idx].must_change_password) {
          delete users[idx].must_change_password;
        }
        _writeUsers(users);
        return true;
      }
    }
  };
})();
