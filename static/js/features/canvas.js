export function createCanvas({
    STATE,
    canvasToggleBtn,
    getModels,
    updateSideToolbarState,
    alignInputHint,
    customConfirm,
    saveConversation,
    window
}) {
    function updateCanvasBtn() {
        if (!canvasToggleBtn || !window.Canvas) return;
        const e = STATE.currentModel;
        if (!(e && getModels().some((t => t.id === e)))) return canvasToggleBtn.style.display = "none",
        "function" == typeof updateSideToolbarState && updateSideToolbarState(), void ("function" == typeof alignInputHint && alignInputHint());
        canvasToggleBtn.style.display = "", "object" == typeof window.Canvas._state && canvasToggleBtn.classList.toggle("active", !!window.Canvas.isActive()),
        "function" == typeof updateSideToolbarState && updateSideToolbarState(), "function" == typeof alignInputHint && alignInputHint();
    }

    function buildCanvasParserIfActive() {
        return window.Canvas && window.Canvas.isActive() ? window.Canvas.createStreamParser({
            onPersist: () => {
                "function" == typeof window.saveConversation && window.saveConversation();
            }
        }) : null;
    }

    function attachCanvasBeforeToLastAssistant() {
        if (!window.Canvas || !window.Canvas.isActive()) return;
        const e = STATE.conversationHistory[STATE.conversationHistory.length - 1];
        e && "assistant" === e.role && ("function" != typeof window.Canvas.isDirtyVsBaseline || window.Canvas.isDirtyVsBaseline()) && (e.canvasBefore = window.Canvas.getBaselineSnapshot());
    }

    async function confirmAndRewindCanvas(e) {
        if (!window.Canvas || !window.Canvas.isActive()) return !0;
        if (!e) return !0;
        if ("function" == typeof window.Canvas.filesEqual && window.Canvas.filesEqual(e, window.Canvas.getCurrentSnapshot())) return !0;
        return !!await customConfirm("Cette action va annuler les modifications du canvas apportées par cette réponse de l'IA et la relancer depuis l'état précédent. Continuer ?", {
            icon: "revert",
            danger: !0,
            okLabel: "Relancer",
            cancelLabel: "Annuler"
        }) && (window.Canvas.restoreSnapshot(e), "function" == typeof saveConversation && saveConversation(),
        !0);
    }

    return {
        updateCanvasBtn,
        buildCanvasParserIfActive,
        attachCanvasBeforeToLastAssistant,
        confirmAndRewindCanvas
    };
}
