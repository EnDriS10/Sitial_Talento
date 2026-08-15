/* ══════════════════════════════════════════════════════════════
   MODERN UI — Sitial de Talentos Cubanos
   Módulo ligero que:
   1) Sustituye los emojis de tema (🌙/☀️) y hamburguesa por íconos
      SVG que MORPHEAN entre sí con Morphicons (vía CDN, sin build).
   2) Si Morphicons no carga (offline, red bloqueada), cae de forma
      segura a un swap instantáneo de íconos estáticos — el sitio
      nunca depende de la CDN para funcionar.
   3) Activa un scroll-reveal sutil en encabezados y tarjetas.
   Cero configuración por página: cada página solo necesita
   <script type="module" src=".../modern-ui.js"></script>
   ══════════════════════════════════════════════════════════════ */

const SUN  = [["circle", { cx: 12, cy: 12, r: 4 }], ["path", { d: "M12 2v2" }], ["path", { d: "M12 20v2" }], ["path", { d: "m4.93 4.93 1.41 1.41" }], ["path", { d: "m17.66 17.66 1.41 1.41" }], ["path", { d: "M2 12h2" }], ["path", { d: "M20 12h2" }], ["path", { d: "m6.34 17.66-1.41 1.41" }], ["path", { d: "m19.07 4.93-1.41 1.41" }]];
const MOON = [["path", { d: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" }]];
const MENU = [["path", { d: "M4 12h16" }], ["path", { d: "M4 6h16" }], ["path", { d: "M4 18h16" }]];
const XICON = [["path", { d: "M18 6 6 18" }], ["path", { d: "m6 6 12 12" }]];

function svgWrap(nodes) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    nodes.forEach(([tag, attrs]) => {
        const el = document.createElementNS(ns, tag);
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
        svg.appendChild(el);
    });
    return svg;
}

function mountIcon(button, initialNodes) {
    if (!button || button.dataset.muMounted) return null;
    button.dataset.muMounted = "1";
    button.textContent = "";
    const wrap = document.createElement("span");
    wrap.className = "morph-icon-wrap";
    wrap.appendChild(svgWrap(initialNodes));
    button.prepend(wrap);
    return wrap;
}

async function loadMorph() {
    try {
        const mod = await import("https://esm.sh/morphicons/dom@latest");
        return mod.createMorph || mod.default?.createMorph || null;
    } catch (e) {
        return null;
    }
}

function staticSwap(wrap, nodes) {
    wrap.textContent = "";
    wrap.appendChild(svgWrap(nodes));
}

async function wireThemeIcons(createMorph) {
    const buttons = document.querySelectorAll(
        "#theme-toggle, .mp-icon-btn[id$='-theme-btn'], .np-icon-btn[id$='-theme-btn']"
    );
    buttons.forEach((btn) => {
        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        const wrap = mountIcon(btn, isDark ? MOON : SUN);
        if (!wrap) return;
        const pathEl = wrap.querySelector("svg");
        const morph = createMorph ? createMorph(pathEl, isDark ? MOON : SUN) : null;

        const update = () => {
            const dark = document.documentElement.getAttribute("data-theme") === "dark";
            const target = dark ? MOON : SUN;
            if (morph) {
                morph.morphTo(target, "snappy");
            } else {
                staticSwap(wrap, target);
            }
        };

        new MutationObserver(update).observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["data-theme"],
        });
    });
}

async function wireHamburger(createMorph) {
    const btn = document.getElementById("hamburger-btn");
    const container = document.getElementById("topbar-hamburger");
    if (!btn || !container) return;
    // El hamburger usa 3 <span> para su propia animación CSS; le añadimos
    // el ícono morph delante sin tocar esa lógica existente.
    if (btn.dataset.muMounted) return;
    btn.dataset.muMounted = "1";
    const wrap = document.createElement("span");
    wrap.className = "morph-icon-wrap";
    wrap.style.marginRight = "2px";
    wrap.appendChild(svgWrap(MENU));
    btn.prepend(wrap);
    const pathEl = wrap.querySelector("svg");
    const morph = createMorph ? createMorph(pathEl, MENU) : null;

    const update = () => {
        const open = container.classList.contains("menu-abierto");
        const target = open ? XICON : MENU;
        if (morph) morph.morphTo(target, "snappy");
        else staticSwap(wrap, target);
    };
    new MutationObserver(update).observe(container, { attributes: true, attributeFilter: ["class"] });
}

function setupScrollReveal() {
    const selectors = [
        "h1", ".mp-heading", ".bp-heading", ".np-header", ".card",
        ".tabla-wrapper", ".bp-card", ".np-card", ".mp-gallery > *",
    ].join(", ");
    const els = Array.from(document.querySelectorAll(selectors)).slice(0, 60);
    if (!els.length) return;
    if (!("IntersectionObserver" in window)) {
        els.forEach((el) => el.classList.add("mu-reveal", "mu-in"));
        return;
    }
    const io = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("mu-in");
                    io.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach((el) => {
        el.classList.add("mu-reveal");
        io.observe(el);
    });
}

(async function init() {
    const createMorph = await loadMorph();
    wireThemeIcons(createMorph);
    wireHamburger(createMorph);
    setupScrollReveal();
})();
