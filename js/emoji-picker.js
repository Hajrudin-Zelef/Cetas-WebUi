// © Marexsoft Corporation. Fondateur Kouassi Marius.
// --- Emoji Picker ---
const EMOJI_LIBRARY = {
    'Smileys': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😋','😛','🤔','🤗','🤫','🤭','😏','😌','😴','🤓','😎','🥳','😤','😠','🤯','😱','🥺','😢','😭','🫠'],
    'Gestes': ['👍','👎','👏','🙌','🤝','✌️','🤞','🤟','🤘','👌','🫶','💪','👋','✋','🖐️','🤚','👆','👇','👈','👉','☝️','🫵','🙏'],
    'Coeurs': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','💕','💞','💓','💗','💖','💘','💝','♥️'],
    'Travail': ['💼','📁','📂','📊','📈','📉','📋','📌','📎','✏️','📝','🗂️','🗃️','🗄️','💻','🖥️','⌨️','🖱️','📱','📧','✉️','📬','🏢','🏠','⏰','📅','🗓️'],
    'Science': ['🔬','🔭','⚗️','🧪','🧫','🧬','💊','💉','🩺','🧮','📐','📏','🔋','⚡','🧲','🌡️','☢️','☣️'],
    'Creative': ['🎨','🎭','🎬','🎤','🎧','🎵','🎶','🎸','🎹','🥁','🎻','📷','📸','🎥','🖌️','🖍️','✒️','🪄','💡','📖','📚','✍️'],
    'Nature': ['🌸','🌺','🌻','🌹','🌷','🌱','🌿','🍀','🌳','🌲','🍃','🍂','🍁','🌍','🌎','🌏','🌙','⭐','🌟','✨','☀️','🌈','🔥','💧','❄️','🌊'],
    'Animaux': ['🐱','🐶','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦅','🦋','🐝','🐞','🐢','🐍','🐬','🐳','🦄','🐲'],
    'Food': ['🍕','🍔','🍟','🌭','🌮','🌯','🍣','🍜','🍝','🍩','🍪','🎂','🍰','🍫','🍬','☕','🍵','🍺','🍷','🥤','🍎','🍊','🍋','🍇','🍓','🍑','🥑','🥕'],
    'Transport': ['🚗','🚕','🚌','🚎','🏎️','🚓','🚑','🚒','✈️','🚀','🛸','🚁','⛵','🚢','🚲','🛴','🏍️','🚄','🚅','🚇'],
    'Objets': ['🔑','🗝️','🔒','🔓','🛡️','⚔️','🏆','🥇','🥈','🥉','🎯','🎮','🧩','🎲','♟️','🔮','🧿','🎁','🎀','🏷️','💎','👑','🧸','🪩'],
    'Symboles': ['✅','❌','⭕','❗','❓','💯','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔶','🔷','▶️','⏸️','⏹️','🔄','💤','🚫','♻️','⚠️','🏳️','🏴','🚩']
};

const emojiPickerEl = document.getElementById('emoji-picker');
const emojiGridEl = document.getElementById('emoji-grid');
const emojiTabsEl = document.getElementById('emoji-tabs');
const emojiSearchEl = document.getElementById('emoji-search');
const emojiIconeBtn = document.getElementById('cat-modal-icone-btn');
const emojiPreview = document.getElementById('cat-modal-icone-preview');
const catModalIcone = document.getElementById('cat-modal-icone');

export function initEmojiTabs() {
    emojiTabsEl.innerHTML = '';
    const categories = Object.keys(EMOJI_LIBRARY);
    for (const cat of categories) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'emoji-tab';
        btn.textContent = EMOJI_LIBRARY[cat][0];
        btn.title = cat;
        btn.addEventListener('click', () => {
            emojiSearchEl.value = '';
            renderEmojiGrid(cat);
            emojiTabsEl.querySelectorAll('.emoji-tab').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
        });
        emojiTabsEl.appendChild(btn);
    }
}

export function renderEmojiGrid(activeCategory = null, filter = '') {
    emojiGridEl.innerHTML = '';
    const query = filter.toLowerCase();
    const categories = Object.entries(EMOJI_LIBRARY);

    for (const [catName, emojis] of categories) {
        if (activeCategory && catName !== activeCategory) continue;

        const filtered = query
            ? emojis.filter(e => e.includes(query) || catName.toLowerCase().includes(query))
            : emojis;

        if (filtered.length === 0) continue;

        if (!activeCategory || query) {
            const label = document.createElement('div');
            label.className = 'emoji-cat-label';
            label.textContent = catName;
            emojiGridEl.appendChild(label);
        }

        for (const emoji of filtered) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'emoji-grid-item';
            btn.textContent = emoji;
            btn.addEventListener('click', () => {
                catModalIcone.value = emoji;
                emojiPreview.textContent = emoji;
                hideEmojiPicker();
            });
            emojiGridEl.appendChild(btn);
        }
    }

    if (emojiGridEl.children.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'emoji-cat-label';
        empty.textContent = 'Aucun résultat';
        emojiGridEl.appendChild(empty);
    }
}

function _getEmojiModal() {
    return emojiPickerEl.closest('.sp-modal');
}

export function showEmojiPicker() {
    initEmojiTabs();
    emojiSearchEl.value = '';
    renderEmojiGrid();
    const modal = _getEmojiModal();
    if (modal) {
        let backdrop = modal.querySelector('.emoji-picker-backdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.className = 'emoji-picker-backdrop';
            backdrop.addEventListener('click', hideEmojiPicker);
            modal.appendChild(backdrop);
        }
        backdrop.style.display = '';
    }
    emojiPickerEl.style.display = '';
    emojiTabsEl.querySelectorAll('.emoji-tab').forEach(t => t.classList.remove('active'));
    emojiSearchEl.focus();
}

export function hideEmojiPicker() {
    emojiPickerEl.style.display = 'none';
    const modal = _getEmojiModal();
    if (modal) {
        const backdrop = modal.querySelector('.emoji-picker-backdrop');
        if (backdrop) backdrop.style.display = 'none';
    }
}

// Event listeners d'initialisation (exécutés au chargement du module)
emojiIconeBtn.addEventListener('click', () => {
    const visible = emojiPickerEl.style.display !== 'none';
    if (visible) {
        hideEmojiPicker();
    } else {
        showEmojiPicker();
    }
});

emojiSearchEl.addEventListener('input', () => {
    emojiTabsEl.querySelectorAll('.emoji-tab').forEach(t => t.classList.remove('active'));
    renderEmojiGrid(null, emojiSearchEl.value.trim());
});

// Fermer le picker si on clique en dehors
document.addEventListener('click', (e) => {
    if (emojiPickerEl.style.display !== 'none'
        && !emojiPickerEl.contains(e.target)
        && !emojiIconeBtn.contains(e.target)) {
        hideEmojiPicker();
    }
});
