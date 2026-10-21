/* ══════════════════════════════════════════════════════════════
   PWA — Sitial de Talentos Cubanos
   · Registra /sw.js (modo offline) con el scope correcto, tanto en
     Vercel (raíz) como en GitHub Pages (/Sitial_Talento/).
   · Botón "Instalar app" cuando el navegador lo permite.
   · Aviso discreto de "Sin conexión" y de "Nueva versión disponible".
   Se incluye con:  <script src="Assets/UI/pwa.js" defer></script>
   ══════════════════════════════════════════════════════════════ */
(function () {
    'use strict';
    var script = document.currentScript;
    var root = script && script.src ? script.src.replace(/Assets\/UI\/pwa\.js(\?.*)?$/, '') : '/';

    function lang() {
        try { return (window._lang || localStorage.getItem('lang') || 'es') === 'en' ? 'en' : 'es'; }
        catch (e) { return 'es'; }
    }
    var TXT = {
        es: { offline: 'Sin conexión — mostrando la versión guardada', install: 'Instalar app',
              update: 'Hay una nueva versión del Sitial', reload: 'Actualizar', close: 'Cerrar' },
        en: { offline: 'Offline — showing the saved version', install: 'Install app',
              update: 'A new version is available', reload: 'Update', close: 'Close' }
    };
    function t(k) { return TXT[lang()][k]; }

    // ── estilos mínimos (usan las variables del sitio si existen) ──
    var css = document.createElement('style');
    css.textContent =
        '.pwa-bar{position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:99999;display:flex;gap:10px;align-items:center;' +
        'background:var(--navy,#04122b);color:var(--gold-light,#f0c84a);border:1px solid rgba(240,200,74,.35);border-radius:999px;' +
        'padding:9px 14px 9px 18px;font:600 13px/1.2 "DM Sans",system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.35);max-width:calc(100vw - 24px)}' +
        '.pwa-bar button{background:var(--gold-light,#f0c84a);color:#04122b;border:0;border-radius:999px;padding:6px 14px;font:700 12px inherit;cursor:pointer}' +
        '.pwa-bar .pwa-x{background:transparent;color:inherit;padding:2px 6px;font-size:16px;opacity:.7}' +
        '.pwa-off{top:12px;bottom:auto;background:#7a4b00;color:#fff;border-color:#f0c84a}' +
        '@media print{.pwa-bar{display:none!important}}';
    document.head.appendChild(css);

    function bar(cls, text, btnText, onBtn) {
        var el = document.createElement('div');
        el.className = 'pwa-bar ' + (cls || '');
        var span = document.createElement('span'); span.textContent = text; el.appendChild(span);
        if (btnText) {
            var b = document.createElement('button'); b.textContent = btnText;
            b.onclick = function () { onBtn && onBtn(el); }; el.appendChild(b);
        }
        var x = document.createElement('button'); x.className = 'pwa-x'; x.textContent = '×'; x.title = t('close');
        x.onclick = function () { el.remove(); }; el.appendChild(x);
        document.body.appendChild(el);
        return el;
    }

    // ── Estado de conexión ──
    var offEl = null;
    function net() {
        if (!navigator.onLine && !offEl) offEl = bar('pwa-off', t('offline'));
        if (navigator.onLine && offEl) { offEl.remove(); offEl = null; }
    }
    addEventListener('online', net); addEventListener('offline', net);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', net); else net();

    // ── Instalar ──
    var deferred = null;
    addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault(); deferred = e;
        try { if (localStorage.getItem('pwaInstallDismissed') === '1') return; } catch (err) {}
        var el = bar('', 'Sitial', t('install'), function (self) {
            deferred.prompt();
            deferred.userChoice.finally(function () { deferred = null; self.remove(); });
        });
        el.querySelector('.pwa-x').addEventListener('click', function () {
            try { localStorage.setItem('pwaInstallDismissed', '1'); } catch (err) {}
        });
        window._pwaInstall = function () { if (deferred) deferred.prompt(); };
    });

    // ── Service worker ──
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;

    window.addEventListener('load', function () {
        navigator.serviceWorker.register(root + 'sw.js', { scope: root }).then(function (reg) {
            function aviso(sw) {
                bar('', t('update'), t('reload'), function () { sw.postMessage('SKIP_WAITING'); });
            }
            if (reg.waiting && navigator.serviceWorker.controller) aviso(reg.waiting);
            reg.addEventListener('updatefound', function () {
                var nw = reg.installing; if (!nw) return;
                nw.addEventListener('statechange', function () {
                    if (nw.state === 'installed' && navigator.serviceWorker.controller) aviso(nw);
                });
            });
            // comprobar actualizaciones al volver a la pestaña
            document.addEventListener('visibilitychange', function () {
                if (!document.hidden) reg.update().catch(function () {});
            });
        }).catch(function () {});
        var recargado = false;
        navigator.serviceWorker.addEventListener('controllerchange', function () {
            if (recargado) return; recargado = true;
            // solo recargar si el usuario pidió actualizar (había un SW previo)
            if (window._pwaPidioActualizar) location.reload();
        });
    });
    // marcar que la recarga fue pedida por el usuario
    document.addEventListener('click', function (e) {
        if (e.target && e.target.closest && e.target.closest('.pwa-bar button') && !e.target.classList.contains('pwa-x')) window._pwaPidioActualizar = true;
    }, true);
})();
