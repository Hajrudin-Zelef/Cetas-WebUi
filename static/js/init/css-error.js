// CSS load error handler — detects if style.css fails to load and shows a user-friendly overlay.
// Must run in <head> before body renders.
(function(){
    var cssLoadError = false;
    function showCSSError(){
        if(document.getElementById('kiro-css-error')) return;
        var overlay=document.createElement('div');
        overlay.id='kiro-css-error';
        overlay.style.cssText='position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
        overlay.innerHTML='<div style="background:#fff;color:#333;border-radius:16px;padding:32px 36px;max-width:520px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.25);text-align:left;line-height:1.6">'
            +'<h2 style="margin:0 0 12px;font-size:1.25rem;color:#d35400">Oh, on dirait que Cetas a un petit souci</h2>'
            +'<p style="margin:0 0 14px;font-size:0.92rem">Le fichier de style (CSS) est introuvable ou endommagé. Cela arrive parfois lors de la décompression du dossier.</p>'
            +'<p style="margin:0 0 8px;font-size:0.92rem;font-weight:600">Marche à suivre :</p>'
            +'<ol style="margin:0 0 14px;padding-left:20px;font-size:0.88rem">'
            +'<li>Supprimez le dossier Cetas actuel</li>'
            +'<li>Supprimez le fichier .zip</li>'
            +'<li>Retéléchargez Cetas depuis <strong>Marexsoft Corporation</strong></li>'
            +'<li>Décompressez le nouveau fichier .zip</li>'
            +'<li>Ouvrez <strong>index.html</strong></li>'
            +'</ol>'
            +'<p style="margin:0;font-size:0.85rem;color:#888">Si le problème persiste, n’hésitez pas à contacter <strong>Marexsoft Corporation</strong>.</p>'
            +'</div>';
        document.body.appendChild(overlay);
    }
    document.getElementById('main-css').addEventListener('error',function(){
        cssLoadError = true;
    });
    window.addEventListener('load',function(){
        if(cssLoadError){ showCSSError(); return; }
        if(document.body.classList.contains('auth-locked')) return;
        var sidebar=document.getElementById('sidebar');
        if(!sidebar) return;
        var display=window.getComputedStyle(sidebar).display;
        if(display!=='flex') showCSSError();
    });
})();
