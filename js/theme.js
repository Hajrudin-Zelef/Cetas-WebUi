// © Marexsoft Corporation. Fondateur Kouassi Marius.
import { getThemeToggle } from './dom.js';

let _onThemeChange = null;

export function setOnThemeChange(fn) {
    _onThemeChange = fn;
}

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

export function initTheme() {
    const toggle = getThemeToggle();
    const saved = localStorage.getItem('minou-theme') || 'light';
    applyTheme(saved);

    toggle.addEventListener('click', () => {
        const current = localStorage.getItem('minou-theme') || 'light';
        const order = ['light', 'dark', 'auto'];
        const next = order[(order.indexOf(current) + 1) % order.length];
        localStorage.setItem('minou-theme', next);
        if (window._syncPushSetting) window._syncPushSetting('minou-theme', next);
        applyTheme(next);
    });
}
