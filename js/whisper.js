// --- Micro : dictée vocale via Whisper ---
import { STATE } from './state.js';

let micStream = null;
let _micIdleTimer = null;
const MIC_IDLE_RELEASE_MS = 10 * 60 * 1000;

// Libère les pistes du micro pour éteindre le voyant rouge du navigateur.
// Appelé dès la fin de l'enregistrement et au déchargement de la page.
function _releaseMicStream() {
    if (_micIdleTimer) { clearTimeout(_micIdleTimer); _micIdleTimer = null; }
    if (micStream) {
        try { micStream.getTracks().forEach(t => t.stop()); } catch {}
        micStream = null;
    }
}

// (Re)programme la libération automatique du micStream après 10 min d'inactivité,
// pour éteindre le voyant rouge si l'utilisateur ne dicte plus.
function _scheduleMicRelease() {
    if (_micIdleTimer) clearTimeout(_micIdleTimer);
    _micIdleTimer = setTimeout(_releaseMicStream, MIC_IDLE_RELEASE_MS);
}

// Callbacks injectés par app.js
let _showNoModelAlert = null;
let _customAlert = null;
let _addCostForModel = null;
let _updateTokenDisplay = null;
let _saveConversation = null;

export function setWhisperCallbacks({ showNoModelAlert, customAlert, addCostForModel, updateTokenDisplay, saveConversation }) {
    _showNoModelAlert = showNoModelAlert;
    _customAlert = customAlert;
    _addCostForModel = addCostForModel;
    _updateTokenDisplay = updateTokenDisplay;
    _saveConversation = saveConversation;
}

export function initWhisper(micBtn, promptInput) {
    const micIconDefault = micBtn.innerHTML;
    const micIconStop = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>';
    const micIconLoading = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';

    window.addEventListener('beforeunload', _releaseMicStream);
    window.addEventListener('pagehide', _releaseMicStream);
    // Sauvegarde des conversations avant fermeture (mobile : hard refresh tue IndexedDB)
    window.addEventListener('beforeunload', function() {
        if (typeof flushPendingWrites === 'function') flushPendingWrites();
    });

    micBtn.addEventListener('click', async () => {
        // Si streaming en cours (mode stop), arrêter la génération
        if (STATE.isStreaming && micBtn.classList.contains('stop-mode')) {
            if (STATE.currentAbortController) STATE.currentAbortController.abort();
            return;
        }
        // Verrou anti double-clic : pendant la transcription, le STATE.mediaRecorder est déjà
        // inactif — sans cette garde, un clic relancerait l'enregistrement par-dessus
        // le STT en cours (placeholder écrasé, mauvais texte injecté au retour).
        if (STATE.micTranscribing) return;
        // Si en cours d'enregistrement, arrêter
        if (STATE.mediaRecorder && STATE.mediaRecorder.state === 'recording') {
            STATE.mediaRecorder.stop();
            return;
        }

        if (!AUDIO_SETTINGS.sttProvider) {
            _showNoModelAlert('la transcription audio', 'audio-stt-provider');
            return;
        }

        // STT navigateur natif (SpeechRecognition API) — gratuit, sans clé
        var _sttModel = MODELS_DATA.stt.find(function(m) { return m.id === AUDIO_SETTINGS.sttProvider; });
        if (_sttModel && _sttModel.editeur === 'system') {
            var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SR) {
                _customAlert('Reconnaissance vocale non supportée par ce navigateur.', 'error');
                return;
            }
            try {
                var sr = new SR();
                sr.lang = 'fr-FR';
                sr.continuous = false;
                sr.interimResults = false;
                micBtn.classList.add('recording');
                promptInput.placeholder = 'Parlez...';
                sr.onresult = function(e) {
                    var text = e.results[0][0].transcript;
                    promptInput.value += (promptInput.value && !promptInput.value.endsWith(' ') ? ' ' : '') + text;
                    promptInput.dispatchEvent(new Event('input'));
                    micBtn.classList.remove('recording');
                    promptInput.placeholder = 'Écrivez votre message...';
                    _scheduleMicRelease();
                };
                sr.onerror = function() {
                    micBtn.classList.remove('recording');
                    promptInput.placeholder = 'Écrivez votre message...';
                    _scheduleMicRelease();
                };
                sr.start();
            } catch(e) {
                micBtn.classList.remove('recording');
                promptInput.placeholder = 'Écrivez votre message...';
                _customAlert('Erreur reconnaissance vocale: ' + e.message, 'error');
            }
            return;
        }

        try {
            if (_micIdleTimer) { clearTimeout(_micIdleTimer); _micIdleTimer = null; }
            if (!micStream || !micStream.active) {
                micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            STATE.mediaRecorder = new MediaRecorder(micStream);
            STATE.micChunks = [];
            STATE.micStartTime = Date.now();

            STATE.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) STATE.micChunks.push(e.data);
            };

            STATE.mediaRecorder.onstop = () => {
                const durationMin = (Date.now() - STATE.micStartTime) / 60000;
                const blob = new Blob(STATE.micChunks, { type: 'audio/webm' });
                // On ne libère plus le micStream ici : sur certains contextes
                // (notamment file://) le navigateur redemande l'autorisation à
                // chaque getUserMedia. Garder le stream vivant évite ce prompt
                // répété entre deux dictées. Le stream est libéré au pagehide /
                // beforeunload et lors d'une erreur d'enregistrement.
                STATE.micTranscribing = true;
                micBtn.innerHTML = micIconLoading;
                micBtn.classList.remove('recording');
                promptInput.placeholder = 'Transcription en cours...';

                transcribeAudio(blob, (text) => {
                    STATE.micTranscribing = false;
                    micBtn.innerHTML = micIconDefault;
                    promptInput.placeholder = 'Écrivez votre message...';
                    promptInput.value += (promptInput.value && !promptInput.value.endsWith(' ') ? ' ' : '') + text;
                    promptInput.dispatchEvent(new Event('input'));
                    // Coût STT
                    const sttModel = MODELS_DATA.stt.find(m => m.id === AUDIO_SETTINGS.sttProvider);
                    if (sttModel?.prix?.includes('/min')) {
                        const sttCost = durationMin * parseFloat(sttModel.prix.replace('$', ''));
                        STATE.totalAudioCost += sttCost;
                        _addCostForModel('stt', 0, 0, sttCost);
                    }
                    _updateTokenDisplay();
                    if (STATE.conversationId) _saveConversation();
                    _scheduleMicRelease();
                }, (err) => {
                    STATE.micTranscribing = false;
                    micBtn.innerHTML = micIconDefault;
                    _scheduleMicRelease();
                    promptInput.placeholder = 'Écrivez votre message...';
                    console.error('STT error:', err);
                    _customAlert('Erreur transcription : ' + err.message, 'error');
                });
            };

            STATE.mediaRecorder.start();
            micBtn.innerHTML = micIconStop;
            micBtn.classList.add('recording');
            promptInput.placeholder = 'Écoute en cours...';
        } catch (err) {
            _releaseMicStream();
            console.error('Mic error:', err);
            _customAlert('Impossible d’accéder au microphone.', 'mic');
        }
    });
}
