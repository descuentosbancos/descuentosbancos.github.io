/* Descuentos en comida · Santiago — lógica del sitio.
   Lee data.json (exportado por el repo de datos) y renderiza con los mismos
   criterios del correo: día seleccionado, vigencia (fecha Santiago), top por %. */

// `pin`: el color de marca oscurecido lo justo para que el % en BLANCO se lea
// dentro del pin. El verde y el naranjo crudos daban ~2.5:1 sobre blanco.
const BANCOS = [
  { id: "falabella", nombre: "CMR Falabella", color: "#2DB94C", pin: "#1B7A34", url: "https://bancofalabella.cl/descuentos" },
  { id: "chile", nombre: "Banco de Chile", color: "#003087", pin: "#003087", url: "https://www.bancochile.cl/personas/beneficios" },
  { id: "bci", nombre: "BCI",            color: "#0033A0", pin: "#0033A0", url: "https://www.bci.cl/personas/beneficios" },
  { id: "santander", nombre: "Santander",      color: "#EC0000", pin: "#BF0000", url: "https://banco.santander.cl/personas/beneficios" },
  { id: "itau", nombre: "Itaú",           color: "#EC7000", pin: "#A85000", url: "https://www.itau.cl/personas/beneficios" },
  { id: "bice", nombre: "BICE",           color: "#004B8D", pin: "#004B8D", url: "https://www.bice.cl/personas/beneficios" },
];

// Base del mapa: Esri Canvas (gris neutro) en vez de OpenStreetMap crudo. El
// OSM estándar mete escudos de ruta, relieve y carreteras de colores que
// tapaban los pines; este fondo está diseñado para eso, con variante oscura.
//
// Antes era CARTO (basemaps.cartocdn.com), pero dejó de servir tiles gratis
// sin cuenta: el tile que llegaba traía literalmente el texto "API KEY
// REQUIRED" incrustado en la imagen (sep-2026). Esri Canvas es el
// reemplazo directo -mismo estilo visual, sin cuenta ni clave- pero viene en
// DOS capas que hay que superponer: "Base" (el relleno/calles) y
// "Reference" (las etiquetas, PNG transparente), a diferencia de CARTO que
// las traía juntas en un solo tile.
//
// OJO con el orden de la URL: Esri usa {z}/{y}/{x}, NO {z}/{x}/{y} como la
// mayoría de los servicios XYZ (CARTO, OSM). Cambiarlo por error deja el
// mapa mostrando el tile equivocado en cada posición.
//
// maxNativeZoom en 15: pasado ese nivel Esri devuelve un tile con el texto
// "Map data not yet available" para esta región en vez de fallar limpio.
// Leaflet resuelve el acercamiento extra escalando el último tile real -se
// ve borroso, pero nunca ese texto.
const TILES = {
  claro: {
    base: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    ref: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
  },
  oscuro: {
    base: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    ref: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
  },
};
const TILES_ATTR = '&copy; <a href="https://www.esri.com">Esri</a>';
const temaOscuro = () => matchMedia("(prefers-color-scheme: dark)").matches;
const FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLScfOH3mzOrMN5hBaX74k2IFxHrfxanplOuyTMGKnz-a6hTYDA/viewform";
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DIA_LARGO = ["lunes", "martes", "miércoles", "jueves", "viernes",
                   "sábado", "domingo"];
const EMOJI = { delivery: "🍕", restaurante: "🍽️", cafe: "☕", supermercado: "🛒" };
const MAX_POR_BANCO = 24; // la web tiene más espacio que el correo

// Casi todo es restaurante: repetir 🍽️ en cada tarjeta era ruido. El emoji
// solo aparece cuando dice algo (café, delivery, súper).
function sub(d) {
  return d.subcat && d.subcat !== "restaurante" && EMOJI[d.subcat]
    ? `<span class="sub" aria-hidden="true">${EMOJI[d.subcat]}</span>` : "";
}

