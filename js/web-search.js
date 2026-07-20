// --- Bouton recherche web (globe) ---
import { STATE } from './state.js';

const webSearchBtn = document.getElementById('web-search-btn');
const WEB_SEARCH_EDITEURS = ['openai', 'anthropic', 'google', 'grok', 'openrouter'];
const WEB_SEARCH_TOOLTIPS = {
    openai: 'Prix recherche web OpenAI : 0,01 $ / requête',
    anthropic: 'Prix recherche web Anthropic : 0,01 $ / requête',
    google: 'Prix recherche web Google : 5000 requêtes sans frais supplémentaires',
    grok: 'Prix recherche web Grok : 0,035 $ / source (le prix varie donc en fonction du nombre de sources)',
    openrouter: 'Activer la recherche web et la récupération de pages web sur OpenRouter.\n• Coût recherche web : ~0,02 $/requête\n• Récupération : 0,001 $/page web'
};
// OpenRouter facture les server tools dans `usage.cost`, déjà capturé via `cost_real` — pas d'estimation locale.
const WEB_SEARCH_COST_PER_REQ = { openai: 0.01, anthropic: 0.01, google: 0, grok: 0, openrouter: 0 };
const WEB_SEARCH_COST_PER_CITATION = { grok: 0.035 };

// Modèles OpenRouter avec recherche web intégrée (Perplexity, variantes OpenAI « Search ») :
// l'API renvoie une erreur si on ajoute les server tools web, la recherche étant native au
// modèle. On n'envoie donc jamais webSearch pour eux, mais le bouton reste affiché actif
// et verrouillé pour montrer que la recherche web fonctionne bien.
export function hasBuiltInWebSearch(modelId) {
    if (!modelId) return false;
    const model = MODELS.find(m => m.id === modelId);
    if (!model || model.editeur !== 'openrouter') return false;
    return /^perplexity\//i.test(modelId) || (/^openai\//i.test(modelId) && /search/i.test(modelId));
}

export function calcWebSearchCost(modelId, citations) {
    if (!STATE.webSearchEnabled) return 0;
    const model = MODELS.find(m => m.id === modelId);
    const editeur = model?.editeur;
    if (!editeur || !WEB_SEARCH_EDITEURS.includes(editeur)) return 0;
    let cost = WEB_SEARCH_COST_PER_REQ[editeur] || 0;
    if (WEB_SEARCH_COST_PER_CITATION[editeur] && citations?.length) {
        cost += citations.length * WEB_SEARCH_COST_PER_CITATION[editeur];
    }
    return cost;
}

// Fonction de fallback pour alignInputHint (callback injecté par app.js)
let _alignInputHint = null;
export function setWebSearchAlignCallback(fn) { _alignInputHint = fn; }

export function updateWebSearchBtn() {
    if (!webSearchBtn) return;
    // Afficher le bouton uniquement si un modèle texte supportant la recherche est sélectionné
    const activeModel = STATE.currentModel;
    if (activeModel) {
        const model = MODELS.find(m => m.id === activeModel);
        if (model && WEB_SEARCH_EDITEURS.includes(model.editeur)) {
            const builtIn = hasBuiltInWebSearch(activeModel);
            webSearchBtn.style.display = '';
            webSearchBtn.classList.toggle('active', builtIn || STATE.webSearchEnabled);
            webSearchBtn.classList.toggle('web-search-locked', builtIn);
            webSearchBtn.dataset.tooltip = builtIn
                ? 'Recherche web intégrée à ce modèle : toujours active, non désactivable.'
                : (WEB_SEARCH_TOOLTIPS[model.editeur] || '');
            if (_alignInputHint) _alignInputHint();
            return;
        }
    }
    // Masquer et désactiver si pas de modèle compatible
    webSearchBtn.style.display = 'none';
    webSearchBtn.classList.remove('active', 'web-search-locked');
    STATE.webSearchEnabled = false;
    webSearchBtn.dataset.tooltip = '';
    if (_alignInputHint) _alignInputHint();
}

// Event listener d'initialisation
if (webSearchBtn) {
    webSearchBtn.addEventListener('click', () => {
        // Recherche intégrée au modèle : toujours active, le clic est ignoré
        if (hasBuiltInWebSearch(STATE.currentModel)) return;
        STATE.webSearchEnabled = !STATE.webSearchEnabled;
        webSearchBtn.classList.toggle('active', STATE.webSearchEnabled);
    });
}
