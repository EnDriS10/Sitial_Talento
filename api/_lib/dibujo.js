// Guía que se pega en los prompts de la IA para que pueda DIBUJAR moléculas,
// síntesis y mecanismos con el motor MolGraph del sitio (RDKit + flechas libres).
// El navegador interpreta SOLO esta sintaxis (todo lo demás se escapa).
export const GUIA_DIBUJO = `
DIBUJO QUÍMICO (úsalo en preguntas de orgánica/inorgánica cuando una estructura, una síntesis o un mecanismo aclare más que el texto; no dibujes por adornar):
• Una molécula: [[MOL: SMILES | nombre]]   p. ej. [[MOL: CC(=O)OC | acetato de metilo]]
• Esquema, síntesis o mecanismo: bloque con tres comillas invertidas y la palabra esquema, con estas líneas:
  size=sm escala=0.85 gapx=110 gapy=90        (opcional)
  a @0,0: SMILES | etiqueta | caja=verde      (nodo en columna,fila; opciones: caja=amarillo|verde|azul, resaltar=3,4 (nº de átomos), color=cpk)
  b @1,0: t:H2O                               (texto en vez de molécula)
  a -> b | reactivo arriba | reactivo abajo | nota gris   (flecha; estilos: <=> equilibrio, <-> resonancia, --> punteada)
  b -> c | arriba | abajo | nota | ruta=hv    (si b y c no están alineados, la flecha gira en escuadra; ruta=hv gira al revés)
  curva: a:3 -> a:5                           (flecha curva de electrones: del átomo nº3 al átomo nº5; enlace con a:3-4)
  caja amarillo: a, b | Stobbe                (recuadro de resalte alrededor de varios nodos)
  Las flechas pueden ir a la derecha, izquierda, abajo o arriba según la posición de los nodos. Fórmulas como H2SO4 o NEt3 se muestran con subíndices solos; // en un texto = salto de línea.
• Los átomos se numeran desde 0 en el orden en que aparecen en el SMILES (solo átomos pesados, sin H).
• Reglas estrictas: SMILES válidos y sin estereoquímica con barras (nada de \\ ni / de dobles enlaces); sin comillas dobles dentro del dibujo; máximo 8 nodos por esquema y 2–3 esquemas por respuesta; mecanismos: una flecha curva por par de electrones, del par/enlace que ataca al átomo que lo recibe. Explica en texto cada paso del dibujo.
Ejemplo (esterificación, paso de ataque):
\`\`\`esquema
size=sm
a @0,0: CC(=O)O | ácido acético
b @1,0: CO | metanol
c @2,0: CC(=O)OC | acetato de metilo | caja=verde
a -> c | H2SO4, Δ | | esterificación de Fischer
\`\`\`
`;
