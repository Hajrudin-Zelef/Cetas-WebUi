export function createMarexcode(deps) {
    const {
        streamModelWithTools,
        MAREXCODE_TOOLS,
        MODELS,
        Auth,
        effectiveSystemPrompt,
    } = deps;

    let session = { id: null, title: "Nouvelle session", model: null, messages: [] };
    let running = false;
    let pendingEl = null;

    const log = document.getElementById("marex-chat-log");
    const input = document.getElementById("marex-input");
    const sendBtn = document.getElementById("marex-send-btn");
    const plusBtn = document.getElementById("marex-plus-btn");
    const plusDropdown = document.getElementById("marex-plus-dropdown");
    const plusTabs = document.getElementById("marex-model-tabs");
    const plusList = document.getElementById("marex-model-list");
    const modelLabel = document.getElementById("marex-model-label");
    const sessionSel = document.getElementById("marex-session-select");
    const treeEl = document.getElementById("marex-tree");
    const sessionsEl = document.getElementById("marex-sessions");
    const fileViewer = document.getElementById("marex-file-content");
    const backBtn = document.getElementById("marex-back-btn");

    function apiHeaders() {
        const h = { "Content-Type": "application/json" };
        if (Auth && Auth.getToken) { const t = Auth.getToken(); if (t) h.Authorization = "Bearer " + t; }
        return h;
    }

    async function loadTree() {
        try {
            const r = await fetch("/api/marexcode/tree", { headers: apiHeaders() });
            const list = await r.json();
            treeEl.innerHTML = "";
            list.forEach(f => {
                const d = document.createElement("div");
                d.className = "marex-tree-item";
                d.textContent = f.path;
                d.title = f.path;
                d.addEventListener("click", () => openFile(f.path));
                treeEl.appendChild(d);
            });
        } catch (e) { treeEl.textContent = "Erreur chargement arbre"; }
    }

    async function openFile(path) {
        try {
            const r = await fetch("/api/exec", {
                method: "POST", headers: apiHeaders(),
                body: JSON.stringify({ tool: "Read", args: { file_path: path } }),
                signal: AbortSignal.timeout(20000),
            });
            const d = await r.json();
            fileViewer.textContent = d.error ? "Erreur: " + d.error : (d.content || "");
        } catch (e) { /* ignore */ }
    }

    function addMsg(role, text) {
        const m = document.createElement("div");
        m.className = "marex-msg " + role;
        m.textContent = text;
        log.appendChild(m); log.scrollTop = log.scrollHeight;
        return m;
    }

    function addTool(name, args, result) {
        const t = document.createElement("div");
        t.className = "marex-tool";
        t.innerHTML = '<div class="marex-tool-name">🛠 ' + esc(name) + "</div>" +
            "<pre>" + esc(JSON.stringify(args)) + "</pre>" +
            "<pre>" + esc(JSON.stringify(result)) + "</pre>";
        log.appendChild(t); log.scrollTop = log.scrollHeight;
    }

    async function send() {
        const text = input.value.trim();
        if (!text || running) return;
        const model = session.model || null;
        if (!model) { addMsg("assistant", "Sélectionnez un modèle avec le bouton +."); return; }
        running = true; input.value = ""; sendBtn.disabled = true;
        session.model = model;
        session.messages.push({ role: "user", content: text });
        addMsg("user", text);
        const history = [
            { role: "system", content: effectiveSystemPrompt ? effectiveSystemPrompt() : "Tu es Marexcode, assistant de codage." },
            ...session.messages,
        ];
        pendingEl = null;
        let thinkEl = null;
        let thinkText = "";
        await streamModelWithTools(model, history,
            (chunk) => {
                if (!pendingEl) { pendingEl = addMsg("assistant", ""); }
                pendingEl.textContent += chunk;
                log.scrollTop = log.scrollHeight;
            },
            () => {
                running = false; sendBtn.disabled = false;
                if (pendingEl) {
                    if (thinkText.trim() && thinkEl) {
                        thinkEl.setAttribute("open", "");
                        thinkEl.querySelector(".marex-think-content").textContent = thinkText;
                    }
                    session.messages.push({ role: "assistant", content: pendingEl.textContent });
                    pendingEl = null; thinkEl = null; thinkText = "";
                }
                saveSession();
            },
            (err) => {
                running = false; sendBtn.disabled = false; pendingEl = null; thinkEl = null;
                addMsg("assistant", "Erreur: " + (err && err.message || err));
            },
            MAREXCODE_TOOLS, false,
            (t) => {
                thinkText += t;
                if (!thinkEl) {
                    thinkEl = document.createElement("details");
                    thinkEl.className = "marex-think";
                    thinkEl.open = true;
                    const sum = document.createElement("summary");
                    sum.textContent = "Raisonnement";
                    const body = document.createElement("div");
                    body.className = "marex-think-content";
                    thinkEl.appendChild(sum); thinkEl.appendChild(body);
                    log.appendChild(thinkEl); log.scrollTop = log.scrollHeight;
                }
                thinkEl.querySelector(".marex-think-content").textContent = thinkText;
                log.scrollTop = log.scrollHeight;
            },
            null, null, null, 0);
    }

    async function saveSession() {
        if (!session.messages.length) return;
        const id = session.id || "s" + Date.now();
        session.id = id;
        session.date = new Date().toISOString();
        const r = await fetch("/api/marexcode/sessions/" + id, {
            method: "PUT", headers: apiHeaders(), body: JSON.stringify(session),
        });
        if (r.ok) loadSessions();
    }

    async function loadSessions() {
        try {
            const r = await fetch("/api/marexcode/sessions", { headers: apiHeaders() });
            const list = await r.json();
            sessionSel.innerHTML = "";
            sessionsEl.innerHTML = "";
            list.forEach(s => {
                const o = document.createElement("option");
                o.value = s.id; o.textContent = (s.title || s.id) + (s.model ? " — " + s.model : "");
                sessionSel.appendChild(o);
                const d = document.createElement("div");
                d.className = "marex-tree-item"; d.textContent = o.textContent;
                d.addEventListener("click", () => { sessionSel.value = s.id; loadSession(s.id); });
                sessionsEl.appendChild(d);
            });
        } catch (e) { /* ignore */ }
    }

    async function loadSession(id) {
        try {
            const r = await fetch("/api/marexcode/sessions/" + id, { headers: apiHeaders() });
            const d = await r.json();
            session = d; session.id = id;
            renderMessages();
        } catch (e) { /* ignore */ }
    }

    function renderMessages() {
        log.innerHTML = "";
        (session.messages || []).forEach(m => addMsg(m.role === "user" ? "user" : "assistant", m.content));
    }

    function modelLabelOf(id) {
        const m = MODELS.find(x => x.id === id);
        return m ? m.label : (id || "");
    }

    function setModel(cat, id) {
        session.model = id;
        session.modelCat = cat || "text";
        if (modelLabel) modelLabel.textContent = modelLabelOf(id) || "Modèle";
        closePlusMenu();
    }

    function refreshModelLabel() {
        if (modelLabel) modelLabel.textContent = modelLabelOf(session.model) || "Modèle";
    }

    function closePlusMenu() {
        if (plusDropdown) plusDropdown.style.display = "none";
        if (plusBtn) plusBtn.classList.remove("open");
    }

    function populatePlus(tab) {
        if (typeof window.populatePlusModels === "function") {
            window.populatePlusModels(tab || "text", plusList, setModel);
        }
    }

    function initPlusMenu() {
        if (!plusBtn || !plusDropdown) return;
        plusBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (plusDropdown.style.display === "block") { closePlusMenu(); return; }
            const activeTab = plusTabs && plusTabs.querySelector(".plus-model-tab.active");
            populatePlus(activeTab ? activeTab.dataset.tab : "text");
            plusDropdown.style.display = "block";
            plusBtn.classList.add("open");
        });
        if (plusTabs) {
            plusTabs.querySelectorAll(".plus-model-tab").forEach(tab => {
                tab.addEventListener("click", () => {
                    plusTabs.querySelectorAll(".plus-model-tab").forEach(t => t.classList.remove("active"));
                    tab.classList.add("active");
                    populatePlus(tab.dataset.tab);
                });
            });
        }
        document.addEventListener("click", (e) => {
            if (plusDropdown.style.display === "block" && !plusDropdown.contains(e.target) &&
                !plusBtn.contains(e.target)) closePlusMenu();
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && plusDropdown.style.display === "block") closePlusMenu();
        });
    }

    sendBtn.addEventListener("click", send);
    input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
    document.getElementById("marex-new-session").addEventListener("click", () => {
        session = { id: null, title: "Nouvelle session", model: null, modelCat: null, messages: [] };
        log.innerHTML = ""; input.value = ""; pendingEl = null; refreshModelLabel();
    });
    sessionSel.addEventListener("change", () => { if (sessionSel.value) loadSession(sessionSel.value); });
    backBtn.addEventListener("click", () => close());

    window.addEventListener("marexcode-tool", (e) => {
        if (e.detail.phase !== "end") return;
        if (!document.body.classList.contains("marexcode-mode")) return;
        addTool(e.detail.name, e.detail.args, e.detail.result);
    });

    function open() {
        initPlusMenu(); refreshModelLabel(); loadTree(); loadSessions();
        document.body.classList.add("marexcode-mode");
        window._activeToolset = MAREXCODE_TOOLS;
        window._toolMaxIterations = 5;
        window.dispatchEvent(new CustomEvent("cetas:toolset-change"));
    }

    function close() {
        document.body.classList.remove("marexcode-mode");
        window._activeToolset = null;
        delete window._toolMaxIterations;
        window.dispatchEvent(new CustomEvent("cetas:toolset-change"));
    }

    function isOpen() { return document.body.classList.contains("marexcode-mode"); }

    return { open, close, isOpen };
}

function esc(s) {
    const div = document.createElement("div");
    div.textContent = String(s);
    return div.innerHTML;
}