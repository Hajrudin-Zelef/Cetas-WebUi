// dom.js — Registre centralisé des éléments DOM. © Marexsoft Corporation. Fondateur Kouassi Marius.
//

// --- Chat principal ---
export const getChatContainer = () => document.getElementById('chat-container');
export const getPromptInput = () => document.getElementById('prompt-input');
export const getSendBtn = () => document.getElementById('send-btn');
export const getNewChatBtn = () => document.getElementById('new-chat-btn');
export const getTokenInfo = () => document.getElementById('token-info');
export const getCostInfo = () => document.getElementById('cost-info');
export const getChatHeaderSettings = () => document.getElementById('chat-header-settings');
export const getInputHint = () => document.getElementById('input-hint');
export const getEmptyChatPlaceholder = () => document.getElementById('empty-chat-placeholder');
export const getEmptyChatCategory = () => document.getElementById('empty-chat-category');
export const getModelAlert = () => document.getElementById('model-alert');
export const getModelAlertText = () => document.getElementById('model-alert-text');
export const getModelAlertClose = () => document.getElementById('model-alert-close');

// --- Barre de tokens ---
export const getTokenBar = () => document.getElementById('token-bar');
export const getShareBtn = () => document.getElementById('share-btn');
export const getShareMenu = () => document.getElementById('share-menu');
export const getShareMenuMd = () => document.getElementById('share-menu-md');
export const getShareMenuHtml = () => document.getElementById('share-menu-html');
export const getSummaryBtn = () => document.getElementById('summary-btn');

// --- Sidebar ---
export const getSidebar = () => document.getElementById('sidebar');
export const getSidebarToggle = () => document.getElementById('sidebar-toggle');
export const getConvList = () => document.getElementById('conv-list');
export const getConvSearch = () => document.getElementById('conv-search');
export const getThemeToggle = () => document.getElementById('theme-toggle');

// --- Catégories ---
export const getCatSelect = () => document.getElementById('cat-select');
export const getCatSelectLabel = () => document.querySelector('#cat-select .cat-select-label');
export const getCatSelectDropdown = () => document.getElementById('cat-select-dropdown');
export const getCatManageBtn = () => document.getElementById('cat-manage-btn');
export const getCatModalOverlay = () => document.getElementById('cat-modal-overlay');
export const getCatModalTitle = () => document.getElementById('cat-modal-title');
export const getCatModalNom = () => document.getElementById('cat-modal-nom');
export const getCatModalIcone = () => document.getElementById('cat-modal-icone');
export const getCatColorGrid = () => document.getElementById('cat-color-grid');
export const getCatModalSave = () => document.getElementById('cat-modal-save');
export const getCatModalDelete = () => document.getElementById('cat-modal-delete');
export const getCatModalBack = () => document.getElementById('cat-modal-back');
export const getCatModalCancel = () => document.getElementById('cat-modal-cancel');
export const getCatManageListView = () => document.getElementById('cat-manage-list-view');
export const getCatManageEditView = () => document.getElementById('cat-manage-edit-view');
export const getCatManageList = () => document.getElementById('cat-manage-list');
export const getCatManageAddBtn = () => document.getElementById('cat-manage-add-btn');
export const getCatManageClose = () => document.getElementById('cat-manage-close');

// --- Rôles (System Prompts) ---
export const getSpSelect = () => document.getElementById('sp-select');
export const getSpListEl = () => document.getElementById('sp-list');
export const getSpAddBtn = () => document.getElementById('sp-add-btn');
export const getSpEditBtn = () => document.getElementById('sp-edit-btn');
export const getSpDeleteBtn = () => document.getElementById('sp-delete-btn');
export const getRpRoleActions = () => document.getElementById('rp-role-actions');
export const getSpModalOverlay = () => document.getElementById('sp-modal-overlay');
export const getSpModalTitle = () => document.getElementById('sp-modal-title');
export const getSpModalNom = () => document.getElementById('sp-modal-nom');
export const getSpModalContenu = () => document.getElementById('sp-modal-contenu');
export const getSpModalCancel = () => document.getElementById('sp-modal-cancel');
export const getSpModalSave = () => document.getElementById('sp-modal-save');
export const getSpModalDelete = () => document.getElementById('sp-modal-delete');
export const getSpModalOptimize = () => document.getElementById('sp-modal-optimize');
export const getSpTextarea = () => document.getElementById('sp-textarea');
export const getSpImportFile = () => document.getElementById('sp-import-file');

