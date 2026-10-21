/* ══════════════════════════════════════════════════════════════
   TOOLS — exportar a Excel / CSV e imprimir tablas y rankings
   Sitial de Talentos Cubanos

   · Añade una barra pequeña (⬇ Excel · CSV · 🖨 Imprimir) encima de
     cada .tabla-wrapper del sitio y encima de la lista del Sitial.
   · Lee lo que se está viendo (filtros y orden incluidos).
   · Excel: SheetJS (Assets/vendor/xlsx.mini.min.js, local → funciona
     también sin conexión). Si no pudiera cargar, cae a CSV.
   · Imprimir: documento limpio A4 con cabecera repetida en cada hoja.
   Se incluye con:  <script src="Assets/UI/tools.js" defer></script>
   ══════════════════════════════════════════════════════════════ */
(function () {
    'use strict';
    var script = document.currentScript;
    var ROOT = script && script.src ? script.src.replace(/Assets\/UI\/tools\.js(\?.*)?$/, '') : '';
    var SITE = 'sitialtalento.vercel.app';

    function lang() {
        try { return (window._lang || localStorage.getItem('lang') || 'es') === 'en' ? 'en' : 'es'; }
        catch (e) { return 'es'; }
    }
    var TXT = {
        es: { excel: 'Excel', csv: 'CSV', print: 'Imprimir', excelT: 'Descargar como Excel (.xlsx)', csvT: 'Descargar como CSV',
              printT: 'Imprimir esta tabla', empty: 'No hay datos para exportar todavía.', date: 'Generado el',
              source: 'Fuente', group: 'Delegación / Edición', prov: 'Provincia', ol: 'Olimpiada', year: 'Año',
              medal: 'Medalla', venue: 'Sede', name: 'Nombre', statsT: 'Estadísticas por provincia', sitial: 'Sitial de Honor',
              page: 'Página', fail: 'No se pudo generar el archivo.',
              medals: { oro: 'Oro', plata: 'Plata', bronce: 'Bronce', mencion: 'Mención', participante: 'Participante' },
              filt: { medal: 'Medalla', search: 'Búsqueda', prov: 'Provincia' } },
        en: { excel: 'Excel', csv: 'CSV', print: 'Print', excelT: 'Download as Excel (.xlsx)', csvT: 'Download as CSV',
              printT: 'Print this table', empty: 'There is no data to export yet.', date: 'Generated on',
              source: 'Source', group: 'Delegation / Edition', prov: 'Province', ol: 'Olympiad', year: 'Year',
              medal: 'Medal', venue: 'Venue', name: 'Name', statsT: 'Statistics by province', sitial: 'Hall of Honor',
              page: 'Page', fail: 'The file could not be generated.',
              medals: { oro: 'Gold', plata: 'Silver', bronce: 'Bronze', mencion: 'Honorable mention', participante: 'Participant' },
              filt: { medal: 'Medal', search: 'Search', prov: 'Province' } }
    };
    function T() { return TXT[lang()]; }

    // ── utilidades ─────────────────────────────────────────────
    function clean(s) {
        return String(s == null ? '' : s).replace(/[↕↓↑▲▼]/g, '').replace(/\s+/g, ' ').trim();
    }
    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function slug(s) {
        return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
            .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 70) || 'tabla';
    }
    function hoy() { return new Date().toISOString().slice(0, 10); }
    function fechaLarga() {
        try { return new Date().toLocaleDateString(lang() === 'en' ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'long', year: 'numeric' }); }
        catch (e) { return hoy(); }
    }
    function numOrText(v) {
        return /^-?\d+([.,]\d+)?$/.test(v) && v.length < 10 && !/^0\d/.test(v) ? Number(v.replace(',', '.')) : v;
    }

    // ── Modelo de tabla leído del DOM ───────────────────────────
    // Espera a que terminen los renders "por tandas" del sitio.
    function esperarEstable(tbody) {
        return new Promise(function (resolve) {
            var last = -1, same = 0, t0 = Date.now();
            (function poll() {
                var n = tbody ? tbody.rows.length : 0;
                var cargando = tbody && /Cargando|Loading/.test(tbody.textContent) && n <= 1;
                same = (n === last) ? same + 1 : 0; last = n;
                if ((same >= 2 && !cargando) || Date.now() - t0 > 4000) return resolve();
                setTimeout(poll, 120);
            })();
        });
    }

    function tituloDe(wrapper) {
        var t = T();
        var vista = wrapper.closest('[id$="-view"]');
        var vt = vista && vista.querySelector('[id$="-view-title"]');
        if (vt) return clean(vt.textContent);
        var sec = wrapper.closest('.seccion');
        var h = sec && sec.querySelector('.section-title');
        var base = h ? clean(h.textContent) : clean(document.title);
        if (wrapper.closest('#stats-vista-tabla')) base += ' — ' + t.statsT;
        return base;
    }
    function filtrosDe(wrapper) {
        var out = [];
        var cont = wrapper.parentElement;
        if (!cont) return '';
        cont.querySelectorAll('.controles-evento select').forEach(function (sel) {
            var lbl = sel.previousElementSibling;
            var l = lbl && lbl.tagName === 'LABEL' ? clean(lbl.textContent).replace(/:$/, '') : '';
            var opt = sel.options[sel.selectedIndex];
            if (opt && opt.value !== 'todos') out.push((l ? l + ': ' : '') + clean(opt.textContent));
            else if (opt && l) out.push(l + ': ' + clean(opt.textContent));
        });
        return out.join(' · ');
    }

    // Texto "humano" de una celda: sin iniciales de avatar, con espacios entre
    // elementos (<br>, <small>, banderas…) y provincia completa si hay data-prov.
    function textoCelda(td) {
        var out = '';
        (function walk(n) {
            if (n.nodeType === 3) { out += n.nodeValue; return; }
            if (n.nodeType !== 1) return;
            if (n.matches && n.matches('.tabla-avatar, .tabla-avatar-initials, .badge-dot, script, style, img')) return;
            if (n.dataset && n.dataset.prov) { out += ' ' + n.dataset.prov + ' '; return; }
            var tag = n.tagName;
            var blk = tag === 'BR' || tag === 'DIV' || tag === 'P' || tag === 'SMALL' || tag === 'STRONG' || n.classList.contains('sede-flag');
            if (blk) out += ' ';
            Array.prototype.forEach.call(n.childNodes, walk);
            if (blk) out += ' ';
        })(td);
        return clean(out);
    }

    async function modeloDeTabla(wrapper) {
        var table = wrapper.querySelector('table');
        var tbody = table.tBodies[0];
        await esperarEstable(tbody);
        var headRow = table.tHead && table.tHead.rows[table.tHead.rows.length - 1];
        var headers = headRow ? Array.from(headRow.cells).map(function (c) { return clean(c.textContent); }) : [];
        var rows = [], grupo = '', hayGrupos = false, splitAnio = false;
        Array.from(tbody.rows).forEach(function (tr) {
            var cells = Array.from(tr.cells);
            if (!cells.length) return;
            if (cells.length === 1 && cells[0].colSpan > 1) {
                if (cells[0].classList.contains('no-results')) return;
                grupo = clean(cells[0].textContent); hayGrupos = true; return;
            }
            // 1ª columna "2026 / Ed.58" → dos columnas (año numérico + edición)
            var f0 = cells[0].querySelector('strong'), s0 = cells[0].querySelector('small');
            var partida = !!(f0 && s0 && /^\d{4}$/.test(clean(f0.textContent)));
            if (partida) splitAnio = true;
            rows.push({ g: grupo, p: partida, c: cells.map(function (c) { return textoCelda(c); }),
                        ed: partida ? clean(s0.textContent) : '', yr: partida ? clean(f0.textContent) : '' });
        });
        if (splitAnio) {
            headers = [headers[0], lang() === 'en' ? 'Edition' : 'Edición'].concat(headers.slice(1));
            rows.forEach(function (r) { r.c = [r.p ? r.yr : r.c[0], r.p ? r.ed : ''].concat(r.c.slice(1)); });
        }
        if (hayGrupos) {
            headers = [T().group].concat(headers);
            rows.forEach(function (r) { r.c = [r.g].concat(r.c); });
        }
        var foot = wrapper.querySelector('.tabla-footer');
        var src = '';
        if (foot) {
            var s = foot.querySelectorAll('span');
            src = clean(s[s.length - 1] ? s[s.length - 1].textContent : '');
        }
        return { title: tituloDe(wrapper), filters: filtrosDe(wrapper), headers: headers,
                 rows: rows.map(function (r) { return r.c; }), groups: hayGrupos, source: src };
    }

    // ── Descargas ───────────────────────────────────────────────
    function descargar(blob, nombre) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = nombre;
        document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    }

    var _xlsxPromise = null;
    function cargarXLSX() {
        if (window.XLSX) return Promise.resolve(window.XLSX);
        if (_xlsxPromise) return _xlsxPromise;
        _xlsxPromise = new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = ROOT + 'Assets/vendor/xlsx.mini.min.js';
            s.onload = function () { window.XLSX ? resolve(window.XLSX) : reject(new Error('XLSX')); };
            s.onerror = function () { _xlsxPromise = null; reject(new Error('XLSX load')); };
            document.head.appendChild(s);
        });
        return _xlsxPromise;
    }

    function aoaDe(m) {
        var t = T();
        var aoa = [[m.title]];
        if (m.filters) aoa.push([m.filters]);
        aoa.push([t.date + ' ' + fechaLarga() + ' · ' + SITE]);
        aoa.push([]);
        var headerRow = aoa.length + 1;                      // 1-based
        aoa.push(m.headers);
        m.rows.forEach(function (r) { aoa.push(r.map(numOrText)); });
        if (m.source) { aoa.push([]); aoa.push([t.source + ': ' + m.source.replace(/^[^:]*:\s*/, '')]); }
        return { aoa: aoa, headerRow: headerRow };
    }

    async function exportarXLSX(m) {
        var X = await cargarXLSX();
        var r = aoaDe(m);
        var ws = X.utils.aoa_to_sheet(r.aoa);
        var ncol = m.headers.length;
        ws['!cols'] = m.headers.map(function (h, i) {
            var w = h.length;
            m.rows.forEach(function (row) { w = Math.max(w, String(row[i] == null ? '' : row[i]).length); });
            return { wch: Math.min(Math.max(w + 2, 8), 48) };
        });
        if (ncol > 1) ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(ncol - 1, 1) } }];
        if (m.rows.length) {
            ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: r.headerRow - 1, c: 0 }, e: { r: r.headerRow - 1 + m.rows.length, c: ncol - 1 } }) };
        }
        var wb = X.utils.book_new();
        X.utils.book_append_sheet(wb, ws, clean(m.title).replace(/[\\\/?*\[\]:]/g, ' ').slice(0, 31) || 'Datos');
        var out = X.write(wb, { bookType: 'xlsx', type: 'array' });
        descargar(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
                  'sitial_' + slug(m.title + ' ' + m.filters) + '_' + hoy() + '.xlsx');
    }

    function exportarCSV(m) {
        function q(v) { v = String(v == null ? '' : v); return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
        var lines = [m.headers].concat(m.rows).map(function (r) { return r.map(q).join(','); });
        descargar(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }),
                  'sitial_' + slug(m.title + ' ' + m.filters) + '_' + hoy() + '.csv');
    }

    // ── Impresión ───────────────────────────────────────────────
    function htmlImpresion(m) {
        var t = T();
        var ancha = m.headers.length > 6;
        var thead = '<tr>' + m.headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr>';
        var body = '', prev = null;
        m.rows.forEach(function (r) {
            if (m.groups && r[0] !== prev) {
                body += '<tr class="g"><td colspan="' + m.headers.length + '">' + esc(r[0]) + '</td></tr>';
                prev = r[0];
            }
            var cells = m.groups ? r.slice(1) : r;
            body += '<tr>' + cells.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>';
        });
        // con grupos, la columna de grupo no se imprime (va como fila de cabecera)
        var theadP = m.groups ? '<tr>' + m.headers.slice(1).map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr>' : thead;
        var ncolP = m.groups ? m.headers.length - 1 : m.headers.length;
        body = body.replace(new RegExp('colspan="' + m.headers.length + '"', 'g'), 'colspan="' + ncolP + '"');
        return '<!DOCTYPE html><html lang="' + lang() + '"><head><meta charset="utf-8"><title>' + esc(m.title) + '</title><style>' +
            '@page{size:A4 ' + (ancha ? 'landscape' : 'portrait') + ';margin:12mm 10mm 14mm}' +
            '*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
            'body{font:10.5pt/1.35 "Helvetica Neue",Arial,sans-serif;color:#111;margin:0}' +
            'header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2.5px solid #04122b;padding-bottom:6px;margin-bottom:10px}' +
            '.brand{font:700 9pt Arial;letter-spacing:.08em;text-transform:uppercase;color:#8a6d00}' +
            'h1{font:700 16pt Georgia,serif;color:#04122b;margin:2px 0 0}' +
            '.f{color:#444;font-size:9.5pt;margin-top:2px}.d{font-size:8.5pt;color:#555;text-align:right}' +
            'table{width:100%;border-collapse:collapse}thead{display:table-header-group}tr{page-break-inside:avoid}' +
            'th{background:#04122b;color:#fff;text-align:left;font-size:9pt;padding:5px 6px}' +
            'td{padding:4px 6px;border-bottom:1px solid #d5d9e3;font-size:9.5pt;vertical-align:top}' +
            'tbody tr:nth-child(even) td{background:#f4f6fb}' +
            'tr.g td{background:#e8dcae!important;font-weight:700;color:#04122b;border-bottom:1px solid #c9a227}' +
            'footer{margin-top:10px;font-size:8.5pt;color:#555;display:flex;justify-content:space-between}' +
            '</style></head><body>' +
            '<header><div><div class="brand">Sitial de Talentos Cubanos</div><h1>' + esc(m.title) + '</h1>' +
            (m.filters ? '<div class="f">' + esc(m.filters) + '</div>' : '') + '</div>' +
            '<div class="d">' + esc(t.date + ' ' + fechaLarga()) + '<br>' + SITE + '</div></header>' +
            '<table><thead>' + theadP + '</thead><tbody>' + body + '</tbody></table>' +
            '<footer><span>' + esc(m.rows.length + ' ' + (lang() === 'en' ? 'rows' : 'filas')) + '</span><span>' +
            (m.source ? esc(m.source) : '') + '</span></footer></body></html>';
    }

    function imprimir(m) {
        var html = htmlImpresion(m);
        var f = document.createElement('iframe');
        f.setAttribute('aria-hidden', 'true');
        f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
        document.body.appendChild(f);
        var doc = f.contentWindow.document;
        doc.open(); doc.write(html); doc.close();
        var hecho = false;
        function lanzar() {
            if (hecho) return; hecho = true;
            try { f.contentWindow.focus(); f.contentWindow.print(); }
            catch (e) {
                var w = window.open('', '_blank');
                if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
            }
            setTimeout(function () { f.remove(); }, 60000);
        }
        f.onload = lanzar;
        setTimeout(lanzar, 400);
    }

    // ── Barra de botones ────────────────────────────────────────
    var css = document.createElement('style');
    css.textContent =
        '.tt-bar{display:flex;justify-content:flex-end;align-items:center;gap:6px;margin:0 0 8px;flex-wrap:wrap}' +
        '.tt-btn{display:inline-flex;align-items:center;gap:5px;background:var(--card-bg,#fff);color:var(--text,#1a1a2e);' +
        'border:1px solid var(--border,#dde3f0);border-radius:999px;padding:5px 12px;font:600 12px "DM Sans",system-ui,sans-serif;' +
        'cursor:pointer;transition:border-color .15s,color .15s,transform .15s}' +
        '.tt-btn:hover{border-color:var(--accent,#1a6fb5);color:var(--accent,#1a6fb5)}.tt-btn:active{transform:scale(.97)}' +
        '.tt-btn[disabled]{opacity:.55;cursor:progress}' +
        '@media print{.tt-bar{display:none!important}}';
    document.head.appendChild(css);

    function crearBarra(getModelo) {
        var bar = document.createElement('div');
        bar.className = 'tt-bar';
        bar.setAttribute('data-tt', '1');
        function btn(key, icon, tip, fn) {
            var b = document.createElement('button');
            b.type = 'button'; b.className = 'tt-btn'; b.dataset.k = key;
            b.addEventListener('click', async function () {
                if (b.disabled) return;
                b.disabled = true;
                try {
                    var m = await getModelo();
                    if (!m || !m.rows.length) { alert(T().empty); return; }
                    await fn(m);
                } catch (e) {
                    console.error('[tools]', e);
                    if (key === 'xlsx') { try { var mm = await getModelo(); exportarCSV(mm); } catch (e2) { alert(T().fail); } }
                    else alert(T().fail);
                } finally { b.disabled = false; }
            });
            bar.appendChild(b);
            return b;
        }
        btn('xlsx', '⬇', '', exportarXLSX);
        btn('csv', '⬇', '', async function (m) { exportarCSV(m); });
        btn('print', '🖨', '', async function (m) { imprimir(m); });
        etiquetar(bar);
        return bar;
    }
    function etiquetar(bar) {
        var t = T();
        var map = { xlsx: ['⬇ ' + t.excel, t.excelT], csv: ['⬇ ' + t.csv, t.csvT], print: ['🖨 ' + t.print, t.printT] };
        bar.querySelectorAll('.tt-btn').forEach(function (b) {
            var v = map[b.dataset.k]; b.textContent = v[0]; b.title = v[1]; b.setAttribute('aria-label', v[1]);
        });
    }

    // ── Modelo de la lista del Sitial ───────────────────────────
    function modeloSitial() {
        var t = T();
        var lista = [];
        try { lista = (typeof _listaActual !== 'undefined' && _listaActual) || window._estudiantesTodos || []; } catch (e) { lista = window._estudiantesTodos || []; }
        var rows = [];
        lista.forEach(function (e) {
            (e.medallas || []).slice().sort(function (a, b) { return (b.año || 0) - (a.año || 0); }).forEach(function (m) {
                var sede = [m.pais, m.sede].filter(Boolean).join(' ');
                rows.push([e.nombre, e.prov || '', m.olimpiada || '', m.año || '', t.medals[m.tipo] || m.tipo || '', sede]);
            });
        });
        var f = [];
        try {
            if (typeof filtroSitial !== 'undefined' && filtroSitial !== 'todos') f.push(t.filt.medal + ': ' + (t.medals[filtroSitial] || filtroSitial));
            if (typeof busquedaSitial !== 'undefined' && busquedaSitial) f.push(t.filt.search + ': ' + busquedaSitial);
            if (typeof filtroProvinciaSitial !== 'undefined' && filtroProvinciaSitial) f.push(t.filt.prov + ': ' + filtroProvinciaSitial);
        } catch (e) {}
        return Promise.resolve({ title: t.sitial, filters: f.join(' · '),
            headers: [t.name, t.prov, t.ol, t.year, t.medal, t.venue], rows: rows, groups: false, source: '' });
    }

    function montar() {
        // 1) todas las tablas
        document.querySelectorAll('.tabla-wrapper').forEach(function (w) {
            if (!w.querySelector('table')) return;
            var prev = w.previousElementSibling;
            if (prev && prev.getAttribute && prev.getAttribute('data-tt')) return;
            w.parentNode.insertBefore(crearBarra(function () { return modeloDeTabla(w); }), w);
        });
        // 2) lista del Sitial
        var grid = document.getElementById('cuadricula-sitial');
        if (grid && !(grid.previousElementSibling && grid.previousElementSibling.getAttribute('data-tt'))) {
            var b = crearBarra(modeloSitial);
            b.style.marginTop = '10px';
            grid.parentNode.insertBefore(b, grid);
        }
    }

    // Reetiquetar al cambiar de idioma (applyI18n lo cambia sin recargar)
    var _l = lang();
    setInterval(function () {
        if (lang() !== _l) { _l = lang(); document.querySelectorAll('.tt-bar').forEach(etiquetar); }
    }, 1000);

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
    else montar();

    window.SitialTools = { htmlImpresion: htmlImpresion, exportarXLSX: exportarXLSX, exportarCSV: exportarCSV, imprimir: imprimir, modeloDeTabla: modeloDeTabla };
})();