// Íconos de trazo (mismo lenguaje que los de la barra en index.html).
const ICO = {
  dia: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  lugar: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  tope: '<circle cx="12" cy="12" r="9"/><path d="M15 9.3c-.5-.9-1.6-1.5-3-1.5-1.7 0-2.9.8-2.9 2.1s1.2 1.8 2.9 2.1 2.9.9 2.9 2.2-1.2 2.1-2.9 2.1c-1.4 0-2.5-.6-3-1.5M12 6v1.8M12 16.3V18"/>',
  tarjeta: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
};
const ico = k => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICO[k]}</svg>`;

const state = {
  dia: diaSantiago(), q: "", bancos: new Set(BANCOS.map(b => b.nombre)),
  data: [], vista: "lista", user: null, comuna: "",
  expandidos: new Set(),  // bancos con "ver todas" abierto
};

// Locales del descuento donde vale el día elegido. [] si el banco no publica
// días por local (el caso normal: un solo local, y `dias` ya es específico).
function localesDelDia(d, dia) {
  if (!d.locales || !d.locales.length) return [];
  return d.locales.filter(l => l.d.includes(dia));
}
// True si el beneficio NO vale hoy en todos sus locales: hay que decir en
// cuáles sí, porque "todos los días" mandaría a la persona al local errado.
function variaPorLocal(d, dia) {
  if (!d.locales || !d.locales.length) return false;
  return localesDelDia(d, dia).length < d.locales.length;
}
// Comunas donde el descuento vale ESE día. Si el banco publica días por
// local, las comunas dependen del día: Fuente Suiza vale en La Reina y
// Cerrillos de lunes a miércoles, pero el viernes SOLO en Las Condes (Open
// Kennedy desde las 19). Usar la lista completa lo mostraba al filtrar por
// una comuna donde ese día no aplica.
function comunasDelDia(d, dia) {
  if (!d.locales || !d.locales.length) return d.comunas || [];
  const cs = localesDelDia(d, dia).map(l => l.c).filter(Boolean);
  return [...new Set(cs)].sort();
}

// "Hoy solo en" si es hoy; "El viernes solo en" si se mira otro día (antes
// decía "Hoy" aunque se estuviera mirando el viernes).
function soloEn() {
  return state.dia === diaSantiago() ? "Hoy solo en:" : `El ${DIA_LARGO[state.dia - 1]} solo en:`;
}

// "Mallplaza Egaña (La Reina)". La comuna solo va si consta en la tabla
// curada del repo de datos: no se adivina.
function nombreLocal(l) {
  return esc(l.n) + (l.c ? ` <span class="loc-comuna">(${esc(l.c)})</span>` : "");
}
let MAPA = null, CAPA = null, USERMARK = null; // Leaflet lazy

function diaSantiago() {
  // Día ISO (1=Lun..7=Dom) en America/Santiago, sin importar el tz del visitante.
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", weekday: "short" })
    .format(new Date());
  return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[s.slice(0, 3)] || 1;
}

function hoyISOSantiago() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}

function fmtTope(d) {
  if (d.tope) return "tope $" + d.tope.toLocaleString("es-CL");
  if (d.sin_tope) return "sin tope";
  return "";
}

function dias_label(arr) {
  const ds = [...new Set(arr)].sort((a, b) => a - b);
  const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  if (eq(ds, [1, 2, 3, 4, 5, 6, 7])) return "Todos los días";
  if (eq(ds, [1, 2, 3, 4, 5])) return "Lun a Vie";
  if (eq(ds, [1, 2, 3, 4, 5, 6])) return "Lun a Sáb";
  const consec = ds.every((v, i) => i === 0 || v === ds[i - 1] + 1);
  if (consec && ds.length >= 3) return `${DIAS[ds[0] - 1]} a ${DIAS[ds[ds.length - 1] - 1]}`;
  if (ds.length === 2) return `${DIAS[ds[0] - 1]} y ${DIAS[ds[1] - 1]}`;
  return ds.map(d => DIAS[d - 1]).join(", ");
}

// `todosLosBancos`: mismo filtro pero sin el de banco, para contar en los
// chips cuántas ofertas tendría cada banco con el resto de filtros puestos.
// Minúsculas y sin tildes: "neli" encuentra "Nelí", "cafe" encuentra "Ora
// Café" (23 locales del catálogo llevan tilde; buscarlos sin ella fallaba).
function norm(t) {
  return String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function visibles(todosLosBancos = false) {
  const hoy = hoyISOSantiago();
  const q = norm(state.q.trim());
  return state.data.filter(d =>
    d.dias.includes(state.dia) &&
    (!d.vigencia || d.vigencia >= hoy) &&
    (todosLosBancos || state.bancos.has(d.banco)) &&
    // Un descuento puede valer en VARIAS comunas (una cadena): basta con que
    // la elegida esté entre las suyas.
    (!state.comuna || comunasDelDia(d, state.dia).includes(state.comuna)) &&
    // El buscador también encuentra por comuna ("ñuñoa", "providencia"),
    // con las comunas donde vale ESE día.
    (!q || norm(d.comercio).includes(q) ||
      comunasDelDia(d, state.dia).some(c => norm(c).includes(q)))
  );
}

// ---------- Estado en la URL ----------
// ?d=5&b=santander,itau&c=Providencia&q=sushi&v=mapa — así un filtro se
// puede compartir por WhatsApp y sobrevive a recargar. Solo se escribe lo
// que difiere de lo por defecto, para que la URL limpia siga siendo "/".
function leerURL() {
  const p = new URLSearchParams(location.search);
  const d = parseInt(p.get("d"), 10);
  if (d >= 1 && d <= 7) state.dia = d;
  const ids = (p.get("b") || "").split(",").filter(Boolean);
  const elegidos = BANCOS.filter(b => ids.includes(b.id)).map(b => b.nombre);
  if (elegidos.length) state.bancos = new Set(elegidos);
  if (p.get("c")) state.comuna = p.get("c");  // render() la descarta si no aplica
  if (p.get("q")) state.q = p.get("q");
  if (p.get("v") === "mapa") state.vista = "mapa";
}
function escribirURL() {
  const p = new URLSearchParams();
  if (state.dia !== diaSantiago()) p.set("d", state.dia);
  if (state.bancos.size < BANCOS.length) {
    p.set("b", BANCOS.filter(b => state.bancos.has(b.nombre)).map(b => b.id).join(","));
  }
  if (state.comuna) p.set("c", state.comuna);
  if (state.q.trim()) p.set("q", state.q.trim());
  if (state.vista === "mapa") p.set("v", "mapa");
  const qs = p.toString();
  const url = location.pathname + (qs ? "?" + qs : "") + location.hash;
  if (url !== location.pathname + location.search + location.hash) {
    history.replaceState(null, "", url);
  }
}

// Deja el día elegido a la vista dentro de la fila deslizable (en móvil el
// domingo queda fuera de pantalla si llega por URL).
function centrarTabActiva() {
  const tabs = document.getElementById("tabs");
  const a = tabs.querySelector(".tab.activo");
  if (!a || tabs.scrollWidth <= tabs.clientWidth) return;
  tabs.scrollLeft = a.offsetLeft - (tabs.clientWidth - a.offsetWidth) / 2;
}

function render() {
  const hoy = hoyISOSantiago();

  // Comunas del día elegido, con su conteo. Va ANTES de filtrar: si la
  // comuna elegida no tiene ofertas este día (se cambió de día, o llegó por
  // URL) se descarta primero. Antes se descartaba después de filtrar y la
  // lista quedaba vacía con el selector mostrando "Todas las comunas".
  const delDia = state.data.filter(
    d => d.dias.includes(state.dia) && (!d.vigencia || d.vigencia >= hoy));
  const cuenta = {};
  let sinComuna = 0;
  for (const d of delDia) {
    const cs = comunasDelDia(d, state.dia);
    if (!cs.length) sinComuna++;
    for (const c of cs) cuenta[c] = (cuenta[c] || 0) + 1;
  }
  if (state.comuna && !cuenta[state.comuna]) state.comuna = "";  // ya no aplica

  const items = visibles();

  // Hero: total del día (sin filtros de búsqueda/banco, para que sea estable).
  const totalDia = state.data.filter(d =>
    d.dias.includes(state.dia) && (!d.vigencia || d.vigencia >= hoy)).length;
  const esHoy = state.dia === diaSantiago();
  const diaTxt = esHoy ? "hoy" : `el ${DIA_LARGO[state.dia - 1]}`;
  document.getElementById("hero-cuando").textContent = diaTxt;
  document.getElementById("dest-cuando").textContent = diaTxt;
  document.getElementById("stat-num").textContent = totalDia;
  document.getElementById("stat-lbl").textContent = esHoy
    ? `ofertas activas hoy, ${DIA_LARGO[state.dia - 1]}, en Santiago`
    : `ofertas para el ${DIA_LARGO[state.dia - 1]} en Santiago`;

  // Reparto del día por banco. Tocar una barra deja solo ese banco (igual
  // que su chip desde "todos") y baja al listado.
  const porBanco = BANCOS.map(bco => ({
    bco,
    n: state.data.filter(d => d.banco === bco.nombre && d.dias.includes(state.dia) &&
      (!d.vigencia || d.vigencia >= hoy)).length,
  }));
  const maxN = Math.max(1, ...porBanco.map(x => x.n));
  const barras = document.getElementById("stat-barras");
  barras.innerHTML = "";
  for (const { bco, n } of porBanco) {
    const b = document.createElement("button");
    b.className = "barra";
    b.style.setProperty("--bcolor", bco.color);
    b.setAttribute("aria-label", `${bco.nombre}: ${n} ofertas. Ver solo ${bco.nombre}`);
    b.innerHTML = `<span>${esc(bco.nombre)}</span>` +
      `<span class="pista"><i style="width:${(n / maxN * 100).toFixed(1)}%"></i></span>` +
      `<span class="n">${n}</span>`;
    b.onclick = () => {
      state.bancos = new Set([bco.nombre]);
      state.vista = "lista";
      render();
      document.querySelector(".toolbar").scrollIntoView({ behavior: "smooth" });
    };
    barras.appendChild(b);
  }

  // Tabs
  const tabs = document.getElementById("tabs");
  tabs.innerHTML = "";
  for (let i = 1; i <= 7; i++) {
    const n = state.data.filter(d => d.dias.includes(i) && (!d.vigencia || d.vigencia >= hoy)).length;
    const b = document.createElement("button");
    const activo = i === state.dia;
    b.className = "tab" + (activo ? " activo" : "");
    b.setAttribute("aria-pressed", activo ? "true" : "false");
    b.innerHTML = `${i === diaSantiago() ? '<span class="hoy-dot"></span>' : ""}` +
      `${DIAS[i - 1]} <span class="n">${n}</span>`;
    b.onclick = () => { state.dia = i; render(); centrarTabActiva(); };
    tabs.appendChild(b);
  }

  // Selector de comunas: se reconstruye en cada render para no ofrecer
  // comunas sin ofertas el día elegido.
  const sel = document.getElementById("comuna");
  const comunas = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a]);
  sel.innerHTML =
    `<option value="">Todas las comunas (${delDia.length})</option>` +
    comunas.map(c =>
      `<option value="${esc(c)}"${c === state.comuna ? " selected" : ""}>` +
      `${esc(c)} (${cuenta[c]})</option>`).join("");
  // No se puede afirmar la comuna de todos: se DICE, en vez de esconderlos.
  const aviso = document.getElementById("comuna-aviso");
  aviso.hidden = !(state.comuna && sinComuna);
  if (!aviso.hidden) {
    aviso.textContent = `${sinComuna} oferta(s) sin comuna conocida no se ` +
      `muestran con este filtro.`;
  }

  // Chips de banco, con cuántas ofertas tendría cada uno con los demás filtros.
  const chips = document.getElementById("chips");
  chips.innerHTML = "";
  const sinFiltroBanco = visibles(true);
  for (const bco of BANCOS) {
    const c = document.createElement("button");
    const on = state.bancos.has(bco.nombre);
    const nChip = sinFiltroBanco.filter(d => d.banco === bco.nombre).length;
    c.className = "chip" + (on ? " activo" : " apagado") + (nChip ? "" : " cero");
    c.style.setProperty("--chipcolor", bco.color);
    c.innerHTML = `${esc(bco.nombre)} <span class="n">${nChip}</span>`;
    c.setAttribute("aria-pressed", on ? "true" : "false");
    c.onclick = () => {
      const todos = state.bancos.size === BANCOS.length;
      if (todos) {
        // Desde "todos", tocar un banco lo AÍSLA. Antes lo apagaba, que es lo
        // contrario de lo que espera quien toca el logo de su banco.
        state.bancos = new Set([bco.nombre]);
      } else if (on && state.bancos.size === 1) {
        state.bancos = new Set(BANCOS.map(b => b.nombre));  // volver a todos
      } else if (on) {
        state.bancos.delete(bco.nombre);
      } else {
        state.bancos.add(bco.nombre);
      }
      render();
    };
    chips.appendChild(c);
  }

  // Destacados: mejor oferta por banco (máx 3), solo con lo visible.
  const mejorPorBanco = {};
  for (const d of [...items].sort((a, b) => b.pct - a.pct)) {
    if (!mejorPorBanco[d.banco]) mejorPorBanco[d.banco] = d;
  }
  const top = Object.values(mejorPorBanco).sort((a, b) => b.pct - a.pct).slice(0, 3);
  const dsec = document.getElementById("destacados-sec");
  dsec.hidden = top.length < 2;
  document.getElementById("destacados").innerHTML = top.map((d, i) => {
    const bco = BANCOS.find(b => b.nombre === d.banco);
    return `<a class="dest" style="--bcolor:${bco.color}" href="${esc(d.url || bco.url)}" target="_blank" rel="noopener">
      <div class="dest-pct"><small>hasta</small><b>${d.pct}</b><span>%</span></div>
      <div class="dest-txt">
        <div class="nom">${sub(d)}${esc(d.comercio)}</div>
        <div class="bco">${esc(d.banco)}</div>
      </div>
      <span class="rank" aria-hidden="true">${i + 1}</span>
    </a>`;
  }).join("");

  // Listado por banco
  const res = document.getElementById("resultado");
  res.innerHTML = "";
  let alguno = false;
  for (const bco of BANCOS) {
    const todas = items.filter(d => d.banco === bco.nombre).sort((a, b) => b.pct - a.pct);
    if (!todas.length) continue;
    alguno = true;
    const total = todas.length;
    const abierto = state.expandidos.has(bco.nombre);
    const del = abierto ? todas : todas.slice(0, MAX_POR_BANCO);
    const sec = document.createElement("section");
    sec.className = "banco-sec";
    sec.id = "banco-" + bco.nombre.toLowerCase().replace(/[^a-z]+/g, "-");
    sec.style.setProperty("--bcolor", bco.color);
    sec.innerHTML = `
      <div class="banco-head">
        <h2 class="nom">${esc(bco.nombre)}</h2>
        <span class="cnt">${total > del.length ? `${del.length} de ${total}` : del.length}
          ${total === 1 ? "oferta" : "ofertas"}</span>
        <a class="ver-mas" href="${esc(bco.url)}" target="_blank" rel="noopener">Ver en el banco →</a>
      </div>
      <div class="grid">
        ${del.map(d => card(d, bco)).join("")}
      </div>
      ${total > MAX_POR_BANCO
        ? `<button class="mas">${abierto ? "Ver menos" : `Ver las ${total} de ${esc(bco.nombre)}`}</button>`
        : ""}`;
    const mas = sec.querySelector(".mas");
    if (mas) mas.onclick = () => {
      if (abierto) state.expandidos.delete(bco.nombre);
      else state.expandidos.add(bco.nombre);
      render();
      if (abierto) document.getElementById(sec.id).scrollIntoView({ block: "start" });
    };
    res.appendChild(sec);
  }
  if (!alguno) {
    const filtrando = state.q || state.comuna || state.bancos.size < BANCOS.length;
    res.innerHTML = `<div class="vacio">
      ${filtrando
        ? `<p class="vacio-tit">Nada con esos filtros</p>
           <p>Prueba <b>otro día</b>, otra comuna, borra la búsqueda o vuelve a activar todos los bancos.</p>
           <button class="mas" id="limpiar">Limpiar filtros</button>`
        : `<p class="vacio-tit">Sin ofertas el ${DIA_LARGO[state.dia - 1]}</p>
           <p>Prueba otro día de la semana.</p>`}
    </div>`;
    const limpiar = document.getElementById("limpiar");
    if (limpiar) limpiar.onclick = () => {
      state.q = ""; state.comuna = "";
      state.bancos = new Set(BANCOS.map(b => b.nombre));
      document.getElementById("buscar").value = "";
      render();
    };
  }

  // Alternar vista lista/mapa.
  const enMapa = state.vista === "mapa";
  document.getElementById("mapa-vista").hidden = !enMapa;
  document.getElementById("destacados-sec").hidden = enMapa || top.length < 2;
  document.getElementById("resultado").hidden = enMapa;
  document.getElementById("como-funciona").hidden = enMapa;
  for (const [id, on] of [["ver-lista", !enMapa], ["ver-mapa", enMapa]]) {
    const b = document.getElementById(id);
    b.classList.toggle("activo", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  }
  if (enMapa) renderMapa(items);
  escribirURL();
}

function distancia(a, b) { // metros (haversine)
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function fmtDist(m) { return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`; }