// --- Prompts enregistrés ---
export const getPrListEl = () => document.getElementById('pr-list');
export const getPrAddBtn = () => document.getElementById('pr-add-btn');
export const getPrModalOverlay = () => document.getElementById('pr-modal-overlay');
export const getPrModalTitle = () => document.getElementById('pr-modal-title');
export const getPrModalNom = () => document.getElementById('pr-modal-nom');
export const getPrModalContenu = () => document.getElementById('pr-modal-contenu');
export const getPrModalCancel = () => document.getElementById('pr-modal-cancel');
export const getPrModalSave = () => document.getElementById('pr-modal-save');
export const getPrModalEnhance = () => document.getElementById('pr-modal-enhance');
export const getPrModalDelete = () => document.getElementById('pr-modal-delete');
export const getPromptPickerDropdownWrapper = () => document.getElementById('prompt-picker-dropdown-wrapper');
export const getPromptPickerDropdown = () => document.getElementById('prompt-picker-dropdown');
export const getPromptPickerBtn = () => document.getElementById('prompt-picker-btn');

// --- Pièces jointes ---
export const getAttachBtn = () => document.getElementById('attach-btn');
export const getFileInput = () => document.getElementById('file-input');
export const getAttachPreview = () => document.getElementById('attach-preview');
export const getMicBtn = () => document.getElementById('mic-btn');
export const getInputArea = () => document.getElementById('input-area');

// --- Toolbar ---
export const getEnhancePromptBtn = () => document.getElementById('enhance-prompt-btn');
export const getToolbarInsertBtn = () => document.getElementById('toolbar-insert-btn');
export const getToolbarEnhanceBtn = () => document.getElementById('toolbar-enhance-btn');
export const getToolbarSaveBtn = () => document.getElementById('toolbar-save-btn');

// --- Sélecteur de modèles ---
export const getModelSelect = () => document.getElementById('model-select');
export const getImageModelSelect = () => document.getElementById('image-model-select');
export const getImageFormatSelect = () => document.getElementById('image-format-select');
export const getSearchModelSelect = () => document.getElementById('search-model-select');

// --- Recherche web / Canvas ---
export const getWebSearchBtn = () => document.getElementById('web-search-btn');
export const getCanvasToggleBtn = () => document.getElementById('canvas-toggle-btn');

// --- Panneau droit ---
export const getRightPanel = () => document.getElementById('right-panel');
export const getRightPanelToggle = () => document.getElementById('right-panel-toggle');
export const getSideToggleSettings = () => document.getElementById('side-toggle-settings');
export const getSideToggleCanvas = () => document.getElementById('side-toggle-canvas');
export const getSidePanelToolbar = () => document.getElementById('side-panel-toolbar');

// --- Configuration ---
export const getApikeysBtn = () => document.getElementById('apikeys-btn');
export const getApikeysModalOverlay = () => document.getElementById('apikeys-modal-overlay');
export const getApikeysCloseBtn = () => document.getElementById('apikeys-close-btn');
export const getImportFileInput = () => document.getElementById('import-file-input');

// --- Canvas (désactivé temporairement) ---
export const getCanvasPanel = () => document.getElementById('canvas-panel');
export const getCanvasResizeHandle = () => document.getElementById('canvas-resize-handle');

// --- Budget ---
export const getBudgetAlertOverlay = () => document.getElementById('budget-alert-overlay');
export const getBudgetAlertText = () => document.getElementById('budget-alert-text');
export const getBudgetAlertClose = () => document.getElementById('budget-alert-close');
export const getNoModelAlertOverlay = () => document.getElementById('no-model-alert-overlay');
export const getNoModelAlertText = () => document.getElementById('no-model-alert-text');
export const getNoModelAlertClose = () => document.getElementById('no-model-alert-close');

