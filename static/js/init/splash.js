// Splash screen coordination — keeps splash visible until (a) minimum duration
// elapsed AND (b) conversation DB is loaded. app.js signals dbReady via window.__kiroSplashReady.
(function () {
    var s = document.getElementById('kiro-splash');
    if (!s) return;
    var state = { minElapsed: false, dbReady: false };
    function maybeHide() {
        if (!state.minElapsed || !state.dbReady) return;
        if (s.classList.contains('fading-out')) return;
        s.classList.add('fading-out');
    }
    window.__kiroSplashReady = function () {
        state.dbReady = true;
        maybeHide();
    };
    if (localStorage.getItem('cetas-last-conv')) {
        state.minElapsed = true;
        state.dbReady = true;
        s.style.display = 'none';
    }
    setTimeout(function () { state.minElapsed = true; maybeHide(); }, 1800);
    setTimeout(function () { if (!state.dbReady) s.classList.add('show-spinner'); }, 2500);
    s.addEventListener('animationend', function (e) {
        if (e.animationName === 'kiro-splash-out' && s.parentNode) {
            s.parentNode.removeChild(s);
        }
    });
})();
