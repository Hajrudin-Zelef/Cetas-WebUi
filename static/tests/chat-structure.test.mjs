import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const appSource = readFileSync(resolve(ROOT, 'js/core/app.js'), 'utf8');
const moduleSource = readFileSync(resolve(ROOT, 'js/features/chat.js'), 'utf8');

globalThis.window = { location: { hostname: 'localhost' }, __wrapTables: undefined };

test('app.js imports createChat from chat.js', () => {
    assert.match(appSource, /import \{ createChat \} from "\.\.\/features\/chat\.js"/);
});

test('chat.js exports createChat factory', () => {
    assert.match(moduleSource, /export function createChat\s*\(/);
});

test('createChat factory API includes required functions', async () => {
    const chatModule = await import('../js/features/chat.js');
    assert.equal(typeof chatModule.createChat, 'function');

    const noop = () => {};
    const chat = chatModule.createChat({
        chatContainer: { querySelectorAll: () => [], appendChild: noop, scroll: noop, scrollHeight: 0, lastElementChild: null },
        promptInput: { value: '', style: {}, trim: () => '', focus: noop, addEventListener: noop, blur: noop, closest: () => null },
        sendBtn: { disabled: false, classList: { add: noop, remove: noop, toggle: noop }, style: {}, title: '' },
        spSelect: { value: '', selectedOptions: [] },
        spTextarea: { value: '', trim: () => '' },
        micBtn: { classList: { contains: () => false }, style: {}, innerHTML: '', title: '' },
        micIconDefaultSaved: '',
        micIconStopStreaming: '',
        attachBtn: { classList: { toggle: noop } },
        attachPreview: { innerHTML: '' },
        updateEnhanceBtn: noop,
        updateEmptyChatCategory: noop,
        generateConversationId: () => 'test-id',
        safeUrl: s => s,
        addCodeCopyButtons: noop,
        saveConversation: noop,
        refreshConvList: noop,
        maybeGenerateTitle: noop,
        _saveConvById: noop,
        _limitHistoryImages: () => [],
        getMaxHistoryImages: () => 10,
        resetConversation: noop,
        getTextFromContent: () => '',
        hasBuiltInWebSearch: () => false,
        calcWebSearchCost: () => 0,
        _resolveTextCost: () => 0,
        _resolveImageCost: () => ({}),
        getImageParams: () => ({}),
        getModelEditeur: () => null,
        getImageModelEditeur: () => null,
        getSearchModelEditeur: () => null,
        getTarif: () => null,
        getImageTarif: () => null,
        getSearchTarif: () => null,
        getModelLabel: () => '',
        getModelParams: () => null,
        streamModel: noop,
        generateImage: noop,
        buildImagePrompt: () => '',
        collectReferenceImages: () => [],
        imageResultToContent: () => [],
        buildImagesContainer: () => document.createElement('div'),
        routeModel: noop,
        recordRouteResult: noop,
        explainError: async () => null,
        addCostForModel: noop,
        updateTokenDisplay: noop,
        customAlert: noop,
        customConfirm: noop,
        showModelAlert: noop,
        showErrorAlert: noop,
        applyErrorStyle: noop,
        openPrModal: noop,
        attachCanvasBeforeToLastAssistant: noop,
        buildCanvasParserIfActive: () => null,
        confirmAndRewindCanvas: async () => true,
        effectiveSystemPrompt: () => '',
        _showRouterThinking: noop,
        _hideRouterThinking: noop,
        AUDIO_SETTINGS: {},
        MODELS_DATA: { tts: [] },
        showNoModelAlert: noop,
        ttsSpeak: noop,
    });

    const expectedApi = [
        'updateSendButton', 'addMessage', 'createStreamRenderer', 'endStreaming',
        'startEditMessage', 'sendMessage', 'regenerateLastResponse',
        'addRegenBtn', 'removeRegenBtn', 'scrollToBottom',
        '_rebindStreamToVisibleDOM', 'handleApiError', 'applyErrorStyle',
        'hideEmptyPlaceholder', 'showEmptyPlaceholder', 'closeAllMenus',
        'collapseThinkBlock', '_getUserHasScrolledUp',
        'formatGenTime', 'formatGenTooltip', 'setGenTimeOnLastAssistant',
        'appendCitations', '_samAgentMakeClickable', '_wrapNewChars',
        '_showThinkingIndicator', '_removeThinkingIndicator', 'addCodeCopyButtons',
    ];

    for (const name of expectedApi) {
        assert.equal(typeof chat[name], 'function', `chat.${name} should be a function`);
    }
});