let TILELAYER = null, TILELAYER_REF = null, FIRMA_VISTA = null;

function crearMapa() {
  MAPA = L.map("mapa", { scrollWheelZoom: true, zoomControl: false })
    .setView([-33.45, -70.66], 12);
  L.control.zoom({ position: "bottomright" }).addTo(MAPA);
  const t = TILES[temaOscuro() ? "oscuro" : "claro"];
  const opts = { attribution: TILES_ATTR, maxZoom: 18, maxNativeZoom: 15 };
  // Dos capas superpuestas: el relleno/calles (Base) abajo, las etiquetas
  // de calle/comuna (Reference, PNG transparente) arriba.
  TILELAYER = L.tileLayer(t.base, opts).addTo(MAPA);
  TILELAYER_REF = L.tileLayer(t.ref, opts).addTo(MAPA);

  CAPA = crearCapaMarcadores();

  // Si el visitante cambia el tema del sistema con el mapa abierto.
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const t = TILES[temaOscuro() ? "oscuro" : "claro"];
    if (TILELAYER) TILELAYER.setUrl(t.base);
    if (TILELAYER_REF) TILELAYER_REF.setUrl(t.ref);
  });
}

function crearCapaMarcadores() {
  // Degradar si el plugin no está: al desplegar, un visitante puede quedar con
  // el index.html viejo en caché (sin el <script> del plugin) y el app.js
  // nuevo. Sin esto, esa mezcla lanza "L.markerClusterGroup is not a function"
  // y el mapa no se dibuja. Sin agrupar es peor, pero roto es mucho peor.
  if (typeof L.markerClusterGroup !== "function") {
    console.warn("markercluster no disponible: mapa sin agrupación.");
    return L.layerGroup().addTo(MAPA);
  }

  // Sin agrupar, media docena de pines quedaban encimados e ilegibles en
  // Providencia/Las Condes. Al acercar, el grupo se abre solo.
  return L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 46,
    spiderfyDistanceMultiplier: 1.4,
    iconCreateFunction: grupo => {
      const hijos = grupo.getAllChildMarkers();
      const max = Math.max(...hijos.map(m => m.options.pct || 0));
      return L.divIcon({
        className: "",
        iconSize: [42, 42], iconAnchor: [21, 21],
        html: `<div class="cluster-pin"><b>${hijos.length}</b>` +
              `<span>${max}%</span></div>`,
      });
    },
  }).addTo(MAPA);
}

