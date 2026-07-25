// ocean.js — Canvas de fond aquatique. © Marexsoft Corporation. Fondateur Kouassi Marius.
// Module ES, s'enregistre sur window.Ocean
// ============================================================
import { setOnThemeChange } from './theme.js';

let canvas, ctx, w, h, isDark, bubbles, planktons, frame = 0;
let rafId = null;
let _paused = false;

// --- Initialisation ---

export function init() {
    canvas = document.createElement('canvas');
    canvas.id = 'ocean-canvas';
    document.body.insertBefore(canvas, document.body.firstChild);
    ctx = canvas.getContext('2d');

    _resize();
    _createParticles();
    _detectTheme();

    window.addEventListener('resize', _resize);
    setOnThemeChange(_detectTheme);
    document.addEventListener('click', _onClickRipple);

    _loop();
}

// --- Redimensionnement ---

function _resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
}

// --- Particules ---

function _createParticles() {
    bubbles = [];
    planktons = [];

    for (let i = 0; i < 12; i++) {
        bubbles.push({
            x: Math.random() * w,
            y: Math.random() * h,
            r: 6 + Math.random() * 14,
            speed: 0.1 + Math.random() * 0.25,
            wobble: Math.random() * Math.PI * 2,
            drift: 0.01 + Math.random() * 0.03,
            alpha: 0.04 + Math.random() * 0.05,
        });
    }

    for (let i = 0; i < 25; i++) {
        planktons.push({
            x: Math.random() * w,
            y: Math.random() * h,
            r: 0.5 + Math.random() * 1.2,
            speed: 0.02 + Math.random() * 0.06,
            phase: Math.random() * Math.PI * 2,
            alpha: 0.08 + Math.random() * 0.15,
        });
    }
}

// --- Détection du thème ---

function _detectTheme() {
    const bodyDark = document.body.classList.contains('dark');
    const bodyAuto = document.body.classList.contains('theme-auto');
    const osDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    isDark = bodyDark || (bodyAuto && osDark);
}

// --- Boucle d'animation ---

function _loop() {
    rafId = requestAnimationFrame(_loop);
    if (_paused) return;
    frame++;
    ctx.clearRect(0, 0, w, h);
    _drawBackground();
    _drawPlanktons();
    _drawBubbles();
}

// --- Fond : gradient de profondeur ---

function _drawBackground() {
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.max(w, h) * 0.75;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    if (isDark) {
        grad.addColorStop(0, '#16294a');
        grad.addColorStop(0.45, '#0d1e35');
        grad.addColorStop(1, '#05070d');
    } else {
        grad.addColorStop(0, '#eaf3fb');
        grad.addColorStop(0.45, '#d7e7f2');
        grad.addColorStop(1, '#f4f7fa');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
}

// --- Plancton bioluminescent ---

function _drawPlanktons() {
    for (const p of planktons) {
        // Drift lent avec oscillation sinusoïdale
        p.y -= p.speed;
        p.x += Math.sin(frame * 0.008 + p.phase) * 0.15;

        // Wrap around
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;

        // Glow radial
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3);
        const glowColor = isDark
            ? `rgba(33, 150, 243, ${p.alpha})`
            : `rgba(33, 150, 243, ${p.alpha * 0.7})`;
        glow.addColorStop(0, glowColor);
        glow.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Noyau brillant
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = isDark
            ? `rgba(33, 150, 243, ${p.alpha * 1.4})`
            : `rgba(33, 150, 243, ${p.alpha})`;
        ctx.fill();
    }
}

// --- Bulles montantes ---

function _drawBubbles() {
    for (const b of bubbles) {
        // Montée + wobble horizontal
        b.y -= b.speed;
        b.x += Math.sin(frame * 0.02 + b.wobble) * b.drift;

        // Wrap around
        if (b.y < -20) {
            b.y = h + 20;
            b.x = Math.random() * w;
            b.wobble = Math.random() * Math.PI * 2;
        }
        if (b.x < -20) b.x = w + 20;
        if (b.x > w + 20) b.x = -20;

        // Cercle de la bulle
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.strokeStyle = isDark
            ? `rgba(255, 255, 255, ${b.alpha})`
            : `rgba(33, 150, 243, ${b.alpha * 1.5})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Reflet spéculaire
        const hlX = b.x - b.r * 0.3;
        const hlY = b.y - b.r * 0.3;
        ctx.beginPath();
        ctx.arc(hlX, hlY, b.r * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = isDark
            ? `rgba(255, 255, 255, ${b.alpha * 2})`
            : `rgba(255, 255, 255, ${b.alpha * 2.5})`;
        ctx.fill();
    }
}

// --- Ripple au clic ---

function _onClickRipple(e) {
    // Cherche un ancêtre avec le flag --ocean-ripple
    let el = e.target;
    while (el && el !== document.body) {
        const hasRipple = getComputedStyle(el).getPropertyValue('--ocean-ripple').trim();
        // On vérifie aussi les sélecteurs connus
        const match = el.matches('.input-wrapper, .new-chat-btn, .sidebar-config-btn');
        if (match) {
            const rect = el.getBoundingClientRect();
            const xPct = ((e.clientX - rect.left) / rect.width) * 100;
            const yPct = ((e.clientY - rect.top) / rect.height) * 100;
            el.style.setProperty('--ripple-x', xPct.toFixed(1) + '%');
            el.style.setProperty('--ripple-y', yPct.toFixed(1) + '%');
            el.classList.add('ocean-ripple-active');
            setTimeout(() => el.classList.remove('ocean-ripple-active'), 700);
            return;
        }
        el = el.parentElement;
    }
}

// --- Enregistrement global (pattern window.Canvas) ---

export function setPaused(paused) {
    _paused = paused;
}

export function isActive() {
    return true;
}

window.Ocean = { init, isActive, setPaused };
