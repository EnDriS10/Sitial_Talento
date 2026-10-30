/* Tabla periódica minimalista (propia, sin dependencias).
   Se monta en #pv-tabla-periodica; pasar el ratón (o tocar) amplía el elemento.
   Datos: número, símbolo, nombre, masa molar (g/mol) y categoría. */
(function () {
  'use strict';
  var RAW = ('1 H Hidrógeno 1.008 nm|2 He Helio 4.003 ng|3 Li Litio 6.94 ak|4 Be Berilio 9.012 ae|5 B Boro 10.81 mt|6 C Carbono 12.011 nm|7 N Nitrógeno 14.007 nm|8 O Oxígeno 15.999 nm|9 F Flúor 18.998 nm|10 Ne Neón 20.18 ng|' +
  '11 Na Sodio 22.99 ak|12 Mg Magnesio 24.305 ae|13 Al Aluminio 26.982 pt|14 Si Silicio 28.085 mt|15 P Fósforo 30.974 nm|16 S Azufre 32.06 nm|17 Cl Cloro 35.45 nm|18 Ar Argón 39.948 ng|' +
  '19 K Potasio 39.098 ak|20 Ca Calcio 40.078 ae|21 Sc Escandio 44.956 tm|22 Ti Titanio 47.867 tm|23 V Vanadio 50.942 tm|24 Cr Cromo 51.996 tm|25 Mn Manganeso 54.938 tm|26 Fe Hierro 55.845 tm|27 Co Cobalto 58.933 tm|28 Ni Níquel 58.693 tm|29 Cu Cobre 63.546 tm|30 Zn Zinc 65.38 tm|31 Ga Galio 69.723 pt|32 Ge Germanio 72.63 mt|33 As Arsénico 74.922 mt|34 Se Selenio 78.971 nm|35 Br Bromo 79.904 nm|36 Kr Kriptón 83.798 ng|' +
  '37 Rb Rubidio 85.468 ak|38 Sr Estroncio 87.62 ae|39 Y Itrio 88.906 tm|40 Zr Circonio 91.224 tm|41 Nb Niobio 92.906 tm|42 Mo Molibdeno 95.95 tm|43 Tc Tecnecio [98] tm|44 Ru Rutenio 101.07 tm|45 Rh Rodio 102.906 tm|46 Pd Paladio 106.42 tm|47 Ag Plata 107.868 tm|48 Cd Cadmio 112.414 tm|49 In Indio 114.818 pt|50 Sn Estaño 118.71 pt|51 Sb Antimonio 121.76 mt|52 Te Telurio 127.6 mt|53 I Yodo 126.904 nm|54 Xe Xenón 131.293 ng|' +
  '55 Cs Cesio 132.905 ak|56 Ba Bario 137.327 ae|57 La Lantano 138.905 ln|58 Ce Cerio 140.116 ln|59 Pr Praseodimio 140.908 ln|60 Nd Neodimio 144.242 ln|61 Pm Prometio [145] ln|62 Sm Samario 150.36 ln|63 Eu Europio 151.964 ln|64 Gd Gadolinio 157.25 ln|65 Tb Terbio 158.925 ln|66 Dy Disprosio 162.5 ln|67 Ho Holmio 164.93 ln|68 Er Erbio 167.259 ln|69 Tm Tulio 168.934 ln|70 Yb Iterbio 173.045 ln|71 Lu Lutecio 174.967 ln|' +
  '72 Hf Hafnio 178.49 tm|73 Ta Tántalo 180.948 tm|74 W Wolframio 183.84 tm|75 Re Renio 186.207 tm|76 Os Osmio 190.23 tm|77 Ir Iridio 192.217 tm|78 Pt Platino 195.084 tm|79 Au Oro 196.967 tm|80 Hg Mercurio 200.592 tm|81 Tl Talio 204.38 pt|82 Pb Plomo 207.2 pt|83 Bi Bismuto 208.98 pt|84 Po Polonio [209] pt|85 At Astato [210] mt|86 Rn Radón [222] ng|' +
  '87 Fr Francio [223] ak|88 Ra Radio [226] ae|89 Ac Actinio [227] ac|90 Th Torio 232.038 ac|91 Pa Protactinio 231.036 ac|92 U Uranio 238.029 ac|93 Np Neptunio [237] ac|94 Pu Plutonio [244] ac|95 Am Americio [243] ac|96 Cm Curio [247] ac|97 Bk Berkelio [247] ac|98 Cf Californio [251] ac|99 Es Einstenio [252] ac|100 Fm Fermio [257] ac|101 Md Mendelevio [258] ac|102 No Nobelio [259] ac|103 Lr Lawrencio [266] ac|' +
  '104 Rf Rutherfordio [267] tm|105 Db Dubnio [268] tm|106 Sg Seaborgio [269] tm|107 Bh Bohrio [270] tm|108 Hs Hasio [277] tm|109 Mt Meitnerio [278] un|110 Ds Darmstatio [281] un|111 Rg Roentgenio [282] un|112 Cn Copernicio [285] un|113 Nh Nihonio [286] un|114 Fl Flerovio [289] un|115 Mc Moscovio [290] un|116 Lv Livermorio [293] un|117 Ts Teneso [294] un|118 Og Oganesón [294] un').split('|').map(function (s) {
    var p = s.split(' '); return { z: +p[0], s: p[1], n: p[2], m: p[3], c: p[4] };
  });
  var CAT = { nm: 'No metal', ng: 'Gas noble', ak: 'Alcalino', ae: 'Alcalinotérreo', tm: 'Metal de transición', pt: 'Metal postransicional', mt: 'Metaloide', ln: 'Lantánido', ac: 'Actínido', un: 'Propiedades desconocidas' };
  var CSS = '' +
  '.ptb{margin:34px auto 10px;max-width:1180px;padding:0 4px}' +
  '.ptb-head{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:6px;margin:0 0 10px}' +
  '.ptb-head h2{margin:0;font-size:1.05rem;letter-spacing:.2px}' +
  '.ptb-head span{font-size:.78rem;opacity:.65}' +
  '.ptb-scroll{overflow-x:auto;padding:30px 38px;margin:-30px -38px}' +
  '.ptb-grid{display:grid;grid-template-columns:repeat(18,minmax(48px,1fr));gap:3px;min-width:900px;position:relative}' +
  '.ptb-el{--c:120,130,150;position:relative;aspect-ratio:1/1.08;border-radius:7px;background:rgba(var(--c),.16);color:rgb(var(--c));display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;cursor:default;user-select:none;transition:transform .14s ease,box-shadow .14s ease,background .14s ease;z-index:1}' +
  '.ptb-el b{font-size:1.18rem;font-weight:600;letter-spacing:.2px}' +
  '.ptb-el i{position:absolute;top:3px;left:5px;font-style:normal;font-size:.6rem;font-weight:700;opacity:.85}' +
  '.ptb-el u{text-decoration:none;font-size:.5rem;font-weight:600;margin-top:3px;opacity:.9;color:inherit}' +
  '.ptb-el em{display:none;font-style:normal;font-size:.5rem;font-weight:700;margin-top:2px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 2px}' +
  '.ptb-el:hover,.ptb-el.ptb-on{transform:scale(1.85);z-index:20;background:rgb(var(--c));color:#fff;box-shadow:0 8px 22px rgba(4,18,43,.35);border-radius:9px}' +
  '.ptb-el:hover em,.ptb-el.ptb-on em{display:block}' +
  '.ptb-el:hover u,.ptb-el.ptb-on u{opacity:1}' +
  '.ptb-gap{grid-column:1/-1;height:10px}' +
  '.ptb-sp{visibility:hidden}' +
  '.ptb-leg{display:flex;flex-wrap:wrap;gap:6px 14px;margin:12px 2px 0;font-size:.74rem}' +
  '.ptb-leg span{display:inline-flex;align-items:center;gap:5px;opacity:.85}' +
  '.ptb-leg s{width:10px;height:10px;border-radius:3px;display:inline-block;background:rgb(var(--c));text-decoration:none}' +
  '.ptb [data-c=nm]{--c:37,108,230}.ptb [data-c=ng]{--c:214,45,102}.ptb [data-c=ak]{--c:6,150,170}.ptb [data-c=ae]{--c:214,40,70}' +
  '.ptb [data-c=tm]{--c:112,72,224}.ptb [data-c=pt]{--c:30,150,90}.ptb [data-c=mt]{--c:178,118,10}.ptb [data-c=ln]{--c:24,120,180}' +
  '.ptb [data-c=ac]{--c:222,92,24}.ptb [data-c=un]{--c:110,116,130}' +
  '.ptb .ptb-el[data-fade]{opacity:.28}' +
  '[data-theme="dark"] .ptb-el{background:rgba(var(--c),.24);filter:brightness(1.35)}' +
  '[data-theme="dark"] .ptb-el:hover,[data-theme="dark"] .ptb-el.ptb-on{background:rgb(var(--c));color:#fff;filter:none}';
  function pos(e) {          // [columna, fila] en la cuadrícula
    var z = e.z;
    if (z === 1) return [1, 1]; if (z === 2) return [18, 1];
    if (z <= 4) return [z - 2, 2]; if (z <= 10) return [z + 8, 2];
    if (z <= 12) return [z - 10, 3]; if (z <= 18) return [z, 3];
    if (z <= 36) return [z - 18, 4]; if (z <= 54) return [z - 36, 5];
    if (z <= 57) return [z - 54, 6]; if (z <= 71) return [null, 9, z - 58];
    if (z <= 86) return [z - 68, 6];
    if (z <= 89) return [z - 86, 7]; if (z <= 103) return [null, 10, z - 90];
    return [z - 100, 7];
  }
  function build(host) {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var g = '', i;
    for (i = 0; i < RAW.length; i++) {
      var e = RAW[i], p = pos(e), col = p[0] === null ? p[2] + 4 : p[0], row = p[1];
      g += '<div class="ptb-el" data-c="' + e.c + '" style="grid-column:' + col + ';grid-row:' + row + '" tabindex="0" role="button" aria-label="' + e.n + ', número ' + e.z + ', masa molar ' + e.m + ' g/mol" data-cat="' + e.c + '">' +
           '<i>' + e.z + '</i><b>' + e.s + '</b><em>' + e.n + '</em><u>' + e.m + '</u></div>';
    }
    var leg = Object.keys(CAT).map(function (k) { return '<span class="ptb-cat" data-c="' + k + '" data-k="' + k + '"><s></s>' + CAT[k] + '</span>'; }).join('');
    host.innerHTML = '<section class="ptb" aria-label="Tabla periódica"><div class="ptb-head"><h2>Tabla periódica</h2><span>Masas molares en g mol⁻¹ · pasa el ratón sobre un elemento</span></div>' +
      '<div class="ptb-scroll"><div class="ptb-grid">' + g + '</div></div><div class="ptb-leg">' + leg + '</div></section>';
    var grid = host.querySelector('.ptb-grid');
    // la fila 8 queda como separación; las filas 9–10 contienen los bloques f
    grid.style.gridTemplateRows = 'repeat(7,auto) 14px auto auto';
    // filtrar por categoría al pasar sobre la leyenda
    host.querySelectorAll('.ptb-cat').forEach(function (l) {
      var k = l.getAttribute('data-k');
      function on() { grid.querySelectorAll('.ptb-el').forEach(function (el) { if (el.getAttribute('data-cat') !== k) el.setAttribute('data-fade', '1'); }); }
      function off() { grid.querySelectorAll('.ptb-el').forEach(function (el) { el.removeAttribute('data-fade'); }); }
      l.addEventListener('mouseenter', on); l.addEventListener('mouseleave', off);
    });
    // táctil / teclado: un toque selecciona
    var cur = null;
    grid.addEventListener('click', function (ev) {
      var el = ev.target.closest('.ptb-el'); if (!el) return;
      if (cur && cur !== el) cur.classList.remove('ptb-on');
      el.classList.toggle('ptb-on'); cur = el.classList.contains('ptb-on') ? el : null;
    });
    document.addEventListener('click', function (ev) { if (cur && !ev.target.closest('.ptb-el')) { cur.classList.remove('ptb-on'); cur = null; } });
  }
  function init() {
    var host = document.getElementById('pv-tabla-periodica');
    if (!host) { host = document.createElement('div'); host.id = 'pv-tabla-periodica'; var f = document.querySelector('footer'); if (f) f.parentNode.insertBefore(host, f); else document.body.appendChild(host); }
    build(host);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
