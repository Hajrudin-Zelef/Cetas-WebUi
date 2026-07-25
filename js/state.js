// state.js — État partagé. © Marexsoft Corporation. Fondateur Kouassi Marius.
//
// Utilisation : import { STATE } from './state.js';
// Tous les modules partagent la même référence → mutations ET
// réassignations fonctionnent (STATE.foo = 5, STATE.bar.push(x))
// ============================================================

export const STATE = {
    version: '3.2',

    // --- Conversations ---
    conversationHistory: [],
    _activeStreams: new Map(), // Map<convId, streamCtx>
    currentModel: null,
    currentImageModel: null,
    currentSearchModel: null,
    isStreaming: false,
    currentAbortController: null,
    conversationId: null,
    conversationStartTime: null,
    conversationLastActivity: null,
    conversationTitle: null,
    firstPrompt: null,
    conversationStarted: false,
    currentSystemPrompt: null,

    // --- Tokens & coûts ---
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCost: 0,
    totalImageCost: 0,
    totalAudioCost: 0,
    totalTitleCost: 0,
    costByModel: {},

    // --- Catégories ---
    activeCategoryId: null,
    editingCategoryId: null,
    currentConversationCategory: null,
    _catEditFromManagePopup: false,
    _selectedCatColor: '#3b82f6',

    // --- Prompts / Rôles ---
    prEditingFilename: null,
    spEditingFilename: null,

    // --- Pièces jointes ---
    pendingImages: [],
    pendingFiles: [],
    pendingLoadingFiles: [],
    _pendingLoadId: 0,

    // --- Audio / Micro ---
    currentTtsAudio: null,
    mediaRecorder: null,
    micChunks: [],
    micStartTime: null,
    micTranscribing: false,

    // --- Divers ---
    webSearchEnabled: true,
    webSearchDepth: 'standard',
    originalPromptBeforeEnhance: null,
    isEnhancing: false,
    _fullTextsLoaded: false,
};

export const STREAM_ERROR_CONTENT = 'Une erreur est survenue. Réessayez de générer la réponse, changez de modèle si nécessaire.';

export const CAT_PRESET_COLORS = [
    '#e53e3e', '#d97706', '#ca8a04', '#16a34a', '#0d9488',
    '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
    '#d946ef', '#ec4899', '#f43f5e', '#78716c', '#64748b',
    '#059669', '#2563eb', '#7c3aed', '#c026d3', '#ea580c',
    '#0891b2', '#b45309'
];

export const TEXT_EXTENSIONS = ['.txt', '.md', '.csv', '.json', '.xml', '.svg', '.log', '.js', '.py', '.html', '.css'];

// Exposition globale pour les scripts classiques non-module (plus-menu.js, conversations.js, config-providers.js)
if (typeof window !== 'undefined') {
    window.STATE = STATE;
}

export function isStreamActive(streamConvId, streamHistory) {
    return streamConvId === STATE.conversationId && streamHistory === STATE.conversationHistory;
}
