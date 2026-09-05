import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const appSource = readFileSync(resolve(ROOT, 'js/core/app.js'), 'utf8');
const moduleSource = readFileSync(resolve(ROOT, 'js/ui/prompt-toolbar.js'), 'utf8');
const promptToolbarModule = await import('../js/ui/prompt-toolbar.js');

function createClassList() {
    const values = new Set();
    return {
        add: value => values.add(value),
        remove: value => values.delete(value),
        contains: value => values.has(value),
        toggle: (value, force) => {
            const next = force === undefined ? !values.has(value) : force;
            next ? values.add(value) : values.delete(value);
            return next;
        }
    };
}

function createElement({ value = '', display = '', rect = {} } = {}) {
    const classList = createClassList();
    return {
        value,
        style: { display },
        classList,
        innerHTML: '',
        title: '',
        scrollHeight: 0,
        getBoundingClientRect: () => rect,
        closest: () => ({
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 40 })
        }),
        appendChild() {},
        querySelector() { return null; },
        addEventListener() {},
        focus() {},
        setSelectionRange() {},
        dispatchEvent() {}
    };
}

function createFixture() {
    const promptInput = createElement({ value: '' });
    const toolbarInsertBtn = createElement({ display: 'inline-flex' });
    const toolbarEnhanceBtn = createElement();
    const toolbarSaveBtn = createElement();
    const promptPickerDropdownWrapper = createElement();
    const promptPickerDropdown = createElement();
    const state = { originalPromptBeforeEnhance: null, isEnhancing: false, isStreaming: false };
    const fixtureDocument = { createElement: () => createElement() };
    const fixtureWindow = {
        Event,
        Canvas: {
            isActive: () => false,
            buildSystemPromptSuffix: () => ''
        }
    };

    const feature = promptToolbarModule.createPromptToolbar({
        STATE: state,
        window: fixtureWindow,
        document: fixtureDocument,
        promptInput,
        enhancePromptBtn: createElement(),
        toolbarInsertBtn,
        toolbarEnhanceBtn,
        toolbarSaveBtn,
        promptPickerDropdownWrapper,
        promptPickerDropdown,
        getLastClickCoordinates: () => ({ x: null, y: null }),
        samAgentBoostPrompt: 'SamAgent boost',
        listSavedPrompts: async () => [],
        updateSendButton() {},
        openPrModal() {}
    });

    return { feature, promptInput, toolbarInsertBtn, toolbarEnhanceBtn, toolbarSaveBtn, state };
}

test('toolbar mode transitions preserve insert, enhance, and revert ownership', () => {
    const { feature, promptInput, toolbarInsertBtn, toolbarEnhanceBtn, toolbarSaveBtn, state } = createFixture();

    feature.updatePromptToolbar();
    assert.equal(feature._toolbarMode, 'insert');
    assert.equal(toolbarInsertBtn.style.display, 'inline-flex');
    assert.equal(toolbarEnhanceBtn.style.display, 'none');

    promptInput.value = 'make this clearer';
    feature.updatePromptToolbar();
    assert.equal(feature._toolbarMode, 'enhance');
    assert.equal(toolbarInsertBtn.style.display, 'none');
    assert.equal(toolbarEnhanceBtn.style.display, 'inline-flex');
    assert.equal(toolbarSaveBtn.style.display, 'inline-flex');

    state.originalPromptBeforeEnhance = 'make this clearer';
    feature.updatePromptToolbar();
    assert.equal(feature._toolbarMode, 'revert');
    assert.equal(toolbarEnhanceBtn.classList.contains('revert'), true);
    assert.equal(toolbarSaveBtn.style.display, 'inline-flex');
});

test('prompt helpers preserve conversation context and Canvas suffix behavior', () => {
    const { feature, state } = createFixture();
    const history = [
        { role: 'user', content: 'first request' },
        { role: 'assistant', content: [{ type: 'text', text: 'first answer' }] },
        { role: 'user', content: 'current request' }
    ];

    assert.equal(
        feature.buildImagePrompt('draw a house', history),
        'Context of the conversation:\nUser: first request\nAssistant: first answer\n\nImage request: draw a house'
    );

    state.currentModel = 'samagent-n4';
    const fixtureWindow = feature.window;
    fixtureWindow.Canvas.isActive = () => true;
    fixtureWindow.Canvas.buildSystemPromptSuffix = () => 'Canvas suffix';
    assert.equal(
        feature.effectiveSystemPrompt('base prompt'),
        'base prompt\n\nSamAgent boost\n\nCanvas suffix'
    );
});

test('prompt-toolbar functions have one owner module', () => {
    assert.match(appSource, /from "\.\.\/ui\/prompt-toolbar\.js"/);
    assert.match(moduleSource, /export function createPromptToolbar\s*\(/);
    assert.equal(typeof promptToolbarModule.createPromptToolbar, 'function');

    for (const name of [
        'effectiveSystemPrompt',
        'updateEnhanceBtn',
        '_insertBtnTargetCoords',
        'showInsertBtn',
        'hideInsertBtn',
        '_applyToolbarMode',
        'updatePromptToolbar',
        'buildImagePrompt',
        'togglePromptPicker'
    ]) {
        const definition = new RegExp(`function ${name}\\s*\\(`, 'g');
        assert.equal([...moduleSource.matchAll(definition)].length, 1, `${name} module definition`);
        assert.equal([...appSource.matchAll(definition)].length, 0, `${name} app definition`);
    }

    assert.equal(appSource.includes('function exportPrItem('), true);
    assert.equal(moduleSource.includes('function exportPrItem('), false);
});
