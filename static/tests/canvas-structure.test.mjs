import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const appSource = readFileSync(resolve(ROOT, 'js/core/app.js'), 'utf8');

function createFixture(canvasModule, {
    canvasPresent = true,
    buttonPresent = true,
    currentModel = 'model-a',
    models = [{ id: 'model-a' }],
    history = [{ role: 'assistant' }],
    confirmResult = true,
    canvas = {}
} = {}) {
    const events = { toolbar: 0, align: 0, confirmed: [], saved: 0, windowSaved: 0, restored: [] };
    const canvasToggleBtn = buttonPresent
        ? { style: { display: 'block' }, classList: { toggle() {} } }
        : null;
    const canvasFixture = {
        _state: { files: {} },
        isActive: () => true,
        createStreamParser: options => ({ options }),
        isDirtyVsBaseline: () => true,
        getBaselineSnapshot: () => ({ 'index.html': '<p>before</p>' }),
        getCurrentSnapshot: () => ({ 'index.html': '<p>after</p>' }),
        filesEqual: () => false,
        restoreSnapshot: snapshot => events.restored.push(snapshot),
        ...canvas
    };
    const appWindow = {
        ...(canvasPresent ? { Canvas: canvasFixture } : {}),
        saveConversation: () => { events.windowSaved++; }
    };
    const feature = canvasModule.createCanvas({
        STATE: { currentModel, conversationHistory: history },
        canvasToggleBtn,
        getModels: () => models,
        updateSideToolbarState: () => { events.toolbar++; },
        alignInputHint: () => { events.align++; },
        customConfirm: async (message, options) => {
            events.confirmed.push({ message, options });
            return confirmResult;
        },
        saveConversation: () => { events.saved++; },
        window: appWindow
    });

    return { feature, canvasToggleBtn, history, events };
}

test('Canvas functions preserve their behavior through the feature factory', async () => {
    const canvasModule = await import('../js/features/canvas.js');
    const history = [{ role: 'assistant' }];
    const classList = { toggled: [], toggle(...args) { this.toggled.push(args); } };
    const canvasToggleBtn = { style: {}, classList };
    const saved = [];
    const restored = [];
    const confirmed = [];
    const canvas = {
        _state: { files: {} },
        isActive: () => true,
        createStreamParser: options => ({ options }),
        isDirtyVsBaseline: () => true,
        getBaselineSnapshot: () => ({ 'index.html': '<p>before</p>' }),
        getCurrentSnapshot: () => ({ 'index.html': '<p>after</p>' }),
        filesEqual: () => false,
        restoreSnapshot: snapshot => restored.push(snapshot)
    };
    const appWindow = {
        Canvas: canvas,
        saveConversation: () => saved.push('window')
    };
    const canvasFeature = canvasModule.createCanvas({
        STATE: { currentModel: 'model-a', conversationHistory: history },
        canvasToggleBtn,
        getModels: () => [{ id: 'model-a' }],
        updateSideToolbarState: () => saved.push('toolbar'),
        alignInputHint: () => saved.push('align'),
        customConfirm: async (message, options) => {
            confirmed.push({ message, options });
            return true;
        },
        saveConversation: () => saved.push('direct'),
        window: appWindow
    });

    canvasFeature.updateCanvasBtn();
    assert.equal(canvasToggleBtn.style.display, '');
    assert.deepEqual(classList.toggled, [['active', true]]);
    assert.deepEqual(saved, ['toolbar', 'align']);

    const parser = canvasFeature.buildCanvasParserIfActive();
    parser.options.onPersist();
    assert.deepEqual(saved, ['toolbar', 'align', 'window']);

    canvasFeature.attachCanvasBeforeToLastAssistant();
    assert.deepEqual(history[0].canvasBefore, { 'index.html': '<p>before</p>' });

    assert.equal(await canvasFeature.confirmAndRewindCanvas({ 'index.html': '<p>before</p>' }), true);
    assert.deepEqual(confirmed, [{
        message: 'Cette action va annuler les modifications du canvas apportées par cette réponse de l\'IA et la relancer depuis l\'état précédent. Continuer ?',
        options: { icon: 'revert', danger: true, okLabel: 'Relancer', cancelLabel: 'Annuler' }
    }]);
    assert.deepEqual(restored, [{ 'index.html': '<p>before</p>' }]);
    assert.deepEqual(saved, ['toolbar', 'align', 'window', 'direct']);
});

test('updateCanvasBtn safely handles missing Canvas, button, and model', async () => {
    const canvasModule = await import('../js/features/canvas.js');

    const withoutCanvas = createFixture(canvasModule, { canvasPresent: false });
    assert.doesNotThrow(() => withoutCanvas.feature.updateCanvasBtn());
    assert.equal(withoutCanvas.canvasToggleBtn.style.display, 'block');

    const withoutButton = createFixture(canvasModule, { buttonPresent: false });
    assert.doesNotThrow(() => withoutButton.feature.updateCanvasBtn());

    const unsupportedModel = createFixture(canvasModule, {
        currentModel: 'model-b',
        models: [{ id: 'model-a' }]
    });
    unsupportedModel.feature.updateCanvasBtn();
    assert.equal(unsupportedModel.canvasToggleBtn.style.display, 'none');
});