// --- Dialogues ---
export const getCustomDialogOverlay = () => document.getElementById('custom-dialog-overlay');
export const getCustomDialogIcon = () => document.getElementById('custom-dialog-icon');
export const getCustomDialogMessage = () => document.getElementById('custom-dialog-message');
export const getCustomDialogCancel = () => document.getElementById('custom-dialog-cancel');
export const getCustomDialogOk = () => document.getElementById('custom-dialog-ok');

// --- Lightbox ---
export const getLightboxOverlay = () => document.getElementById('lightbox-overlay');
export const getLightboxImg = () => document.getElementById('lightbox-img');
export const getLightboxClose = () => document.getElementById('lightbox-close');

// --- File viewer ---
export const getFileViewerOverlay = () => document.getElementById('file-viewer-overlay');
export const getFileViewerIframe = () => document.getElementById('file-viewer-iframe');
export const getFileViewerTitle = () => document.getElementById('file-viewer-title');
export const getFileViewerClose = () => document.getElementById('file-viewer-close');

// --- Sauvegarde / Export ---
export const getDashboardBtn = () => document.getElementById('dashboard-btn');
export const getSaveModalOverlay = () => document.getElementById('save-modal-overlay');
export const getSaveModalClose = () => document.getElementById('save-modal-close');
export const getSaveModalExportBtn = () => document.getElementById('save-modal-export-btn');
export const getSaveModalImportBtn = () => document.getElementById('save-modal-import-btn');
export const getSaveModalIncludeKeys = () => document.getElementById('save-modal-include-keys');

// --- Dashboard ---
export const getDashboardContent = () => document.getElementById('dashboard-content');

// --- Storage ---
export const getStorageSearch = () => document.getElementById('storage-search');
export const getStorageSort = () => document.getElementById('storage-sort');
export const getStorageSelectAll = () => document.getElementById('storage-select-all');
export const getStorageList = () => document.getElementById('storage-list');
export const getStorageClearBtn = () => document.getElementById('storage-clear-btn');
export const getStorageDeleteBtn = () => document.getElementById('storage-delete-btn');
export const getStorageDownloadBtn = () => document.getElementById('storage-download-btn');
export const getStorageSearchBtn = () => document.getElementById('storage-search-btn');
export const getStorageSortBtn = () => document.getElementById('storage-sort-btn');
export const getStorageActionBar = () => document.getElementById('storage-action-bar');
export const getStorageActionInfo = () => document.getElementById('storage-action-info');
export const getStorageLoading = () => document.getElementById('storage-loading');
export const getStoragePreviewDock = () => document.getElementById('storage-preview-dock');
export const getStorageHome = () => document.getElementById('storage-home');
export const getStorageListView = () => document.getElementById('storage-list-view');
export const getStorageOverview = () => document.getElementById('storage-overview');
export const getStorageTotalSize = () => document.getElementById('storage-total-size');
export const getStorageSizeConv = () => document.getElementById('storage-size-conv');
export const getStorageSizeMedia = () => document.getElementById('storage-size-media');
export const getStorageCountConv = () => document.getElementById('storage-count-conv');
export const getStorageCountMedia = () => document.getElementById('storage-count-media');
export const getStorageBackBtn = () => document.getElementById('storage-back-btn');
export const getStorageHeadingSub = () => document.getElementById('storage-heading-sub');
export const getStorageMediaFilter = () => document.getElementById('storage-media-filter');

// --- Update toast ---
export const getUpdateToast = () => document.getElementById('update-toast');
export const getUpdateToastVersion = () => document.getElementById('update-toast-version');