function renderMapa(items) {
  if (!MAPA) crearMapa();
  setTimeout(() => MAPA.invalidateSize(), 50); // por el hidden previo

  const conGeo = items.filter(d => typeof d.lat === "number");
  CAPA.clearLayers();
  const marcadores = [], bounds = [];
  // Los de mayor % se agregan al final para que queden ENCIMA al solaparse.
  for (const d of [...conGeo].sort((a, b) => a.pct - b.pct)) {
    const bco = BANCOS.find(b => b.nombre === d.banco) || { color: "#333", pin: "#333" };
    const icon = L.divIcon({
      className: "", iconSize: [34, 34], iconAnchor: [17, 17],
      html: `<div class="pin-num" style="--pincolor:${bco.pin}">${d.pct}<i>%</i></div>`,
    });
    marcadores.push(L.marker([d.lat, d.lng], { icon, pct: d.pct })
      .bindPopup(popup(d, bco), { closeButton: true, maxWidth: 260 }));
    bounds.push([d.lat, d.lng]);
  }
  // addLayers es del plugin; L.layerGroup (el respaldo) solo tiene addLayer.
  if (CAPA.addLayers) CAPA.addLayers(marcadores);
  else marcadores.forEach(m => CAPA.addLayer(m));
  if (USERMARK) USERMARK.addTo(MAPA);

  const total = items.length, info = document.getElementById("mapa-info");
  if (state.user) marcarCercano(conGeo);
  else info.innerHTML = `<b>${conGeo.length}</b> de ${total} con ubicación · ` +
    `usa tu ubicación para ver el más cercano`;

  // Reencuadrar SOLO si cambió el conjunto de locales: antes se reencuadraba
  // en cada render y el mapa saltaba con cada tecla del buscador.
  const firma = bounds.map(b => b.join()).sort().join("|");
  if (bounds.length && !state.user && firma !== FIRMA_VISTA) {
    MAPA.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }
  FIRMA_VISTA = firma;
}

