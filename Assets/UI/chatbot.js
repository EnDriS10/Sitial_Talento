/* ══════════════════════════════════════════════════════════════
   CHATBOT — Asistente del Sitial de Talentos Cubanos
   Botón flotante + panel de chat que habla con /api/chat (streaming).
   · Sin dependencias; se incluye en cada página con:
       <script src="Assets/UI/chatbot.js" defer></script>
   · Usa las variables de color del sitio (modo claro/oscuro) y el idioma
     ES/EN guardado en localStorage('lang').
   · Guarda la conversación en sessionStorage (se borra al cerrar la pestaña).
   ══════════════════════════════════════════════════════════════ */
(function () {
    'use strict';
    if (window.__sitialChat) return;
    window.__sitialChat = true;
    // En GitHub Pages no existe /api (solo Vercel): no mostrar el widget.
    if (/\.github\.io$/.test(location.hostname)) return;

    var script = document.currentScript;
    var ROOT = script && script.src ? script.src.replace(/Assets\/UI\/chatbot\.js(\?.*)?$/, '') : '/';
    var API = ROOT + 'api/chat';
    var PROD = 'https://sitialtalento.vercel.app';
    var KEY = 'sitialChatV1';
    var MAXLEN = 1000;

    function lang() {
        try { return (window._lang || localStorage.getItem('lang') || 'es') === 'en' ? 'en' : 'es'; } catch (e) { return 'es'; }
    }
    var TXT = {
        es: {
            title: 'Asistente del Sitial', sub: 'IA · puede equivocarse, revisa los enlaces',
            hello: '¡Hola! Soy el asistente del Sitial. Puedo ayudarte con medallas, equipos, profesores, noticias, fotos y problemas del sitio… y también con cualquier otra pregunta.',
            ph: 'Escribe tu pregunta…', send: 'Enviar', stop: 'Detener', open: 'Abrir el asistente', close: 'Cerrar', clear: 'Nueva conversación',
            copy: 'Copiar', copied: 'Copiado', seeAlso: 'Ver también', retry: 'Reintentar',
            eNet: 'No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.', eOff: 'Sin conexión: el asistente necesita internet.',
            eGen: 'Algo salió mal. Inténtalo de nuevo.', eWait: 'Espera', secs: 's',
            sug: ['¿Cuántas medallas ha ganado Cuba en la IChO?', '¿Quiénes integraron el equipo de la IChO 2026?', 'Muéstrame las últimas noticias', '¿Cómo exporto una tabla a Excel?', '¿Qué problemas hay en el Banco de Problemas?', 'Explícame qué es la IChO'],
        },
        en: {
            title: 'Sitial Assistant', sub: 'AI · may be wrong, check the links',
            hello: "Hi! I'm the Sitial assistant. I can help with medals, teams, teachers, news, photos and problems on the site… and with any other question too.",
            ph: 'Type your question…', send: 'Send', stop: 'Stop', open: 'Open the assistant', close: 'Close', clear: 'New conversation',
            copy: 'Copy', copied: 'Copied', seeAlso: 'See also', retry: 'Retry',
            eNet: "Couldn't connect. Check your connection and try again.", eOff: 'Offline: the assistant needs internet.',
            eGen: 'Something went wrong. Please try again.', eWait: 'Wait', secs: 's',
            sug: ['How many medals has Cuba won at the IChO?', 'Who was on the IChO 2026 team?', 'Show me the latest news', 'How do I export a table to Excel?', 'What problems are in the Problem Bank?', 'Explain what the IChO is'],
        },
    };
    function t(k) { return TXT[lang()][k]; }

    // ── Estado ────────────────────────────────────────────────
    var msgs = [];            // [{role, content, sources?}]
    var busy = false, ctl = null, abierto = false;
    try { msgs = JSON.parse(sessionStorage.getItem(KEY) || '[]').filter(function (m) { return m && m.content; }).slice(-30); } catch (e) { msgs = []; }
    function guardar() { try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-30))); } catch (e) {} }

    // ── Estilos ───────────────────────────────────────────────
    var css = document.createElement('style');
    css.textContent =
        '.sc-fab{position:fixed;right:18px;bottom:18px;z-index:9990;width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;' +
        'background:var(--navy,#04122b);color:var(--gold-light,#f0c84a);box-shadow:0 8px 26px rgba(4,18,43,.35),0 0 0 2px var(--gold,#c9a227);transition:transform .2s,box-shadow .2s}' +
        '.sc-fab:hover{transform:translateY(-2px) scale(1.04)}.sc-fab:active{transform:scale(.96)}.sc-fab svg{width:28px;height:28px}' +
        '.sc-fab[hidden]{display:none}' +
        '.sc-panel{position:fixed;right:18px;bottom:18px;z-index:9991;width:390px;max-width:calc(100vw - 24px);height:600px;max-height:calc(100dvh - 36px);display:none;flex-direction:column;' +
        'background:var(--card-bg,#fff);color:var(--text,#1a1a2e);border:1px solid var(--border,#dde3f0);border-radius:20px;overflow:hidden;box-shadow:0 24px 60px rgba(4,18,43,.35);' +
        'font:14px/1.5 "DM Sans",system-ui,-apple-system,sans-serif}' +
        '.sc-panel.sc-open{display:flex;animation:sc-in .22s cubic-bezier(.16,1,.3,1)}' +
        '@keyframes sc-in{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}' +
        '.sc-head{display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--navy,#04122b);color:#fff;flex:0 0 auto}' +
        '.sc-av{width:34px;height:34px;border-radius:50%;background:var(--gold-light,#f0c84a);color:#04122b;display:flex;align-items:center;justify-content:center;font-size:18px;flex:0 0 auto}' +
        '.sc-ht{flex:1;min-width:0}.sc-ht b{display:block;font:700 15px "Playfair Display",Georgia,serif;color:var(--gold-light,#f0c84a);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '.sc-ht span{display:block;font-size:11px;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '.sc-hb{background:transparent;border:0;color:#fff;opacity:.8;cursor:pointer;padding:6px;border-radius:8px;font-size:16px;line-height:1}.sc-hb:hover{opacity:1;background:rgba(255,255,255,.12)}' +
        '.sc-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:12px;background:var(--bg,#f5f3ee);scroll-behavior:smooth;overscroll-behavior:contain}' +
        '.sc-m{max-width:88%;padding:9px 13px;border-radius:16px;word-wrap:break-word;overflow-wrap:anywhere;position:relative}' +
        '.sc-m.u{align-self:flex-end;background:var(--accent,#1a6fb5);color:#fff;border-bottom-right-radius:5px;white-space:pre-wrap}' +
        '.sc-m.a{align-self:flex-start;background:var(--card-bg,#fff);border:1px solid var(--border,#dde3f0);border-bottom-left-radius:5px}' +
        '.sc-m.a p{margin:0 0 8px}.sc-m.a p:last-child{margin-bottom:0}.sc-m.a ul,.sc-m.a ol{margin:4px 0 8px;padding-left:20px}.sc-m.a li{margin:2px 0}' +
        '.sc-m.a a{color:var(--accent,#1a6fb5);text-decoration:underline;text-underline-offset:2px;word-break:break-word}' +
        '.sc-m.a code{background:rgba(127,127,127,.16);padding:1px 5px;border-radius:5px;font:12.5px ui-monospace,Menlo,monospace}' +
        '.sc-m.a pre{background:rgba(127,127,127,.14);padding:9px 11px;border-radius:10px;overflow-x:auto;margin:6px 0}.sc-m.a pre code{background:none;padding:0}' +
        '.sc-m.a h4{margin:6px 0 4px;font-size:14px}' +
        '.sc-m.e{align-self:stretch;max-width:100%;background:#fdecea;color:#8a1c1c;border:1px solid #f3b8b3;font-size:13px}' +
        '[data-theme="dark"] .sc-m.e{background:#3a1a1a;color:#ffb4ab;border-color:#6b2b2b}' +
        '.sc-src{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;padding-top:7px;border-top:1px dashed var(--border,#dde3f0)}' +
        '.sc-src small{width:100%;font-size:11px;opacity:.65}' +
        '.sc-chip{display:inline-block;padding:3px 10px;border-radius:999px;border:1px solid var(--border,#dde3f0);font-size:12px;color:var(--accent,#1a6fb5);text-decoration:none!important;background:var(--bg,#f5f3ee)}' +
        '.sc-chip:hover{border-color:var(--accent,#1a6fb5)}' +
        '.sc-tools{display:flex;gap:4px;margin-top:6px}.sc-tool{background:transparent;border:0;color:var(--text-muted,#5a6a8a);font-size:11.5px;cursor:pointer;padding:2px 6px;border-radius:6px}.sc-tool:hover{background:rgba(127,127,127,.15)}' +
        '.sc-dots{display:inline-flex;gap:4px;padding:4px 2px}.sc-dots i{width:7px;height:7px;border-radius:50%;background:var(--text-muted,#5a6a8a);opacity:.5;animation:sc-b 1.1s infinite}.sc-dots i:nth-child(2){animation-delay:.15s}.sc-dots i:nth-child(3){animation-delay:.3s}' +
        '@keyframes sc-b{0%,60%,100%{transform:translateY(0);opacity:.35}30%{transform:translateY(-5px);opacity:1}}' +
        '.sc-sug{display:flex;flex-wrap:wrap;gap:7px;margin-top:2px}.sc-sug button{border:1px solid var(--border,#dde3f0);background:var(--card-bg,#fff);color:var(--text,#1a1a2e);border-radius:999px;padding:6px 12px;font:inherit;font-size:12.5px;cursor:pointer;text-align:left}' +
        '.sc-sug button:hover{border-color:var(--accent,#1a6fb5);color:var(--accent,#1a6fb5)}' +
        '.sc-form{display:flex;align-items:flex-end;gap:8px;padding:10px 12px;border-top:1px solid var(--border,#dde3f0);background:var(--card-bg,#fff);flex:0 0 auto}' +
        '.sc-in{flex:1;resize:none;border:1px solid var(--border,#dde3f0);background:var(--bg,#f5f3ee);color:var(--text,#1a1a2e);border-radius:14px;padding:9px 12px;font:inherit;max-height:120px;min-height:40px;outline:none}' +
        '.sc-in:focus{border-color:var(--accent,#1a6fb5);box-shadow:0 0 0 3px rgba(26,111,181,.18)}' +
        '.sc-send{flex:0 0 40px;height:40px;border-radius:50%;border:0;cursor:pointer;background:var(--accent,#1a6fb5);color:#fff;display:flex;align-items:center;justify-content:center}' +
        '.sc-send:disabled{opacity:.45;cursor:default}.sc-send svg{width:18px;height:18px}' +
        '.sc-send.stop{background:#b3261e}' +
        '.sc-foot{font-size:10.5px;text-align:center;color:var(--text-muted,#5a6a8a);padding:0 12px 8px;background:var(--card-bg,#fff)}' +
        '@media (max-width:520px){.sc-panel{right:0;bottom:0;left:0;width:100%;max-width:100%;height:100dvh;max-height:100dvh;border-radius:0;border:0}.sc-fab{right:14px;bottom:14px}}' +
        '@media (prefers-reduced-motion:reduce){.sc-panel.sc-open{animation:none}.sc-log{scroll-behavior:auto}}' +
        '@media print{.sc-fab,.sc-panel{display:none!important}}';
    document.head.appendChild(css);

    // ── DOM ───────────────────────────────────────────────────
    function el(tag, cls, attrs) {
        var e = document.createElement(tag); if (cls) e.className = cls;
        if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
        return e;
    }
    var ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-4.5 3.5V17H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M12 7.2l1 2.3 2.3 1-2.3 1-1 2.3-1-2.3-2.3-1 2.3-1z" fill="currentColor" stroke="none"/></svg>';
    var ICON_SEND = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6l-.1 6.5L15 12 3.3 13.9z"/></svg>';
    var ICON_STOP = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

    var fab = el('button', 'sc-fab', { type: 'button' }); fab.innerHTML = ICON_CHAT;
    var panel = el('section', 'sc-panel', { role: 'dialog', 'aria-modal': 'false' });
    var head = el('div', 'sc-head');
    var av = el('div', 'sc-av'); av.textContent = '⚗️';
    var ht = el('div', 'sc-ht'); var hTitle = el('b'); var hSub = el('span'); ht.appendChild(hTitle); ht.appendChild(hSub);
    var bClear = el('button', 'sc-hb', { type: 'button' }); bClear.textContent = '🗑';
    var bClose = el('button', 'sc-hb', { type: 'button' }); bClose.textContent = '✕';
    head.appendChild(av); head.appendChild(ht); head.appendChild(bClear); head.appendChild(bClose);
    var log = el('div', 'sc-log', { role: 'log', 'aria-live': 'polite' });
    var form = el('form', 'sc-form');
    var inp = el('textarea', 'sc-in', { rows: '1', maxlength: String(MAXLEN), autocomplete: 'off' });
    var btn = el('button', 'sc-send', { type: 'submit' }); btn.innerHTML = ICON_SEND;
    form.appendChild(inp); form.appendChild(btn);
    var foot = el('div', 'sc-foot');
    panel.appendChild(head); panel.appendChild(log); panel.appendChild(form); panel.appendChild(foot);
    document.body.appendChild(fab); document.body.appendChild(panel);

    function etiquetar() {
        hTitle.textContent = t('title'); hSub.textContent = t('sub');
        inp.placeholder = t('ph');
        fab.setAttribute('aria-label', t('open')); fab.title = t('open');
        bClose.setAttribute('aria-label', t('close')); bClose.title = t('close');
        bClear.setAttribute('aria-label', t('clear')); bClear.title = t('clear');
        panel.setAttribute('aria-label', t('title'));
        btn.setAttribute('aria-label', busy ? t('stop') : t('send')); btn.title = busy ? t('stop') : t('send');
        foot.textContent = lang() === 'es' ? 'Respuestas generadas por IA con datos del Sitial.' : 'AI-generated answers using Sitial data.';
    }

    // ── Markdown mínimo y seguro ──────────────────────────────
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function href(u) {
        if (u.indexOf(PROD) === 0 && location.origin !== PROD) u = location.origin + u.slice(PROD.length);
        return u;
    }
    function inline(s) {
        s = esc(s);
        var codes = [];
        s = s.replace(/`([^`\n]+)`/g, function (_, c) { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
        s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g, function (_, tx, u) {
            u = href(u.replace(/&amp;/g, '&'));
            var ext = /^https?:/.test(u) && u.indexOf(location.origin) !== 0;
            return '<a href="' + esc(u) + '"' + (ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + tx + '</a>';
        });
        s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?])/g, function (_, p, u) {
            var h = href(u.replace(/&amp;/g, '&')); var ext = h.indexOf(location.origin) !== 0;
            return p + '<a href="' + esc(h) + '"' + (ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + u + '</a>';
        });
        s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
        return s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return '<code>' + codes[+i] + '</code>'; });
    }
    function md(src) {
        var lines = String(src).replace(/\r/g, '').split('\n'), out = [], i = 0;
        while (i < lines.length) {
            var l = lines[i];
            if (/^```/.test(l)) {
                var buf = []; i++;
                while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
                i++; out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>'); continue;
            }
            if (/^\s*[-*•]\s+/.test(l)) {
                var li = [];
                while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) li.push('<li>' + inline(lines[i++].replace(/^\s*[-*•]\s+/, '')) + '</li>');
                out.push('<ul>' + li.join('') + '</ul>'); continue;
            }
            if (/^\s*\d+[.)]\s+/.test(l)) {
                var ol = [];
                while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) ol.push('<li>' + inline(lines[i++].replace(/^\s*\d+[.)]\s+/, '')) + '</li>');
                out.push('<ol>' + ol.join('') + '</ol>'); continue;
            }
            if (/^#{1,4}\s+/.test(l)) { out.push('<h4>' + inline(l.replace(/^#{1,4}\s+/, '')) + '</h4>'); i++; continue; }
            if (!l.trim()) { i++; continue; }
            var p = [];
            while (i < lines.length && lines[i].trim() && !/^(```|\s*[-*•]\s+|\s*\d+[.)]\s+|#{1,4}\s+)/.test(lines[i])) p.push(lines[i++]);
            out.push('<p>' + p.map(inline).join('<br>') + '</p>');
        }
        return out.join('');
    }

    // ── Render ────────────────────────────────────────────────
    function bajar() { log.scrollTop = log.scrollHeight; }
    function nodoMensaje(m) {
        var d = el('div', 'sc-m ' + (m.role === 'user' ? 'u' : 'a'));
        if (m.role === 'user') { d.textContent = m.content; return d; }
        pintarAsistente(d, m);
        return d;
    }
    function pintarAsistente(d, m, final) {
        d.innerHTML = md(m.content);
        if (final !== false && m.sources && m.sources.length) {
            var s = el('div', 'sc-src'); var sm = el('small'); sm.textContent = t('seeAlso'); s.appendChild(sm);
            m.sources.forEach(function (x) {
                var a = el('a', 'sc-chip'); a.href = href(x.url); a.textContent = x.title;
                if (a.href.indexOf(location.origin) !== 0) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
                s.appendChild(a);
            });
            d.appendChild(s);
        }
        if (final !== false && m.content) {
            var tl = el('div', 'sc-tools'); var cp = el('button', 'sc-tool', { type: 'button' }); cp.textContent = '⧉ ' + t('copy');
            cp.onclick = function () {
                try { navigator.clipboard.writeText(m.content); cp.textContent = '✓ ' + t('copied'); setTimeout(function () { cp.textContent = '⧉ ' + t('copy'); }, 1500); } catch (e) {}
            };
            tl.appendChild(cp); d.appendChild(tl);
        }
    }
    function pintarTodo() {
        log.innerHTML = '';
        var saludo = el('div', 'sc-m a'); saludo.innerHTML = '<p>' + esc(t('hello')) + '</p>';
        log.appendChild(saludo);
        msgs.forEach(function (m) { log.appendChild(nodoMensaje(m)); });
        if (!msgs.length) {
            var box = el('div', 'sc-sug');
            var pool = TXT[lang()].sug.slice();
            for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp; }
            pool.slice(0, 4).forEach(function (q) {
                var b = el('button', null, { type: 'button' }); b.textContent = q; b.onclick = function () { enviar(q); }; box.appendChild(b);
            });
            log.appendChild(box);
        }
        bajar();
    }
    function mostrarError(texto, reintentar) {
        var d = el('div', 'sc-m e'); d.setAttribute('role', 'alert'); d.textContent = texto;
        if (reintentar) {
            var b = el('button', 'sc-tool', { type: 'button' }); b.textContent = '↻ ' + t('retry'); b.style.marginLeft = '8px';
            b.onclick = function () { d.remove(); reintentar(); }; d.appendChild(b);
        }
        log.appendChild(d); bajar();
    }

    // ── Envío y streaming ─────────────────────────────────────
    function setBusy(v) {
        busy = v; btn.classList.toggle('stop', v); btn.innerHTML = v ? ICON_STOP : ICON_SEND;
        btn.disabled = false; etiquetar();
    }
    function enviar(texto) {
        texto = String(texto || '').trim().slice(0, MAXLEN);
        if (!texto || busy) return;
        if (!navigator.onLine) { mostrarError(t('eOff')); return; }
        var sug = log.querySelector('.sc-sug'); if (sug) sug.remove();
        msgs.push({ role: 'user', content: texto });
        log.appendChild(nodoMensaje(msgs[msgs.length - 1]));
        inp.value = ''; autoGrow();
        var m = { role: 'assistant', content: '', sources: null };
        var nodo = el('div', 'sc-m a'); nodo.innerHTML = '<span class="sc-dots"><i></i><i></i><i></i></span>';
        log.appendChild(nodo); bajar();
        setBusy(true);
        ctl = new AbortController();
        var historial = msgs.slice(0, -1).concat([msgs[msgs.length - 1]]).slice(-10).map(function (x) { return { role: x.role, content: x.content }; });
        var ultimoError = null, terminado = false;

        fetch(API, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
            body: JSON.stringify({ messages: historial, lang: lang(), page: { path: location.pathname + location.search, title: document.title } }),
        }).then(function (r) {
            if (!r.ok) {
                return r.json().catch(function () { return {}; }).then(function (j) {
                    var msg = j.error || t('eGen');
                    if (r.status === 429 && j.retryAfter) msg += ' (' + t('eWait') + ' ' + Math.min(j.retryAfter, 3600) + t('secs') + ')';
                    throw { visible: msg };
                });
            }
            var rd = r.body.getReader(), dec = new TextDecoder(), buf = '';
            function pump() {
                return rd.read().then(function (x) {
                    if (x.done) return;
                    buf += dec.decode(x.value, { stream: true });
                    var partes = buf.split('\n\n'); buf = partes.pop();
                    partes.forEach(function (bloque) {
                        var linea = bloque.split('\n').filter(function (z) { return z.indexOf('data:') === 0; })[0];
                        if (!linea) return;
                        var ev; try { ev = JSON.parse(linea.slice(5)); } catch (e) { return; }
                        if (ev.t === 'meta') m.sources = ev.sources || null;
                        else if (ev.t === 'delta') { m.content += ev.v; pintarAsistente(nodo, m, false); bajar(); }
                        else if (ev.t === 'error') ultimoError = ev.message;
                        else if (ev.t === 'done') terminado = true;
                    });
                    return pump();
                });
            }
            return pump();
        }).then(function () {
            if (m.content) {
                msgs.push(m); pintarAsistente(nodo, m, true); guardar();
                if (ultimoError && !terminado) mostrarError(ultimoError);
            } else {
                nodo.remove(); msgs.pop(); guardar();
                mostrarError(ultimoError || t('eGen'), function () { enviar(texto); });
            }
        }).catch(function (e) {
            if (e && e.name === 'AbortError') {
                if (m.content) { msgs.push(m); pintarAsistente(nodo, m, true); } else { nodo.remove(); msgs.pop(); inp.value = texto; autoGrow(); }
                guardar(); return;
            }
            if (m.content) { msgs.push(m); pintarAsistente(nodo, m, true); guardar(); }
            else { nodo.remove(); msgs.pop(); guardar(); }
            mostrarError(e && e.visible ? e.visible : t('eNet'), e && e.visible ? null : function () { enviar(texto); });
        }).then(function () { setBusy(false); ctl = null; bajar(); });
    }

    // ── Eventos ───────────────────────────────────────────────
    function autoGrow() { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 120) + 'px'; }
    function abrir() {
        abierto = true; etiquetar(); pintarTodo();
        panel.classList.add('sc-open'); fab.hidden = true;
        setTimeout(function () { inp.focus(); }, 60);
        try { sessionStorage.setItem(KEY + 'o', '1'); } catch (e) {}
    }
    function cerrar() {
        abierto = false; panel.classList.remove('sc-open'); fab.hidden = false; fab.focus();
        try { sessionStorage.removeItem(KEY + 'o'); } catch (e) {}
    }
    fab.addEventListener('click', abrir);
    bClose.addEventListener('click', cerrar);
    bClear.addEventListener('click', function () { if (ctl) ctl.abort(); msgs = []; guardar(); pintarTodo(); inp.focus(); });
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (busy) { if (ctl) ctl.abort(); return; }
        enviar(inp.value);
    });
    inp.addEventListener('input', autoGrow);
    inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && abierto) cerrar(); });
    // cambio de idioma del sitio
    var _l = lang();
    setInterval(function () { if (lang() !== _l) { _l = lang(); etiquetar(); if (abierto && !msgs.length) pintarTodo(); } }, 1000);

    etiquetar();
    window.SitialChat = { open: abrir, close: cerrar, ask: function (q) { if (!abierto) abrir(); enviar(q); } };
    try { if (sessionStorage.getItem(KEY + 'o') === '1') abrir(); } catch (e) {}
})();