// --- Right panel parameters ---
export const getRpEffortToggle = () => document.getElementById('rp-effort-toggle');
export const getRpEffortSelect = () => document.getElementById('rp-effort-select');
export const getRpTemperatureToggle = () => document.getElementById('rp-temperature-toggle');
export const getRpTemperatureRange = () => document.getElementById('rp-temperature-range');
export const getRpTemperatureValue = () => document.getElementById('rp-temperature-value');
export const getRpTopPToggle = () => document.getElementById('rp-top-p-toggle');
export const getRpTopPRange = () => document.getElementById('rp-top-p-range');
export const getRpTopPValue = () => document.getElementById('rp-top-p-value');
export const getRpMaxTokensToggle = () => document.getElementById('rp-max-tokens-toggle');
export const getRpMaxTokensRange = () => document.getElementById('rp-max-tokens-range');
export const getRpMaxTokensValue = () => document.getElementById('rp-max-tokens-value');
export const getRpFreqPenaltyToggle = () => document.getElementById('rp-freq-penalty-toggle');
export const getRpFreqPenaltyRange = () => document.getElementById('rp-freq-penalty-range');
export const getRpFreqPenaltyValue = () => document.getElementById('rp-freq-penalty-value');
export const getRpPresencePenaltyToggle = () => document.getElementById('rp-presence-penalty-toggle');
export const getRpPresencePenaltyRange = () => document.getElementById('rp-presence-penalty-range');
export const getRpPresencePenaltyValue = () => document.getElementById('rp-presence-penalty-value');
export const getRpTopKToggle = () => document.getElementById('rp-top-k-toggle');
export const getRpTopKRange = () => document.getElementById('rp-top-k-range');
export const getRpTopKValue = () => document.getElementById('rp-top-k-value');
export const getRpMinPToggle = () => document.getElementById('rp-min-p-toggle');
export const getRpMinPRange = () => document.getElementById('rp-min-p-range');
export const getRpMinPValue = () => document.getElementById('rp-min-p-value');
export const getRpTopAToggle = () => document.getElementById('rp-top-a-toggle');
export const getRpTopARange = () => document.getElementById('rp-top-a-range');
export const getRpTopAValue = () => document.getElementById('rp-top-a-value');
export const getRpRepPenaltyToggle = () => document.getElementById('rp-rep-penalty-toggle');
export const getRpRepPenaltyRange = () => document.getElementById('rp-rep-penalty-range');
export const getRpRepPenaltyValue = () => document.getElementById('rp-rep-penalty-value');
export const getRpSeedToggle = () => document.getElementById('rp-seed-toggle');
export const getRpSeedInput = () => document.getElementById('rp-seed-input');
export const getRpParamsResetBtn = () => document.getElementById('rp-params-reset-btn');
export const getRpQualitySelect = () => document.getElementById('rp-quality-select');
export const getRpGeminiRatioSelect = () => document.getElementById('rp-gemini-ratio-select');
export const getRpGeminiSizeSelect = () => document.getElementById('rp-gemini-size-select');
export const getRpGeminiThinkingSelect = () => document.getElementById('rp-gemini-thinking-select');
export const getRpOpenAIFormatSelect = () => document.getElementById('rp-openai-format-select');
export const getRpOpenAIBackgroundSelect = () => document.getElementById('rp-openai-background-select');
export const getRpOpenAIModerationSelect = () => document.getElementById('rp-openai-moderation-select');
export const getRpOpenAINRange = () => document.getElementById('rp-openai-n-range');
export const getRpOpenAINValue = () => document.getElementById('rp-openai-n-value');
export const getRpOpenAICompressionRange = () => document.getElementById('rp-openai-compression-range');
export const getRpOpenAICompressionValue = () => document.getElementById('rp-openai-compression-value');
export const getRpImgSeedToggle = () => document.getElementById('rp-img-seed-toggle');
export const getRpImgSeedInput = () => document.getElementById('rp-img-seed-input');
export const getRpImageParamsResetBtn = () => document.getElementById('rp-image-params-reset-btn');
export const getRpMaxHistoryImagesRange = () => document.getElementById('rp-max-history-images-range');
export const getRpMaxHistoryImagesValue = () => document.getElementById('rp-max-history-images-value');

