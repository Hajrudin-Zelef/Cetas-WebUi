// Marexcode — Profile page logic
import { getProfileStats, getProfileActivity } from './api.js';

const HEATMAP_COLORS = ['#16161b', '#1a472a', '#238636', '#26a641'];

function getHeatColor(count) {
    if (count === 0) return HEATMAP_COLORS[0];
    if (count <= 2) return HEATMAP_COLORS[1];
    if (count <= 5) return HEATMAP_COLORS[2];
    return HEATMAP_COLORS[3];
}

function renderHeatmap(canvas, activity) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const cellW = 12;
    const cellH = 12;
    const gap = 3;
    const cols = Math.floor(w / (cellW + gap));
    const today = new Date();

    for (let col = 0; col < cols; col++) {
        const d = new Date(today);
        d.setDate(d.getDate() - (cols - 1 - col));
        const key = d.toISOString().slice(0, 10);
        const count = activity[key] || 0;
        const x = col * (cellW + gap);
        const y = 0;
        ctx.fillStyle = getHeatColor(count);
        ctx.beginPath();
        ctx.roundRect(x, y, cellW, cellH, 2);
        ctx.fill();
    }
}

function formatTokens(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
}

function shortModel(m) {
    if (!m) return '—';
    const parts = m.split('/');
    const name = parts[parts.length - 1] || m;
    return name.length > 20 ? name.slice(0, 18) + '…' : name;
}

export async function loadProfilePage() {
    try {
        const [stats, activity] = await Promise.all([
            getProfileStats(),
            getProfileActivity()
        ]);

        // User info (from fillUserInfo in app.js)
        const username = document.getElementById('set-username')?.textContent || 'Utilisateur';
        document.getElementById('profile-username').textContent = username;
        document.getElementById('profile-avatar').textContent = (username[0] || 'U').toUpperCase();
        document.getElementById('profile-email').textContent = username;

        // Stats
        document.getElementById('stat-tokens').textContent = formatTokens(stats.total_tokens || 0);
        document.getElementById('stat-chats').textContent = String(stats.total_chats || 0);
        document.getElementById('stat-streak').textContent = (stats.streak || 0) + ' jours';
        document.getElementById('stat-model').textContent = shortModel(stats.top_model);

        // Overview
        document.getElementById('ov-mode').textContent = 'Activé';
        document.getElementById('ov-reasoning').textContent = 'Auto';
        const sk = stats.skills || {};
        document.getElementById('ov-skills').textContent = (sk.auto || 0) + ' auto · ' + (sk.manual || 0) + ' manuel · ' + (sk.on_demand || 0) + ' demande';
        document.getElementById('ov-chats').textContent = String(stats.total_chats || 0);

        // Top skills (mode auto, sorted by config order)
        const topSkillsEl = document.getElementById('profile-top-skills');
        try {
            const { listSkillsConfig } = await import('./api.js');
            const skills = await listSkillsConfig();
            const autoSkills = skills.filter(s => s.enabled && s.mode === 'auto').slice(0, 5);
            if (autoSkills.length) {
                topSkillsEl.innerHTML = autoSkills.map((s, i) =>
                    '<div class="profile-skill-row">' +
                        '<span class="profile-skill-rank">#' + (i + 1) + '</span>' +
                        '<span class="profile-skill-name">' + esc(s.name) + '</span>' +
                        '<span class="profile-skill-mode">auto</span>' +
                    '</div>'
                ).join('');
            } else {
                topSkillsEl.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;">Aucun skill actif en mode auto</div>';
            }
        } catch (e) {
            topSkillsEl.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;">Erreur chargement</div>';
        }

        // Heatmap
        const canvas = document.getElementById('profile-heatmap');
        if (canvas) renderHeatmap(canvas, activity);

    } catch (e) {
        console.error('Profile load error:', e);
    }
}

function esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
}