function popup(d, bco) {
  const locs = localesDelDia(d, state.dia);
  // dias_confirmados=false: la ficha no dijo ningún día, "dias" es un
  // supuesto -no se muestra como si fuera un hecho (mismo criterio del correo).
  const badges = [d.dias_confirmados === false ? null : dias_label(d.dias),
                  fmtTope(d), d.condicion]
    .filter(Boolean)
    .map(t => `<span class="pb">${esc(t)}</span>`).join("");
  const porLocal = locs.length && variaPorLocal(d, state.dia)
    ? `<div class="pop-locales"><b>${soloEn()}</b> ${locs.map(nombreLocal).join(" · ")}</div>`
    : "";
  const ruta = `https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}`;
  const ver = d.url
    ? `<a class="pl-primario" style="background:${bco.pin}" href="${esc(d.url)}" target="_blank" rel="noopener">Ver oferta →</a>`
    : "";
  return `<div class="pop">
    <div class="pop-top">
      <div class="pop-pct" style="color:${bco.pin}">${d.pct}<i>%</i></div>
      <div>
        <div class="pop-nom">${sub(d)}${esc(d.comercio)}</div>
        <div class="pop-bco" style="color:${bco.pin}">${esc(d.banco)}</div>
      </div>
    </div>
    ${badges ? `<div class="pop-badges">${badges}</div>` : ""}
    ${porLocal}
    <div class="pop-links">${ver}<a class="pl-ruta" href="${ruta}" target="_blank" rel="noopener">🧭 Cómo llegar</a></div>
  </div>`;
}

