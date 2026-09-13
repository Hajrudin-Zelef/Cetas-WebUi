const PROVIDER_GROUPS = [
    { label: 'OpenCode Go', editeurs: ['opencode-go'], icon: '/images/Opencode.svg' },
    { label: 'OpenCode Zen', editeurs: ['opencode'], icon: '/images/Opencode.svg' },
    { label: 'DeepSeek', editeurs: ['deepseek'], icon: '/images/DeepSeek.svg' },
    { label: 'OpenRouter', editeurs: ['openrouter'], icon: '/images/OpenRouter.svg' },
];

export function getCatalog() {
    const data = (typeof MODELS_DATA !== 'undefined' && MODELS_DATA) || {};
    return (data.text || []).map(e => ({
        id: e.id,
        label: e.label,
        editeur: e.editeur,
        description: e.description || '',
        inputPer1M: e.inputPer1M || 0,
        outputPer1M: e.outputPer1M || 0
    }));
}

function esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
}

export function getModelLabel(id) {
    const m = getCatalog().find(x => x.id === id);
    return m ? m.label : id;
}

export function initModelSelect(menuEl, labelEl, onSelect) {
    const models = getCatalog();
    const byEditeur = {};
    for (const m of models) {
        if (m.hidden || m.editeur === 'samagent') continue;
        (byEditeur[m.editeur] = byEditeur[m.editeur] || []).push(m);
    }

    menuEl.innerHTML = '';
    let firstId = null;
    for (const grp of PROVIDER_GROUPS) {
        let all = [];
        for (const e of grp.editeurs) {
            if (byEditeur[e]) all = all.concat(byEditeur[e]);
        }
        if (!all.length) continue;
        if (!firstId) firstId = all[0].id;
        const lbl = document.createElement('div');
        lbl.className = 'cdrop-section-label';
        lbl.innerHTML = (grp.icon ? '<img src="' + grp.icon + '" width="14" height="14" style="vertical-align:-2px;margin-right:4px;border-radius:2px" alt=""> ' : '') + grp.label;
        menuEl.appendChild(lbl);
        for (const m of all) {
            const b = document.createElement('button');
            b.className = 'cdrop-item';
            b.setAttribute('data-provider', m.editeur);
            b.setAttribute('data-model', m.id);
            const price = m.inputPer1M || m.outputPer1M
                ? '$' + ((m.inputPer1M || 0) + (m.outputPer1M || 0)).toFixed(2) + '/1M'
                : 'Gratuit';
            b.innerHTML = '<span class="cdrop-item-left"><span class="cdrop-item-text"><span class="t">' + esc(m.label) +
                '</span><span class="d">' + esc(price) + '</span></span></span>' +
                '<svg class="check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6L9 17l-5-5"/></svg>';
            b.addEventListener('click', () => {
                menuEl.querySelectorAll('.cdrop-item').forEach(o => o.classList.remove('selected'));
                b.classList.add('selected');
                labelEl.textContent = m.label;
                localStorage.setItem('marex-last-model', m.id);
                if (onSelect) onSelect(m.id);
                menuEl.classList.remove('open');
            });
            menuEl.appendChild(b);
        }
    }

    const saved = localStorage.getItem('marex-last-model');
    const target = (saved && models.some(x => x.id === saved)) ? saved : (firstId || null);
    if (target) {
        const item = menuEl.querySelector('.cdrop-item[data-model="' + CSS.escape(target) + '"]');
        if (item) item.classList.add('selected');
        labelEl.textContent = getModelLabel(target);
        if (onSelect) onSelect(target);
    }
    return target;
}

export function selectModel(menuEl, labelEl, id, onSelect) {
    const item = menuEl.querySelector('.cdrop-item[data-model="' + CSS.escape(id) + '"]');
    menuEl.querySelectorAll('.cdrop-item').forEach(o => o.classList.remove('selected'));
    if (item) {
        item.classList.add('selected');
        labelEl.textContent = getModelLabel(id);
        localStorage.setItem('marex-last-model', id);
        if (onSelect) onSelect(id);
    }
}

export function getSelectedModelId(menuEl) {
    const item = menuEl.querySelector('.cdrop-item.selected');
    return item ? item.getAttribute('data-model') : null;
}