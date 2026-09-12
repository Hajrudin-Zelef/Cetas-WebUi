import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const appSource = readFileSync(resolve(ROOT, 'js/core/app.js'), 'utf8');
const moduleSource = readFileSync(resolve(ROOT, 'js/features/model-select.js'), 'utf8');
const modelSelectModule = await import('../js/features/model-select.js');

const createElement = () => ({
    classList: { toggle() {} },
    querySelectorAll: () => [],
    style: {},
    remove() {}
});
globalThis.document = {
    body: { appendChild() {} },
    createElement,
    getElementById: () => null
};

const movedFunctions = [
    '_modelMakerLabel',
    '_editeurGroupHeaderHtml',
    'hasProviderKey',
    '_isModelNew',
    '_isModelExpiringSoon',
    '_formatExpirationDateFr',
    '_formatContextLength',
    '_formatModalities',
    '_formatSupportedParams',
    '_formatDefaultParams',
    '_buildModelTooltip',
    'upgradeToCustomSelect',
    'hasAnyProviderKey',
    'updateTriggerDisplay',
    'updateActiveOption',
    'formatImagePriceRange',
    '_formatOrImagePriceStr',
    '_formatModelPriceString',
    'populateCustomSelect',
    '_buildModelsHtml',
    '_switchTab',
    '_applyModelSelection',
    'populateUnifiedSelect',
    'populateModelSelect',
    'checkApiKeyForModel',
    'addModelSwitchElement',
    'addModelSwitch'
];

test('model selection functions have one owner module', () => {
    assert.match(appSource, /from "\.\.\/features\/model-select\.js"/);
    assert.match(moduleSource, /export function createModelSelect\s*\(/);
    assert.equal(typeof modelSelectModule.createModelSelect, 'function');

    const modelSelect = modelSelectModule.createModelSelect({
        STATE: { conversationHistory: [] },
        chatContainer: { querySelectorAll: () => [] },
        modelSelect: {},
        getModelLabel: value => value,
        escHtml: value => value,
        getApiKeys: () => ({}),
        getModels: () => [],
        getImageModels: () => [],
        getSearchModels: () => [],
        loadCatalogPrefs: () => ({ disabled: [], orEnabled: [] }),
        getTarif: () => null,
        getImageTarif: () => null,
        getSearchTarif: () => null,
        getImageModelEditeur: () => null,
        getSearchModelEditeur: () => null,
        isLocalEditeur: () => false,
        formatImagePrice: value => String(value),
        openApiKeysModal() {},
        showModelAlert() {},
        updateInputHint() {},
        updateEffortMandatory() {},
        updateImageParamsVisibility() {},
        setRightPanelTab() {},
        updateTokenDisplay() {},
        updateWebSearchBtn() {},
        updateCanvasBtn() {},
        populatePlusModels() {},
        scrollToBottom() {},
        saveConversation() {}
    });

    for (const name of movedFunctions) {
        assert.equal(typeof modelSelect[name], 'function', `${name} factory export`);
    }

    for (const name of movedFunctions) {
        const definition = new RegExp(`function ${name}\\s*\\(`, 'g');
        assert.equal([...moduleSource.matchAll(definition)].length, 1, `${name} module definition`);
        assert.equal([...appSource.matchAll(definition)].length, 0, `${name} app definition`);
    }
});
