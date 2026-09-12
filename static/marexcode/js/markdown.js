const COPY_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Découpe le markdown en blocs stables séparés par une ligne vide hors code
// clôturé, plus un tail "live" (dernier bloc, susceptible de changer).
export function splitBlocks(text) {
    const lines = String(text == null ? '' : text).split('\n');
    const blocks = [];
    let buf = [];
    let fence = null;
    for (const line of lines) {
        const m = line.match(/^ {0,3}(`{3,}|~{3,})/);
        if (m) {
            if (!fence) fence = m[1][0];
            else if (m[1][0] === fence) fence = null;
        }
        buf.push(line);
        if (!fence && line.trim() === '') {
            const block = buf.join('\n');
            if (block.trim()) blocks.push(block);
            buf = [];
        }
    }
    return { blocks, tail: buf.join('\n') };
}

function parseMarkdown(text) {
    const m = typeof globalThis !== 'undefined' ? globalThis.marked : null;
    if (!m) return escapeHtml(text).replace(/\n/g, '<br>');
    const parse = typeof m === 'function' ? m : m.parse;
    let html;
    try { html = parse(text, { breaks: true, gfm: true }); } catch (e) { html = escapeHtml(text); }
    const p = globalThis.DOMPurify;
    return (p && typeof p.sanitize === 'function') ? p.sanitize(html) : html;
}

let hljsPromise = null;
function loadHljs() {
    if (!hljsPromise) {
        hljsPromise = import('/js/vendor/highlight.esm.min.js')
            .then((mod) => mod.default || mod)
            .catch(() => null);
    }
    return hljsPromise;
}

async function highlight(root) {
    const hljs = await loadHljs();
    if (!hljs) return;
    root.querySelectorAll('pre code').forEach((code) => {
        if (code.dataset.hl === '1') return;
        const text = code.textContent || '';
        try {
            const match = (code.className || '').match(/language-([\w-]+)/);
            const result = (match && hljs.getLanguage(match[1]))
                ? hljs.highlight(text, { language: match[1], ignoreIllegals: true })
                : hljs.highlightAuto(text);
            code.innerHTML = result.value;
            code.classList.add('hljs');
            code.dataset.hl = '1';
        } catch (e) { /* on garde le code brut */ }
    });
}

function decorateCode(root) {
    root.querySelectorAll('pre').forEach((pre) => {
        if (pre.closest('[data-component="markdown-code"]')) return;
        const wrap = document.createElement('div');
        wrap.setAttribute('data-component', 'markdown-code');
        pre.replaceWith(wrap);
        wrap.appendChild(pre);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'markdown-copy-button';
        btn.setAttribute('data-slot', 'markdown-copy-button');
        btn.setAttribute('aria-label', 'Copier');
        btn.innerHTML = COPY_ICON;
        wrap.appendChild(btn);
    });
}

function bindCopy(container) {
    if (container.dataset.mdCopyBound === '1') return;
    container.dataset.mdCopyBound = '1';
    container.addEventListener('click', async (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const btn = target.closest('[data-slot="markdown-copy-button"]');
        if (!btn || !navigator.clipboard) return;
        const code = btn.parentElement ? btn.parentElement.querySelector('code') : null;
        if (!code) return;
        try { await navigator.clipboard.writeText(code.textContent || ''); } catch (e) { return; }
        btn.setAttribute('data-copied', 'true');
        setTimeout(() => btn.removeAttribute('data-copied'), 2000);
    });
}

function childAt(container, index) {
    let el = container.children[index];
    if (!el) {
        el = document.createElement('div');
        el.className = 'md-block';
        el._html = null;
        container.appendChild(el);
    }
    return el;
}

function setBlock(container, index, html) {
    const el = childAt(container, index);
    if (el._html === html) return;
    el.innerHTML = html;
    el._html = html;
    decorateCode(el);
    highlight(el);
}

function render(container, text, streaming) {
    const value = String(text == null ? '' : text);
    const { blocks, tail } = splitBlocks(value);
    for (let i = 0; i < blocks.length; i++) {
        setBlock(container, i, parseMarkdown(blocks[i]));
    }
    let total = blocks.length;
    if (streaming || tail.trim()) {
        setBlock(container, total, parseMarkdown(tail));
        total += 1;
    }
    while (container.children.length > total) container.removeChild(container.lastElementChild);
    bindCopy(container);
}

export function createMarkdownRenderer() {
    const pending = new WeakMap();
    const frames = new WeakMap();

    function cancel(container) {
        const frame = frames.get(container);
        if (frame) {
            cancelAnimationFrame(frame);
            frames.set(container, null);
        }
    }

    return {
        render(container, text) {
            cancel(container);
            render(container, text, false);
        },
        update(container, text) {
            pending.set(container, text);
            if (frames.get(container)) return;
            frames.set(container, requestAnimationFrame(() => {
                frames.set(container, null);
                render(container, pending.get(container), true);
            }));
        },
        finalize(container, text) {
            cancel(container);
            render(container, text, false);
        }
    };
}
