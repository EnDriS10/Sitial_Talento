/* Menú hamburguesa para las páginas secundarias (media, noticias, Banco de Problemas,
   equipos y visor de problemas). Es el mismo menú de la página principal, pero
   NO muestra la página en la que ya estás. Se inyecta en .mp-topbar-actions. */
(function () {
    'use strict';
    var bar = document.querySelector('.mp-topbar-actions, .np-topbar-actions');
    if (!bar || document.getElementById('sm-btn')) return;

    var path = location.pathname;
    var ROOT = path.replace(/(Equipo\/.*|Banco_Problemas\/.*|Problem_Data\/.*|media(\.html)?|noticias(\.html)?|Banco_Problemas(\.html)?|equipo(\.html)?)$/, '');
    if (!/\/$/.test(ROOT)) ROOT = ROOT.replace(/[^/]*$/, '');

    var ITEMS = [
        { id: 'inicio',   ico: '🏠', es: 'Inicio',                       en: 'Home',                        href: ROOT },
        { id: 'eventos',  ico: '🔍', es: 'Historial por Eventos',        en: 'Results by Event',           href: ROOT + 'Historial_Eventos' },
        { id: 'sitial',   ico: '🏅', es: 'Historial por Medallas',       en: 'Hall of Medals',           href: ROOT + 'Historial_Medallas' },
        { id: 'cnq',      ico: '🧪', es: 'Olimpiada Cubana de Química',  en: 'Cuban Chemistry Olympiad',    href: ROOT + 'Olimpiada_Cubana' },
        { id: 'banco',    ico: '📝', es: 'Banco de Problemas',           en: 'Problem Bank',                href: ROOT + 'Banco_Problemas' },
        { id: 'honor',    ico: '🎓', es: 'Honor a quien Honor Merece',   en: 'Hall of Fame',    href: ROOT + 'Honor_Merece' },
        { id: 'noticias', ico: '📰', es: 'Noticias y Entrevistas',       en: 'News & Interviews',           href: ROOT + 'noticias' },
        { id: 'media',    ico: '📸', es: 'Media',                        en: 'Media',                       href: ROOT + 'media' },
        { id: 'contacto', ico: '📌', es: 'Enlaces y Contacto',           en: 'Links & Contact',             href: ROOT + 'Contacto' }
    ];
    // ¿en qué página estamos?  (equipo.html pertenece a «Historial por Eventos» pero es una página aparte: se muestra todo)
    var actual = /\/Banco_Problemas(\.html)?(\/|$)|\/Problem_Data\//.test(path) ? 'banco'
        : /\/media(\.html)?\/?$/.test(path) ? 'media'
        : /\/noticias(\.html)?\/?$/.test(path) ? 'noticias' : '';

    function lang() { try { var g = localStorage.getItem('lang'); if (g) return g; } catch (e) {} return (navigator.language || 'es').toLowerCase().indexOf('en') === 0 ? 'en' : 'es'; }

    var st = document.createElement('style');
    st.textContent =
        '#sm-btn{display:inline-flex;flex-direction:column;justify-content:center;gap:4px;width:38px;height:38px;padding:0 9px;border:0;border-radius:10px;background:rgba(255,255,255,.1);cursor:pointer;flex-shrink:0}' +
        '#sm-btn:hover{background:rgba(255,255,255,.18)}' +
        '#sm-btn span{display:block;height:2px;border-radius:2px;background:#fff;transition:transform .25s,opacity .2s}' +
        '#sm-btn.on span:nth-child(1){transform:translateY(6px) rotate(45deg)}#sm-btn.on span:nth-child(2){opacity:0}#sm-btn.on span:nth-child(3){transform:translateY(-6px) rotate(-45deg)}' +
        '#sm-ov{position:fixed;inset:0;z-index:9990;display:none;background:rgba(0,0,0,.35)}#sm-ov.on{display:block}' +
        '#sm-panel{position:fixed;left:0;right:0;top:0;z-index:9991;display:flex;flex-direction:column;background:#04122b;box-shadow:0 8px 32px rgba(0,0,0,.45);max-height:0;overflow:hidden;opacity:0;pointer-events:none;transition:max-height .28s cubic-bezier(.4,0,.2,1),opacity .2s}' +
        '[data-theme="dark"] #sm-panel{background:#10161e}' +
        '#sm-panel.on{max-height:80vh;opacity:1;pointer-events:auto;overflow:auto}' +
        '#sm-panel a{display:flex;gap:10px;align-items:center;padding:14px 22px;color:rgba(255,255,255,.85);text-decoration:none;border-left:3px solid transparent;font-family:\'DM Sans\',system-ui,sans-serif;font-size:14px;font-weight:500;line-height:1.2}' +
        '#sm-panel a:hover{background:rgba(255,255,255,.07);color:#fff}' +
        '#sm-panel .sm-pie{padding:12px 22px 16px;color:rgba(255,255,255,.4);font:11px \'DM Sans\',system-ui,sans-serif}';
    document.head.appendChild(st);

    var btn = document.createElement('button');
    btn.id = 'sm-btn'; btn.type = 'button'; btn.setAttribute('aria-label', 'Menú'); btn.innerHTML = '<span></span><span></span><span></span>';
    bar.appendChild(btn);
    var ov = document.createElement('div'); ov.id = 'sm-ov';
    var panel = document.createElement('nav'); panel.id = 'sm-panel';
    document.body.appendChild(ov); document.body.appendChild(panel);

    function pinta() {
        var l = lang();
        panel.innerHTML = ITEMS.filter(function (x) { return x.id !== actual; }).map(function (x) {
            return '<a href="' + x.href + '">' + x.ico + ' <span>' + (l === 'en' ? x.en : x.es) + '</span></a>';
        }).join('') + '<div class="sm-pie">© 2026 · Sitial de Talentos Cubanos</div>';
    }
    function abre(v) {
        var top = Math.round((bar.closest('.mp-topbar, .np-topbar') || bar).getBoundingClientRect().bottom);
        panel.style.top = top + 'px'; ov.style.top = top + 'px';
        panel.classList.toggle('on', v); ov.classList.toggle('on', v); btn.classList.toggle('on', v);
    }
    btn.onclick = function (e) { e.stopPropagation(); abre(!panel.classList.contains('on')); };
    ov.onclick = function () { abre(false); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') abre(false); });
    window.addEventListener('scroll', function () { if (panel.classList.contains('on')) abre(false); }, { passive: true });
    pinta();
    // Si cambia el idioma (botón ES/EN de la página) se vuelve a pintar
    var lb = document.getElementById('mp-lang-btn') || document.getElementById('np-lang-btn') || document.getElementById('pv-lang-btn');
    if (lb) new MutationObserver(pinta).observe(lb, { childList: true, characterData: true, subtree: true });
})();
