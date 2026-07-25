// © Marexsoft Corporation. Fondateur Kouassi Marius.
import { STATE } from './state.js';

export function loadBudgetSettings() {
    try {
        const stored = localStorage.getItem('minou-budget');
        return stored ? JSON.parse(stored) : { enabled: false, period: 'month', amount: 10 };
    } catch { return { enabled: false, period: 'month', amount: 10 }; }
}

export function toggleBudgetSettings() {
    const on = document.getElementById('budget-enabled').checked;
    document.getElementById('budget-settings').style.display = on ? '' : 'none';
    if (on) updateBudgetPreview();
}

export function getBudgetPeriodBounds(period) {
    const now = new Date();
    let start, end;
    if (period === 'day') {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (period === 'week') {
        const day = now.getDay();
        const diffToMonday = (day === 0 ? -6 : 1 - day);
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday, 0, 0, 0, 0);
        end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999);
    } else {
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }
    return { start, end };
}

export function getCostForPeriod(convs, period) {
    const { start, end } = getBudgetPeriodBounds(period);
    return convs.filter(c => {
        if (!c.date) return false;
        const d = new Date(c.date);
        return d >= start && d <= end;
    }).reduce((s, c) => s + (c.cout_estime_usd || 0), 0);
}

export function formatPeriodLabel(period) {
    const { start, end } = getBudgetPeriodBounds(period);
    const opts = { day: 'numeric', month: 'short' };
    if (period === 'day') {
        return start.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    } else if (period === 'week') {
        return `${start.toLocaleDateString('fr-FR', opts)} → ${end.toLocaleDateString('fr-FR', opts)}`;
    } else {
        return start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    }
}

const PERIOD_LABELS = { day: "aujourd'hui", week: 'cette semaine', month: 'ce mois' };

export async function updateBudgetPreview() {
    const budget = loadBudgetSettings();
    const preview = document.getElementById('budget-preview');
    if (!budget.enabled || !budget.amount || budget.amount <= 0) { preview.style.display = 'none'; return; }

    const convs = await listAllConvStats();
    const spent = getCostForPeriod(convs, budget.period);
    const pct = Math.min((spent / budget.amount) * 100, 100);
    const color = pct < 75 ? '#10b981' : pct < 100 ? '#f59e0b' : '#ef4444';

    document.getElementById('budget-period-label').textContent = formatPeriodLabel(budget.period);
    document.getElementById('budget-fill').style.width = pct + '%';
    document.getElementById('budget-fill').style.background = color;
    document.getElementById('budget-text').textContent = `$${spent.toFixed(4)} / $${budget.amount.toFixed(2)} ${PERIOD_LABELS[budget.period]} (${pct.toFixed(0)}%)`;
    preview.style.display = '';
}

export function getBudgetPeriodId(period) {
    const { start } = getBudgetPeriodBounds(period);
    const pad = n => String(n).padStart(2, '0');
    const dateStr = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
    if (period === 'day') return dateStr;
    if (period === 'month') return dateStr.slice(0, 7);
    if (period === 'week') return 'week-' + dateStr;
    return 'default';
}

export async function checkBudgetAlert() {
    const budget = loadBudgetSettings();
    if (!budget.enabled || !budget.amount || budget.amount <= 0) return;

    const periodId = getBudgetPeriodId(budget.period);
    const acknowledged = localStorage.getItem('cetas-budget-ack-' + periodId);
    if (acknowledged === 'true') return;

    const convs = await listAllConvStats();
    const spent = getCostForPeriod(convs, budget.period);
    if (spent >= budget.amount) {
        document.getElementById('budget-alert-text').innerHTML = `Budget dépassé ${PERIOD_LABELS[budget.period]}<br><strong>$${spent.toFixed(2)} / $${budget.amount.toFixed(2)}</strong>`;
        document.getElementById('budget-alert-overlay').style.display = 'flex';
    }
}

export function addCostForModel(modelId, inputTokens, outputTokens, cost) {
    if (!modelId) return;
    if (!STATE.costByModel[modelId]) STATE.costByModel[modelId] = { input: 0, output: 0, cost: 0 };
    STATE.costByModel[modelId].input += inputTokens;
    STATE.costByModel[modelId].output += outputTokens;
    STATE.costByModel[modelId].cost += cost;
}

export function updateBudgetAmountSuffix() {
    const period = document.getElementById('budget-period').value;
    const suffix = document.getElementById('budget-amount-suffix');
    if (!suffix) return;
    const labels = { day: '/ jour', week: '/ semaine', month: '/ mois' };
    suffix.textContent = labels[period] || '/ mois';
}

// Event listeners — seront attachés après l'init
export function initBudget() {
    document.getElementById('budget-alert-close').addEventListener('click', () => {
        const budget = loadBudgetSettings();
        const periodId = getBudgetPeriodId(budget.period);
        localStorage.setItem('cetas-budget-ack-' + periodId, 'true');
        document.getElementById('budget-alert-overlay').style.display = 'none';
    });

    document.getElementById('budget-enabled').addEventListener('change', toggleBudgetSettings);
    document.getElementById('budget-period').addEventListener('change', () => {
        saveBudgetSettings();
        updateBudgetAmountSuffix();
        updateBudgetPreview();
    });
    document.getElementById('budget-amount').addEventListener('input', () => {
        saveBudgetSettings();
        updateBudgetPreview();
    });
}

function saveBudgetSettings() {
    const enabled = document.getElementById('budget-enabled').checked;
    const period = document.getElementById('budget-period').value;
    const amount = parseFloat(document.getElementById('budget-amount').value) || 0;
    const data = JSON.stringify({ enabled, period, amount });
    localStorage.setItem('minou-budget', data);
    if (window._syncPushSetting) window._syncPushSetting('minou-budget', data);
}
