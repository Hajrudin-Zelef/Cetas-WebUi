// © Marexsoft Corporation. Fondateur Kouassi Marius.
// --- Gestion des utilisateurs (admin uniquement) ---
import { escHtml } from './utils.js';

export function initUserManagement() {
    const tabUsers = document.getElementById('tab-users');
    const panelUsers = document.getElementById('panel-users');
    const usersList = document.getElementById('users-list');
    const usersAddBtn = document.getElementById('users-add-btn');
    const userModalOverlay = document.getElementById('user-modal-overlay');
    const userModalTitle = document.getElementById('user-modal-title');
    const userModalUsername = document.getElementById('user-modal-username');
    const userModalEmail = document.getElementById('user-modal-email');
    const userModalPassword = document.getElementById('user-modal-password');
    const userModalRole = document.getElementById('user-modal-role');
    const userModalSave = document.getElementById('user-modal-save');
    const userModalCancel = document.getElementById('user-modal-cancel');
    const userModalDelete = document.getElementById('user-modal-delete');

    if (!tabUsers || !panelUsers) return;

    // Afficher l'onglet Utilisateurs seulement pour les admins
    if (Auth.isAdmin()) {
        tabUsers.style.display = '';
    }

    let _editingUsername = null;

    async function _renderUserList() {
        if (!usersList) return;
        const users = await Auth.listUsers();
        usersList.innerHTML = users.map(u => {
            const initials = (u.username || '?').substring(0, 2).toUpperCase();
            const roleClass = u.role === 'admin' ? 'admin' : 'user';
            const roleLabel = u.role === 'admin' ? 'Admin' : 'Utilisateur';
            return `<div class="user-card" data-username="${escHtml(u.username)}">
                <div class="user-card-avatar">${escHtml(initials)}</div>
                <div class="user-card-info">
                    <div class="user-card-name">${escHtml(u.username)}</div>
                    <div class="user-card-email">${escHtml(u.email)}</div>
                </div>
                <span class="user-card-badge ${roleClass}">${roleLabel}</span>
            </div>`;
        }).join('');

        // Clic sur une carte → édition
        usersList.querySelectorAll('.user-card').forEach(card => {
            card.addEventListener('click', () => {
                _editingUsername = card.dataset.username;
                const u = users.find(x => x.username === _editingUsername);
                if (!u) return;
                userModalTitle.textContent = 'Modifier l\'utilisateur';
                userModalUsername.value = u.username;
                userModalUsername.disabled = true;
                userModalEmail.value = u.email || '';
                userModalPassword.value = '';
                userModalPassword.placeholder = 'Laisser vide pour ne pas changer';
                userModalRole.value = u.role || 'user';
                userModalDelete.style.display = '';
                userModalOverlay.style.display = 'flex';
            });
        });
    }

    usersAddBtn.addEventListener('click', () => {
        _editingUsername = null;
        userModalTitle.textContent = 'Ajouter un utilisateur';
        userModalUsername.value = '';
        userModalUsername.disabled = false;
        userModalEmail.value = '';
        userModalPassword.value = '';
        userModalPassword.placeholder = 'Mot de passe';
        userModalRole.value = 'user';
        userModalDelete.style.display = 'none';
        userModalOverlay.style.display = 'flex';
    });

    userModalCancel.addEventListener('click', () => {
        userModalOverlay.style.display = 'none';
    });
    userModalOverlay.addEventListener('click', (e) => {
        if (e.target === userModalOverlay) userModalOverlay.style.display = 'none';
    });

    userModalSave.addEventListener('click', async () => {
        const username = userModalUsername.value.trim();
        const email = userModalEmail.value.trim();
        const password = userModalPassword.value;
        const role = userModalRole.value;

        if (!username) { alert('Le nom d\'utilisateur est requis.'); return; }
        if (!email) { alert('L\'email est requis.'); return; }

        try {
            if (_editingUsername) {
                // Mise à jour
                const data = { email, role };
                if (password) data.password = password;
                await Auth.updateUser(_editingUsername, data);
            } else {
                // Création
                if (!password) { alert('Le mot de passe est requis.'); return; }
                await Auth.createUser(username, email, password, role);
            }
            userModalOverlay.style.display = 'none';
            _renderUserList();
        } catch (e) {
            alert(e.message || 'Erreur lors de l\'enregistrement.');
        }
    });

    userModalDelete.addEventListener('click', async () => {
        if (!_editingUsername) return;
        if (!confirm(`Supprimer définitivement l'utilisateur "${_editingUsername}" ?`)) return;
        try {
            await Auth.deleteUser(_editingUsername);
            userModalOverlay.style.display = 'none';
            _renderUserList();
        } catch (e) {
            alert(e.message || 'Erreur lors de la suppression.');
        }
    });

    // Rendu initial
    _renderUserList();
}
