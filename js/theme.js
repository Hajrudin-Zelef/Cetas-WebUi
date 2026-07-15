// ============================================================
// theme.js — Gestion du thème clair/sombre/auto
// ============================================================
import { getThemeToggle } from './dom.js';

let _onThemeChange = null;

/** Enregistre un callback appelé après chaque changement de thème */
export function setOnThemeChange(fn) {
    _onThemeChange = fn;
}

/** Applique le thème et persiste dans localStorage */
export function applyTheme(mode) {
    if (mode === 'auto') {
        document.body.classList.remove('dark');
        document.body.classList.add('theme-auto');
        getThemeToggle().innerHTML = '&#9681; Thème auto';
    } else {
        document.body.classList.remove('theme-auto');
        document.body.classList.toggle('dark', mode === 'dark');
        getThemeToggle().innerHTML = mode === 'dark' ? '&#9790; Thème sombre' : '&#9788; Thème clair';
    }
    if (_onThemeChange) _onThemeChange();
}

/** Initialise le toggle de thème et applique le thème sauvegardé */
export function initTheme() {
    const toggle = getThemeToggle();
    const saved = localStorage.getItem('minou-theme') || 'light';
    applyTheme(saved);

    toggle.addEventListener('click', () => {
        const current = localStorage.getItem('minou-theme') || 'light';
        const order = ['light', 'dark', 'auto'];
        const next = order[(order.indexOf(current) + 1) % order.length];
        localStorage.setItem('minou-theme', next);
        applyTheme(next);
    });
}