function marcarCercano(conGeo) {
  const info = document.getElementById("mapa-info");
  if (!conGeo.length) { info.textContent = "No hay locales con ubicación para este filtro."; return; }
  let mejor = null, dmin = Infinity;
  for (const d of conGeo) {
    const dist = distancia(state.user, d);
    if (dist < dmin) { dmin = dist; mejor = d; }
  }
  info.innerHTML = `📍 Más cerca: <b>${esc(mejor.comercio)}</b> (${mejor.pct}%, a ${fmtDist(dmin)})`;
  MAPA.fitBounds([[state.user.lat, state.user.lng], [mejor.lat, mejor.lng]],
    { padding: [60, 60], maxZoom: 16 });
}

function ubicar() {
  const info = document.getElementById("mapa-info");
  if (!navigator.geolocation) { info.textContent = "Tu navegador no permite ubicación."; return; }
  info.textContent = "Obteniendo tu ubicación…";
  navigator.geolocation.getCurrentPosition(pos => {
    state.user = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    if (USERMARK) MAPA.removeLayer(USERMARK);
    USERMARK = L.circleMarker([state.user.lat, state.user.lng], {
      radius: 9, color: "#1a73e8", fillColor: "#1a73e8", fillOpacity: .9, weight: 3,
    }).addTo(MAPA).bindPopup("Estás aquí");
    render();
  }, () => { info.textContent = "No pudimos obtener tu ubicación (revisa los permisos)."; },
    { enableHighAccuracy: true, timeout: 10000 });
}