// --- Configuration panels ---
export const getPanelApimodeles = () => document.getElementById('panel-apimodeles');
export const getPanelModels = () => document.getElementById('panel-models');
export const getPanelBudget = () => document.getElementById('panel-budget');
export const getPanelAppearance = () => document.getElementById('panel-appearance');
export const getPanelStatistiques = () => document.getElementById('panel-statistiques');
export const getPanelStockage = () => document.getElementById('panel-stockage');
export const getPanelFaq = () => document.getElementById('panel-faq');
export const getPanelShare = () => document.getElementById('panel-share');
export const getThemeTogglePanel = () => document.getElementById('theme-toggle-panel');
export const getModelsError = () => document.getElementById('models-error');
export const getBudgetEnabled = () => document.getElementById('budget-enabled');
export const getBudgetPeriod = () => document.getElementById('budget-period');
export const getBudgetAmount = () => document.getElementById('budget-amount');
export const getBudgetSettings = () => document.getElementById('budget-settings');
export const getBudgetPreview = () => document.getElementById('budget-preview');
export const getBudgetFill = () => document.getElementById('budget-fill');
export const getBudgetText = () => document.getElementById('budget-text');
export const getBudgetPeriodLabel = () => document.getElementById('budget-period-label');
export const getBudgetAmountSuffix = () => document.getElementById('budget-amount-suffix');
export const getBudgetSaveBtn = () => document.getElementById('budget-save-btn');
export const getBudgetCancelBtn = () => document.getElementById('budget-cancel-btn');

// --- Feature selects ---
export const getAudioTtsProvider = () => document.getElementById('audio-tts-provider');
export const getAudioSttProvider = () => document.getElementById('audio-stt-provider');
export const getEnhanceProvider = () => document.getElementById('enhance-provider');
export const getSummaryModel = () => document.getElementById('summary-model');
export const getTitleModel = () => document.getElementById('title-model');
export const getErrorExplainerModel = () => document.getElementById('error-explainer-model');
export const getLocalFallbackModel = () => document.getElementById('local-fallback-model');
export const getLocalFallbackRow = () => document.getElementById('local-fallback-row');

// --- Provider tabs ---
export const getProvidersTabs = () => document.getElementById('providers-tabs');
export const getProviderContent = () => document.getElementById('provider-content');

// --- Roles/Prompts management popups ---
export const getRolesManageOverlay = () => document.getElementById('roles-manage-overlay');
export const getPromptsManageOverlay = () => document.getElementById('prompts-manage-overlay');

// --- FAQ ---
export const getFaqContainer = () => document.getElementById('faq-container');
export const getFaqTabs = () => document.getElementById('faq-tabs');

// --- Share ---
export const getShareLinkInput = () => document.getElementById('share-link-input');
export const getShareCopyBtn = () => document.getElementById('share-copy-btn');

// --- Login ---
export const getLoginOverlay = () => document.getElementById('login-overlay');
export const getLoginUsername = () => document.getElementById('login-username');
export const getLoginPassword = () => document.getElementById('login-password');
export const getLoginError = () => document.getElementById('login-error');
export const getLoginBtn = () => document.getElementById('login-btn');
export const getLoginForm = () => document.getElementById('login-form');

// --- User management ---
export const getTabUsers = () => document.getElementById('tab-users');
export const getPanelUsers = () => document.getElementById('panel-users');
export const getUsersList = () => document.getElementById('users-list');
export const getUsersAddBtn = () => document.getElementById('users-add-btn');
export const getUserModalOverlay = () => document.getElementById('user-modal-overlay');
export const getUserModalTitle = () => document.getElementById('user-modal-title');
export const getUserModalUsername = () => document.getElementById('user-modal-username');
export const getUserModalEmail = () => document.getElementById('user-modal-email');
export const getUserModalPassword = () => document.getElementById('user-modal-password');
export const getUserModalRole = () => document.getElementById('user-modal-role');
export const getUserModalSave = () => document.getElementById('user-modal-save');
export const getUserModalCancel = () => document.getElementById('user-modal-cancel');
export const getUserModalDelete = () => document.getElementById('user-modal-delete');
