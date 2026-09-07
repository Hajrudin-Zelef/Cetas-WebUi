import { getToken } from './api.js';

export function initRouter(deps) {
    const { authGate, mainFrame, settingsFrame, profileFrame } = deps;

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
        if (profileFrame) profileFrame.style.display = 'none';
        mainFrame.style.display = '';
    }

    function showSettings() {
        mainFrame.style.display = 'none';
        if (profileFrame) profileFrame.style.display = 'none';
        settingsFrame.style.display = 'flex';
    }

    function showProfile() {
        mainFrame.style.display = 'none';
        settingsFrame.style.display = 'none';
        if (profileFrame) profileFrame.style.display = 'flex';
    }

    return { checkAuth, showMain, showSettings, showProfile };
}