function card(d, bco) {
  const hoy = hoyISOSantiago();
  const ultimo = d.vigencia && d.vigencia === hoy;
  const tope = fmtTope(d);
  const link = esc(d.url || bco.url);
  const locs = localesDelDia(d, state.dia);
  const cs = comunasDelDia(d, state.dia);
  return `<article class="cardo" style="--bcolor:${bco.color}">
    <div class="fila">
      <a class="nom" href="${link}" target="_blank" rel="noopener">${sub(d)}${esc(d.comercio)}</a>
      <div class="pct"><span class="hasta">hasta</span><span class="num">${d.pct}<i>%</i></span></div>
    </div>
    <div class="meta">
      ${ultimo ? `<span class="dato ultimo">${ico("reloj")}Último día</span>` : ""}
      ${d.dias_confirmados === false ? "" :
        `<span class="dato">${ico("dia")}${dias_label(d.dias)}</span>`}
      ${cs.length
        ? `<span class="dato">${ico("lugar")}${cs.slice(0, 2).map(esc).join(" · ")}` +
          `${cs.length > 2 ? ` +${cs.length - 2}` : ""}</span>`
        : ""}
      ${tope ? `<span class="dato">${ico("tope")}${esc(tope)}</span>` : ""}
    </div>
    ${d.condicion ? `<div class="cond">${ico("tarjeta")}${esc(d.condicion)}</div>` : ""}
    ${locs.length && variaPorLocal(d, state.dia)
      ? `<div class="locales"><b>${soloEn()}</b> ${locs.map(nombreLocal).join(" · ")}</div>`
      : ""}
  </article>`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function init() {
  document.getElementById("cta-form").href = FORM_URL;
  document.getElementById("cta-form-2").href = FORM_URL;
  document.getElementById("cta-top").href = FORM_URL;
  const buscar = document.getElementById("buscar");
  buscar.addEventListener("input", e => {
    state.q = e.target.value; render();
  });
  // "/" enfoca el buscador (como en GitHub o YouTube); Esc lo limpia.
  document.addEventListener("keydown", e => {
    const escribiendo = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (e.key === "/" && !escribiendo && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      buscar.focus();
    } else if (e.key === "Escape" && document.activeElement === buscar && buscar.value) {
      buscar.value = ""; state.q = ""; render();
    }
  });
  // Volver arriba: la lista de 6 bancos es larga en el teléfono.
  const arriba = document.getElementById("arriba");
  arriba.onclick = () => scrollTo({ top: 0, behavior: "smooth" });
  addEventListener("scroll", () => {
    arriba.hidden = scrollY < 1400 || state.vista === "mapa";
  }, { passive: true });
  document.getElementById("comuna").addEventListener("change", e => {
    state.comuna = e.target.value; render();
  });
  document.getElementById("ver-lista").onclick = () => { state.vista = "lista"; render(); };
  document.getElementById("ver-mapa").onclick = () => { state.vista = "mapa"; render(); };
  document.getElementById("btn-ubicacion").onclick = ubicar;
  try {
    const r = await fetch("data.json", { cache: "no-cache" });
    const j = await r.json();
    state.data = j.descuentos || [];
    const gen = new Date(j.generado);
    const fecha = gen.toLocaleDateString("es-CL", { day: "numeric", month: "long" });
    document.getElementById("generado").textContent = "Datos actualizados el " + fecha;
    document.getElementById("stat-fecha").textContent =
      `Datos de los bancos al ${fecha} · se actualiza solo`;
  } catch (e) {
    document.getElementById("stat-lbl").textContent = "No se pudieron cargar las ofertas 😕";
    return;
  }
  leerURL();
  buscar.value = state.q;
  render();
  centrarTabActiva();
}

init();