test('buildCanvasParserIfActive returns null without an active Canvas', async () => {
    const canvasModule = await import('../js/features/canvas.js');

    const withoutCanvas = createFixture(canvasModule, { canvasPresent: false });
    assert.equal(withoutCanvas.feature.buildCanvasParserIfActive(), null);

    const inactiveCanvas = createFixture(canvasModule, {
        canvas: {
            isActive: () => false,
            createStreamParser: () => assert.fail('inactive Canvas must not create a parser')
        }
    });
    assert.equal(inactiveCanvas.feature.buildCanvasParserIfActive(), null);
});

test('attachCanvasBeforeToLastAssistant preserves history on inactive or clean Canvas paths', async () => {
    const canvasModule = await import('../js/features/canvas.js');

    const withoutCanvas = createFixture(canvasModule, { canvasPresent: false });
    withoutCanvas.feature.attachCanvasBeforeToLastAssistant();
    assert.deepEqual(withoutCanvas.history, [{ role: 'assistant' }]);

    const inactiveCanvas = createFixture(canvasModule, {
        canvas: { isActive: () => false },
        history: [{ role: 'assistant' }]
    });
    inactiveCanvas.feature.attachCanvasBeforeToLastAssistant();
    assert.deepEqual(inactiveCanvas.history, [{ role: 'assistant' }]);

    const noAssistantLast = createFixture(canvasModule, {
        history: [{ role: 'assistant' }, { role: 'user' }]
    });
    noAssistantLast.feature.attachCanvasBeforeToLastAssistant();
    assert.deepEqual(noAssistantLast.history, [{ role: 'assistant' }, { role: 'user' }]);

    const cleanCanvas = createFixture(canvasModule, {
        canvas: { isDirtyVsBaseline: () => false },
        history: [{ role: 'assistant' }]
    });
    cleanCanvas.feature.attachCanvasBeforeToLastAssistant();
    assert.deepEqual(cleanCanvas.history, [{ role: 'assistant' }]);
});

test('confirmAndRewindCanvas skips confirmation and persistence on safe exits', async () => {
    const canvasModule = await import('../js/features/canvas.js');
    const before = { 'index.html': '<p>before</p>' };

    const withoutCanvas = createFixture(canvasModule, { canvasPresent: false });
    assert.equal(await withoutCanvas.feature.confirmAndRewindCanvas(before), true);
    assert.equal(withoutCanvas.events.confirmed.length, 0);
    assert.equal(withoutCanvas.events.restored.length, 0);
    assert.equal(withoutCanvas.events.saved, 0);

    const withoutBeforeSnapshot = createFixture(canvasModule);
    assert.equal(await withoutBeforeSnapshot.feature.confirmAndRewindCanvas(), true);
    assert.equal(withoutBeforeSnapshot.events.confirmed.length, 0);
    assert.equal(withoutBeforeSnapshot.events.restored.length, 0);
    assert.equal(withoutBeforeSnapshot.events.saved, 0);

    const equalFiles = createFixture(canvasModule, {
        canvas: { filesEqual: () => true }
    });
    assert.equal(await equalFiles.feature.confirmAndRewindCanvas(before), true);
    assert.equal(equalFiles.events.confirmed.length, 0);
    assert.equal(equalFiles.events.restored.length, 0);
    assert.equal(equalFiles.events.saved, 0);

    const cancelled = createFixture(canvasModule, { confirmResult: false });
    assert.equal(await cancelled.feature.confirmAndRewindCanvas(before), false);
    assert.equal(cancelled.events.confirmed.length, 1);
    assert.equal(cancelled.events.restored.length, 0);
    assert.equal(cancelled.events.saved, 0);
});

test('Canvas functions have one owner module', async () => {
    const moduleSource = readFileSync(resolve(ROOT, 'js/features/canvas.js'), 'utf8');
    const canvasModule = await import('../js/features/canvas.js');

    assert.match(appSource, /from "\.\.\/features\/canvas\.js"/);
    assert.match(moduleSource, /export function createCanvas\s*\(/);
    assert.equal(typeof canvasModule.createCanvas, 'function');

    for (const name of [
        'updateCanvasBtn',
        'buildCanvasParserIfActive',
        'attachCanvasBeforeToLastAssistant',
        'confirmAndRewindCanvas'
    ]) {
        const definition = new RegExp(`function ${name}\\s*\\(`, 'g');
        assert.equal([...moduleSource.matchAll(definition)].length, 1, `${name} module definition`);
        assert.equal([...appSource.matchAll(definition)].length, 0, `${name} app definition`);
    }
});
