import { getToken } from './api.js';

export function initRouter(deps) {
    const { authGate, mainFrame, settingsFrame } = deps;

    function checkAuth() {
        if (getToken()) {
            authGate.classList.remove('open');
            return true;
        }
        authGate.classList.add('open');
        return false;
    }

    function showMain() {
        settingsFrame.style.display = 'none';
        mainFrame.style.display = '';
    }

    function showSettings() {
        mainFrame.style.display = 'none';
        settingsFrame.style.display = 'flex';
    }

    return { checkAuth, showMain, showSettings };
}