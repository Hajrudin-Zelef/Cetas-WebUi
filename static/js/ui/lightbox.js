// © Marexsoft Corporation. Fondateur Kouassi Marius.
// ============================================================
// lightbox.js — Lightbox images + File viewer iframe
// ============================================================
import { getLightboxOverlay, getLightboxImg, getLightboxClose,
         getFileViewerOverlay, getFileViewerIframe, getFileViewerTitle, getFileViewerClose,
         getChatContainer } from '../core/dom.js';

// --- Lightbox images ---
export function openLightbox(src) {
    getLightboxImg().src = src;
    getLightboxOverlay().classList.remove('closing');
    getLightboxOverlay().style.display = 'flex';
}

export function closeLightbox() {
    const overlay = getLightboxOverlay();
    if (overlay.style.display === 'none' || overlay.classList.contains('closing')) return;
    overlay.classList.add('closing');
    const onEnd = (e) => {
        if (e.target !== overlay) return;
        overlay.removeEventListener('animationend', onEnd);
        overlay.style.display = 'none';
        overlay.classList.remove('closing');
        getLightboxImg().src = '';
    };
    overlay.addEventListener('animationend', onEnd);
}

export function attachLightboxToImg(imgEl) {
    imgEl.style.cursor = 'zoom-in';
    imgEl.addEventListener('click', () => openLightbox(imgEl.src));
}

// --- File viewer (iframe popup) ---
export function openFileViewer(blobUrl, fileName) {
    getFileViewerTitle().textContent = fileName;
    getFileViewerIframe().src = blobUrl;
    getFileViewerOverlay().classList.remove('closing');
    getFileViewerOverlay().style.display = 'flex';
}

export function closeFileViewer() {
    const overlay = getFileViewerOverlay();
    if (overlay.style.display === 'none' || overlay.classList.contains('closing')) return;
    overlay.classList.add('closing');
    const onEnd = (e) => {
        if (e.target !== overlay) return;
        overlay.removeEventListener('animationend', onEnd);
        overlay.style.display = 'none';
        overlay.classList.remove('closing');
        getFileViewerIframe().src = '';
    };
    overlay.addEventListener('animationend', onEnd);
}

/** Initialise les event listeners de la lightbox et du file viewer */
export function initLightbox() {
    const lbOverlay = getLightboxOverlay();
    if (lbOverlay) {
        lbOverlay.addEventListener('click', (e) => {
            if (e.target === lbOverlay) closeLightbox();
        });
        getLightboxClose().addEventListener('click', closeLightbox);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && lbOverlay.style.display !== 'none') closeLightbox();
        });
    }

    const fvOverlay = getFileViewerOverlay();
    if (fvOverlay) {
        fvOverlay.addEventListener('click', (e) => {
            if (e.target === fvOverlay) closeFileViewer();
        });
        getFileViewerClose().addEventListener('click', closeFileViewer);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && fvOverlay.style.display !== 'none') closeFileViewer();
        });
    }

    const cc = getChatContainer();
    if (cc) {
        cc.addEventListener('click', (e) => {
            const img = e.target.closest('.message-images img');
            if (img) openLightbox(img.src);
        });
    }
}
