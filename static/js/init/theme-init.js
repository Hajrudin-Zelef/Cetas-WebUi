// Theme initialization — applies saved theme BEFORE body renders to prevent flash.
// Silent stub for _syncPushSetting until settings-sync.js loads.
window._syncPushSetting = function(){};
(function () {
    var t = localStorage.getItem('minou-theme') || 'light';
    if (t === 'auto') document.body.classList.add('theme-auto');
    else if (t === 'dark') document.body.classList.add('dark');
})();
