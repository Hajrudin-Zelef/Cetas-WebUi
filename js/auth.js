// ============================================================
// auth.js — Authentification Cetas (chargé avant app.js)
// Non-module — expose l'objet global Auth
// ============================================================
const Auth = (() => {
  'use strict';

  const LS_USERS = 'cetas-users';
  const SS_SESSION = 'cetas-session';
  const SEED_URL = 'core/users-seed.json';

  let _currentUser = null; // {username, email, role, created_at}

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
        return true;
      }
    } catch (e) {}
    return false;
  }

  // --- Bootstrap première exécution ---

  async function _bootstrapUsers() {
    let users = _readUsers();
    if (users.length > 0) return users;

    // Essayer de charger le seed depuis setup.py
    try {
      const resp = await fetch(SEED_URL);
      if (resp.ok) {
        const seed = await resp.json();
        if (Array.isArray(seed) && seed.length > 0) {
          // Marquer tous les comptes du seed comme admin
          users = seed.map(u => ({
            username: u.username,
            email: u.email || '',
            password_hash: u.password_hash,
            role: 'admin',
            created_at: u.created_at || new Date().toISOString()
          }));
          _writeUsers(users);
          return users;
        }
      }
    } catch (e) {
      // Fichier seed inexistant (normal si setup.py n'a pas été lancé)
    }

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
      return true;
    },

    /** Déconnecte l'utilisateur et recharge la page */
    logout() {
      _clearSession();
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
